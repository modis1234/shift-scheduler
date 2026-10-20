import { randomUUID } from "node:crypto";
import { db } from "./db";
import { isEventColor } from "./manager-event-colors";
import type { EventColor } from "./manager-event-colors";

export type ManagerEvent = {
  id: string;
  date: string;
  title: string;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
  note: string;
  color: EventColor;
  createdAt: string;
  updatedAt: string;
};

export type ManagerEventWrite = Omit<ManagerEvent, "id" | "createdAt" | "updatedAt">;

export type ManagerEventParse = { value: ManagerEventWrite; error?: never } | { value?: never; error: string };

type EventRow = {
  id: string;
  date: string;
  title: string;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
  note: string;
  color: EventColor;
  createdAt: Date;
  updatedAt: Date;
};

const view = (row: EventRow): ManagerEvent => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
}

/** API 입력을 검증하고 공백·하루 종일 시각을 정규화한다. */
export function parseManagerEventWrite(input: unknown): ManagerEventParse {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return { error: "일정 내용을 확인해 주세요." };
  const body = input as Record<string, unknown>;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (!isCalendarDate(body.date)) return { error: "일정 날짜를 확인해 주세요." };
  if (!title) return { error: "일정 제목을 입력해 주세요." };
  if (title.length > 50) return { error: "일정 제목은 50자까지 입력할 수 있습니다." };
  if (note.length > 200) return { error: "메모는 200자까지 입력할 수 있습니다." };
  if (typeof body.allDay !== "boolean") return { error: "하루 종일 여부를 확인해 주세요." };
  // 색을 보내지 않는 예전 화면은 회색으로 저장한다
  if (body.color !== undefined && !isEventColor(body.color)) return { error: "일정 색을 확인해 주세요." };
  const color = body.color ?? "gray";

  let startTime: string | null = null;
  let endTime: string | null = null;
  if (!body.allDay) {
    const validTime = (value: unknown): value is string => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
    if (!validTime(body.startTime) || !validTime(body.endTime)) return { error: "시작 시각과 종료 시각을 입력해 주세요." };
    if (body.endTime <= body.startTime) return { error: "종료 시각은 시작 시각보다 늦어야 합니다." };
    startTime = body.startTime;
    endTime = body.endTime;
  }
  return { value: { date: body.date, title, allDay: body.allDay, startTime, endTime, note, color } };
}

const select = (storeId: string, from: string, to: string) => db()<EventRow[]>`
  SELECT id,
         event_date::text AS date,
         title,
         all_day AS "allDay",
         CASE WHEN start_time IS NULL THEN NULL ELSE to_char(start_time, 'HH24:MI') END AS "startTime",
         CASE WHEN end_time IS NULL THEN NULL ELSE to_char(end_time, 'HH24:MI') END AS "endTime",
         note,
         color,
         created_at AS "createdAt",
         updated_at AS "updatedAt"
  FROM manager_events
  WHERE store_id = ${storeId} AND event_date BETWEEN ${from} AND ${to}
  ORDER BY event_date, all_day DESC, start_time NULLS FIRST, created_at`;

export async function listManagerEvents(storeId: string, from: string, to: string): Promise<ManagerEvent[]> {
  return (await select(storeId, from, to)).map(view);
}

export async function createManagerEvent(storeId: string, event: ManagerEventWrite): Promise<ManagerEvent> {
  return db().begin(async (tx) => {
    await tx`SELECT 1 FROM stores WHERE id = ${storeId} FOR UPDATE`;
    const id = randomUUID();
    const [row] = await tx<EventRow[]>`
      INSERT INTO manager_events (id, store_id, event_date, title, all_day, start_time, end_time, note, color)
      VALUES (${id}, ${storeId}, ${event.date}, ${event.title}, ${event.allDay}, ${event.startTime}, ${event.endTime}, ${event.note}, ${event.color})
      RETURNING id, event_date::text AS date, title, all_day AS "allDay",
                CASE WHEN start_time IS NULL THEN NULL ELSE to_char(start_time, 'HH24:MI') END AS "startTime",
                CASE WHEN end_time IS NULL THEN NULL ELSE to_char(end_time, 'HH24:MI') END AS "endTime",
                note, color, created_at AS "createdAt", updated_at AS "updatedAt"`;
    return view(row);
  });
}

export async function updateManagerEvent(storeId: string, id: string, event: ManagerEventWrite): Promise<ManagerEvent | null> {
  return db().begin(async (tx) => {
    await tx`SELECT 1 FROM stores WHERE id = ${storeId} FOR UPDATE`;
    const [row] = await tx<EventRow[]>`
      UPDATE manager_events
      SET event_date = ${event.date}, title = ${event.title}, all_day = ${event.allDay},
          start_time = ${event.startTime}, end_time = ${event.endTime}, note = ${event.note}, color = ${event.color}, updated_at = now()
      WHERE store_id = ${storeId} AND id = ${id}
      RETURNING id, event_date::text AS date, title, all_day AS "allDay",
                CASE WHEN start_time IS NULL THEN NULL ELSE to_char(start_time, 'HH24:MI') END AS "startTime",
                CASE WHEN end_time IS NULL THEN NULL ELSE to_char(end_time, 'HH24:MI') END AS "endTime",
                note, color, created_at AS "createdAt", updated_at AS "updatedAt"`;
    return row ? view(row) : null;
  });
}

export async function deleteManagerEvent(storeId: string, id: string): Promise<boolean> {
  return db().begin(async (tx) => {
    await tx`SELECT 1 FROM stores WHERE id = ${storeId} FOR UPDATE`;
    return (await tx`DELETE FROM manager_events WHERE store_id = ${storeId} AND id = ${id}`).count > 0;
  });
}
