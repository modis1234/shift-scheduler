# 카카오 로그인 FE 재검토

대상: qitem `qitem-20261016020901-c4ce70eb26d9f322` — `LoginView.tsx`의 `next` 우회 수정 및 함께 반영된 I-01/버튼/심볼 UI 변경.

## 판정

통과. 이전 MEDIUM 발견 사항이 해결되었고, 이번 재검토 범위에서 추가 결함을 확인하지 못했다.

## 확인

- `LoginView.tsx:27-30`은 `new URL(next, "http://same.invalid")`로 origin을 확인하고 동일 origin인 경우 pathname/search/hash만 반환한다. 재현 `/\n//evil.example`, `//evil.example`, `/\\evil.example`는 모두 `/`로 차단되고 `/schedule?x=1#part`는 유지된다.
- 유효 초대 시 매장 연결 안내가 추가되고, 이동 중 버튼의 opacity가 제거됐다. `pointer-events-none`과 `aria-disabled`를 사용하며 클릭 핸들러도 재진입을 막는다.
- 카카오 심볼 교체는 SVG 경로/뷰박스 적용 상태만 확인했다.
- `npm run lint --prefix web-client` 통과; `./web-client/node_modules/.bin/tsc --noEmit -p web-client/tsconfig.json` 통과. scratchpad build/35 UI checks는 요청자 보고로만 기록했으며 독립 실행하지 않았다. 공유 `next build`/`next dev` 미실행.
- lead 결정대로 입력칸별 `aria-invalid`/`aria-describedby`는 이번 차단 사유로 삼지 않았다.
