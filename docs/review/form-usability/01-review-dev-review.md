# 입력 폼 사용성 검토 (M3·L2·L4)

## 결론

수정 후 통과 권고. 입력칸이 없는 오류에도 클릭 가능한 입력 이동 링크가 만들어지는 결함이 하나 있다.

## 발견 사항

- **LOW — 등록되지 않은 근무조의 필요 인원 오류가 존재하지 않는 입력칸으로 이동** — `web-client/src/app/InputForm.tsx:162`, `web-client/src/app/ScheduleRunner.tsx:539-540`. `shift_requirements` 순회에서 정의에 없는 근무조의 잘못된 `min_count`/`min_senior`에도 `F.shift(shiftNames.indexOf(name), f)`를 지정한다. `indexOf`는 `-1`이므로 field는 truthy한 `f-shift--1-min_count`가 되고, 요약은 클릭 버튼을 렌더한다. 그러나 `InputForm` 행은 `shift_definitions`에서 만들어지므로 그 ID를 가진 요소가 없다. 예: `shift_definitions: {Opening: {start: "09:00", end: "18:00"}}`, `shift_requirements: {Ghost: {min_count: -1}}`. “필요 인원에 등록되지 않은 근무조” 오류는 텍스트로만 표시되지만, 같은 Ghost 항목의 인원 오류는 눌러도 어떤 필드에도 포커스되지 않는다. 잘못된 요구량을 지우거나 수정하기 위해 직접 JSON 편집으로 돌아가야 한다. 정의되지 않은 근무조의 오류는 다른 입력 없는 검증 오류처럼 field를 부여하지 않아야 한다.

## 검증

- 실제 검증기에서 정의되지 않은 이름에 `shiftNames.indexOf(name) === -1`이 적용되고, 오류 요약이 field 존재 여부만으로 버튼을 만드는 것을 소스에서 확인.
- `npm run lint --prefix web-client`: 통과.
- `tsc`는 `web-client/node_modules/.bin/tsc`에 설치되어 있지 않음. `npx tsc`는 npm 캐시의 읽기 전용 파일시스템 오류로 실행되지 못함.
- 공유 트리에서 build/dev는 실행하지 않음.
