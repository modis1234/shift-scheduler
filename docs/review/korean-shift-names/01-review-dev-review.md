# 한글 근무조 이름 변경 검토

## 결론

수정 후 승인 권고. **MEDIUM 1건**: 선택 규칙 `undesirable_shifts`를 생략할 때 기존 기본값이 새 한글 시프트 키와 일치하지 않아 기피 근무 균등화가 조용히 꺼진다. 현재 샘플은 이 규칙을 명시하므로 기본 샘플 실행은 영향받지 않는다.

## 발견 사항

- **MEDIUM — 한글 샘플의 선택 규칙 생략 시 기피 근무 균등화 비활성화** — `algorithm-engine/solver.py:18,195,202`; 새 샘플 `algorithm-engine/sample_input.json:11-13`; 선택 규칙 설명 `README.md:68`.
  - `rules` 객체는 선택이고 기본값은 merge된다. 기본 `undesirable_shifts`는 `Closing`, `Night`지만, 새 샘플은 해당 시프트를 `마감`으로 이름 변경했다.
  - 솔버는 `shifts` 키와 규칙 배열의 정확한 문자열 교집합만 `undesirable`로 취급한다. 따라서 샘플에서 선택 키 `undesirable_shifts`를 제거하면 기피 근무 최적화와 해당 배정 사유가 모두 빠진다.
  - 재현: 기존 HEAD 샘플과 새 샘플 각각에서 `rules.undesirable_shifts`를 제거한 뒤 같은 현재 솔버에 전달. 기존 영문 키 샘플에서는 기피 균등 배정 사유 60건, 한글 키 샘플에서는 0건이었다. 둘 다 `SUCCESS`여서 비활성화가 오류로 드러나지 않는다.
  - 현재 샘플은 `undesirable_shifts: ["마감"]`을 명시해 정상이며, `solver.py`의 기본값 변경은 이번 변경 범위 밖이다. 기본값을 한글화하면 기존 영문 시프트 키 입력과의 동작 호환성이 달라질 수 있으므로 lead가 기대 기본 동작과 호환성 방침을 결정해야 한다.
  - **형식 변경 필요: 아니요.** 입력 필드나 출력 형식 변경은 아니지만, 수정 방향은 선택 키의 기본 동작을 바꾸므로 lead 결정이 필요하다.

## 확인 결과

- `cd algorithm-engine && .venv/bin/python test_solver.py`: 통과 (`ok 100`, rotation `ok 90`, 총 배정 210, 법적 위반 0, 비용 16,099,200).
- 선택 `undesirable_shifts` 생략 재현: 기존 이름에서 일치 60건, 새 한글 이름에서 0건.
- 요청 범위 `git diff --check`: 통과.
- 변경된 샘플/테스트의 나머지 참조는 한글 키와 일치한다. `Night` 참조는 미정의 키 거부 검증용으로 유지되며 solver 동작은 변경되지 않았다.
