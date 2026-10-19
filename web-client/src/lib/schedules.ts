import { randomBytes, randomUUID } from "node:crypto";
import { db } from "./db";

// 근무표 저장소(Postgres schedules·share_links 표). 모든 함수는 storeId로 범위를 제한한다: 다른 매장의 id는 없는 것과 같다(null/false)
// 직원 이름 등 개인정보가 들어 있으므로 input·result 내용은 로그에 남기지 않는다

export type ScheduleStatus = "draft" | "published" | "unpublished";
export type ScheduleSummary = { id: string; startDate: string; endDate: string; status: ScheduleStatus; createdAt: string; updatedAt: string };
export type Schedule = { id: string; status: ScheduleStatus; input: unknown; result: unknown; createdAt: string; updatedAt: string };

export async function listSchedules(storeId: string): Promise<ScheduleSummary[]> {
  const rows = await db()<{ id: string; startDate: string; endDate: string; status: ScheduleStatus; createdAt: Date; updatedAt: Date }[]>`
    SELECT id, start_date::text AS "startDate", end_date::text AS "endDate", status, created_at AS "createdAt", updated_at AS "updatedAt"
    FROM schedules WHERE store_id = ${storeId} ORDER BY start_date DESC, end_date DESC, created_at DESC`;
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() }));
}

export async function createSchedule(storeId: string, startDate: string, endDate: string, input: unknown, result: unknown): Promise<string> {
  const id = randomUUID();
  // 문자열로 보내 json으로 바꾼다. sql.json()은 jsonb로 보내므로 객체 키 순서(근무조 순서)가 바뀐다
  await db()`
    INSERT INTO schedules (id, store_id, start_date, end_date, status, input, result)
    VALUES (${id}, ${storeId}, ${startDate}, ${endDate}, 'draft', ${JSON.stringify(input)}::text::json, ${JSON.stringify(result)}::text::json)`;
  return id;
}

export async function getSchedule(storeId: string, id: string): Promise<Schedule | null> {
  const [row] = await db()<{ id: string; status: ScheduleStatus; input: unknown; result: unknown; created_at: Date; updated_at: Date }[]>`
    SELECT id, status, input, result, created_at, updated_at FROM schedules WHERE store_id = ${storeId} AND id = ${id}`;
  if (!row) return null;
  return { id: row.id, status: row.status, input: row.input, result: row.result, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() };
}

/** 게시. 같은 기간에 이미 게시된 것은 같은 트랜잭션에서 게시 취소로 바꾼다. */
export async function publishSchedule(storeId: string, id: string): Promise<boolean> {
  return db().begin(async (tx) => {
    // 같은 매장의 게시를 한 줄로 세워(매장 행 잠금) 동시 게시가 게시 1개 인덱스에 부딪히지 않게 한다
    await tx`SELECT 1 FROM stores WHERE id = ${storeId} FOR UPDATE`;
    const [target] = await tx<{ status: ScheduleStatus }[]>`SELECT status FROM schedules WHERE store_id = ${storeId} AND id = ${id}`;
    if (!target) return false;
    if (target.status !== "published") {
      await tx`
        UPDATE schedules SET status = 'unpublished', updated_at = now()
        WHERE store_id = ${storeId} AND status = 'published'
          AND (start_date, end_date) = (SELECT start_date, end_date FROM schedules WHERE id = ${id})`;
      await tx`UPDATE schedules SET status = 'published', updated_at = now() WHERE store_id = ${storeId} AND id = ${id}`;
    }
    return true;
  });
}

/** 게시 취소. 게시된 상태가 아니면 바꾸지 않는다. */
export async function unpublishSchedule(storeId: string, id: string): Promise<boolean> {
  const sql = db();
  const [found] = await sql`SELECT 1 FROM schedules WHERE store_id = ${storeId} AND id = ${id}`;
  if (found) await sql`UPDATE schedules SET status = 'unpublished', updated_at = now() WHERE store_id = ${storeId} AND id = ${id} AND status = 'published'`;
  return !!found;
}

export async function deleteSchedule(storeId: string, id: string): Promise<boolean> {
  return (await db()`DELETE FROM schedules WHERE store_id = ${storeId} AND id = ${id}`).count > 0;
}

/** 게시된 근무표(기간 오름차순). 직원 공유 화면용이며, 응답은 호출하는 쪽이 필요한 필드만 새로 만든다 */
export async function listPublished(storeId: string): Promise<{ input: unknown; result: unknown }[]> {
  return db()<{ input: unknown; result: unknown }[]>`
    SELECT input, result FROM schedules WHERE store_id = ${storeId} AND status = 'published' ORDER BY start_date, end_date`;
}

export type ShareLink = { code: string | null; createdAt: string | null };

export async function getShareLink(storeId: string): Promise<ShareLink> {
  const [row] = await db()<{ code: string; created_at: Date }[]>`SELECT code, created_at FROM share_links WHERE store_id = ${storeId}`;
  return { code: row?.code ?? null, createdAt: row?.created_at.toISOString() ?? null };
}

/** 새 코드(128비트, base64url 22자)로 만들거나 바꾼다. 이전 코드는 바로 열리지 않는다 */
export async function rotateShareLink(storeId: string): Promise<{ code: string; createdAt: string }> {
  const code = randomBytes(16).toString("base64url");
  const [row] = await db()<{ created_at: Date }[]>`
    INSERT INTO share_links (store_id, code) VALUES (${storeId}, ${code})
    ON CONFLICT (store_id) DO UPDATE SET code = excluded.code, created_at = now()
    RETURNING created_at`;
  return { code, createdAt: row.created_at.toISOString() };
}

export const isShareCode = (code: string) => /^[A-Za-z0-9_-]{22}$/.test(code);

/** 코드의 매장 id. 형식이 틀리면 DB를 보지 않고 null */
export async function storeIdByCode(code: string): Promise<string | null> {
  if (!isShareCode(code)) return null;
  const [row] = await db()<{ store_id: string }[]>`SELECT store_id FROM share_links WHERE code = ${code}`;
  return row?.store_id ?? null;
}
