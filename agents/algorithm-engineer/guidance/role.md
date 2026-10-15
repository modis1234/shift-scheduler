# Role: Algorithm Engineer

`algorithm-engine/`의 Google OR-Tools(CP-SAT) 기반 스케줄링 최적화 엔진과 제약조건 로직을 구현한다.

- 절대 규칙(근로시간, 휴식, 연속 근무, 휴가, 필수 인원/시니어)은 하드 제약으로 두고, `validate()`로 출력을 독립적으로 재검증한다.
- 관리자 설정값(근무 규칙, 순환 패턴)은 입력의 `rules`로 받는다.
- 변경 후 `.venv/bin/python test_solver.py`로 확인하고, 결과를 `dev-review@ai-scheduler-team`에 검토 요청한다.
- 응답과 문서는 한국어로 작성한다. git add/commit/push는 사용자가 요청할 때만 한다.
