#!/usr/bin/env node
// 운영 담당자용 계정 관리. web-client에서: node --env-file=.env.local scripts/accounts.mjs <명령>
// 서버와 같은 Postgres stores 표(db/migrations/001_init.sql)를 쓴다. 의존성은 앱과 같은 postgres 하나
import { createHash, createHmac, randomBytes } from "node:crypto";
import postgres from "postgres";

const INVITE_DAYS = 7;
const USAGE = `사용법: node --env-file=.env.local scripts/accounts.mjs <명령>
  create <매장 이름>     매장을 만들고 초대 링크 발급
  invite <매장 id>       새 초대 링크 발급(이전 미사용 링크는 무효). 관리자 교체에도 사용
  list                   매장 목록
  revoke-invite <매장 id> 미사용 초대 링크 취소
  unlink <매장 id>       카카오 계정 연결 해제(그 관리자의 로그인도 즉시 끊김)
  delete <매장 id>       매장과 그 매장의 근무표 삭제
  dev-session [매장 이름] 개발·테스트용 세션 쿠키 출력(NODE_ENV=production이면 거부)`;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function env(name) {
  const v = process.env[name];
  if (!v) fail(`${name} 환경변수가 없습니다. --env-file=.env.local로 실행했는지 확인하세요.`);
  return v;
}

// src/lib/db.ts와 같은 연결 규칙: sslmode가 없으면 SSL 필수, transaction pooler 대비 prepare 끔
const url = env("DATABASE_URL");
const sql = postgres(url, { ...(/[?&]sslmode=/.test(url) ? {} : { ssl: "require" }), prepare: false, max: 1, onnotice: () => {} });

async function findStore(id) {
  const [store] = await sql`SELECT * FROM stores WHERE id = ${id ?? ""}`;
  return store ?? fail(`매장 ${id}이(가) 없습니다. list로 id를 확인하세요.`);
}

/** 초대 링크의 origin. DB를 바꾸기 전에 불러 설정 오류로 고아 매장·무효화된 초대가 남지 않게 한다 */
function inviteOrigin() {
  const raw = env("KAKAO_REDIRECT_URI");
  let u;
  try {
    u = new URL(raw);
  } catch {
    u = null;
  }
  if (u?.protocol !== "http:" && u?.protocol !== "https:") fail("KAKAO_REDIRECT_URI가 http(s) URL이 아닙니다. .env.local을 확인하세요.");
  return u.origin;
}

/** 초대 코드를 새로 만들어 해시만 저장하고(이전 미사용 코드는 덮어써서 무효), 전체 링크를 돌려준다. */
async function newInvite(db, storeId, origin) {
  const code = randomBytes(16).toString("base64url"); // 128비트
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86400_000);
  const hash = createHash("sha256").update(code).digest("hex");
  await db`UPDATE stores SET invite_hash = ${hash}, invite_expires_at = ${expiresAt} WHERE id = ${storeId}`;
  return { url: `${origin}/login?invite=${code}`, expiresAt: expiresAt.toISOString() };
}

async function newStore(name, kakaoId = null, db = sql) {
  const [store] = await db`
    INSERT INTO stores (id, name, kakao_id, linked_at) VALUES (${`s_${randomBytes(6).toString("hex")}`}, ${name}, ${kakaoId}, ${kakaoId && new Date()})
    RETURNING *`;
  return store;
}

const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case "create": {
    const name = args.join(" ").trim() || fail("매장 이름을 입력하세요.");
    const origin = inviteOrigin();
    // 매장과 초대는 함께 생기거나 함께 없다
    const { store, url, expiresAt } = await sql.begin(async (tx) => {
      const store = await newStore(name, null, tx);
      return { store, ...(await newInvite(tx, store.id, origin)) };
    });
    console.log(`매장 ${store.id} "${name}" 생성\n초대 링크(1회용, ${expiresAt}까지): ${url}`);
    break;
  }
  case "invite": {
    const origin = inviteOrigin();
    const store = await findStore(args[0]);
    const { url, expiresAt } = await newInvite(sql, store.id, origin);
    console.log(`초대 링크(1회용, ${expiresAt}까지): ${url}`);
    if (store.kakao_id) console.log("이 링크로 새 카카오 계정이 연결되면 지금 연결된 계정은 끊깁니다.");
    break;
  }
  case "list": {
    const stores = await sql`SELECT * FROM stores ORDER BY created_at`;
    if (!stores.length) console.log("매장이 없습니다.");
    for (const s of stores) {
      const link = s.kakao_id ? `연결됨(${s.kakao_id}, ${s.linked_at.toISOString()})` : "연결 안 됨";
      const invite = !s.invite_hash ? "초대 없음" : s.invite_expires_at > new Date() ? `초대 유효(${s.invite_expires_at.toISOString()}까지)` : "초대 만료";
      console.log(`${s.id}\t${s.name}\t${link}\t${invite}`);
    }
    break;
  }
  case "revoke-invite": {
    const store = await findStore(args[0]);
    await sql`UPDATE stores SET invite_hash = NULL, invite_expires_at = NULL WHERE id = ${store.id}`;
    console.log("초대 링크를 취소했습니다.");
    break;
  }
  case "unlink": {
    const store = await findStore(args[0]);
    await sql`UPDATE stores SET kakao_id = NULL, linked_at = NULL WHERE id = ${store.id}`;
    console.log("카카오 계정 연결을 해제했습니다. 새 관리자는 invite로 링크를 발급하세요.");
    break;
  }
  case "delete": {
    const store = await findStore(args[0]);
    // 매장의 근무표(직원 개인정보)·공유 링크는 ON DELETE CASCADE로 함께 지워진다. 개수만 먼저 센다
    const removed = await sql.begin(async (tx) => {
      const [{ n }] = await tx`SELECT count(*)::int AS n FROM schedules WHERE store_id = ${store.id}`;
      await tx`DELETE FROM stores WHERE id = ${store.id}`;
      return n;
    });
    console.log(`매장 ${store.id} "${store.name}"과(와) 근무표 ${removed}개를 삭제했습니다.`);
    break;
  }
  case "dev-session": {
    if (process.env.NODE_ENV === "production") fail("NODE_ENV=production에서는 쓸 수 없습니다.");
    const name = args.join(" ").trim() || "개발용 매장";
    const [found] = await sql`SELECT * FROM stores WHERE name = ${name} AND kakao_id LIKE 'dev-%' LIMIT 1`;
    const store = found ?? (await newStore(name, `dev-${randomBytes(6).toString("hex")}`));
    // src/lib/auth.ts의 sign("session", ...)과 같은 형식. '로그인 상태 유지'로 만들어 2시간 무활동 만료가 없다(14일)
    const now = Date.now();
    const body = Buffer.from(JSON.stringify({ s: store.id, u: store.kakao_id, iat: now, lat: now, r: true })).toString("base64url");
    const mac = createHmac("sha256", env("SESSION_SECRET")).update(`session.${body}`).digest("base64url");
    console.log(`Cookie: ss_session=${body}.${mac}`);
    break;
  }
  default:
    console.error(USAGE);
    process.exitCode = 1;
}
await sql.end();
