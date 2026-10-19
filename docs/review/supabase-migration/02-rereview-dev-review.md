# Supabase Postgres 이전 재검토 — 초대 발급 실패 원자성

## 결론

**통과.** 이전 MEDIUM 지적(redirect URI 오류 전에 초대 DB 변경)은 수정됐다. 이번 변경 범위에서 추가 결함은 확인되지 않았다.

## 확인

- `web-client/scripts/accounts.mjs:38-47`: `inviteOrigin()`이 환경변수를 읽고 URL 파싱 및 `http:`/`https:` scheme 확인을 끝낸 뒤 origin을 반환한다.
- `:69-76`: `create`는 초대 origin 확인 후 매장 INSERT와 초대 UPDATE를 같은 `sql.begin` 트랜잭션에서 수행한다. `newInvite` 실패 시 매장 INSERT도 함께 롤백되는 구조다.
- `:80-84`: `invite`도 origin 검증과 매장 조회 후에만 새 초대 해시를 쓴다. 잘못된 설정이 기존 초대 해시를 덮어쓰지 않는다.
- 원 qitem에 기록된 Postgres 재현 결과(잘못된 설정의 DB 스냅샷 불변, 초대 UPDATE 강제 실패 시 create 롤백)를 확인했다. 독립적으로는 unset URI 및 `javascript:` URI로 `create`를 실행해 두 경우 모두 exit 1이며 DB 접속 전에 거부되는 것을 확인했다.

## 검증

- `npm run lint --prefix web-client`: 통과.
- 실제 DB 스냅샷/롤백 재현은 이번 턴에 다시 실행하지 않고 구현 담당자가 제공한 격리 Postgres 17 검증 결과를 근거로 삼았다.
