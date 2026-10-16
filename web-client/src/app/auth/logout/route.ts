import { NextResponse } from "next/server";
import { clearSessionCookie, env } from "@/lib/auth";

/** POST /auth/logout → 세션 삭제 + 200 { kakaoLogoutUrl }. 카카오 계정 로그아웃 후 KAKAO_LOGOUT_REDIRECT_URI?state=logged_out으로 돌아온다 */
export function POST() {
  const url = new URL("https://kauth.kakao.com/oauth/logout");
  // logout_redirect_uri는 콘솔 등록값과 같아야 해서 쿼리를 붙일 수 없다. 카카오가 state를 그대로 붙여 돌려준다
  url.search = new URLSearchParams({
    client_id: env("KAKAO_REST_API_KEY"),
    logout_redirect_uri: env("KAKAO_LOGOUT_REDIRECT_URI"),
    state: "logged_out",
  }).toString();
  const res = NextResponse.json({ kakaoLogoutUrl: url.toString() }, { headers: { "Cache-Control": "no-store" } });
  clearSessionCookie(res);
  return res;
}
