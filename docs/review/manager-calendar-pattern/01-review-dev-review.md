# 3탭·내 일정 CRUD·자연어 패턴 일괄 등록 검토

검토 대상: `qitem-20261019063936-f82e895669b59e27` 수령 시점의 전체 미커밋 변경(검토 중 반영된 자연어 파서 쉼표·`등록해 주세요` 보완 포함)

검증:

- `npm run lint` 통과
- `npx tsc --noEmit` 통과
- `npm run build` 통과
- `git diff --check` 통과
- 지원 문법 직접 실행: 기본 예시, 사용자 원문, 쉼표 포함, `등록해 주세요` 공백형 모두 통과

## Findings

### HIGH — 월 이동 중 오래된 응답이 현재 달 상태를 덮어쓴다

- 근거: `web-client/src/app/ManagerCalendar.tsx:64-80`, `web-client/src/app/ManagerCalendar.tsx:93-101`, `web-client/src/app/ManagerCalendar.tsx:211-223`
- `load()`는 요청 취소나 요청 세대 확인 없이 응답 즉시 `setEvents()` 한다. 달을 바꿀 때 `cursor`와 `events`만 바꾸므로 여러 GET이 겹치면 응답 순서가 화면 상태를 결정한다.
- 재현: 네트워크를 느리게 한 뒤 `내 일정` 진입 직후 `다음 달`을 두 번 누른다. 이전 달 요청이 마지막에 끝나면 현재 제목은 새 달인데 일정은 이전 범위 자료로 덮인다. 더 이른 응답이 새 cursor 렌더 전에 `events`를 채우면 새 범위 요청 자체가 `events === null` 조건 때문에 시작되지 않을 수도 있다.
- 추가 근거: 오류의 `[다시 시도]`는 `setEvents(null)`, `setLoadError("")`, 직접 `load()`를 함께 실행한다(`:248-252`). 렌더 후 effect도 같은 조건에서 `load()`를 실행하여 GET이 중복될 수 있다.
- 영향: 관리자가 현재 달의 일정 일부를 없다고 보거나 다른 달 일정을 현재 달 데이터로 오인한다. 일정 추가·수정 판단에 직접 영향을 준다.
- 수정안: 범위 변경마다 effect에서 한 번만 요청하고 `AbortController` 또는 증가하는 request id로 최신 범위 응답만 반영한다. 재시도는 retry generation만 올리고 직접 호출과 effect 호출을 중복하지 않는다.

### HIGH — 단건 일정 저장 중 Esc로 대화상자를 닫아 입력과 실패 복구 상태를 잃는다

- 근거: `web-client/src/app/ManagerCalendar.tsx:162-191`, `web-client/src/app/ManagerCalendar.tsx:321-351`
- 저장 중 버튼은 비활성화되지만 `<dialog>`에 `onCancel` 방지가 없다. 네이티브 dialog는 Esc cancel의 기본 동작으로 닫히며, `onClose`가 `draft`를 `null`로 만든다.
- 재현: 일정 저장 요청을 느리게 만든 뒤 `[저장]`을 누르고 Esc를 누른다. 대화상자가 닫힌다. 이후 요청이 실패하면 `formError`만 갱신되고 초안과 대화상자는 이미 사라져, 기획의 “입력 유지”가 깨진다. 성공해도 사용자는 요청 결과를 알기 전에 편집 맥락을 잃는다.
- 영향: 네트워크/DB 실패 때 작성한 제목·메모를 복구할 수 없고 중복 재입력 위험이 생긴다.
- 수정안: 패턴 대화상자처럼 저장/삭제 중 `cancel`을 `preventDefault()`하고, 성공 응답 뒤에만 닫는다. 삭제 중 문구도 계약의 `삭제하는 중…`으로 분리하면 상태가 더 명확하다.

### MEDIUM — 저장 근무표를 연속 선택하면 마지막 클릭이 아닌 마지막 응답이 화면을 결정한다

