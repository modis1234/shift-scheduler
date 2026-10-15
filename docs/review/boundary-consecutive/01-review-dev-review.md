# 기간 경계 연속 근무 검사 리뷰

검토 대상: `algorithm-engine/solver.py`, `algorithm-engine/test_solver.py`, `README.md`의 `prior_consecutive_work_days` / `trailing_consecutive_work_days` 변경 범위.

## 결론

모델의 경계 제약식과 `_trailing` 계산은 정상이며, `prior == max_consecutive_days`, 짧은 기간, 휴무 포함 경로도 의도와 일치한다. 그러나 다음 기간의 법적 제약 입력으로 직접 사용되는 `trailing_consecutive_work_days`를 `validate()`가 재계산·대조하지 않아 독립 검증 계약에 HIGH 결함이 있다. 수정 후 재검토가 필요하다.

## Finding

### HIGH — `validate()`가 출력의 trailing 연속근무 값을 검증하지 않는다

- 근거: `algorithm-engine/solver.py:240-244`, `algorithm-engine/solver.py:302-307`
- 솔버는 실제 근무일로 `trailing_consecutive_work_days`를 계산하지만, 검증기는 입력 `prior`와 기간 첫 근무일만 검사한다. 결과에 기록된 trailing 맵의 값·누락·대상 직원 집합은 전혀 확인하지 않는다.
- 재현: 상한 5일, `prior=3`, 하루짜리 기간에 직원 A가 근무한 정상 결과는 `trailing={"A": 4}`이고 `validate=[]`다. 이 값을 `{"A": 0}`으로 변조해도 `validate=[]`가 그대로 반환된다.
- 영향: 검증을 통과한 잘못된 carry 값을 다음 기간의 `prior_consecutive_work_days`로 넘기면 경계 연속근무 제한이 완화돼 법적 상한을 넘는 스케줄을 허용할 수 있다. 현재 `validate()`의 “출력 근무표를 입력과 독립적으로 재검증”한다는 계약과 맞지 않는다.
- 필요한 방향: `validate()`가 `by_emp`와 기간 날짜로 기대 trailing 값을 독립 계산하고, 전 직원 키의 완전성 및 각 값을 `result.trailing_consecutive_work_days`와 대조해야 한다. 값 변조·직원 누락·불필요한 직원 키 회귀 테스트를 추가해야 한다.

## 나머지 판단

- 경계 제약 `sum(first n+1-prior days) <= n-prior`는 기간이 더 짧을 때도 올바르다. 초과가 가능해지는 정확한 길이에 도달하면 최소 하루 휴무를 강제한다.
- `prior == max_consecutive_days`이면 첫날 휴무가 강제된다. 필수 인원 때문에 근무가 강제되는 단일 직원 입력이 `INFEASIBLE`인 것을 확인했다.
- 고정 rotation 위상과 prior가 충돌할 때 `INFEASIBLE`로 처리하는 판단은 타당하다. 휴가나 다른 직원 구성에 따라 해소될 수 있으므로 입력 자체의 형식 오류가 아니다.
- `prior`의 범위·타입 검사에서 음수, 초과, bool, float를 `INVALID_INPUT`으로 처리하는 구현은 적절하다.

## 검증

- `cd algorithm-engine && .venv/bin/python test_solver.py`: 통과 (`ok`, `ok rotation`).
- 정상 trailing 계산, 변조된 carry 값 미검출, `prior == max` 충돌을 별도 최소 입력으로 재현했다.

