# 캘린더 저장·게시 프런트엔드 검토

## 결론

한 건의 LOW 결함을 확인했다. 저장·게시 액션이 `SUCCESS`와 비어 있지 않은 일정 배열을 모두 요구하므로, 엔진이 정상적으로 만든 빈 일정 결과를 저장할 수 없다.

## 발견 사항

- **LOW — 유효한 빈 근무표 결과에 저장·관리 액션이 숨겨짐** — `web-client/src/app/ScheduleRunner.tsx:543,746`. `hasGrid`는 `result.schedules?.length > 0`이어야 참이고, 저장·게시·삭제 액션 전체가 `success && hasGrid` 안에 있다. 하지만 입력 검증은 직원 배열이 비어 있지 않은지 검사하지 않고, 요구 인원 0도 허용한다(`web-client/src/app/InputForm.tsx:166`, `algorithm-engine/solver.py:164-165,288`). 엔진 결과 조립은 배정이 있을 때만 schedule 행을 추가하고(`solver.py:368-369`), 이어 `SUCCESS`를 반환한다(`solver.py:383`). 따라서 요구 인원이 모두 0인 성공 결과는 `schedules: []`가 될 수 있으며, 해당 결과에서 저장 버튼을 쓸 수 없다. 결과 데이터가 없더라도 저장/삭제 등 상태 액션을 결과 그리드 표시 조건과 분리해야 한다.

## 검증

- `npm run lint --prefix web-client`: 통과.
- 엔진의 입력·결과 경로와 FE 액션 조건을 대조했다. 로컬 Python에는 `ortools`가 없어 0명/최소 인원 0 입력으로 solver를 직접 실행하는 재현은 완료하지 못했다. 다만 비어 있지 않은 직원 목록과 모든 `min_count=0`인 입력도 같은 경로로 배정 없이 SUCCESS가 가능하다.
- 공유 `web-client`에서 build/dev는 실행하지 않았다.
