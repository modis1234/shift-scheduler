import { createHash, randomUUID } from "node:crypto";
import { db } from "./db";
import type { ManagerEvent } from "./manager-events";
import type { EventColor } from "./manager-event-colors";
import { isCalendarDate } from "./manager-events";
import { parseManagerPattern } from "./manager-pattern-language";
import type { ManagerPatternRule } from "./manager-pattern-language";

export type { ManagerPatternRule } from "./manager-pattern-language";

const DAY_MS = 86_400_000;
export const MAX_PATTERN_DAYS = 90;
export const MAX_PATTERN_TEXT = 100;
/** 패턴으로 만든 일정의 기본 색: 근무 파랑, 쉬는 날 초록 */
const PATTERN_COLORS: Record<ManagerPatternEvent["kind"], EventColor> = { work: "blue", rest: "green" };

export type ManagerPatternStatus = "new" | "existing-date" | "duplicate";
export type ManagerPatternEvent = {
  date: string;
  title: string;
  kind: "work" | "rest";
  status: ManagerPatternStatus;
};
export type ManagerPatternPreview = {
  normalized: ManagerPatternRule;
  summary: { total: number; creatable: number; duplicates: number; datesWithExisting: number };
  events: ManagerPatternEvent[];
  digest: string;
};
export type ManagerPatternInput = { startDate: string; endDate: string; referenceDate: string; patternText: string };
export type ManagerPatternParse = { value: ManagerPatternInput; error?: never } | { value?: never; error: string };
type ExistingEvent = Pick<ManagerEvent, "id" | "date" | "title" | "allDay" | "startTime" | "endTime" | "updatedAt">;

const fromUtc = (time: number) => new Date(time).toISOString().slice(0, 10);

export function parseManagerPatternInput(input: unknown): ManagerPatternParse {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return { error: "입력 내용을 확인해 주세요." };
  const body = input as Record<string, unknown>;
  if (!isCalendarDate(body.startDate) || !isCalendarDate(body.endDate)) return { error: "시작일과 종료일을 입력해 주세요." };
  if (!isCalendarDate(body.referenceDate)) return { error: "오늘 날짜를 확인하지 못했습니다. 화면을 새로고침해 주세요." };
  const start = Date.parse(`${body.startDate}T00:00:00Z`);
  const end = Date.parse(`${body.endDate}T00:00:00Z`);
  if (end < start) return { error: "종료일은 시작일과 같거나 뒤여야 합니다." };
  if ((end - start) / DAY_MS + 1 > MAX_PATTERN_DAYS) return { error: `한 번에 만들 수 있는 기간은 최대 ${MAX_PATTERN_DAYS}일입니다.` };
  if (typeof body.patternText !== "string" || !body.patternText.trim()) return { error: "패턴 문장을 입력해 주세요." };
  const patternText = body.patternText.trim();
  if (patternText.length > MAX_PATTERN_TEXT) return { error: `패턴 문장은 ${MAX_PATTERN_TEXT}자까지 입력할 수 있습니다.` };
  if (/^오늘(?: 날짜)?부터(?:\s|$)/.test(patternText) && body.startDate !== body.referenceDate) {
    return { error: "문장의 “오늘 날짜부터”와 시작일이 다릅니다. 시작일을 오늘로 바꾸거나 문장에서 해당 표현을 빼 주세요." };
  }
  return { value: { startDate: body.startDate, endDate: body.endDate, referenceDate: body.referenceDate, patternText } };
}

export function buildManagerPatternPreview(input: ManagerPatternInput, existing: ExistingEvent[]): ManagerPatternPreview | { error: string } {
  const normalized = parseManagerPattern(input.patternText);
  if (!normalized) return { error: "문장을 해석하지 못했습니다. “2일 근무하고 1일 쉬기”처럼 입력해 주세요." };

  const start = Date.parse(`${input.startDate}T00:00:00Z`);
  const end = Date.parse(`${input.endDate}T00:00:00Z`);
  const cycle = normalized.workDays + normalized.restDays;
  const events: ManagerPatternEvent[] = [];
  const datesWithExisting = new Set<string>();

  for (let time = start, index = 0; time <= end; time += DAY_MS, index += 1) {
    const date = fromUtc(time);
    const kind = index % cycle < normalized.workDays ? "work" as const : "rest" as const;
    const title = kind === "work" ? normalized.workTitle : "쉬는 날";
    const sameDate = existing.filter((event) => event.date === date);
    const duplicate = sameDate.some((event) => event.allDay && event.title === title);
    if (sameDate.length) datesWithExisting.add(date);
    events.push({ date, title, kind, status: duplicate ? "duplicate" : sameDate.length ? "existing-date" : "new" });
  }

  const duplicates = events.filter((event) => event.status === "duplicate").length;
  const snapshot = existing
    .map((event) => [event.id, event.date, event.title, event.allDay, event.startTime, event.endTime, event.updatedAt])
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const digest = createHash("sha256").update(JSON.stringify({ input, normalized, events, snapshot })).digest("base64url");
  return {
    normalized,
    summary: { total: events.length, creatable: events.length - duplicates, duplicates, datesWithExisting: datesWithExisting.size },
    events,
    digest,
  };
}

type PatternRow = {
  id: string; date: string; title: string; allDay: boolean; startTime: string | null; endTime: string | null;
  note: string; color: EventColor; createdAt: Date; updatedAt: Date;
};

const toManagerEvent = (row: PatternRow): ManagerEvent => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/** 미리보기 이후 상태를 다시 검증하고 새 일정만 한 트랜잭션으로 저장한다. */
export async function createManagerPatternBatch(storeId: string, input: ManagerPatternInput, expectedDigest: string) {
  return db().begin(async (tx) => {
    await tx`SELECT 1 FROM stores WHERE id = ${storeId} FOR UPDATE`;
    const existing = await tx<PatternRow[]>`
      SELECT id, event_date::text AS date, title, all_day AS "allDay",
             CASE WHEN start_time IS NULL THEN NULL ELSE to_char(start_time, 'HH24:MI') END AS "startTime",
             CASE WHEN end_time IS NULL THEN NULL ELSE to_char(end_time, 'HH24:MI') END AS "endTime",
             note, color, created_at AS "createdAt", updated_at AS "updatedAt"
      FROM manager_events
      WHERE store_id = ${storeId} AND event_date BETWEEN ${input.startDate} AND ${input.endDate}
      ORDER BY event_date, id`;
    const preview = buildManagerPatternPreview(input, existing.map(toManagerEvent));
    if ("error" in preview) return { error: preview.error, status: 400 as const };
    if (!expectedDigest || preview.digest !== expectedDigest) return { error: "기존 일정이 바뀌었습니다. 새 미리보기를 확인해 주세요.", status: 409 as const };

    const creatable = preview.events.filter((event) => event.status !== "duplicate");
    const created: ManagerEvent[] = [];
    for (const event of creatable) {
      const id = randomUUID();
      const [row] = await tx<PatternRow[]>`
        INSERT INTO manager_events (id, store_id, event_date, title, all_day, start_time, end_time, note, color)
        VALUES (${id}, ${storeId}, ${event.date}, ${event.title}, true, NULL, NULL, '', ${PATTERN_COLORS[event.kind]})
        RETURNING id, event_date::text AS date, title, all_day AS "allDay",
                  NULL::text AS "startTime", NULL::text AS "endTime", note, color,
                  created_at AS "createdAt", updated_at AS "updatedAt"`;
      created.push(toManagerEvent(row));
    }
    return { created, skippedDuplicates: preview.summary.duplicates };
  });
}
