# 엔진 입력 견고성 검토

## 결론

수정 후 재검토 필요. HIGH 1건.

## 발견 사항

### HIGH — 숫자 검사가 상한·연산 결과의 유한성을 보장하지 않아 웹 API 500이 남아 있음

- 근거: `algorithm-engine/solver.py:98-103`, `algorithm-engine/solver.py:129-132`, `algorithm-engine/solver.py:168-169`
- 영향 경로: `algorithm-engine/solver.py:328`, `algorithm-engine/solver.py:360-365`, `algorithm-engine/solver.py:489`

`_is_num`과 `_is_int`는 하한만 검사한다. 따라서 JSON으로 정상 표현되는 매우 큰 숫자가 입력 검사를 통과하지만, 비용 합산은 `float('inf')`가 되고 `json.dumps`는 표준 JSON이 아닌 `Infinity`를 출력한다. 웹 route의 `JSON.parse`가 이를 거부해, 이번 변경이 제거하려는 500 응답이 다른 형태의 잘못된 입력에서 그대로 발생한다.

재현:

```text
sample_input.json의 rules.default_hourly_wage를 1e308로 변경
python solver.py <input>
=> status: SUCCESS
=> summary.estimated_labor_cost: Infinity

같은 입력을 POST /api/schedule
=> HTTP 500
=> {"error":"엔진 출력이 올바른 JSON이 아닙니다."}
```

정수 필드도 같은 검사의 빈틈이 있다. `shift_definitions.Opening.hours`, `shift_requirements.Opening.min_count`, 또는 `rules.max_weekly_hours`에 `2**63`을 넣으면 `_check_input`은 통과하지만 `solve()`가 OR-Tools 식 구성 중 `TypeError`를 낸다. CLI 안전망은 이를 일반 `INVALID_INPUT`으로 바꾸지만, 직접 `solve()`를 쓰는 호출자는 여전히 예외를 받는다.

숫자 필드에 엔진이 실제로 처리 가능한 상한과 유한성 검사를 적용하고, 출력 직전에도 모든 숫자가 표준 JSON으로 직렬화 가능한지 검증하는 회귀가 필요하다. 테스트는 CLI 상태뿐 아니라 `solve()`가 예외를 내지 않는지와 웹 API가 500이 아닌 `INVALID_INPUT`을 반환하는지 확인해야 한다.

형식 변경 필요: **숫자 필드의 허용 상한을 입력 계약에 명시해야 한다.** 상한 선택은 dev-lead를 거쳐 사용자 승인이 필요하다.

## 검증 결과

```text
.venv/bin/python test_solver.py  PASS (ok 100 / ok rotation 90)
{"employees":"x"} CLI          exit 0, INVALID_INPUT
{"employees":"x"} web API      HTTP 200, INVALID_INPUT
default_hourly_wage: 1e308 CLI  SUCCESS + Infinity (결함 재현)
default_hourly_wage: 1e308 API  HTTP 500 (결함 재현)
git diff --check                PASS
```
