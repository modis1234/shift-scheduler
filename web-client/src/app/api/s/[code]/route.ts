import { getStore } from "@/lib/accounts";
import { listPublished, storeIdByCode } from "@/lib/schedules";

// 직원 공유 API(로그인 없음). 베타 토글과 응답 헤더(no-store·noindex·no-referrer)는 middleware가 맡는다
// 저장된 input·result를 걸러 보내지 않고 계약(docs/planning/calendar.md 7-3) 필드만 새 객체로 만든다. 시급·고용 형태·직원 id 등은 여기서 끊긴다

type Input = {
  schedule_period: { start_date: string; end_date: string };
  shift_definitions?: Record<string, { start?: string; end?: string; hours?: number }>;
  employees?: { name?: string; approved_leaves?: string[] }[];
};
type Result = { schedules?: { date: string; shift: string; assigned_employees?: { name: string }[] }[] };

const notFound = () => Response.json({ error: "링크를 열 수 없습니다." }, { status: 404 });

function period(input: Input, result: Result) {
  const { start_date: startDate, end_date: endDate } = input.schedule_period;
  const employees = input.employees ?? [];
  return {
    startDate,
    endDate,
    // 엔진처럼 hours가 0인 근무조(Off 등)는 빼므로 배정에도 나오지 않는다
    shifts: Object.entries(input.shift_definitions ?? {})
      .filter(([, sd]) => (sd.hours ?? 0) > 0)
      .map(([name, sd]) => ({ name, start: String(sd.start), end: String(sd.end) })),
    employees: employees
      .map((e) => e.name)
      .filter((n): n is string => typeof n === "string")
      .sort((a, b) => a.localeCompare(b, "ko")),
    days: (result.schedules ?? []).map((s) => ({ date: s.date, shift: s.shift, names: (s.assigned_employees ?? []).map((a) => a.name) })),
    leaves: employees
      .flatMap((e) => (typeof e.name === "string" ? (e.approved_leaves ?? []).map((date) => ({ date, name: e.name as string })) : []))
      .filter((l) => l.date >= startDate && l.date <= endDate)
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/** GET /api/s/:code → 200 {storeName, periods} | 404 (없는·바뀐·형식이 틀린 코드를 구분하지 않음) */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const storeId = await storeIdByCode((await params).code);
  if (!storeId) return notFound();
  const store = await getStore(storeId);
  if (!store) return notFound();
  const periods = (await listPublished(storeId)).map(({ input, result }) => period(input as Input, result as Result));
  return Response.json({ storeName: store.name, periods });
}
