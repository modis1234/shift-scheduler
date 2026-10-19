# 직원 달력 PWA 베타 — FE 화면 검토

## 결론

**통과.** 화면·기간 탐색·이름 선택·읽기 전용 표시에서 수정 요청할 결함은 확인하지 않았다. Android 실기기에서 실제 설치까지 확인하지는 못했다.

## 발견 사항

이번 검토 중 manifest의 `start_url`/192px 아이콘 누락은 잠재 충돌로 조사했으나 결함으로 판정하지 않았다. 제품 완료 기준은 Chrome 메뉴의 수동 “홈 화면에 추가”이며, Chrome은 PWA 설치 기준에 못 미치는 페이지도 universal install로 설치할 수 있다. `start_url` 미지정 시 manifest를 링크한 현재 페이지가 시작 주소가 되므로 `/s/<코드>`를 유지하려는 현재 선택과 맞는다. 다만 수동 설치 동작과 앱 표시명/아이콘을 실제 Android에서 확인하지 못했으므로 해당 기기 검증은 아직 미완료다. 근거: [Chrome 124 universal install](https://developer.chrome.com/release-notes/124), [MDN start_url fallback](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/start_url).

## 확인한 항목

- `web-client/src/app/s/[code]/StaffView.tsx:45-74,129-148`: 요청은 `cache: no-store`; 기간 초기 선택은 오늘 포함 → 가장 가까운 미래 → 가장 최근 과거 순서이며, 기간 전환 시 이름을 해당 기간 직원 목록과 대조해 복원하고 날짜 커서를 재설정한다.
- `:181-285`: 게시본 없음·링크 오류·일반 로딩 실패·내 근무 없음 상태가 구분된다. 기간/이름 선택에는 label이 있고, 보기 버튼은 `aria-pressed`, 날짜 이동과 주간 목록은 기간 경계 안으로 제한된다.
- `web-client/src/app/s/[code]/page.tsx:7-21,24-27`: 요청 시 베타 플래그를 확인하고 robots·manifest·apple icon·theme color를 직원 경로 metadata로 한정한다.
- 제공된 `staff-mine-light-360.png`, `staff-week-light-360.png`, `staff-mine-dark-360.png`를 확인했다. 화면은 모바일 폭에서 계층과 라벨이 읽히고 가로 overflow 징후가 보이지 않는다. 다크 팔레트도 제공 토큰 기준으로 적용돼 있다.

## 검증

- `npm run lint --prefix web-client`: 통과.
- `./web-client/node_modules/.bin/tsc --noEmit -p web-client/tsconfig.json`: 통과.
- manifest PNG 실제 크기 확인: 128×128 및 512×512. 제공된 테스트 보고의 Android 실기기 설치 검증은 미수행으로 표시되어 있어, standalone/WebAPK 성공 여부는 확인되지 않았다.
- 공유 개발 서버에서 build/dev를 실행하지 않았다. 실제 Android 기기 검증도 수행하지 않았다.

서버/API·Postgres 변경은 이 FE 검토 범위에서 제외했다.
