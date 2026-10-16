import type { NextRequest } from "next/server";
import { sessionStore } from "@/lib/auth";
import { deleteSchedule, getSchedule } from "@/lib/schedules";

type Ctx = { params: Promise<{ id: string }> };
const error = (status: number, message: string) => Response.json({ error: message }, { status });

/** GET /api/schedules/:id → 200 {id, status, input, result, createdAt, updatedAt} | 404 (다른 매장도 404) */
export async function GET(req: NextRequest, { params }: Ctx) {
  const store = await sessionStore(req);
  if (!store) return error(401, "로그인이 필요합니다.");
  const schedule = getSchedule(store.id, (await params).id);
  if (!schedule) return error(404, "근무표를 찾을 수 없습니다.");
  return Response.json(schedule, { headers: { "Cache-Control": "no-store" } });
}

/** DELETE /api/schedules/:id → 204 | 404 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const store = await sessionStore(req);
  if (!store) return error(401, "로그인이 필요합니다.");
  if (!deleteSchedule(store.id, (await params).id)) return error(404, "근무표를 찾을 수 없습니다.");
  return new Response(null, { status: 204 });
}
