import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 1024 * 1024;
const TIMEOUT_MS = 120_000;

const ENGINE_DIR = process.env.ENGINE_DIR ?? path.resolve(process.cwd(), "../algorithm-engine");
const ENGINE_PYTHON = process.env.ENGINE_PYTHON ?? `${ENGINE_DIR}/.venv/bin/python`;

// CP-SAT은 요청 하나가 여러 코어를 쓰므로 동시에 도는 엔진 수를 제한한다. 넘으면 대기 없이 429
// ponytail: Node 프로세스 하나 안의 카운터라 인스턴스를 여러 개 띄우면 전체 제한이 아니다. 그때는 외부 큐나 공유 세마포어로 옮긴다
const maxConcurrency = Number(process.env.ENGINE_MAX_CONCURRENCY ?? 2);
const MAX_CONCURRENCY = Number.isInteger(maxConcurrency) && maxConcurrency >= 1 ? maxConcurrency : 2;
if (MAX_CONCURRENCY !== maxConcurrency) console.warn(`[engine] ENGINE_MAX_CONCURRENCY가 1 이상 정수가 아니어서 2를 사용합니다.`);
const RETRY_AFTER_SECONDS = 30; // 엔진 기본 time_limit_seconds
let running = 0;

const error = (status: number, message: string) => Response.json({ error: message }, { status });

/** 본문을 최대 limit 바이트까지만 읽는다. 넘으면 null (Content-Length 없는 chunked 요청도 막기 위해 스트림으로 센다). */
async function readBody(req: Request, limit: number): Promise<string | null> {
  if (Number(req.headers.get("content-length") ?? 0) > limit) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

type EngineRun = { kind: "ok"; stdout: string } | { kind: "timeout" } | { kind: "failed"; reason: string };

// 입력은 임시 파일로 넘긴다. Node의 stdio "pipe"는 socketpair라서 python이 /dev/stdin을 open()하면 ENXIO로 실패한다
async function runEngine(input: string): Promise<EngineRun> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "engine-"));
  try {
    const file = path.join(dir, "input.json");
    await writeFile(file, input, "utf-8");
    return await spawnEngine(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function spawnEngine(file: string): Promise<EngineRun> {
  return new Promise((resolve) => {
    // 셸을 거치지 않고 실행
    const child = spawn(ENGINE_PYTHON, ["solver.py", file], { cwd: ENGINE_DIR, stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, TIMEOUT_MS);

    child.stdout.on("data", (c: Buffer) => out.push(c));
    child.stderr.on("data", (c: Buffer) => err.push(c));
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ kind: "failed", reason: `spawn 실패: ${e.message}` });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const stderr = Buffer.concat(err).toString("utf-8").trim();
      if (stderr) console.error("[engine stderr]", stderr);
      if (timedOut) return resolve({ kind: "timeout" });
      if (code !== 0) return resolve({ kind: "failed", reason: `exit code ${code}, signal ${signal}` });
      resolve({ kind: "ok", stdout: Buffer.concat(out).toString("utf-8") });
    });
  });
}

export async function POST(req: Request) {
  const body = await readBody(req, MAX_BODY_BYTES);
  if (body === null) return error(413, "요청 본문은 1MB를 넘을 수 없습니다.");

  let input: unknown;
  try {
    input = JSON.parse(body);
  } catch {
    return error(400, "본문이 올바른 JSON이 아닙니다.");
  }
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return error(400, "본문은 JSON 객체여야 합니다.");
  }

  if (running >= MAX_CONCURRENCY) {
    return Response.json(
      { error: "다른 근무표를 생성하고 있습니다. 잠시 후 다시 시도하세요." },
      { status: 429, headers: { "Retry-After": String(RETRY_AFTER_SECONDS) } },
    );
  }
  running++;
  let run: EngineRun;
  try {
    run = await runEngine(body);
  } finally {
    running--;
  }
  if (run.kind === "timeout") return error(504, "엔진 실행 시간(120초)을 초과했습니다.");
  if (run.kind === "failed") {
    console.error("[engine]", run.reason);
    return error(500, "엔진 실행에 실패했습니다.");
  }
  try {
    // 정상 종료면 status(INFEASIBLE 등)와 무관하게 결과를 그대로 전달
    return Response.json(JSON.parse(run.stdout));
  } catch {
    console.error("[engine] stdout이 JSON이 아님");
    return error(500, "엔진 출력이 올바른 JSON이 아닙니다.");
  }
}
