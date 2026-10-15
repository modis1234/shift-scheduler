# 엔진 입력 견고성 3차 검토

## 결론

승인 가능. 추가 결함 없음.

형식 변경 필요: **승인 완료.** 숫자 상한표와 `rules.time_limit_seconds` 최대 100은 dev-lead가 전달한 사용자 승인 기준과 일치한다.

## 확인 결과

- `algorithm-engine/solver.py:108-115`: 정수는 float 변환 없이 범위를 검사하고, float에만 `math.isfinite`를 적용한다. `bool`은 두 경로 모두 거부한다.
- `algorithm-engine/solver.py:140-145`, `algorithm-engine/solver.py:183-186`: 승인된 상한과 유한성 검사가 rules 및 직원 숫자 필드에 적용된다.
- `algorithm-engine/test_solver.py:136-152`: `1e308`, `Infinity`, `NaN`, `2**63`, `10**1000`과 각 상한 초과 회귀가 직접 `solve()`와 `json.dumps(..., allow_nan=False)`를 검증한다.
- `README.md:52-64`: 승인된 숫자 상한과 `time_limit_seconds` 최대 100이 구현과 일치한다.
- 1차 재현인 `default_hourly_wage: 1e308`은 앞선 재검토에서 웹 API HTTP 200 `INVALID_INPUT`으로 확인됐다.
- 2차 재현인 rules/직원 시급 `10**1000`은 이제 직접 `solve()`에서도 예외 없이 `INVALID_INPUT`이다.

독립 경계 검사에서는 `default_hourly_wage`, `min_rest_hours`, `employees[].hourly_wage` 각각에 `10**1000`, `-10**1000`, `Infinity`, `-Infinity`, `NaN`을 넣은 15건이 모두 `INVALID_INPUT`이었고 표준 JSON 직렬화를 통과했다.

## 검증

```text
.venv/bin/python test_solver.py  PASS (ok 100 / ok rotation 90)
극단값 직접 solve 15건           PASS (전부 INVALID_INPUT, 표준 JSON)
대상 파일 git diff --check       PASS
```
