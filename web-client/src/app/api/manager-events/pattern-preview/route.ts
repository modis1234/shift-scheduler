import type { NextRequest } from "next/server";
import { sessionStore } from "@/lib/auth";
import { readBody } from "@/lib/http";
import { listManagerEvents } from "@/lib/manager-events";
import { buildManagerPatternPreview, parseManagerPatternInput, todayMismatch } from "@/lib/manager-pattern";
import { resolveManagerCommand } from "@/lib/manager-pattern-ai";

const headers = { "Cache-Control": "no-store" };
const json = (body: unknown, init?: ResponseInit) => Response.json(body, { ...init, headers: { ...headers, ...init?.headers } });

export async function POST(req: NextRequest) {
  try {
    const store = await sessionStore(req);
    if (!store) return json({ error: "로그인이 필요합니다." }, { status: 401 });
    const raw = await readBody(req, 8 * 1024);
    if (raw === null) return json({ error: "입력 내용이 너무 깁니다." }, { status: 413 });
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return json({ error: "입력 내용을 확인해 주세요." }, { status: 400 }); }
    const parsed = parseManagerPatternInput(body);
    if ("error" in parsed) return json({ error: parsed.error }, { status: 400 });
    const resolved = await resolveManagerCommand(parsed.value.patternText);
    if (resolved.error !== undefined) return json({ error: resolved.error }, { status: resolved.status });
    const mismatch = todayMismatch(parsed.value, resolved.command);
    if (mismatch) return json({ error: mismatch }, { status: 400 });
    const existing = await listManagerEvents(store.id, parsed.value.startDate, parsed.value.endDate);
    const preview = buildManagerPatternPreview(parsed.value, existing, resolved.command);
    return json({ ...preview, source: resolved.source, commandToken: resolved.token });
  } catch {
    return json({ error: "일정을 미리보지 못했습니다. 잠시 뒤 다시 시도해 주세요." }, { status: 500 });
  }
}
