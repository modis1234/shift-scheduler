import { readFile } from "node:fs/promises";
import path from "node:path";
import { staffShareBeta } from "@/lib/auth";
import ScheduleRunner from "./ScheduleRunner";

// STAFF_SHARE_BETA를 빌드 때가 아니라 요청 때 읽는다(Docker 이미지는 빌드 후 env로 켜고 끈다)
export const dynamic = "force-dynamic";

export default async function Home() {
  const engineDir = process.env.ENGINE_DIR ?? path.resolve(process.cwd(), "../algorithm-engine");
  const sample = await readFile(path.join(engineDir, "sample_input.json"), "utf-8");

  // 헤더의 현재 기간이 입력 상태를 따라가므로 앱 셸(헤더·본문)은 ScheduleRunner가 그린다
  return <ScheduleRunner initialInput={sample} staffShareBeta={staffShareBeta()} />;
}
