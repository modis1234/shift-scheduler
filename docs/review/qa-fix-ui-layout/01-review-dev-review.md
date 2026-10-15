# UI QA 수정 4건 재검토

## 결론

검토 범위에서 결함 없음. 승인 권고.

## 확인 결과

- **M1 기간·회전 이어가기** — `ScheduleRunner.tsx:68-94`. 이전 기간이 시작월의 1일~말일인 경우에만 다음 기간을 다음 달 전체로 설정하고, 그 외에는 동일한 실제 일수로 연속시킨다. 회전 위치는 다음 기간 길이가 아니라 이전 기간의 inclusive 일수로 넘긴다. `buildNextInput` 실제 함수를 추출 실행해 2026-11→12월(31일), 12월→2027-01월, 2027-01→2월(28일), 2028-01→2월(29일), 2028-02→3월(31일), 7일 사용자 지정 구간, 29일 사용자 지정 구간을 확인했다. 7건 모두 날짜, rotation offset, 연속근무일·주간근로시간·마지막 종료시각 carry, 원본 입력 불변 검증 통과.
- **M2 비성공 결과 지표** — `ScheduleRunner.tsx:492-508`. `SUCCESS`가 아니면 공정성, 배정수, 위반수, 인건비를 모두 `-`로 표시하고 상태와 도움말은 유지한다.
- **M4 포커스 이동** — `ScheduleRunner.tsx:351-359,480-490`. 결과, 요청 오류, 다음 기간 안내 요소가 각각 실제 렌더된 뒤 focus target으로 사용된다. QA 보고서는 SUCCESS/INFEASIBLE 및 다음 기간 이동, 429 응답의 `activeElement` 확인을 보고했다. 코드 참조와 일치한다.
- **L3 문구·정보 순서** — `InputForm.tsx:22-27,501-510,675-681`. `Off` 데이터 키는 유지하면서 UI에는 “쉬는 날”과 현재 design 승인 설명 문구 “근무가 없는 날입니다. 따로 설정하지 않아도 됩니다.”를 표시한다. carry 필드는 가이드의 순서와 일치한다. INFEASIBLE 엔진 원문은 화면 안내와 중복되지 않도록 숨긴다 (`ScheduleRunner.tsx:491-492`).

## 검증

- 공유 `web-client`: `npm run lint`, `npx tsc --noEmit` 통과.
- 공유 트리와 분리한 `/tmp/ui-review-build.0ySGBh` 복사본에서 `ENGINE_DIR=/home/dhlee2/Workspace/shift-scheduler/algorithm-engine npm run build` 통과 (Next.js 15.5.27). 최초 build는 복사본 기본 상대경로에 엔진 샘플이 없어 정적 페이지 생성 단계에서 실패했으며, 엔진 경로를 지정한 재실행에서 완료했다.
- QA 담당자가 기록한 브라우저·가짜 API 확인: `scratchpad/qa/REPORT.md`의 M1/M2/M4/L3 후속 결과를 코드와 대조했다. 브라우저 자동화는 이번 독립 검토에서 다시 실행하지 않았다.
- 검토 대상 `git diff --check`: 통과.
- 공유 `web-client`에서는 `next build`/`next dev`를 실행하지 않았고 포트 3000도 조작하지 않았다.

## 범위 메모

이전 기간 휴가 칩 유지와 개별 입력 오류 필드 표시(aria-invalid/aria-describedby)는 QA/lead가 후속 범위로 분리한 사항이며 이번 수정의 승인 조건으로 삼지 않았다.
