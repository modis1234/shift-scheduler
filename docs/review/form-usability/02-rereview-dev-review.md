# 입력 폼 사용성 재검토

## 결론

통과 권고. 앞서 보고한 LOW 결함이 수정되어 정의되지 않은 근무조의 잘못된 필요 인원 오류에는 field ID가 붙지 않는다. 직원 행 식별 문구 변경도 요청된 동작과 일치한다.

## 확인

- `web-client/src/app/InputForm.tsx:162`: 필요 인원 오류는 `shiftNames.includes(name)`인 경우에만 `F.shift(...)` field를 부여한다. 정의되지 않은 근무조에는 `undefined`가 전달되어 오류 요약은 텍스트로만 렌더되고, 존재하지 않는 입력칸 이동 버튼이 생기지 않는다.
- 재현 조건 `shift_definitions: {Opening: {start: "09:00", end: "18:00"}}`, `shift_requirements: {없는조: {min_count: -1}}`에서 `없는조`는 정의된 이름 목록에 없어 field가 비어 있음을 코드에서 확인했다. 작성자 보고의 버튼 0개 / `f-shift--1-*` ID 0개 결과와 일치한다.
- `web-client/src/app/InputForm.tsx:168-177`: 오류 주체 문구가 직원 배열 행 순번과 정리된 번호를 사용하며 번호가 비어 있으면 행 순번만 사용한다. 중복 번호 행도 각각의 배열 행을 구분한다. 과거 정보 표의 별도 표시에는 변경이 없다.
- `npm run lint --prefix web-client`: 통과.
- 작성자가 scratchpad 복사본에서 tsc/lint/build 및 폼·회귀 검증을 통과했다고 보고함. 공유 트리의 build/dev는 실행하지 않았다.
