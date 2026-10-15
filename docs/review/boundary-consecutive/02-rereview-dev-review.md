# 기간 경계 연속 근무 검사 재검토

검토 대상: `validate()`의 `trailing_consecutive_work_days` 재계산·대조 수정과 회귀 테스트.

## 결론

1차 HIGH의 핵심인 값 변조와 직원 키 누락은 해결됐다. 기존 재현 `4→0`은 위반으로 검출되고 전체 테스트도 통과한다. 다만 출력 맵의 타입과 정확한 키 집합을 검증하지 않아 비차단 MEDIUM 계약 결함이 남아 있다.

## Finding

### MEDIUM — trailing 맵의 boolean 값과 미등록 직원 키가 검증을 통과한다

- 근거: `algorithm-engine/solver.py:308-313`
- 검증기가 `trailing.get(i) != expected`만 비교한다. Python에서는 `True == 1`, `False == 0`이므로 기대값이 1/0일 때 boolean이 잘못된 출력 타입이어도 통과한다. 또한 입력 직원만 순회해 추가 키는 무시한다.
- 재현: 하루 근무한 직원 A의 정상 trailing `{"A": 1}`을 `{"A": true}`로 바꾸거나 `{"A": 1, "GHOST": 5}`로 바꿔도 두 경우 모두 `validate=[]`다.
- 영향: boolean carry는 다음 기간 입력 검사에서 `INVALID_INPUT`이 되어 정상 연속 스케줄 흐름을 중단시킨다. 미등록 키를 포함한 맵은 문서의 `{직원 id: 일수}` 계약과 다르며, 맵을 순회하는 소비자에 존재하지 않는 직원을 전달할 수 있다.
- 필요한 방향: 출력이 dict인지, 키 집합이 정확히 입력 직원 ID 집합인지, 각 값이 `type(value) is int`인지 먼저 검사한 뒤 기대값과 비교한다. boolean 및 추가 키 회귀 테스트를 추가한다.

## 1차 finding 재검증

- `prior=3`, 하루 근무의 기대 trailing 4를 0으로 바꾸면 위반을 반환한다. 해결됨.
- 알려진 직원 키를 삭제하면 기대값과 `None`이 달라 위반을 반환한다. 해결됨.
- 정상 샘플의 `validate()`는 0건이며 `test_solver.py` 전체가 통과한다.

