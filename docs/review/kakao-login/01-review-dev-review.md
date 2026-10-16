# 카카오 로그인 서버 측 보안 검토

대상: `feature/kakao-login` 미커밋 변경분, 기획 `docs/planning/login.md` v0.2

## 판정

수정 후 재검토 권고. 보안 경로를 코드와 확정 정책에 대조했고 아래 MEDIUM 1건을 확인했다. 서명·purpose 분리, 세션 만료 및 계정 연결 재확인, state 검증, `safeNext`, 초대 코드 저장 해시 및 콜백 직렬화는 확인 범위에서 의도에 부합한다.

## 발견 사항

- **MEDIUM — 테스트 전용 `KAKAO_API_BASE`가 운영에서 임의 OAuth 서버로 시크릿을 전송할 수 있음** — `web-client/src/app/auth/kakao/callback/route.ts:20-22,27-35`. 환경변수가 있으면 런타임 환경과 무관하게 토큰·회원 조회 호스트를 대체한다. 재현 조건: `NODE_ENV=production`, `KAKAO_API_BASE=https://attacker.example`로 설정한 뒤 유효 콜백을 처리하면 `/oauth/token` 요청 본문에 `KAKAO_CLIENT_SECRET`과 인가 코드가 포함되어 해당 호스트로 전송된다. 토큰 응답 뒤에는 bearer 토큰도 같은 설정의 `/v2/user/me`로 전달된다. README는 테스트 전용이라고 설명하지만 production에서 거부하는 검사는 없다. 운영에서는 해당 변수를 거부하거나, 테스트 전용 로컬 환경에만 허용하도록 제한해야 한다.

## 검토한 정책·제약

- `x-forwarded-for` 마지막 값 신뢰, 메모리 기반 rate limit/직렬화의 단일 프로세스 전제, 운영 스크립트와 서버 동시 쓰기 경합은 코드 주석에 명시된 제한과 일치한다. 다만 실제 배포 프록시 설정은 이 변경분에서 확인할 수 없으므로, 배포 전에 신뢰 가능한 프록시가 `x-forwarded-for`를 덮어쓰거나 신뢰된 값을 마지막에 추가하는지 확인해야 한다. 이를 확인하지 못한 상태에서 IP 제한을 실효성 있다고 간주하면 안 된다.
- matcher가 제외하는 확장자 경로는 보호 우회가 되는 실제 API/페이지를 변경분에서 찾지 못했다.
- BE가 보고한 scratchpad 테스트 58경로는 재현 파일 위치를 받지 못해 독립 실행하지 않았다. 공유 작업 트리에서 `npm run lint --prefix web-client` 통과, `./web-client/node_modules/.bin/tsc --noEmit -p web-client/tsconfig.json` 통과. 공유 `next build`/`next dev`는 실행하지 않았다.

## 검토 범위

`auth.ts`, `accounts.ts`, middleware, Kakao start/callback/logout, `/api/me`, `/api/invite`, 운영자 스크립트, README 로그인 안내 및 로그인 기획. UI 변경은 서버 인증 계약을 확인하는 데 필요한 부분만 확인했다.
