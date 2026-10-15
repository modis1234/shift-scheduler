# 기간 경계 최소 휴식 검토

## 결론

수정 후 재검토 필요.

## HIGH — 날짜만 있는 값을 ISO datetime으로 잘못 허용

- 근거: `algorithm-engine/solver.py:51-59`
- 테스트 공백: `algorithm-engine/test_solver.py:91-93`
- 형식 변경 필요: **아니오**. 승인된 `prior_last_shift_end`의 “ISO datetime 문자열” 계약을 그대로 검증하는 수정이다.

`_prior_end()`는 `datetime.fromisoformat()`의 성공 여부만 검사한다. 이 함수는 날짜만 있는 문자열도 자정 datetime으로 변환하므로, 시각이 없는 `"2026-10-31"`이 `INVALID_INPUT` 대신 유효한 직전 종료 시각 `2026-10-31T00:00`처럼 사용된다. 무배정 직원이면 `_last_end()`가 원문을 그대로 반환해 출력의 `last_shift_end`에도 날짜-only 값이 남는다.

재현 입력의 핵심:

```python
{
  "schedule_period": {"start_date": "2026-11-01", "end_date": "2026-11-01"},
  "rules": {},
  "shift_definitions": {"D": {"start": "08:00", "end": "16:00", "hours": 8}},
  "shift_requirements": {},
  "employees": [{
    "id": "A", "name": "a",
    "approved_leaves": ["2026-11-01"],
    "prior_last_shift_end": "2026-10-31"
  }]
}
```

실제 결과:

```text
status = SUCCESS
last_shift_end = {"A": "2026-10-31"}
```

영향: 시각이 누락된 carry를 자정 종료로 추정해 기간 첫 시프트의 휴식 시간을 실제보다 길게 계산할 수 있다. 이 값은 다음 기간 입력으로 다시 전달되므로 최소 휴식 법적 제약을 완화할 가능성이 있다.

날짜와 시각 구성요소가 모두 명시되었는지 별도로 검증하고, 날짜-only 입력을 `INVALID_INPUT`으로 거부하는 회귀 테스트가 필요하다. Python `fromisoformat()`이 허용하는 비표준 단일 문자 구분자(`2026-10-31X23:00`)도 현재 `SUCCESS`이므로 승인된 ISO datetime 범위에 맞게 함께 제한해야 한다.

## 확인한 정상 범위

- 기간 경계 휴식 제약은 첫날뿐 아니라 전체 기간의 시프트를 검사한다.
- 자정을 넘는 현재 기간 시프트의 마지막 종료 시각 계산은 `_window()`와 `_at()` 조합으로 다음 날짜를 반영한다.
- `validate()`는 직원 키 집합, 경계 휴식, `last_shift_end` 타입과 값을 독립 재계산해 대조한다.
- 전체 테스트 실행 결과: `ok 100`, `ok rotation 90`.
