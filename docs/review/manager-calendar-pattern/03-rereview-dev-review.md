# 달력 월 GET 재재검토

대상: `qitem-20261019070205-ce9447b33f199c97` (`main` 04531d0)

## 판정

지적 없음. 이전 MEDIUM은 해소됐다.

- `web-client/src/app/ManagerCalendar.tsx:68-79`에서 요청마다 세대를 증가시킨다.
- `fetch()` 완료 직후뿐 아니라 `response.json()` 완료 뒤에도 현재 세대인지 다시 확인한 다음 `setEvents(data)`를 호출한다.
- 따라서 이전 달 응답의 헤더가 먼저 도착하고, 달 이동 뒤 그 응답 본문이 늦게 완료되는 기존 재현 순서에서도 오래된 배열을 현재 달 상태에 반영하지 않는다.

## 검증

- `npm run lint`: 통과
- `npx tsc --noEmit`: 통과
- `git diff --check`: 통과
- 공유 `.next` 보호 지침에 따라 build/dev는 실행하지 않았다.

결론: **PASS**
