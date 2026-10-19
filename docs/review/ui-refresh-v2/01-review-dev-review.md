# UI 리프레시 v2 검토

## 결론

**통과.** 지정된 `730f203` 커밋과 그 위의 검수 보정 2줄에서 기능·데이터 흐름·API 계약 변경은 확인되지 않았다. 수정 요청할 결함 없음.

## 검토 범위 및 확인

- `730f203`: 대상 컴포넌트 변경은 주로 클래스 및 표현 변경이다. 보기 전환 컨트롤은 `aria-pressed`와 동일한 상태 변경 handler를 유지하고, `<button>` 요소도 유지한다. 입력 state·저장 API·일정 데이터 변환은 변경되지 않았다.
- 그리드 폭: `ScheduleRunner.tsx`는 직원 열 128px + 날짜 열당 40px를 유지하고, 30일 표 너비는 1,328px이다. 1440px 뷰포트에서 메인 여백 및 결과 카드 안쪽 여백을 제외해도 들어가는 폭이며, 직원 열의 `sticky left-0`도 그대로다.
- 스타일 규칙: 시프트 토큰에는 빨강 계열이 없고 휴가 색과 구별된다. 전역 `:focus-visible` outline이 유지되며, 시스템 다크 모드 토큰과 인쇄 시 shadow/backdrop blur 제거 규칙이 존재한다. reduced-motion은 전환을 끄고 명시적으로 진행 스피너만 유지한다.
- 아이콘: `layout.tsx`의 `/app-icon.svg` favicon 경로가 `public/app-icon.svg`와 일치하고, 해당 파일은 `docs/design/app-icon/app-icon.svg`와 동일함을 확인했다.
- 작업 트리의 지정 보정: 지표 `break-all` → `whitespace-nowrap`는 숫자 표현만 조정한다. 작은 화면의 `.metric-value` 20px 및 `.app-header` 88% 배경은 스타일 토큰 변경이다.
- `package.json`에 신규 의존성 변경은 없다.

## 검증

- `npm run lint --prefix web-client`: 통과.
- `./web-client/node_modules/.bin/tsc --noEmit -p web-client/tsconfig.json`: 통과.
- 공유 개발 서버를 건드릴 수 있는 build/dev 명령은 실행하지 않았다.

현재 공유 작업 트리에 섞인 Postgres·직원 공유 기능 변경은 이번 범위에서 제외했다.
