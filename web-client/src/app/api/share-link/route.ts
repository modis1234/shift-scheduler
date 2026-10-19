import type { NextRequest } from "next/server";
import { sessionStore } from "@/lib/auth";
import { getShareLink, rotateShareLink } from "@/lib/schedules";

// 베타가 꺼지면 middleware가 404를 낸다

/** GET /api/share-link → 200 {code, createdAt} (없으면 둘 다 null) */
export async function GET(req: NextRequest) {
  const store = await sessionStore(req);
  if (!store) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  return Response.json(await getShareLink(store.id), { headers: { "Cache-Control": "no-store" } });
}

/** POST /api/share-link → 201 {code, createdAt}. 있으면 새 코드로 바꿔 이전 링크는 바로 열리지 않는다 */
export async function POST(req: NextRequest) {
  const store = await sessionStore(req);
  if (!store) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  return Response.json(await rotateShareLink(store.id), { status: 201, headers: { "Cache-Control": "no-store" } });
}
