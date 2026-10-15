import { readFile } from "node:fs/promises";
import path from "node:path";
import ScheduleRunner from "./ScheduleRunner";

export default async function Home() {
  const engineDir = process.env.ENGINE_DIR ?? path.resolve(process.cwd(), "../algorithm-engine");
  const sample = await readFile(path.join(engineDir, "sample_input.json"), "utf-8");

  return (
    <main className="mx-auto max-w-screen-2xl space-y-6 p-4 sm:p-8">
      <h1 className="text-2xl font-bold">교대근무 스케줄러</h1>
      <ScheduleRunner initialInput={sample} />
    </main>
  );
}
