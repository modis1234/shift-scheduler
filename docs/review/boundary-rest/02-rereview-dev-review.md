# 기간 경계 최소 휴식 재검토

## 결론

수정 후 재검토 필요.

1차 HIGH의 핵심인 날짜-only 입력은 해결됐다. `"2026-10-31"`, `"20261031"`, `"2026-W44-6"`은 모두 `INVALID_INPUT`이 되며 전체 테스트도 통과한다.

## HIGH — 비표준 datetime 구분자가 계속 통과해 출력 계약까지 벗어남

- 근거: `algorithm-engine/solver.py:56-63`, `algorithm-engine/solver.py:66-70`
- 테스트 공백: `algorithm-engine/test_solver.py:91-93`
- 형식 변경 필요: **아니오**. 승인된 ISO datetime 입력과 `YYYY-MM-DDTHH:MM` 출력 계약을 검증하는 수정이다.

`datetime.fromisoformat()`은 ISO 8601의 `T`가 아닌 임의의 한 문자도 날짜/시간 구분자로 허용한다. 새 검사는 날짜-only 여부만 `date.fromisoformat()`으로 가르므로 1차 리뷰에서 함께 지적한 `"2026-10-31X23:00"`이 여전히 통과한다. 무배정이면 `_last_end()`가 입력 원문을 그대로 반환하므로 비표준 값이 `last_shift_end`에도 남는다.

재현 결과:

```text
prior_last_shift_end = "2026-10-31"       -> INVALID_INPUT  # 수정됨
prior_last_shift_end = "2026-10-31X23:00" -> SUCCESS
last_shift_end = {"A": "2026-10-31X23:00"}
```

영향: 엔진이 승인된 입력 형식 밖의 값을 받아들이고, 다음 기간으로 넘기는 출력은 문서의 `YYYY-MM-DDTHH:MM` 계약도 위반한다. 엄격한 다음 소비자는 이 carry를 파싱하지 못할 수 있다.

날짜-only 판별에 더해 승인된 날짜/시간 구분자와 시간 구성요소를 명시적으로 검증하고, `X` 구분자 회귀 테스트를 추가해야 한다.

## 검증

- `algorithm-engine/.venv/bin/python test_solver.py`: `ok 100`, `ok rotation 90`
- 날짜-only 원 재현: `INVALID_INPUT`
- 비표준 `X` 구분자 재현: `SUCCESS`, 원문 carry
