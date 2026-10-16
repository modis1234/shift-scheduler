# 캘린더 저장·게시 백엔드 재검토

## 결론

이전 MEDIUM 두 건의 수정이 확인되어 통과 권고한다. 기존 SQLite 파일 권한, 실제 날짜 및 기간 상한이 각각 강제된다. 요청 범위에 추가된 계정 삭제의 빈 DB 예외 처리도 코드상 반영되어 있다.

## 확인 항목

- `web-client/src/lib/schedules.ts:23-25`: DB 파일을 연 직후 `chmodSync(file, 0o600)`을 실행하여 미리 존재하는 파일에도 소유자 전용 권한을 적용한다. 게시 최종 UPDATE에도 store 조건이 들어가 있다(`:86`).
- `web-client/src/app/api/schedules/route.ts:10-15,45-49`: ISO 날짜 형식뿐 아니라 Date 왕복 비교로 유효한 날짜인지 확인하고, 시작≤종료 및 inclusive 366일 이내를 검사한다.
- `web-client/scripts/accounts.mjs:114-132`: DB 파일이 존재하더라도 `schedules` 테이블이 아직 없을 수 있으므로 `sqlite_master` 확인 뒤에만 삭제 쿼리를 실행한다. DB connection은 정상 경로에서 닫는다.

## 검증

- `npm run lint --prefix web-client`: 통과.
- `./web-client/node_modules/.bin/tsc --noEmit -p web-client/tsconfig.json`: 통과.
- 담당자가 준비한 scratchpad 전용 `rerun.sh` 재실행: 로그인 58/58, schedules 34/34 통과. 기존 `0644` DB의 최종 mode는 `0600`이었다. 2026-02-31 및 367일은 400, 윤년 366일은 201 응답을 확인했다.
- 실행 파일과 DB는 scratchpad 복사본·포트 3911에서만 사용했다. 공유 `web-client`에서 build/dev는 실행하지 않았다.

## 잔여 이슈

이번 BE 재검토 범위에서 추가 결함은 확인하지 못했다. 계정 삭제의 schema-less DB 경로는 구현을 확인했으며, 제공된 34개 테스트의 요약에는 해당 경로가 별도 항목으로 표시되지 않아 독립 실행 검증까지 했다고 주장하지 않는다.
