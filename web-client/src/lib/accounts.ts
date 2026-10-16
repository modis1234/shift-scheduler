import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// 계정 파일(ACCOUNTS_FILE) 형식. 운영자 스크립트(scripts/accounts.mjs)도 같은 형식을 읽고 쓰므로 바꾸면 둘 다 고친다
export type Store = {
  id: string;
  name: string;
  kakaoId: string | null; // 카카오 회원번호(문자열)
  linkedAt: string | null;
  invite: { hash: string; expiresAt: string } | null; // 초대 코드는 sha256 해시만 저장
  createdAt: string;
};
export type Accounts = { stores: Store[] };

function accountsFile(): string {
  const file = process.env.ACCOUNTS_FILE;
  if (!file) throw new Error("ACCOUNTS_FILE 환경변수가 없습니다.");
  return file.startsWith("~/") ? path.join(os.homedir(), file.slice(2)) : file;
}

export const hashInvite = (code: string) => createHash("sha256").update(code).digest("hex");

/** 파일이 없으면 빈 상태. */
export async function readAccounts(): Promise<Accounts> {
  try {
    return JSON.parse(await readFile(accountsFile(), "utf-8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { stores: [] };
    throw e;
  }
}

/** 임시 파일에 쓴 뒤 rename으로 바꿔 끼운다. */
async function writeAccounts(accounts: Accounts) {
  const file = accountsFile();
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(tmp, JSON.stringify(accounts, null, 2) + "\n", { mode: 0o600 });
  await rename(tmp, file);
}

// ponytail: 한 Node 프로세스 안에서만 직렬화한다. 운영자 스크립트가 같은 순간에 쓰면 한쪽 변경이 사라질 수 있고, 인스턴스가 여럿이면 DB로 옮긴다
let writing: Promise<unknown> = Promise.resolve();

/** 읽기 → fn으로 수정 → 쓰기를 순서대로 한다. fn이 changed: false를 돌려주면 쓰지 않는다. */
export function updateAccounts<T>(fn: (accounts: Accounts) => { changed: boolean; result: T }): Promise<T> {
  const run = writing.then(async () => {
    const accounts = await readAccounts();
    const { changed, result } = fn(accounts);
    if (changed) await writeAccounts(accounts);
    return result;
  });
  writing = run.catch(() => {});
  return run;
}

/** 만료되지 않은 초대 코드의 매장. */
export function findInvitedStore(accounts: Accounts, code: string): Store | undefined {
  const hash = hashInvite(code);
  return accounts.stores.find((s) => s.invite?.hash === hash && Date.parse(s.invite.expiresAt) > Date.now());
}
