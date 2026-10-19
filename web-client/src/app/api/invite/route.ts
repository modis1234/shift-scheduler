import type { NextRequest } from "next/server";
import { findInvitedStore } from "@/lib/accounts";

/** GET /api/invite?code= → 200 { storeName } | 404. 로그인 없이 호출되므로 매장 이름 외에는 알려 주지 않는다 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const store = code ? await findInvitedStore(code) : null;
  if (!store) return Response.json({ error: "초대 링크를 쓸 수 없습니다." }, { status: 404 });
  return Response.json({ storeName: store.name }, { headers: { "Cache-Control": "no-store" } });
}
