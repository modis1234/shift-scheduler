# Android 1a 앱 설치 기반 리뷰

대상: `qitem-20261021230627-78354f7349758483` (`feature/pwa-install-base` 미커밋 변경분)

## Finding

### MEDIUM — `/app`에 기획된 개인정보 처리방침 링크가 없다

- 근거: `docs/planning/android-app.md:121-123`, `web-client/src/app/app/AppStartView.tsx:53-66`, `docs/planning/android-app.md:370-374`
- 기획 6.1은 앱 시작 화면 구성에 개인정보 처리방침 링크를 명시하지만, 역할 선택 화면에는 관리자 로그인과 직원 링크 안내만 있다. 저장소에도 연결할 개인정보 처리방침 페이지나 URL이 없다.
- 구현 기록은 “해당 페이지가 아직 없어 넣지 않았다”고 적어 누락을 인지하고 있지만, 사용자 승인이나 단계 계약 변경 없이 필수 화면 요소를 생략한 상태다.
- 영향: 설치 앱의 공통 시작 화면에서 사용자가 개인정보 처리 기준을 확인할 경로가 없다. 후속 Web Push에서 기기별 구독 정보를 수집하기 시작하면 기획 9절의 앱 내 정책 제공 조건과도 바로 충돌한다.
- 수정 방향: 실제 내용을 제공하는 정책 페이지/URL을 만들고 `/app`에서 연결한다. 1a에서 의도적으로 미룰 결정이라면 사용자 승인을 받아 6.1의 완료 범위를 명시적으로 변경해야 한다.

## 확인된 정상 범위

- manifest는 `id: "/"`, `start_url: "/app"`, `scope: "/"`, standalone 표시와 192·512·maskable 아이콘을 제공한다. PNG 실제 크기도 선언과 일치한다.
- 루트 layout이 관리자·직원 경로 모두에 manifest, Apple icon, light/dark theme color를 제공한다.
- `/app`은 공개 경로이며, 유효한 관리자 세션은 서버에서 `/`로 이동한다. 비로그인 상태는 마지막 직원 공유 코드를 검사하고 유효하면 직원 화면으로, 404면 저장값 삭제·만료 안내로, 네트워크 실패면 오프라인 재시도로 분기한다.
- 정상 직원 공유 API 응답 뒤에만 마지막 코드를 저장하고, 같은 저장 코드의 404에서만 삭제한다.
- 서비스 워커는 프로덕션에서만 `/sw.js`를 등록한다. fetch handler는 navigation 요청만 네트워크 우선 처리하고 실패할 때 `/offline.html`을 반환한다.
- Cache Storage에 추가하는 자원은 `/offline.html` 하나뿐이다. API·근무표·관리자 일정·앱 셸 캐시 경로는 없다.
- middleware의 `/app` 공개 처리와 `sw.js`·`offline.html` 정적 제공 경로를 확인했다. 기존 인증 API는 각 route에서도 세션을 검증하며 이번 예외로 공개되는 현재 동적 데이터 경로는 확인되지 않았다.
- 기존 `/s/`의 no-store·noindex·no-referrer 처리와 서버 404 검증은 유지된다.
- 192 및 maskable 512 아이콘을 직접 확인했으며 maskable 아이콘은 투명 가장자리 없이 배경을 채운다.

## 검증

- `npm run lint`: 통과
- `npx tsc --noEmit`: 통과
- `git diff --check`: 통과
- manifest JSON 파싱 및 `public/sw.js` 구문 검사: 통과
- 서비스 워커 캐시 쓰기 정적 검사: `/offline.html` 1건만 확인
- 공유 `.next` 보호 지침에 따라 build/dev는 실행하지 않았다. Android 실기기 설치도 이 리뷰에서는 수행하지 않았다.

결론: **CHANGES REQUESTED (MEDIUM 1건)**
