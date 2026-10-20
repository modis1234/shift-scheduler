# 내 일정 문장 해석 AI 보조 리뷰

대상: `qitem-20261020053630-25c93f6f9778f6b6` (`feature/nl-delete-color` 작업 트리의 AI 보조 변경, 공휴일 변경 제외)

## Findings

### HIGH — 특정 제목 삭제 가드가 열거한 제목 밖에서는 전체 기간 삭제 오해석을 허용한다

- 근거: `web-client/src/lib/manager-pattern-ai.ts:52-63`
- `TITLED_DELETE`는 `근무|휴무|회의|약속|교육|미팅`과 `…근무`만 열거한다. 일정 제목은 자유 문자열이므로 이 목록으로 특정 제목 삭제를 완전하게 판별할 수 없다.
- 재현:
  - `병원 일정 삭제해줘`, `치과 일정만 지워줘`, `운동 일정 제거해줘`, `김대리 일정 삭제해줘`에 대해 `TITLED_DELETE.test(text)`는 모두 `false`다.
  - 이 입력에서 모델이 `{ supported: true, deleteScope: "all", fromToday: false, rule: null }`을 반환하면 `toCommand()`는 `deleteExisting: true`인 명령을 그대로 만든다.
- 영향: 모델이 임의의 특정 제목 삭제를 전체 삭제로 잘못 분류하면 서버 가드가 막지 못하고 선택 기간의 모든 기존 일정이 삭제 대상이 된다. 미리보기와 확인창이 피해 가능성을 낮추지만, 구현이 별도 서버 가드를 둔 목적은 모델 오분류에 독립적으로 데이터 삭제를 차단하는 것이다.
- 수정 방향: 특정 제목의 블랙리스트가 아니라, 전체 삭제를 명시한 제한된 원문 형태만 positive allowlist로 허용한다. 더 안전하게는 AI 응답만으로 `deleteExisting`을 켜지 말고 결정적 전체 삭제 파서가 원문에서 확인한 경우에만 삭제를 허용한다.

### HIGH — 무료 등급의 외부 데이터 사용 가능성을 화면에서 “저장되지 않는다”고 잘못 안내한다

- 근거: `web-client/src/app/ManagerPatternMaker.tsx:152`
- 화면은 “문장만 전송되고 저장되지 않지만”이라고 안내한다. 앱 서버가 저장하지 않는다는 뜻이 명시되지 않아 외부 공급자도 보관·사용하지 않는다고 읽힌다.
- Google Gemini API 추가 약관의 Unpaid Services 조항은 무료 할당량에 제출한 입력과 생성 응답을 Google 제품·서비스 및 머신러닝 기술 개선에 사용할 수 있고, 사람 검토자가 입력·출력을 읽고 처리할 수 있다고 명시한다.
  - 공식 약관: https://ai.google.dev/gemini-api/terms
- 영향: README에는 이 사실이 있지만 실제 입력 화면의 사용자는 외부 처리 조건을 충분히 알지 못한 채 이름 등 개인정보를 넣을 수 있다. 이는 개인정보 안내의 실질적·정직성 결함이다.
- 수정 방향: “우리 서버에는 저장·기록하지 않는다”로 주체를 한정하고, 무료 등급에서는 Google이 입력·응답을 제품 개선에 사용하거나 사람 검토자가 처리할 수 있음을 입력 전 화면에 명시한다. 개인정보·민감정보·기밀정보를 넣지 말라는 공급자 문구와 맞춘다.

### MEDIUM — 제목 검증이 토큰이 아닌 부분문자열을 금지해 정상 제목을 규칙·AI 양쪽에서 거부한다

- 근거: `web-client/src/lib/manager-pattern-language.ts:8-9`, `web-client/src/lib/manager-pattern-ai.ts:66-68`
- `isWorkTitle()`의 `/쉬/`, `/하루/`, `/휴일/` 등은 단어 경계 없이 제목 어디서든 일치한다.
- 재현:
  - `parseManagerCommand("2일 쉬프트 근무하고 하루 휴무")` → `null`
  - `parseManagerCommand("2일 휴일근무하고 하루 휴무")` → `null`
  - `parseManagerCommand("2일 하루방 근무하고 하루 휴무")` → `null`
- AI 결과도 같은 `isWorkTitle()` 검증을 거치므로 fallback으로 복구되지 않는다.
- 영향: 두 패턴을 한 제목으로 잘못 읽는 경우를 막으려는 검사가 정상적인 한국어 제목까지 영구적으로 미지원 처리한다.
- 수정 방향: 음절 포함 여부 대신 별도의 일수+휴무 패턴 구조가 제목 안에 완성된 경우만 거부하거나, 토큰 경계가 확인되는 표현만 검사한다.

## 확인된 정상 범위

- 규칙 파서 성공 문장은 외부로 보내지 않는다.
- Gemini 요청에는 원문 문장만 들어가며 기존 일정·매장·메모는 포함되지 않는다.
- API 키는 서버 환경변수에서 읽어 `x-goog-api-key` 헤더로만 전송되고 클라이언트 응답·로그에 포함되지 않는다. `.env.local`은 ignore된다.
- AI 실패·429·시간 초과는 preview 단계에서 종료되어 DB 쓰기로 이어지지 않는다.
- 저장 단계는 모델을 다시 호출하지 않고 같은 원문에 묶인 HMAC 토큰과 현재 일정 snapshot digest를 사용한다.
- `gemini-3.5-flash-lite`는 공식 지원 모델이며 structured output을 지원한다.

## 검증

- 삭제 가드 임의 제목 4건 직접 실행: 모두 미탐
- 제목 검증 정상 후보 3건 직접 실행: 모두 `null` 재현
- 기존 규칙 삭제·색·fromToday 대표 입력 회귀 확인
- `npm run lint`: 통과
- `npx tsc --noEmit`: 통과
- `git diff --check`: 통과
- 공유 `.next` 보호 지침에 따라 build/dev는 실행하지 않았다.

결론: **CHANGES REQUESTED (HIGH 2건, MEDIUM 1건)**
