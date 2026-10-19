import { createHash } from "node:crypto";
import type postgres from "postgres";
import { db } from "./db";

// 매장(관리자 계정) 저장소: Postgres stores 표(db/migrations/001_init.sql). 운영자 스크립트(scripts/accounts.mjs)도 같은 표를 쓴다
export type Store = {
  id: string;
  name: string;
  kakaoId: string | null; // 카카오 회원번호(문자열)
  linkedAt: string | null;
  invite: { hash: string; expiresAt: string } | null; // 초대 코드는 sha256 해시만 저장
  createdAt: string;
};

type Row = {
  id: string;
  name: string;
  kakao_id: string | null;
  linked_at: Date | null;
  invite_hash: string | null;
  invite_expires_at: Date | null;
  created_at: Date;
};

const toStore = (r: Row): Store => ({
  id: r.id,
  name: r.name,
  kakaoId: r.kakao_id,
  linkedAt: r.linked_at?.toISOString() ?? null,
  invite: r.invite_hash && r.invite_expires_at ? { hash: r.invite_hash, expiresAt: r.invite_expires_at.toISOString() } : null,
  createdAt: r.created_at.toISOString(),
});

export const hashInvite = (code: string) => createHash("sha256").update(code).digest("hex");

export async function getStore(id: string): Promise<Store | null> {
  const [row] = await db()<Row[]>`SELECT * FROM stores WHERE id = ${id}`;
  return row ? toStore(row) : null;
}

export async function findStoreByKakaoId(kakaoId: string): Promise<Store | null> {
  const [row] = await db()<Row[]>`SELECT * FROM stores WHERE kakao_id = ${kakaoId}`;
  return row ? toStore(row) : null;
}

/** 만료되지 않은 초대 코드의 매장. */
export async function findInvitedStore(code: string): Promise<Store | null> {
  const [row] = await db()<Row[]>`SELECT * FROM stores WHERE invite_hash = ${hashInvite(code)} AND invite_expires_at > now()`;
  return row ? toStore(row) : null;
}

/** 초대 코드의 매장에 카카오 계정을 연결하고 초대를 사용 처리한다(1회용). 이전 관리자 연결은 덮어써서 끊긴다(그 세션도 readSession에서 무효) */
export async function linkInvitedStore(code: string, kakaoId: string): Promise<Store | "invite_invalid" | "already_linked"> {
  try {
    return await db().begin(async (tx) => {
      // 같은 초대 코드로 동시에 들어와도 한 번만 쓰이게 행을 잠근다
      const [store] = await tx<Row[]>`SELECT * FROM stores WHERE invite_hash = ${hashInvite(code)} AND invite_expires_at > now() FOR UPDATE`;
      if (!store) return "invite_invalid" as const;
      const [other] = await tx`SELECT 1 FROM stores WHERE kakao_id = ${kakaoId} AND id <> ${store.id}`;
      if (other) return "already_linked" as const;
      const [row] = await tx<Row[]>`
        UPDATE stores SET kakao_id = ${kakaoId}, linked_at = now(), invite_hash = NULL, invite_expires_at = NULL
        WHERE id = ${store.id} RETURNING *`;
      return toStore(row);
    });
  } catch (e) {
    // 다른 매장 연결이 동시에 같은 카카오 계정을 잡으면 kakao_id UNIQUE가 막는다
    if ((e as postgres.PostgresError).code === "23505") return "already_linked";
    throw e;
  }
}
