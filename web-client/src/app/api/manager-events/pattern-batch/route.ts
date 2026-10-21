import type { NextRequest } from "next/server";
import { sessionStore } from "@/lib/auth";
import { readBody } from "@/lib/http";
import { createManagerPatternBatch, parseManagerPatternInput, todayMismatch } from "@/lib/manager-pattern";
import { storedManagerCommand, UNSUPPORTED_MESSAGE } from "@/lib/manager-pattern-ai";

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
    const expectedDigest = typeof (body as Record<string, unknown>).expectedDigest === "string"
      ? (body as Record<string, string>).expectedDigest : "";
    const command = storedManagerCommand(parsed.value.patternText, (body as Record<string, unknown>).commandToken);
    if (!command) return json({ error: UNSUPPORTED_MESSAGE }, { status: 400 });
    const mismatch = todayMismatch(parsed.value, command);
    if (mismatch) return json({ error: mismatch }, { status: 400 });
    const result = await createManagerPatternBatch(store.id, parsed.value, command, expectedDigest);
    if ("error" in result) return json({ error: result.error }, { status: result.status });
    return json({ created: result.created.length, skippedDuplicates: result.skippedDuplicates, deleted: result.deleted, renamed: result.renamed, events: result.created }, { status: 201 });
  } catch {
    return json({ error: "일정을 등록하지 못했습니다. 저장된 일정은 없습니다. 잠시 뒤 다시 시도해 주세요." }, { status: 500 });
  }
}
