# 엔진 입력 폼 재검토

## 결론

앞선 두 MEDIUM 지적은 수정된 것으로 확인했으나, `JSON.stringify(input)` 전송이 JSON 직접 편집의 정밀도를 조용히 훼손할 수 있다. 이 경우 생성 결과와 다음 기간 입력은 원문 입력과 달라지므로 추가 수정 후 재검토 권고다.

## 이전 지적 상태

- **정수 JSON 숫자 표기:** 해결. `ScheduleRunner.tsx:248`은 검증한 객체를 직렬화해 `8.0`을 `8`로 보내며, Python 엔진의 정수 검사와 일치한다.
- **`prior_week_hours` 실효 상한:** 해결. `InputForm.tsx:83-84,133-137`은 기본 규칙 상한 52와 직원별 상한 중 작은 값을 검증에 사용한다. 고급 입력의 `max`도 같은 규칙을 사용한다 (`InputForm.tsx:645`).

## 발견 사항

- **MEDIUM — JSON 편집 입력의 안전 정수 초과 값이 전송/다음 기간 입력에서 변형됨** — `web-client/src/app/ScheduleRunner.tsx:248`. `JSON.parse`는 `9007199254740993`을 JS 안전 정수 범위 밖이라 `9007199254740992`로 읽고, 새 `JSON.stringify(input)` 전송은 변형된 값을 보낸다. 재현: Node `JSON.stringify(JSON.parse('{"future_extension":9007199254740993}'))` 결과는 `{"future_extension":9007199254740992}`. 엔진 현재 스키마 밖의 확장 키라 즉시 제약 계산을 바꾸지는 않지만, JSON 직접 편집의 값을 보존하지 못하고 `run.input` 기반 다음 기간 입력도 손실된 값을 이어 간다. 원문 JSON의 정수 토큰을 보존하면서 정수 필드의 `.0`만 안전하게 정규화하거나, 적어도 안전 정수 초과 정수 토큰은 제출 전에 감지해 거부해야 한다.

## 검증

- `npm run lint`: 통과.
- `npm run build`: 통과 (Next.js 15.5.27).
- 위 정밀도 손실은 Node로 재현했다. 엔진 런타임 재현은 로컬 Python 환경에 `ortools`가 없어 실행하지 못했다.

