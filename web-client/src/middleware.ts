import { NextResponse, type NextRequest } from "next/server";
import { clearSessionCookie, readSession, redirectTo, SESSION_COOKIE, setSessionCookie, staffShareBeta } from "@/lib/auth";

// DB(postgres)와 node:crypto를 쓰므로 Node 런타임
export const config = {
  runtime: "nodejs",
  // 정적 파일 제외
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:ico|png|jpg|jpeg|gif|svg|webp|txt|xml|webmanifest)$).*)"],
};

const isShare = (path: string) => path.startsWith("/s/") || path.startsWith("/api/s/"); // 직원 공유 화면·API(로그인 없음)
const isPublic = (path: string) => path === "/login" || path.startsWith("/auth/") || path === "/api/invite" || isShare(path);
// 주소에 공유 코드가 있으므로 캐시·검색 엔진·Referer로 새지 않게 한다
function noShareLeak(res: NextResponse) {
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
const REFRESH_MS = 60_000; // 마지막 사용 시각은 1분 단위로만 갱신해 매 요청 Set-Cookie를 피한다

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  // 베타가 꺼져 있으면 공유 API는 로그인 여부와 상관없이 404. /s/* 화면은 페이지가 notFound()로 404를 낸다
  if (!staffShareBeta() && (pathname.startsWith("/api/s/") || pathname === "/api/share-link")) {
    // 404가 캐시되면 베타를 다시 켜도 남을 수 있다
    return noShareLeak(NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 }));
  }
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const auth = await readSession(token);

  if (isPublic(pathname)) {
    // 이미 로그인했으면 /login 대신 메인으로. 초대 링크는 관리자 교체 때 쓰므로 그대로 보여 준다
    if (pathname === "/login" && auth && !req.nextUrl.searchParams.has("invite")) return redirectTo("/", req.url);
    const res = NextResponse.next();
    if (pathname === "/login") res.headers.set("Cache-Control", "no-store");
    return isShare(pathname) ? noShareLeak(res) : res;
  }

  if (!auth) {
    const res = pathname.startsWith("/api/")
      ? NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401, headers: { "Cache-Control": "no-store" } })
      : redirectTo(`/login?${new URLSearchParams({ next: pathname + search })}`, req.url);
    if (token) clearSessionCookie(res);
    return res;
  }

  const res = NextResponse.next();
  const now = Date.now();
  if (now - auth.session.lat > REFRESH_MS) setSessionCookie(res, { ...auth.session, lat: now });
  return res;
}
