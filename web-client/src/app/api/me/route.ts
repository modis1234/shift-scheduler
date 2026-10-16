import type { NextRequest } from "next/server";
import { readSession, SESSION_COOKIE } from "@/lib/auth";

/** GET /api/me → 200 { storeName } | 401 */
export async function GET(req: NextRequest) {
  const auth = await readSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!auth) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  return Response.json({ storeName: auth.store.name }, { headers: { "Cache-Control": "no-store" } });
}
