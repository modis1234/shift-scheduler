import { NextResponse, type NextRequest } from "next/server";
import { clearSessionCookie, readSession, redirectTo, SESSION_COOKIE, setSessionCookie } from "@/lib/auth";

// 계정 파일과 node:crypto를 쓰므로 Node 런타임
export const config = {
  runtime: "nodejs",
  // 정적 파일 제외
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:ico|png|jpg|jpeg|gif|svg|webp|txt|xml|webmanifest)$).*)"],
};

const isPublic = (path: string) => path === "/login" || path.startsWith("/auth/") || path === "/api/invite";
const REFRESH_MS = 60_000; // 마지막 사용 시각은 1분 단위로만 갱신해 매 요청 Set-Cookie를 피한다

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const auth = await readSession(token);

  if (isPublic(pathname)) {
    // 이미 로그인했으면 /login 대신 메인으로. 초대 링크는 관리자 교체 때 쓰므로 그대로 보여 준다
    if (pathname === "/login" && auth && !req.nextUrl.searchParams.has("invite")) return redirectTo("/", req.url);
    const res = NextResponse.next();
    if (pathname === "/login") res.headers.set("Cache-Control", "no-store");
    return res;
  }

  if (!auth) {
    const res = pathname.startsWith("/api/")
      ? NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 })
      : redirectTo(`/login?${new URLSearchParams({ next: pathname + search })}`, req.url);
    if (token) clearSessionCookie(res);
    return res;
  }

  const res = NextResponse.next();
  const now = Date.now();
  if (now - auth.session.lat > REFRESH_MS) setSessionCookie(res, { ...auth.session, lat: now });
  return res;
}
