# 리뷰 5건 수정 재검토

대상: `qitem-20261019065112-881cbbb168ad771e`

검증: `npm run lint`, `npx tsc --noEmit`, `git diff --check` 통과. 추가 build/dev는 실행하지 않았다. 파서의 쉼표, `등록해 주세요`, 사용자 원문도 직접 실행 통과했다.

## 판정

- 단건 일정 저장/삭제 중 Esc 차단: **해소**
- 저장 근무표 연속 열기 경합·행 상태·포커스: **해소**
- manager-events 네 API의 JSON 500/no-store: **해소**
- 패턴 대화상자 취소·generation·초기 포커스: **해소**
- 월 GET 역순 응답: **부분 해소, 잔여 finding 1건**

### MEDIUM — 응답 본문을 기다리는 동안 달을 바꾸면 오래된 일정이 여전히 반영된다

- 근거: `web-client/src/app/ManagerCalendar.tsx:65-79`
- `load()`는 `await fetch()` 직후인 71행에서만 version을 확인하고, 이후 `await response.json()` 결과를 74행에서 재확인 없이 `setEvents()` 한다.
- 재현: 이전 달 GET이 헤더를 반환한 뒤 본문 전달을 지연한다. 그 사이 `[다음 달]`을 눌러 version을 올리고 새 요청을 시작한다. 이전 응답의 본문이 나중에 완료되면 74행이 오래된 배열을 현재 달 상태에 반영한다.
- 영향: 최초 HIGH의 핵심인 “현재 달 제목과 다른 범위의 일정 표시”가 좁은 타이밍에서 남아 있다.
- 수정안: JSON을 지역 변수로 읽은 뒤 `if (version !== loadVersionRef.current) return;`을 다시 검사하고 나서 `setEvents(data)` 한다. 가능하면 AbortController도 함께 사용한다.

## 결론

이전 5건 중 4건은 해소됐고 1건은 부분 해소다. 위 한 줄 수준의 세대 재확인 후 재검토가 필요하다.
