import type { NextRequest } from "next/server";
import { sessionStore } from "@/lib/auth";
import { readBody } from "@/lib/http";
import { createSchedule, listSchedules } from "@/lib/schedules";

const MAX_BODY_BYTES = 1024 * 1024;
const MAX_DAYS = 366; // 엔진 기간 상한과 같음
const DAY_MS = 86_400_000;

/** 실제 있는 날짜(YYYY-MM-DD)면 UTC 자정 시각, 아니면 null. 2026-02-31 같은 값은 Date가 다음 달로 넘기므로 되돌려 비교한다 */
function dayOf(v: unknown): number | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const t = Date.parse(`${v}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v ? t : null;
}

const error = (status: number, message: string) => Response.json({ error: message }, { status });
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** GET /api/schedules → 200 [{id, startDate, endDate, status, createdAt, updatedAt}] (기간 최신순) */
export async function GET(req: NextRequest) {
  const store = await sessionStore(req);
  if (!store) return error(401, "로그인이 필요합니다.");
  return Response.json(await listSchedules(store.id), { headers: { "Cache-Control": "no-store" } });
}

/** POST /api/schedules {input, result} → 201 {id}. result.status가 SUCCESS일 때만 */
export async function POST(req: NextRequest) {
  const store = await sessionStore(req);
  if (!store) return error(401, "로그인이 필요합니다.");
  const body = await readBody(req, MAX_BODY_BYTES);
  if (body === null) return error(413, "요청 본문은 1MB를 넘을 수 없습니다.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return error(400, "본문이 올바른 JSON이 아닙니다.");
  }
  if (!isObject(parsed) || !isObject(parsed.input) || !isObject(parsed.result)) return error(400, "본문은 {input, result} 객체여야 합니다.");
  const { input, result } = parsed;
  // result는 클라이언트가 보낸 값이다. 엔진 validate로 다시 검증하지 않는 이유: 위변조해도 영향은 그 매장(본인이 만든 근무표)뿐이고,
  // 지금은 화면에서 수정할 수 없어(결정 3) 정상 경로의 결과는 엔진이 이미 검증했다. 수정 기능(4단계)에서 재검증을 넣는다
  if (result.status !== "SUCCESS" || !Array.isArray(result.schedules)) return error(400, "생성에 성공한 근무표만 저장할 수 있습니다.");
  const period = input.schedule_period;
  const start = dayOf(isObject(period) ? period.start_date : undefined);
  const end = dayOf(isObject(period) ? period.end_date : undefined);
  if (start === null || end === null || start > end || (end - start) / DAY_MS + 1 > MAX_DAYS) {
    return error(400, "input.schedule_period의 start_date·end_date가 올바르지 않습니다(최대 366일).");
  }
  const { start_date: startDate, end_date: endDate } = period as { start_date: string; end_date: string };

  const id = await createSchedule(store.id, startDate, endDate, input, result);
  return Response.json({ id }, { status: 201 });
}
