# 기피 근무조 기본값 A+B 검토

## 결론

검토 범위에서 결함 없음. 승인 권고.

## 검토 범위

- `algorithm-engine/solver.py`: 기본값에 `마감` 추가, 활성 근무조와 기피 목록이 전혀 일치하지 않을 때 성공 결과 경고 추가.
- `algorithm-engine/test_solver.py`: 기본값 적용, 전부 미일치, 빈 목록 회귀 검사.
- `README.md`: 새 기본값과 경고 조건 설명.

## 확인

- 기존 `warnings_and_exceptions` 배열을 재사용하고, 최적화가 완료된 뒤 경고를 붙인다. 새 경고 로직은 목적함수·fairness penalty 계산에 관여하지 않는다 (`solver.py:371-384`).
- 기본값은 기존 `Closing`, `Night`를 유지하고 `마감`을 추가하므로 두 키 체계 모두와 정확히 매치된다 (`solver.py:14-20`).
- `undesirable_shifts`가 비어 있지 않고 활성 근무조(hours > 0)와 교집합이 없을 때만 경고한다. 일부 교집합이 있거나 명시적 빈 목록이면 경고하지 않는다 (`solver.py:199-202,371-375`).
- 미일치 `['야간']`을 실제 sample 입력에 설정해 실행: `SUCCESS`, fairness 100, 불일치 경고 정확히 1건. 부분 일치 `['오픈', '야간']`에서는 불일치 경고 없음.
- `cd algorithm-engine && .venv/bin/python test_solver.py`: 통과 (`ok 100`, `ok rotation 90`; 210 배정, 법적 위반 0, 예상 비용 16,099,200).
- 대상 `git diff --check`: 통과.
- 변경은 엔진·README에 한정되어 frontend build/dev를 실행하지 않았다.

## 잔여 범위

부분 일치 목록의 미등록 원소는 의도대로 별도 경고하지 않는 정책으로 확인했다. 이름 오타를 일부 일치 상태에서도 탐지하는 것은 이번 승인된 A+B 범위 밖이다.
