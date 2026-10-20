# 내 일정 문장 명령 — 절 경계·오늘 검사 재검토

대상: `qitem-20261020042804-576de98f` (`feature/nl-delete-color` 미커밋 작업 트리)

## 이전 지적 판정

- HIGH — 제목 내부 삭제·색 문자열 오해석: **해소**
  - `일정 삭제방지`, `빨간색연필`, `근무는 회의`가 각각 원래 제목과 기본 색을 보존하며 `deleteExisting: false`로 해석된다.
  - 정상 삭제·색 명령과 기존 미지원 예시도 기대대로 동작한다.
- MEDIUM — `다시`의 오늘 검사 불일치: **정책 명확화로 해소**
  - 문서가 `다시`를 날짜 기준을 바꾸지 않는 filler로 명시했고 구현도 그 정의와 일치한다.

## 잔여 Finding

### MEDIUM — 근무 제목 속 `오늘부터`도 날짜 기준 표현으로 오인해 유효한 패턴을 거부한다

- 근거: `web-client/src/lib/manager-pattern-language.ts:27`, `web-client/src/lib/manager-pattern.ts:49-52`
- `FROM_TODAY`는 문장 시작이 아니라 임의의 공백 뒤에서도 일치한다. 반면 `PREFIX`가 실제 날짜 기준 접두어로 소비하는 위치는 문장 시작 또는 앞쪽 삭제 절을 제거한 뒤의 시작이다.
- 재현:
  - 문장: `2일 오늘부터 점검하고 하루 휴무`
  - `parseManagerCommand()` 결과: `workTitle: "오늘부터 점검"`인 정상 규칙
  - `FROM_TODAY.test()` 결과: `true`
  - 따라서 `startDate != referenceDate`이면 `parseManagerPatternInput()`이 “오늘 날짜부터와 시작일이 다릅니다”로 잘못 거부한다.
- 영향: 결정적 파서가 정상 근무 제목을 보존해 해석하면서도 API 입력 검증에서 모순되게 거부한다. 오늘이 아닌 기간에 `오늘부터 점검` 같은 제목을 등록할 수 없다.
- 수정 방향: 단순 포함 검사 대신 파서가 실제 접두어 위치에서 `오늘부터|오늘 기준으로`를 소비했는지를 구조화 결과에 담아 검증하거나, 정규화 후 문장 시작 및 선행 삭제 절 직후만 검사한다.

## 검증

- 정상 삭제·색 및 이전 재현 3건: 통과
- 기존 미지원 입력 3건: 거부 확인
- `FROM_TODAY` 위치 행렬: 제목 내부 입력에서 위 오탐 재현
- `npm run lint`: 통과
- `npx tsc --noEmit`: 통과
- `git diff --check`: 통과
- 공유 `.next` 보호 지침에 따라 build/dev는 실행하지 않았다.

결론: **CHANGES REQUESTED (MEDIUM 1건)**
