# 기간 경계 주당 근로시간 검토

## 결론

수정 방향에 대한 사용자 결정 후 재검토 필요.

## HIGH — 일요일 종료 carry를 월요일 시작 기간에 그대로 넘기면 새 ISO 주를 잘못 차감

- 근거: `algorithm-engine/solver.py:74-77`, `algorithm-engine/solver.py:155-159`, `README.md:55`
- 테스트 공백: `algorithm-engine/test_solver.py:95-114`
- 형식 변경 필요: **예**. 현재 출력 의미 또는 전달 규칙을 바꾸거나 주 식별 정보를 추가해야 하므로 lead를 통한 사용자 결정이 필요하다.

`_trailing_week()`는 `end_date`가 속한 ISO 주의 누계를 반환한다. README는 이 값을 다음 기간의 `prior_week_hours`로 그대로 넘기라고 한다. 그러나 기간이 일요일에 끝나고 다음 기간이 월요일에 시작하면 ISO 주가 바뀐다. 일요일까지의 누계를 월요일 새 주의 선행 근무시간으로 넣어 새 주 상한을 잘못 줄인다.

재현:

```text
상한: 8h, 하루 시프트: 8h
기간 1: 2026-11-01(일), A 8h 배정
  -> SUCCESS, trailing_week_hours = {A: 8}
기간 2: 2026-11-02(월), A 8h 필요
  prior_week_hours = 기간 1의 8을 그대로 전달
  -> INFEASIBLE
기간 2에서 prior_week_hours = 0
  -> SUCCESS
```

영향: 실제 새 ISO 주에는 선행 근무가 없는데 이전 주 시간을 합산해 가능한 근무표를 `INFEASIBLE`로 만든다. 기간을 주 경계에서 나누는 정상 사용 경로에서 발생한다.

현재 승인 계약은 “end_date가 속한 주의 시간”과 “다음 기간에 그대로 전달”을 동시에 약속하므로 주 경계에서 양립하지 않는다. 다음 중 어떤 의미를 채택할지 사용자 결정이 필요하다.

- 소비자가 다음 `start_date`의 ISO 주가 바뀌면 0으로 재설정하도록 전달 규칙을 변경
- 출력에 해당 ISO 주 식별자를 추가해 소비자가 검증하도록 형식 확장
- 연속된 다음 날을 기준으로 carry 의미를 재정의

## 확인한 정상 범위

- 같은 ISO 주 안에서 `prior_week_hours`는 모델과 validator의 주간 합계에 반영된다.
- `trailing_week_hours`는 직원 키 집합, 정확한 `int` 타입, 재계산 값과 대조된다.
- 상한 초과·음수·bool·float·문자열 prior는 `INVALID_INPUT`이다.
- 전체 테스트: `ok 100`, `ok rotation 90`.
