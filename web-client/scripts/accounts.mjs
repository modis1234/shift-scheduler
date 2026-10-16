#!/usr/bin/env node
// 운영 담당자용 계정 관리. 의존성 없음. web-client에서: node --env-file=.env.local scripts/accounts.mjs <명령>
// 계정 파일 형식은 src/lib/accounts.ts와 같다. 서버가 같은 순간에 초대를 사용 처리하면 한쪽 변경이 사라질 수 있으니 사용이 적을 때 실행한다
import { createHash, createHmac, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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

const file = (() => {
  const f = env("ACCOUNTS_FILE");
  return f.startsWith("~/") ? path.join(os.homedir(), f.slice(2)) : f;
})();

async function load() {
  try {
    return JSON.parse(await readFile(file, "utf-8"));
  } catch (e) {
    if (e.code === "ENOENT") return { stores: [] };
    throw e;
  }
}

async function save(accounts) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(tmp, JSON.stringify(accounts, null, 2) + "\n", { mode: 0o600 });
  await rename(tmp, file);
}

function findStore(accounts, id) {
  return accounts.stores.find((s) => s.id === id) ?? fail(`매장 ${id}이(가) 없습니다. list로 id를 확인하세요.`);
}

/** 초대 코드를 새로 만들어 해시만 저장하고, 전체 링크를 돌려준다. */
function newInvite(store) {
  const code = randomBytes(16).toString("base64url"); // 128비트
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86400_000).toISOString();
  store.invite = { hash: createHash("sha256").update(code).digest("hex"), expiresAt };
  const origin = new URL(env("KAKAO_REDIRECT_URI")).origin;
  return { url: `${origin}/login?invite=${code}`, expiresAt };
}

function newStore(name, kakaoId = null) {
  const now = new Date().toISOString();
  return { id: `s_${randomBytes(6).toString("hex")}`, name, kakaoId, linkedAt: kakaoId && now, invite: null, createdAt: now };
}

const [cmd, ...args] = process.argv.slice(2);
const accounts = await load();

switch (cmd) {
  case "create": {
    const name = args.join(" ").trim() || fail("매장 이름을 입력하세요.");
    const store = newStore(name);
    const { url, expiresAt } = newInvite(store);
    accounts.stores.push(store);
    await save(accounts);
    console.log(`매장 ${store.id} "${name}" 생성\n초대 링크(1회용, ${expiresAt}까지): ${url}`);
    break;
  }
  case "invite": {
    const store = findStore(accounts, args[0]);
    const { url, expiresAt } = newInvite(store);
    await save(accounts);
    console.log(`초대 링크(1회용, ${expiresAt}까지): ${url}`);
    if (store.kakaoId) console.log("이 링크로 새 카카오 계정이 연결되면 지금 연결된 계정은 끊깁니다.");
    break;
  }
  case "list": {
    if (!accounts.stores.length) console.log("매장이 없습니다.");
    for (const s of accounts.stores) {
      const link = s.kakaoId ? `연결됨(${s.kakaoId}, ${s.linkedAt})` : "연결 안 됨";
      const invite = !s.invite ? "초대 없음" : Date.parse(s.invite.expiresAt) > Date.now() ? `초대 유효(${s.invite.expiresAt}까지)` : "초대 만료";
      console.log(`${s.id}\t${s.name}\t${link}\t${invite}`);
    }
    break;
  }
  case "revoke-invite": {
    findStore(accounts, args[0]).invite = null;
    await save(accounts);
    console.log("초대 링크를 취소했습니다.");
    break;
  }
  case "unlink": {
    const store = findStore(accounts, args[0]);
    store.kakaoId = null;
    store.linkedAt = null;
    await save(accounts);
    console.log("카카오 계정 연결을 해제했습니다. 새 관리자는 invite로 링크를 발급하세요.");
    break;
  }
  case "delete": {
    const store = findStore(accounts, args[0]);
    // 매장의 근무표(직원 개인정보)도 함께 지운다. DB 파일이 아직 없으면 지울 것도 없다
    const db = process.env.SCHEDULES_DB?.replace(/^~\//, `${os.homedir()}/`);
    let removed = 0;
    if (db && existsSync(db)) {
      const { DatabaseSync } = await import("node:sqlite");
      const conn = new DatabaseSync(db);
      // 서버가 아직 한 번도 열지 않은 DB면 테이블이 없다
      if (conn.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schedules'").get()) {
        removed = Number(conn.prepare("DELETE FROM schedules WHERE store_id = ?").run(store.id).changes);
      }
      conn.close();
    } else if (!db) {
      console.warn("SCHEDULES_DB가 없어 근무표는 지우지 않았습니다. 근무표가 있다면 SCHEDULES_DB를 설정하고 다시 실행하세요.");
    }
    accounts.stores = accounts.stores.filter((s) => s !== store);
    await save(accounts);
    console.log(`매장 ${store.id} "${store.name}"과(와) 근무표 ${removed}개를 삭제했습니다.`);
    break;
  }
  case "dev-session": {
    if (process.env.NODE_ENV === "production") fail("NODE_ENV=production에서는 쓸 수 없습니다.");
    const name = args.join(" ").trim() || "개발용 매장";
    let store = accounts.stores.find((s) => s.name === name && s.kakaoId?.startsWith("dev-"));
    if (!store) {
      store = newStore(name, `dev-${randomBytes(6).toString("hex")}`);
      accounts.stores.push(store);
      await save(accounts);
    }
    // src/lib/auth.ts의 sign("session", ...)과 같은 형식. '로그인 상태 유지'로 만들어 2시간 무활동 만료가 없다(14일)
    const now = Date.now();
    const body = Buffer.from(JSON.stringify({ s: store.id, u: store.kakaoId, iat: now, lat: now, r: true })).toString("base64url");
    const mac = createHmac("sha256", env("SESSION_SECRET")).update(`session.${body}`).digest("base64url");
    console.log(`Cookie: ss_session=${body}.${mac}`);
    break;
  }
  default:
    fail(USAGE);
}
