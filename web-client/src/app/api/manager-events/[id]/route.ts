import type { NextRequest } from "next/server";
import { sessionStore } from "@/lib/auth";
import { readBody } from "@/lib/http";
import { deleteManagerEvent, parseManagerEventWrite, updateManagerEvent } from "@/lib/manager-events";

type Ctx = { params: Promise<{ id: string }> };
const MAX_BODY_BYTES = 16 * 1024;
const headers = { "Cache-Control": "no-store" };
const json = (body: unknown, init?: ResponseInit) => Response.json(body, { ...init, headers: { ...headers, ...init?.headers } });

/** PATCH /api/manager-events/:id → 200 ManagerEvent | 404. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const store = await sessionStore(req);
    if (!store) return json({ error: "로그인이 필요합니다." }, { status: 401 });
    const raw = await readBody(req, MAX_BODY_BYTES);
    if (raw === null) return json({ error: "일정 내용이 너무 깁니다." }, { status: 413 });
    let input: unknown;
    try {
      input = JSON.parse(raw);
    } catch {
      return json({ error: "일정 내용을 확인해 주세요." }, { status: 400 });
    }
    const parsed = parseManagerEventWrite(input);
    if ("error" in parsed) return json({ error: parsed.error }, { status: 400 });
    const event = await updateManagerEvent(store.id, (await params).id, parsed.value);
    return event ? json(event) : json({ error: "일정을 찾을 수 없습니다." }, { status: 404 });
  } catch {
    return json({ error: "일정을 저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요." }, { status: 500 });
  }
}

/** DELETE /api/manager-events/:id → 204 | 404. */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const store = await sessionStore(req);
    if (!store) return json({ error: "로그인이 필요합니다." }, { status: 401 });
    if (!(await deleteManagerEvent(store.id, (await params).id))) return json({ error: "일정을 찾을 수 없습니다." }, { status: 404 });
    return new Response(null, { status: 204, headers });
  } catch {
    return json({ error: "일정을 삭제하지 못했습니다. 잠시 뒤 다시 시도해 주세요." }, { status: 500 });
  }
}
