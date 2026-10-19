# Supabase Postgres 이전 검토

## 결론

저장소 전환 및 직원 공유 경로를 검토했다. **MEDIUM 한 건**: `create`와 `invite`가 초대 URL 설정을 확인하기 전에 DB 상태를 바꾸므로, 설정 오류 시 고아 매장이 생기거나 기존 초대가 무효화될 수 있다.

## 발견 사항

- **MEDIUM — 초대 URL 설정 오류가 DB 변경 뒤에 발생** — `web-client/scripts/accounts.mjs:38-44,57-67`. `newInvite()`는 먼저 새 초대 해시를 UPDATE한 뒤(`42행`) `KAKAO_REDIRECT_URI`를 읽고 URL을 파싱한다(`43행`). `create`는 매장 INSERT를 커밋한 뒤 이 함수를 호출한다(`59-60행`). 따라서 `DATABASE_URL`은 유효하지만 `KAKAO_REDIRECT_URI`가 unset/빈 값/잘못된 URL인 입력에서 `create <이름>`은 매장과 초대 해시를 남긴 후 종료하며 링크를 출력하지 않는다. `invite <id>`는 먼저 기존 미사용 초대를 새 해시로 덮어써 기존 링크를 무효화하고, URL 생성에서 실패해 새 링크도 출력하지 않는다. 운영자가 인지하지 못한 고아 매장과 초대 불능 상태가 생길 수 있다. URL/origin을 DB 변경 전에 검증하고, `create`의 매장 생성과 초대 발급을 한 트랜잭션으로 묶어야 한다.

## 확인한 항목

- `web-client/db/migrations/001_init.sql`: 매장 외래 키 cascade, 기간별 게시본 partial unique, RLS 활성화 및 무정책 설정이 변경 설명과 부합한다.
- `web-client/src/lib/schedules.ts`: 게시 트랜잭션이 매장 행 잠금으로 직렬화되고, JSON 보존 및 응답 타입 변환 경로가 기존 계약에 맞게 구성되어 있다.
- `web-client/src/app/api/s/[code]/route.ts`: 직원 공개 응답은 allowlist 객체로 구성되며 매장별 게시본만 반환한다.
- `web-client/src/middleware.ts`: 베타 비활성 응답 및 비로그인 API 401 응답에 no-store 헤더가 적용되어 이전 LOW 지적이 해소됐다.

## 검증 및 범위

- `npm run lint --prefix web-client`: 통과.
- `./web-client/node_modules/.bin/tsc --noEmit -p web-client/tsconfig.json`: 통과.
- BE가 제공한 scratchpad PostgreSQL 17/API 회귀 테스트 결과를 확인했다. 설정 누락·오류 시나리오는 테스트 보고에 포함되지 않아 위 결함은 SQL/제어 흐름 순서로 판정했다.
- 실제 Supabase 연결은 프로젝트가 없어 수행하지 않았다. 사용자 소유 공유 `web-client`에서는 build/dev 명령을 실행하지 않았다.
