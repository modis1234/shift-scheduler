# 카카오 로그인 FE 검토

대상: qitem `qitem-20261016020518-34728cd185e54d98`의 FE 범위 (`login/page.tsx`, `login/LoginView.tsx`, `ScheduleRunner.tsx`, `globals.css`)

## 판정

수정 후 재검토 권고. **MEDIUM 1건** 확인.

## 발견 사항

- **MEDIUM — 로그인 화면의 `next` 검증을 줄바꿈 문자로 우회해 외부 주소로 이동 가능** — `web-client/src/app/login/LoginView.tsx:25-26,52-56`. `safeNext` 정규식은 `/` 다음 문자가 줄바꿈이면 허용한다. 이후 인증된 `/api/me` 응답에서 그 값을 `location.replace()`에 넘기면 브라우저 URL 파서가 줄바꿈을 제거하고 외부 origin으로 해석한다. 재현: `next = "/\n//evil.example"`은 현재 정규식 검사에 통과하고, `new URL(next, "https://scheduler.example").href`는 `https://evil.example/`다. 로그인된 사용자가 초대 쿼리와 이 `next`를 포함한 로그인 URL을 열어 로그인 페이지가 렌더링되는 경로에서 피싱 리다이렉트에 악용될 수 있다. 서버 측 `safeNext`와 같이 URL 파서 기준으로 same-origin을 검증하거나 C0 제어 문자를 먼저 거부해야 한다.

## 검증

- `npm run lint --prefix web-client` 통과.
- `./web-client/node_modules/.bin/tsc --noEmit -p web-client/tsconfig.json` 통과.
- 위 재현을 Node URL 파서로 확인: 정규식 `true`, 결과 URL `https://evil.example/`.
- 공유 `next build`/`next dev`는 실행하지 않았다. BE 파일은 이번 검토 범위에서 제외했다.
- 결과가 있을 때만 로그아웃 확인, 세션 만료 입력 저장/복원, 오류 문구와 키보드 동선은 구현상 요청 내용과 일치해 추가 결함을 보고하지 않는다. 입력별 `aria-invalid`/`aria-describedby` 누락은 lead의 이번 범위 제외 결정에 따라 차단 사유로 삼지 않았다.