- 근거: `web-client/src/app/ScheduleRunner.tsx:448-472`, `web-client/src/app/SavedSchedules.tsx:211-231`
- `loadSaved()`에도 요청 취소/세대 확인이 없고, 목록 행은 여는 동안 비활성화되지 않는다. 서로 다른 두 행을 연속 클릭할 수 있으며 두 응답 모두 전역 `text/run/saved`를 갱신한다.
- 재현: A 요청을 지연시키고 A를 누른 직후 B를 누른다. B가 먼저 열린 뒤 A가 도착하면 화면이 A로 되돌아간다. 사용자가 마지막으로 선택한 B와 다른 근무표를 편집·게시할 수 있다.
- 영향: 잘못된 근무표를 현재 선택으로 인식하게 하는 상태 정합성 결함이다. 기획의 “열기 중 누른 행 비활성화”도 구현되지 않았다.
- 수정안: `openingId`와 request id/AbortController를 두고 최신 선택만 반영하며, 해당 행을 비활성화하고 `근무표 여는 중…`을 표시한다. 성공 시 `③ 결과`, 실패 시 오류 상자로 포커스를 옮긴다.

### MEDIUM — DB 예외가 명시된 JSON 500 오류 계약을 거치지 않는다

- 근거: `web-client/src/app/api/manager-events/route.ts:12-37`, `web-client/src/app/api/manager-events/[id]/route.ts:12-34`, `web-client/src/app/api/manager-events/pattern-preview/route.ts:10-22`, `web-client/src/app/api/manager-events/pattern-batch/route.ts:9-22`
- 각 handler가 세션/조회/트랜잭션 함수를 직접 await하고 DB 예외를 잡지 않는다. 따라서 DB 연결 실패나 트랜잭션 오류는 계약의 `{ error: "일정을 처리하지 못했습니다." }`, `Cache-Control: no-store` 응답 대신 Next 런타임의 일반 500 응답으로 빠진다.
- 재현 입력: `DATABASE_URL` 연결을 실패시키거나 batch insert 중 DB 오류를 발생시키고 네 API를 호출한다. route 내부에 예외 응답 경로가 없어 명시된 JSON 오류를 반환하지 못한다.
- 영향: 클라이언트가 일관된 오류 문구를 받지 못하고 API 소비자는 JSON 계약을 신뢰할 수 없다. batch UI도 서버 문구 대신 일반 요청 실패 문구를 표시한다.
- 수정안: 각 route의 DB 경계를 `try/catch`로 감싸 공통 JSON 500 응답을 반환하되, 서버 로그에는 원문 패턴·접속 문자열·SQL을 남기지 않는다.

### LOW — 패턴 대화상자의 취소·초기 포커스가 명시된 접근성 동작과 다르다

- 근거: `web-client/src/app/ManagerPatternMaker.tsx:36-42`, `web-client/src/app/ManagerPatternMaker.tsx:104-112`, `web-client/src/app/ManagerPatternMaker.tsx:164-173`
- `onCancel`은 `busy` 종류를 구분하지 않아 미리보기 요청 중에도 Esc를 막고 취소 버튼도 비활성화한다. 기획은 저장 전에는 Esc/취소가 언제든 가능하고 저장 중만 닫기를 막도록 했다.
- 제목은 focusable하지 않고 `showModal()` 뒤 별도 포커스 이동이 없어, 열 때 제목이 아니라 첫 날짜 입력으로 이동한다.
- 영향: 느린 미리보기 요청 중 키보드 사용자가 대화상자를 닫을 수 없고, 진입 시 대화상자 맥락이 먼저 읽히지 않는다.
- 수정안: `busy === "save"`일 때만 cancel을 막고, 제목에 `tabIndex={-1}`/ref를 둬 열린 뒤 포커스를 이동한다. 미리보기 요청을 닫을 수 있게 할 경우 완료 응답이 닫힌 UI를 다시 바꾸지 않도록 abort 또는 open generation도 함께 둔다.

## 결론

현재 범위는 **수정 후 재검토 필요**다. 락 기반 매장 격리, batch 단일 트랜잭션, digest 409, 정확한 중복 건너뛰기, 90일 제한과 주요 자연어 예시는 코드와 실행 결과에서 확인했다. 위 두 HIGH는 잘못된 달 데이터 표시와 작성 내용 손실로 이어지므로 QA 전 수정해야 한다.
