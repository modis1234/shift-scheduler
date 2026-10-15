# UI 레이아웃 수정 재검토

## 결론

이번 수정 범위에서 확인한 결함 없음. 수정 후 승인 권고.

## 범위와 근거

- MEDIUM 1: 390px 이하에서 생성 카드의 `sm:sticky`가 비활성이고, 640px 이상에서는 sticky 상태를 유지한다 (`web-client/src/app/ScheduleRunner.tsx:411-412`). 640px 이상에서 브라우저 포커스 스크롤이 sticky 카드 아래로 입력을 가리지 않도록 viewport scroll-padding 6rem을 둔다 (`web-client/src/app/globals.css:106-110`).
- MEDIUM 2: 검증 오류가 있을 때 제출 핸들러가 최대 세 건의 구체 오류를 `role="alert"` 본문에 스크린리더 전용으로 포함하고, 요약 목록으로 포커스를 이동한다 (`web-client/src/app/ScheduleRunner.tsx:283-288,398-406,425-429`). 정상적인 검증 오류 경로에서 요약 요소는 `validationErrors`로 이미 렌더되어 있어 포커스 대상이 존재한다.
- 입력별 `aria-invalid`/`aria-describedby`는 이번 범위의 차단 조건에서 제외한다는 lead의 2026-10-15 07:12 결정을 따랐다.
- 관련 화면 규약: `docs/design/ui-guide.md`의 모바일 스크롤, 키보드 접근성 및 오류 안내 기준.

## 검증

- `cd web-client && npm run lint`: 통과.
- `cd web-client && npm run build`: 통과 (Next.js 15.5.27, 타입 확인 포함).
- 검토 대상 파일 `git diff --check`: 통과.

테스트 환경에는 브라우저 재현을 위한 별도 자동화 테스트가 없었다. 요청에 첨부된 구현 측 보고(390px/1440px 및 140회 Tab, 제출 시 오류 알림과 포커스)를 코드 경로와 대조했고, 새로운 재현 가능한 결함은 찾지 못했다.
