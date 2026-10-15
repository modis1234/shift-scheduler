# rules.rotation_pattern 재검토

검토 대상: 1차 리뷰 후 수정된 `algorithm-engine/solver.py`, `algorithm-engine/test_solver.py`, `README.md` 범위.

## 결론

1차 HIGH 입력 타입 결함은 해결됐고, 직원별 고정 위상과 다음 기간 계산식도 배정이 존재하는 정상 경로에서 동작한다. 다만 문서가 다음 기간 전달에 사용하도록 정의한 출력 `rotation_offset`이 배정 없는 직원에게는 전혀 출력되지 않아, 출력 계약에 HIGH 결함이 남아 있다. 수정 후 재검토가 필요하다.

## Finding

### HIGH — 배정이 없는 풀타임 직원의 선택 위상을 출력하지 않아 다음 기간으로 전달할 수 없다

- 근거: `algorithm-engine/solver.py:169`, `algorithm-engine/solver.py:175-205`, `README.md:48-50`
- 솔버는 모든 풀타임 직원의 위상을 `offset_of`에 계산하지만, `rotation_offset`은 실제 시프트의 `assigned_employees` 항목에만 넣는다. 해당 기간에 배정이 한 건도 없는 직원은 결과 어디에도 선택 위상이 남지 않는다.
- 재현: 2026-11-01..03, 2일 근무-1일 휴무, 풀타임 직원 1명, 세 날짜 모두 승인 휴가, 최소 인원 0인 입력은 `SUCCESS`, `legal_violations=0`, `schedules=[]`를 반환한다. 솔버 내부에서는 위상을 선택했지만 결과에서 그 값을 얻을 방법이 없다.
- 영향: README가 지시하는 `(offset + 이전 기간 일수) % cycle` 계산을 모든 직원에 대해 일반적으로 수행할 수 없다. 다음 기간 입력에서 offset을 생략하면 다시 임의 위상을 고르므로, 휴가 기간에도 패턴 시계가 계속 간다는 현재 의미론과 출력 계약이 끊긴다.
- 필요한 방향: 배정 행과 독립된 직원별 위상 맵/목록을 결과에 포함해 모든 대상 풀타임 직원의 선택 위상을 항상 반환하고, 무배정 직원 회귀 테스트를 추가해야 한다.

## 1차 findings 재검증

- 입력 타입: `rotation_pattern="2-1"`, `work_days=true`, `off_days=true`가 모두 `INVALID_INPUT`을 반환했다. 해결됨.
- 기간 위상 전달: 5-1 패턴의 첫 기간에서 출력 offset 1을 얻고, 5일 경과 계산값 0을 다음 기간 입력에 넣었을 때 첫 기간은 11/01~04 근무·11/05 휴무, 다음 기간은 11/06~10 근무로 패턴이 연속됐다. 고정 위상 모델과 계산식은 해결됨.
- 기간 경계의 일반 `max_consecutive_days` 이력 부재는 README에 제한사항으로 명시됐으며 이번 결정 범위 밖으로 처리한다.

## 검증

- `cd algorithm-engine && .venv/bin/python test_solver.py`: 통과 (`ok`, `ok rotation`).
- 타입 오류 3건, 5-1 두 기간 연속성, 전 기간 휴가인 무배정 직원 출력을 별도 재현했다.

