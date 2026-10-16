import { randomUUID } from "node:crypto";
import { chmodSync, closeSync, mkdirSync, openSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// 근무표 저장소(SCHEDULES_DB). 모든 함수는 storeId로 범위를 제한한다: 다른 매장의 id는 없는 것과 같다(null/false)
// 직원 이름 등 개인정보가 들어 있으므로 input·result 내용은 로그에 남기지 않는다

export type ScheduleStatus = "draft" | "published" | "unpublished";
export type ScheduleSummary = { id: string; startDate: string; endDate: string; status: ScheduleStatus; createdAt: string; updatedAt: string };
export type Schedule = { id: string; status: ScheduleStatus; input: unknown; result: unknown; createdAt: string; updatedAt: string };

let db: DatabaseSync | undefined;

function open(): DatabaseSync {
  if (db) return db;
  const raw = process.env.SCHEDULES_DB;
  // 기본값을 두지 않는다: 개인정보가 담긴 파일이라 위치(Docker 볼륨 등)를 명시하게 하고, 컨테이너 안에 조용히 생겼다 사라지는 일을 막는다
  if (!raw) throw new Error("SCHEDULES_DB 환경변수가 없습니다.");
  const file = raw.startsWith("~/") ? path.join(os.homedir(), raw.slice(2)) : raw;
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  closeSync(openSync(file, "a", 0o600));
  chmodSync(file, 0o600); // 미리 만들어 두거나 옮겨 온 파일도 소유자만 읽게(WAL·SHM 파일은 SQLite가 이 권한을 따름)
  const conn = new DatabaseSync(file);
  conn.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'unpublished')),
      input TEXT NOT NULL,
      result TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS schedules_store ON schedules (store_id, start_date);
    -- 같은 매장·같은 기간에 게시된 근무표는 하나
    CREATE UNIQUE INDEX IF NOT EXISTS schedules_one_published ON schedules (store_id, start_date, end_date) WHERE status = 'published';
  `);
  return (db = conn);
}

export function listSchedules(storeId: string): ScheduleSummary[] {
  return open()
    .prepare(
      `SELECT id, start_date AS startDate, end_date AS endDate, status, created_at AS createdAt, updated_at AS updatedAt
       FROM schedules WHERE store_id = ? ORDER BY start_date DESC, end_date DESC, created_at DESC`,
    )
    .all(storeId) as ScheduleSummary[];
}

export function createSchedule(storeId: string, startDate: string, endDate: string, input: string, result: string): string {
  const id = randomUUID();
  const now = new Date().toISOString();
  open()
    .prepare(`INSERT INTO schedules VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?)`)
    .run(id, storeId, startDate, endDate, input, result, now, now);
  return id;
}

export function getSchedule(storeId: string, id: string): Schedule | null {
  const row = open()
    .prepare(`SELECT id, status, input, result, created_at, updated_at FROM schedules WHERE store_id = ? AND id = ?`)
    .get(storeId, id) as { id: string; status: ScheduleStatus; input: string; result: string; created_at: string; updated_at: string } | undefined;
  if (!row) return null;
  return { id: row.id, status: row.status, input: JSON.parse(row.input), result: JSON.parse(row.result), createdAt: row.created_at, updatedAt: row.updated_at };
}

/** 게시. 같은 기간에 이미 게시된 것은 같은 트랜잭션에서 게시 취소로 바꾼다. */
export function publishSchedule(storeId: string, id: string): boolean {
  const conn = open();
  const now = new Date().toISOString();
  conn.exec("BEGIN IMMEDIATE");
  try {
    const target = conn.prepare(`SELECT start_date, end_date, status FROM schedules WHERE store_id = ? AND id = ?`).get(storeId, id) as
      | { start_date: string; end_date: string; status: ScheduleStatus }
      | undefined;
    if (target && target.status !== "published") {
      conn
        .prepare(`UPDATE schedules SET status = 'unpublished', updated_at = ? WHERE store_id = ? AND start_date = ? AND end_date = ? AND status = 'published'`)
        .run(now, storeId, target.start_date, target.end_date);
      conn.prepare(`UPDATE schedules SET status = 'published', updated_at = ? WHERE store_id = ? AND id = ?`).run(now, storeId, id);
    }
    conn.exec("COMMIT");
    return !!target;
  } catch (e) {
    conn.exec("ROLLBACK");
    throw e;
  }
}

/** 게시 취소. 게시된 상태가 아니면 바꾸지 않는다. */
export function unpublishSchedule(storeId: string, id: string): boolean {
  const conn = open();
  const found = conn.prepare(`SELECT 1 FROM schedules WHERE store_id = ? AND id = ?`).get(storeId, id);
  if (found) {
    conn
      .prepare(`UPDATE schedules SET status = 'unpublished', updated_at = ? WHERE store_id = ? AND id = ? AND status = 'published'`)
      .run(new Date().toISOString(), storeId, id);
  }
  return !!found;
}

export function deleteSchedule(storeId: string, id: string): boolean {
  return open().prepare(`DELETE FROM schedules WHERE store_id = ? AND id = ?`).run(storeId, id).changes > 0;
}
