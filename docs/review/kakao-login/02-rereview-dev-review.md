# 카카오 로그인 `KAKAO_API_BASE` 재검토

대상: qitem `qitem-20261016022007-1064c2176d395ded`의 이전 MEDIUM 수정분만.

## 판정

통과. `KAKAO_API_BASE`로 원격 OAuth 호스트를 지정해 client secret·인가 코드·토큰을 외부로 보내던 문제가 차단되었다. 추가 결함을 확인하지 못했다.

## 확인

- `callback/route.ts:22-27`은 설정값을 URL로 파싱하고 hostname을 `localhost`, `127.0.0.1`, `[::1]`로 제한한다. 그 외 호스트면 route 모듈 초기화에서 throw하므로 `fetchKakaoId()`에 진입하지 않는다. README 로그인 절에도 허용 범위를 명시했다.
- 제공된 격리 scratchpad의 `./rerun.sh` 실행 결과: build/start 후 카카오 인증 회귀 **58 pass, 0 fail**.
- 동일 scratch build에서 `KAKAO_API_BASE=https://attacker.example`로 별도 `next start` 실행 후 확인: `/login` 200, `/auth/kakao/callback?state=x&code=x` 500. 서버 로그에는 allowlist 거부 오류가 있었고 route handler의 fetch 호출 전 실패했다.
- 공유 작업 트리에서 `npm run lint --prefix web-client` 및 `./web-client/node_modules/.bin/tsc --noEmit -p web-client/tsconfig.json` 통과. 공유 `web-client` build/dev는 실행하지 않았다.
