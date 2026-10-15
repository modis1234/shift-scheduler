# rules.rotation_pattern 3차 검토

검토 대상: 2차 HIGH 수정 후 `algorithm-engine/solver.py`, `algorithm-engine/test_solver.py`, `README.md` 변경 범위.

## 결론

배정이 없는 풀타임 직원의 위상 누락은 해결됐다. 기존 전체 테스트와 무배정 재현이 통과하고, 최상위 위상과 행별 위상 불일치도 기존 집합 검사로 검출된다. 다만 `rotation_pattern`이 활성화됐지만 풀타임 직원이 0명인 성공 응답에서는 문서화·요청된 `rotation_offsets` 키 자체가 누락되는 결과 스키마 불일치가 남아 있다. 비차단 MEDIUM 수정 후 clean 판정 가능하다.

## Finding

### MEDIUM — 풀타임 직원이 0명이면 성공 응답에서 `rotation_offsets` 키가 누락된다

- 근거: `algorithm-engine/solver.py:221-222`, `README.md:49`
- `if offset_of` 조건은 빈 사전일 때 키 생성을 생략한다. 그러나 이번 출력 계약은 `rotation_pattern`이 있는 성공 응답에 직원별 위상 맵을 제공하고, 문서는 이를 풀타임 전원의 맵으로 정의한다. 대상 직원이 없으면 값은 빈 맵이어야 한다.
- 재현: 2026-11-01..03, 2-1 패턴, 파트타임 직원 1명, 요구 인원 없음 입력은 `SUCCESS`를 반환하지만 `rotation_offsets`가 결과 키에 없다.
- 영향: 성공 응답의 스키마가 직원 구성에 따라 달라져, 문서대로 `rotation_offsets`를 읽는 호출자가 별도 누락 분기를 두지 않으면 실패한다.
- 필요한 방향: `offset_of`의 truthiness가 아니라 `rp is not None`일 때 `result["rotation_offsets"] = offset_of`를 설정하고, 풀타임 0명일 때 빈 맵을 검증하는 테스트를 추가한다.

## 2차 finding 재검증

- 전 기간 휴가인 풀타임 직원 최소 입력은 `SUCCESS`, `schedules=[]`, `rotation_offsets={"E": 0}`, `validate=[]`를 반환했다. 해결됨.
- `test_solver.py` 전체가 통과했다.

