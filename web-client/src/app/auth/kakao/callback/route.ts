import type { NextRequest } from "next/server";
import { findInvitedStore, readAccounts, updateAccounts, type Store } from "@/lib/accounts";
import {
  clearStateCookie,
  clientIp,
  env,
  loginErrorUrl,
  logAuth,
  rateLimited,
  redirectTo,
  safeEqual,
  setSessionCookie,
  STATE_COOKIE,
  verify,
  type LoginState,
} from "@/lib/auth";

type LoginError = "not_registered" | "invite_invalid" | "already_linked" | "consent_denied" | "kakao_error" | "rate_limited";

// 가짜 카카오 서버로 확인할 때만 설정한다. 없으면 실제 카카오.
// 요청에 client_secret·인가 코드·토큰이 실리므로 로컬 주소만 받는다(잘못 설정하면 콜백이 500으로 멈춘다)
const TEST_BASE = process.env.KAKAO_API_BASE;
if (TEST_BASE && !["localhost", "127.0.0.1", "[::1]"].includes(new URL(TEST_BASE).hostname)) {
  throw new Error("KAKAO_API_BASE는 localhost·127.0.0.1·[::1]만 쓸 수 있습니다.");
}
const KAUTH = TEST_BASE ?? "https://kauth.kakao.com";
const KAPI = TEST_BASE ?? "https://kapi.kakao.com";
const KAKAO_TIMEOUT_MS = 5000;

/** 인가 코드 → 토큰 → 회원번호. 토큰은 이 함수 밖으로 나가지 않고 버린다. 실패·타임아웃은 throw */
async function fetchKakaoId(code: string): Promise<string> {
  const tokenRes = await fetch(`${KAUTH}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: env("KAKAO_REST_API_KEY"),
      client_secret: env("KAKAO_CLIENT_SECRET"),
      redirect_uri: env("KAKAO_REDIRECT_URI"),
      code,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(KAKAO_TIMEOUT_MS),
  });
  const token = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || typeof token.access_token !== "string") {
    throw new Error(`토큰 교환 실패 HTTP ${tokenRes.status} ${token.error_code ?? token.error ?? ""}`);
  }
  const meRes = await fetch(`${KAPI}/v2/user/me`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(KAKAO_TIMEOUT_MS),
  });
  const me = await meRes.json().catch(() => ({}));
  if (!meRes.ok || !(typeof me.id === "number" || typeof me.id === "string") || me.id === "") {
    throw new Error(`회원번호 조회 실패 HTTP ${meRes.status}`);
  }
  return String(me.id);
}

/** 초대 코드가 있으면 그 매장에 연결(1회용), 없으면 연결된 매장을 찾는다. */
async function findOrLinkStore(kakaoId: string, invite: string | null): Promise<Store | LoginError> {
  if (!invite) return (await readAccounts()).stores.find((s) => s.kakaoId === kakaoId) ?? "not_registered";
  return updateAccounts<Store | LoginError>((accounts) => {
    const store = findInvitedStore(accounts, invite);
    if (!store) return { changed: false, result: "invite_invalid" };
    if (accounts.stores.some((s) => s.kakaoId === kakaoId && s.id !== store.id)) {
      return { changed: false, result: "already_linked" };
    }
    // 이전 관리자 연결은 덮어써서 끊긴다(그 세션도 readSession에서 무효)
    store.kakaoId = kakaoId;
    store.linkedAt = new Date().toISOString();
    store.invite = null;
    return { changed: true, result: store };
  });
}

/** GET /auth/kakao/callback. 성공: 세션 쿠키 + next로 302, 실패: /login?error=<코드>[&invite=] */
export async function GET(req: NextRequest) {
  const ip = clientIp(req);
  const q = req.nextUrl.searchParams;
  const raw = req.cookies.get(STATE_COOKIE)?.value;
  const state = raw ? verify<LoginState>("state", raw) : null;
  const invite = state?.invite ?? null;

  const fail = (error: LoginError, kakaoId?: string, detail?: string) => {
    logAuth(error, ip, kakaoId, detail);
    const res = redirectTo(loginErrorUrl(error, invite));
    clearStateCookie(res);
    return res;
  };

  if (rateLimited(ip)) return fail("rate_limited");
  const qState = q.get("state");
  if (!state || state.exp < Date.now() || !qState || !safeEqual(qState, state.st)) {
    return fail("kakao_error", undefined, "state 불일치·만료");
  }
  const kakaoError = q.get("error");
  if (kakaoError) {
    // error_description은 서버 로그에만 남기고 화면에는 코드만 넘긴다
    const detail = `${kakaoError}: ${q.get("error_description") ?? ""}`;
    return fail(kakaoError === "access_denied" ? "consent_denied" : "kakao_error", undefined, detail);
  }
  const code = q.get("code");
  if (!code) return fail("kakao_error", undefined, "code 없음");

  let kakaoId: string;
  try {
    kakaoId = await fetchKakaoId(code);
  } catch (e) {
    return fail("kakao_error", undefined, (e as Error).message);
  }

  const store = await findOrLinkStore(kakaoId, invite);
  if (typeof store === "string") return fail(store, kakaoId);

  const now = Date.now();
  const res = redirectTo(state.next);
  setSessionCookie(res, { s: store.id, u: kakaoId, iat: now, lat: now, r: state.r });
  clearStateCookie(res);
  logAuth(invite ? "linked" : "ok", ip, kakaoId);
  return res;
}
