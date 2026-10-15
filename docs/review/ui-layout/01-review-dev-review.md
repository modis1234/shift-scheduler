# UI 레이아웃·접근성 검토

## 결론

수정 후 승인 권고. 시각 토큰·날짜/숫자 표기·rotation_offset 변환·오류 상태 매핑은 요청한 방향으로 정리됐고 lint/build도 통과했다. 다만 모바일 sticky 생성 바의 컨트롤 가림과 입력 검증 오류의 스크린리더 전달 누락을 확인했다.

## 발견 사항

- **MEDIUM — 모바일 sticky 생성 바가 입력 폼/키보드 포커스 영역을 덮음** — `web-client/src/app/ScheduleRunner.tsx:402-424`. 2단계 카드가 `sticky bottom-4 z-20`으로 입력 섹션 뒤에 놓여 있어 페이지를 스크롤해 폼을 편집할 때 viewport 하단을 덮는다. 제공된 `after-light-390.png`에서 생성 바가 근무조 표 헤더/첫 행과 겹쳐 컨트롤 일부를 가리는 것이 보인다. 키보드 포커스가 가려진 입력으로 이동하면 포커스 링/값을 볼 수 없을 수 있다. 모바일에서는 바를 non-sticky로 두거나, 포커스된 입력이 바 아래에 숨지 않도록 스크롤 여백/레이아웃을 조정해야 한다.
- **MEDIUM — 폼 검증 세부 오류가 제출 시 스크린리더에 전달되지 않음** — `web-client/src/app/ScheduleRunner.tsx:278-280,388-396,415-421`; 입력 예 `InputForm.tsx:266-275`. 검증 오류 목록은 live/alert 역할 없이 표시되고 개별 입력에도 `aria-invalid`/`aria-describedby`가 없다. 생성 버튼을 눌렀을 때 role=alert로 읽히는 문구는 일반 안내(“확인이 필요한 항목을 먼저 고쳐 주세요”)뿐이라, 예를 들어 어느 근무조의 최소 인원 값이 잘못됐는지 즉시 알 수 없다. 오류 목록을 제출 실패 시 live alert로 알리고 해당 입력에 오류 상태/설명을 연결해야 한다.

## 확인 결과

- 라이트/다크 팔레트와 390px·1440px 결과 화면을 제공된 스크린샷으로 확인. 버튼/입력의 focus-visible 링, caption/scope, 행별 삭제 label, JSON 전환 `aria-pressed`, 요청 오류 `role=alert`는 확인했다.
- `rotation_offset`은 화면의 1부터 시작하는 값과 엔진 0부터 시작하는 값을 표시·저장 시 각각 +1/-1 변환한다 (`InputForm.tsx:691-700`).
- 400/413/429/500/504 오류는 사용자용 상황/행동 문구로 매핑된다 (`ScheduleRunner.tsx:214-229`).
- `npm run lint`: 통과.
- `npm run build`: 통과 (Next.js 15.5.27).
- 지정 파일에 대한 `git diff --check`: 통과.

