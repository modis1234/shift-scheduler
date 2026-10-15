# 엔진 입력 폼 검토

## 결론

수정 후 승인 권고. 요청된 폼/JSON 상호작용과 변경 시프트 참조 갱신은 코드상 의도대로 보이며, lint/build는 통과했다. 다만 `validateInput()`이 엔진에서 거부할 두 입력을 통과시켜 생성 요청을 막지 못한다. 엔진 입출력 계약 변경 지적은 아니다.

## 발견 사항

- **MEDIUM — 정수 JSON 숫자의 표현 차이로 엔진 거부 입력을 통과시킴** — `web-client/src/app/InputForm.tsx:57,99,105,121,131-133`. JS `Number.isInteger(8.0)`은 `true`라 `shift_definitions.Opening.hours: 8.0` 및 정수 규칙/카운트 필드에 소수 표기한 JSON이 폼 검증을 통과한다. 그러나 원문 `text`를 그대로 API에 보내며 Python JSON parser는 `8.0`을 `float`로 읽고, `solver.py:108-109,157-160`의 `_is_int`는 정확히 `int`만 허용한다. 따라서 유효 범위의 예시 입력도 클라이언트가 오류를 표시하지 않은 채 엔진 `INVALID_INPUT`으로 간다. 직접 검증: Node에서 `Number.isInteger(JSON.parse('8.0'))` 결과는 `true`; Python의 `_is_int` 정의는 `type(v) is int`이다.
- **MEDIUM — 이전 주 시간의 실효 상한을 검증하지 않음** — `web-client/src/app/InputForm.tsx:133`; 엔진 기준 `algorithm-engine/solver.py:72-73,229-231`. `prior_week_hours`는 폼에서 항상 `0..168`만 확인하지만 엔진은 `min(rules.max_weekly_hours, employees[].max_weekly_hours)` 이하를 요구한다. 예를 들어 `rules.max_weekly_hours=40`, 직원 `prior_week_hours=45`는 폼 검증을 통과한 뒤 엔진에서 `INVALID_INPUT`이 된다. 직원별 주 상한이 더 낮은 경우도 동일하다. 엔진과 같은 실효 상한으로 검사해야 한다.

## 확인

- 시프트 이름 변경은 정의/요구량 키, 기피 목록, 직원 선호를 함께 변경하고 삭제는 정의/요구량/기피 참조를 제거하면서 선호를 남겨 검증 오류로 알린다 (`InputForm.tsx:266-287`).
- 숫자 필드 빈 칸은 해당 키 삭제로 처리하고, Off 행은 읽기 전용이다 (`InputForm.tsx:51-55,417-456`).
- 잘못된 JSON 객체 내부 값은 `obj`/`arr`/`str` 및 렌더링 시 타입 분기로 다뤄 폼 렌더 예외가 나지 않도록 방어한다.
- `npm run lint`: 통과.
- `npm run build`: 통과 (Next.js 15.5.27).
- `git diff --check`는 기존 수정 상태의 `CLAUDE.md` EOF 공백 한 건을 보고했다. 이 리뷰 대상 파일에서 새 공백 오류는 확인하지 않았다.
- 엔진 런타임 재현은 로컬 Python 환경에 `ortools`가 없어 실행하지 못했다. 위 두 항목은 검증기 구현 간 타입/상한 차이를 직접 대조해 확인했다.

