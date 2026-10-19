import type { NextRequest } from "next/server";
import { sessionStore } from "@/lib/auth";
import { unpublishSchedule } from "@/lib/schedules";

/** POST /api/schedules/:id/unpublish → 200 | 404 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const store = await sessionStore(req);
  if (!store) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!(await unpublishSchedule(store.id, (await params).id))) return Response.json({ error: "근무표를 찾을 수 없습니다." }, { status: 404 });
  return Response.json({});
}
