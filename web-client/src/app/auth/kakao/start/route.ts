import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { clientIp, env, loginErrorUrl, rateLimited, redirectTo, safeNext, setStateCookie, STATE_MS } from "@/lib/auth";

/** GET /auth/kakao/start?next=&invite=&remember=1 → state 쿠키(10분) + 카카오 인가 페이지로 302 */
export function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const invite = q.get("invite")?.slice(0, 128) || null;
  if (rateLimited(clientIp(req))) return redirectTo(loginErrorUrl("rate_limited", invite));

  const st = randomBytes(16).toString("base64url");
  const authorize = new URL("https://kauth.kakao.com/oauth/authorize");
  authorize.search = new URLSearchParams({
    client_id: env("KAKAO_REST_API_KEY"),
    redirect_uri: env("KAKAO_REDIRECT_URI"),
    response_type: "code",
    state: st,
  }).toString();

  const res = redirectTo(authorize.toString());
  setStateCookie(res, { st, next: safeNext(q.get("next")), invite, r: q.get("remember") === "1", exp: Date.now() + STATE_MS });
  return res;
}
