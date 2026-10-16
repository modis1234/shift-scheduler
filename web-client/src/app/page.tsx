import { readFile } from "node:fs/promises";
import path from "node:path";
import ScheduleRunner from "./ScheduleRunner";

export default async function Home() {
  const engineDir = process.env.ENGINE_DIR ?? path.resolve(process.cwd(), "../algorithm-engine");
  const sample = await readFile(path.join(engineDir, "sample_input.json"), "utf-8");

  // 헤더의 현재 기간이 입력 상태를 따라가므로 앱 셸(헤더·본문)은 ScheduleRunner가 그린다
  return <ScheduleRunner initialInput={sample} />;
}
