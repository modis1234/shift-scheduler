import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { readAccounts, type Store } from "./accounts";

// 서버 전용(node:crypto, 계정 파일). middleware도 runtime: "nodejs"로 이 모듈을 쓴다

export const SESSION_COOKIE = "ss_session";
export const STATE_COOKIE = "ss_kakao_state";
const IDLE_MS = 2 * 60 * 60 * 1000; // 기본 세션: 마지막 사용 후 2시간
const MAX_MS = 14 * 24 * 60 * 60 * 1000; // 로그인부터 최대 14일('로그인 상태 유지'도 동일)
export const STATE_MS = 10 * 60 * 1000;

/** 세션 쿠키 내용. s: 매장 id, u: 카카오 회원번호, iat: 로그인 시각, lat: 마지막 사용 시각, r: 로그인 상태 유지 */
export type Session = { s: string; u: string; iat: number; lat: number; r: boolean };
/** state 쿠키 내용. 카카오 왕복 동안 next·초대 코드·로그인 상태 유지를 함께 보관 */
export type LoginState = { st: string; next: string; invite: string | null; r: boolean; exp: number };

export function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} 환경변수가 없습니다.`);
  return v;
}

function mac(purpose: string, body: string): string {
  const secret = env("SESSION_SECRET");
  if (secret.length < 32) throw new Error("SESSION_SECRET은 32자 이상이어야 합니다.");
  return createHmac("sha256", secret).update(`${purpose}.${body}`).digest("base64url");
}

/** `<base64url JSON>.<HMAC>`. purpose가 다르면 서로의 토큰으로 쓸 수 없다. scripts/accounts.mjs의 dev-session도 같은 형식 */
export function sign(purpose: string, data: object): string {
  const body = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${body}.${mac(purpose, body)}`;
}

export function verify<T>(purpose: string, token: string): T | null {
  const [body, sig, ...rest] = token.split(".");
  if (!body || !sig || rest.length) return null;
  if (!safeEqual(sig, mac(purpose, body))) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf-8")) as T;
  } catch {
    return null;
  }
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** 서명·만료를 확인하고, 매장이 지금도 그 카카오 회원번호에 연결돼 있는지 계정 파일에서 확인한다(관리자 교체·연결 해제 즉시 반영). */
export async function readSession(token: string | undefined): Promise<{ session: Session; store: Store } | null> {
  if (!token) return null;
  const session = verify<Session>("session", token);
  const now = Date.now();
  if (!session || now - session.iat > MAX_MS || (!session.r && now - session.lat > IDLE_MS)) return null;
  const store = (await readAccounts()).stores.find((s) => s.id === session.s);
  if (!store || store.kakaoId !== session.u) return null;
  return { session, store };
}

const cookieBase = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
});

export function setSessionCookie(res: NextResponse, session: Session) {
  res.cookies.set(SESSION_COOKIE, sign("session", session), {
    ...cookieBase(),
    path: "/",
    // 기본은 브라우저를 닫으면 사라지는 쿠키. '로그인 상태 유지'면 로그인부터 14일
    ...(session.r && { maxAge: Math.floor((session.iat + MAX_MS - Date.now()) / 1000) }),
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", { ...cookieBase(), path: "/", maxAge: 0 });
}

export function setStateCookie(res: NextResponse, state: LoginState) {
  res.cookies.set(STATE_COOKIE, sign("state", state), { ...cookieBase(), path: "/auth/kakao", maxAge: STATE_MS / 1000 });
}

export function clearStateCookie(res: NextResponse) {
  res.cookies.set(STATE_COOKIE, "", { ...cookieBase(), path: "/auth/kakao", maxAge: 0 });
}

/** 같은 사이트 경로(`/`로 시작, `//`·`/\` 아님)만 허용, 아니면 `/`. */
export function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  // 제어 문자 등으로 다른 origin이 되는 경우까지 URL 파서로 한 번 더 확인
  const url = new URL(next, "http://same.invalid");
  return url.origin === "http://same.invalid" ? url.pathname + url.search + url.hash : "/";
}

/** 302. 라우트 핸들러는 상대 경로 Location을 그대로 쓰고, middleware는 절대 URL만 받으므로 base(req.url)를 넘긴다(같은 origin이면 Next가 상대 경로로 바꿔 보냄). */
export function redirectTo(location: string, base?: string): NextResponse {
  const url = base ? new URL(location, base).toString() : location;
  return new NextResponse(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store" } });
}

export function loginErrorUrl(error: string, invite: string | null): string {
  const q = new URLSearchParams({ error });
  if (invite) q.set("invite", invite);
  return `/login?${q}`;
}

// ponytail: x-forwarded-for의 마지막 값. 프록시 없이 직접 노출되면 Next가 클라이언트가 보낸 값을 그대로 두므로 위조로 IP 제한을 피할 수 있다. 배포 프록시가 정해지면 그 프록시가 넣는 헤더로 바꾼다
export function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() || "unknown";
}

// ponytail: 프로세스 메모리의 1분 고정 창. 인스턴스가 여럿이면 공유 저장소로
const RATE_LIMIT = 20;
const hits = new Map<string, { start: number; count: number }>();

/** 같은 IP의 로그인 시작·콜백 요청이 1분에 20회를 넘으면 true. */
export function rateLimited(ip: string): boolean {
  const now = Date.now();
  if (hits.size > 10_000) for (const [k, v] of hits) if (now - v.start >= 60_000) hits.delete(k);
  const hit = hits.get(ip);
  if (!hit || now - hit.start >= 60_000) {
    hits.set(ip, { start: now, count: 1 });
    return false;
  }
  return ++hit.count > RATE_LIMIT;
}

/** 로그인 로그는 시각·IP·결과·회원번호만. 인가 코드·토큰·쿠키 값은 넣지 않는다. */
export function logAuth(result: string, ip: string, kakaoId?: string, detail?: string) {
  const parts = [new Date().toISOString(), `result=${result}`, `ip=${ip}`];
  if (kakaoId) parts.push(`kakaoId=${kakaoId}`);
  if (detail) parts.push(`detail=${JSON.stringify(detail)}`);
  console.info("[auth]", parts.join(" "));
}
