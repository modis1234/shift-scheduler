import type { NextRequest } from "next/server";
import { sessionStore } from "@/lib/auth";
import { readBody } from "@/lib/http";
import { createManagerEvent, isCalendarDate, listManagerEvents, parseManagerEventWrite } from "@/lib/manager-events";

const MAX_BODY_BYTES = 16 * 1024;
const DAY_MS = 86_400_000;
const headers = { "Cache-Control": "no-store" };
const json = (body: unknown, init?: ResponseInit) => Response.json(body, { ...init, headers: { ...headers, ...init?.headers } });

/** GET /api/manager-events?from=YYYY-MM-DD&to=YYYY-MM-DD (양 끝 포함, 최대 42일). */
export async function GET(req: NextRequest) {
  try {
    const store = await sessionStore(req);
    if (!store) return json({ error: "로그인이 필요합니다." }, { status: 401 });
    const from = req.nextUrl.searchParams.get("from");
    const to = req.nextUrl.searchParams.get("to");
    if (!isCalendarDate(from) || !isCalendarDate(to)) return json({ error: "조회할 날짜 범위를 확인해 주세요." }, { status: 400 });
    const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1;
    if (days < 1 || days > 42) return json({ error: "조회할 날짜 범위를 확인해 주세요." }, { status: 400 });
    return json(await listManagerEvents(store.id, from, to));
  } catch {
    return json({ error: "일정을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요." }, { status: 500 });
  }
}

/** POST /api/manager-events → 201 ManagerEvent. */
export async function POST(req: NextRequest) {
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
    return json(await createManagerEvent(store.id, parsed.value), { status: 201 });
  } catch {
    return json({ error: "일정을 저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요." }, { status: 500 });
  }
}
