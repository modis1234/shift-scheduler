# 엔진 입력 견고성 재검토

## 결론

수정 후 재검토 필요. HIGH 1건.

1차의 `default_hourly_wage: 1e308` 웹 API 500 문제는 해결됐다. 같은 입력은 HTTP 200과 `INVALID_INPUT`을 반환한다. 그러나 승인된 “상한 초과 숫자는 예외 없이 `INVALID_INPUT`” 계약을 깨는 더 큰 정수 경계가 남아 있다.

## 발견 사항

### HIGH — 큰 정수에서 유한성 검사 자체가 OverflowError를 발생시킴

- 근거: `algorithm-engine/solver.py:112-114`
- 호출 위치: `algorithm-engine/solver.py:140-145`, `algorithm-engine/solver.py:185-186`

`_is_num`은 정수에도 `math.isfinite(v)`를 먼저 호출한다. Python의 임의 정밀도 정수가 float 변환 범위를 넘으면 `math.isfinite`가 `OverflowError`를 내므로, 명시된 상한을 초과한 입력이 `INVALID_INPUT`으로 반환되지 않고 직접 `solve()` 호출을 중단시킨다.

재현:

```python
data = json.load(open("sample_input.json"))
data["rules"]["default_hourly_wage"] = 10**1000
solve(data)
# OverflowError: int too large to convert to float
```

`employees[].hourly_wage = 10**1000`도 동일하다. `_is_num`에서 `int`는 float 변환 없이 정수 범위만 검사하고, `float`에만 `math.isfinite`를 적용해야 한다. `10**1000` 회귀를 직접 `solve()` 테스트에 포함해야 한다.

형식 변경 필요: **아님.** 사용자 승인 계약에 이미 상한 초과 값은 `INVALID_INPUT`이라고 명시되어 있으며, 그 구현 누락이다.

## 확인 결과

```text
.venv/bin/python test_solver.py                   PASS (ok 100 / ok rotation 90)
default_hourly_wage: 1e308 web API               HTTP 200, INVALID_INPUT
rules.default_hourly_wage: 10**1000 direct solve OverflowError (결함 재현)
employees[].hourly_wage: 10**1000 direct solve   OverflowError (결함 재현)
대상 파일 git diff --check                        PASS
```

전체 작업 트리의 `git diff --check`는 검토 범위 밖 `CLAUDE.md:253`의 EOF 공백 때문에 실패했으며, 이번 대상 세 파일에는 whitespace 오류가 없다.
