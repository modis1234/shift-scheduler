"use client";

import React, { memo, useCallback, useMemo, useState } from "react";

interface IEmployee {
  id: string;
  name?: string;
  employment_type?: string;
  approved_leaves?: string[];
  [key: string]: unknown;
}

interface IEngineInput {
  schedule_period: { start_date: string; end_date: string };
  rules?: { rotation_pattern?: { work_days: number; off_days: number }; [key: string]: unknown };
  shift_definitions?: Record<string, { hours?: number }>;
  employees: IEmployee[];
  [key: string]: unknown;
}

interface IAssigned {
  employee_id: string;
  name: string;
  employment_type: string;
  assignment_reason: string;
  rotation_offset?: number;
}

interface IEngineResult {
  status: string;
  fairness_score: number;
  summary: { total_shifts_assigned: number; legal_violations: number; estimated_labor_cost: number };
  schedules: { date: string; shift: string; assigned_employees: IAssigned[] }[];
  warnings_and_exceptions: string[];
  rotation_offsets?: Record<string, number>;
  trailing_consecutive_work_days?: Record<string, number>;
  last_shift_end?: Record<string, string | null>;
  trailing_week_hours?: Record<string, number>;
}

const DAY_MS = 86_400_000;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
// Tailwind가 클래스를 찾을 수 있도록 리터럴로 둔다
const SHIFT_COLORS = [
  "bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-100",
  "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100",
  "bg-violet-100 text-violet-900 dark:bg-violet-900/50 dark:text-violet-100",
  "bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100",
  "bg-rose-100 text-rose-900 dark:bg-rose-900/50 dark:text-rose-100",
  "bg-teal-100 text-teal-900 dark:bg-teal-900/50 dark:text-teal-100",
];
const EMPLOYMENT_LABEL: Record<string, string> = { Full_Time: "정규", Part_Time: "파트" };

// 날짜는 모두 UTC 자정 기준으로 계산해 시간대에 따라 하루가 밀리지 않게 한다
const toUtc = (d: string) => Date.parse(`${d}T00:00:00Z`);
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const periodDates = (start: string, end: string): string[] => {
  const out: string[] = [];
  for (let t = toUtc(start); t <= toUtc(end); t += DAY_MS) out.push(fromUtc(t));
  return out;
};

/** 결과의 기간 경계 carry 값으로 다음 기간 입력을 만든다. 결과에 없는 키는 건드리지 않는다. */
export function buildNextInput(input: IEngineInput, result: IEngineResult): IEngineInput {
  const next = structuredClone(input);
  const { start_date, end_date } = input.schedule_period;
  const days = (toUtc(end_date) - toUtc(start_date)) / DAY_MS + 1;
  const start = toUtc(end_date) + DAY_MS;
  next.schedule_period = { ...next.schedule_period, start_date: fromUtc(start), end_date: fromUtc(start + (days - 1) * DAY_MS) };

  const rp = input.rules?.rotation_pattern;
  for (const e of next.employees) {
    const tc = result.trailing_consecutive_work_days;
    if (tc && e.id in tc) e.prior_consecutive_work_days = tc[e.id];
    const tw = result.trailing_week_hours;
    if (tw && e.id in tw) e.prior_week_hours = tw[e.id];
    const ls = result.last_shift_end;
    if (ls && e.id in ls) {
      if (ls[e.id] === null) delete e.prior_last_shift_end;
      else e.prior_last_shift_end = ls[e.id];
    }
    const ro = result.rotation_offsets;
    if (ro && rp && e.id in ro) e.rotation_offset = (ro[e.id] + days) % (rp.work_days + rp.off_days);
  }
  return next;
}

interface IScheduleGridProps {
  input: IEngineInput;
  result: IEngineResult;
}

const ScheduleGrid = memo<IScheduleGridProps>(({ input, result }) => {
  const dates = useMemo(
    () => periodDates(input.schedule_period.start_date, input.schedule_period.end_date),
    [input.schedule_period],
  );

  const colorOf = useMemo(() => {
    const names = Object.keys(input.shift_definitions ?? {});
    for (const s of result.schedules) if (!names.includes(s.shift)) names.push(s.shift);
    return (shift: string) => SHIFT_COLORS[names.indexOf(shift) % SHIFT_COLORS.length];
  }, [input.shift_definitions, result.schedules]);

  const cells = useMemo(() => {
    const m = new Map<string, { shift: string; reason: string }[]>();
    for (const s of result.schedules) {
      for (const a of s.assigned_employees) {
        const key = `${a.employee_id}|${s.date}`;
        m.set(key, [...(m.get(key) ?? []), { shift: s.shift, reason: a.assignment_reason }]);
      }
    }
    return m;
  }, [result.schedules]);

  const usedShifts = useMemo(() => [...new Set(result.schedules.map((s) => s.shift))], [result.schedules]);

  return (
    <div className="space-y-2">
      <ul className="flex flex-wrap gap-2 text-xs" aria-label="시프트 범례">
        {usedShifts.map((s) => (
          <li key={s} className={`rounded px-2 py-0.5 ${colorOf(s)}`}>{s}</li>
        ))}
        <li className="rounded px-2 py-0.5 bg-red-100 text-red-900 dark:bg-red-900/50 dark:text-red-100">휴가</li>
        <li className="rounded px-2 py-0.5 border border-foreground/15">빈 칸: 휴무</li>
      </ul>
      <div className="overflow-x-auto rounded border border-foreground/15">
        <table className="border-collapse text-xs">
          <caption className="sr-only">직원별 근무표</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-background border-b border-r border-foreground/15 px-2 py-1 text-left min-w-28">
                직원
              </th>
              {dates.map((d) => {
                const wd = new Date(toUtc(d)).getUTCDay();
                const weekend = wd === 0 || wd === 6;
                return (
                  <th
                    key={d}
                    scope="col"
                    className={`border-b border-foreground/15 px-1 py-1 font-medium min-w-16 ${weekend ? "bg-foreground/5 text-red-600 dark:text-red-400" : ""}`}
                  >
                    {Number(d.slice(5, 7))}/{Number(d.slice(8, 10))}
                    <br />
                    {WEEKDAYS[wd]}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {input.employees.map((e) => {
              const leaves = new Set(e.approved_leaves ?? []);
              return (
                <tr key={e.id}>
                  <th scope="row" className="sticky left-0 z-10 bg-background border-r border-b border-foreground/15 px-2 py-1 text-left font-medium whitespace-nowrap">
                    {e.name ?? e.id}
                    <span className="ml-1 font-normal opacity-60">
                      {EMPLOYMENT_LABEL[e.employment_type ?? ""] ?? e.employment_type}
                    </span>
                  </th>
                  {dates.map((d) => {
                    const assigned = cells.get(`${e.id}|${d}`);
                    const wd = new Date(toUtc(d)).getUTCDay();
                    const weekend = wd === 0 || wd === 6;
                    return (
                      <td key={d} className={`border-b border-foreground/10 p-0.5 text-center ${weekend ? "bg-foreground/5" : ""}`}>
                        {assigned ? (
                          assigned.map((a) => (
                            <div key={a.shift} title={a.reason} className={`rounded px-1 py-0.5 ${colorOf(a.shift)}`}>
                              {a.shift}
                            </div>
                          ))
                        ) : leaves.has(d) ? (
                          <div className="rounded px-1 py-0.5 bg-red-100 text-red-900 dark:bg-red-900/50 dark:text-red-100">휴가</div>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
});
ScheduleGrid.displayName = "ScheduleGrid";

interface IScheduleRunnerProps {
  initialInput: string;
}

const ScheduleRunner = memo<IScheduleRunnerProps>(({ initialInput }) => {
  const [text, setText] = useState(initialInput);
  const [inputError, setInputError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // 결과와 짝이 맞는 입력. 생성 후 textarea를 고쳐도 그리드·다음 기간 계산은 실제로 보낸 입력 기준
  const [run, setRun] = useState<{ input: IEngineInput; result: IEngineResult } | null>(null);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value), []);

  const handleGenerate = useCallback(async () => {
    let input: unknown;
    try {
      input = JSON.parse(text);
    } catch (e) {
      setInputError(`JSON 파싱 오류: ${(e as Error).message}`);
      return;
    }
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      setInputError("입력은 JSON 객체여야 합니다.");
      return;
    }
    setInputError(null);
    setRequestError(null);
    setNotice(null);
    setRun(null);
    setLoading(true);
    try {
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: text,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setRequestError(`요청 실패 (${res.status}): ${data?.error ?? "알 수 없는 오류"}`);
        return;
      }
      setRun({ input: input as IEngineInput, result: data as IEngineResult });
    } catch {
      setRequestError("서버에 연결할 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }, [text]);

  const handleNextPeriod = useCallback(() => {
    if (!run) return;
    const next = buildNextInput(run.input, run.result);
    setText(JSON.stringify(next, null, 2));
    setRun(null);
    setNotice(
      `다음 기간(${next.schedule_period.start_date} ~ ${next.schedule_period.end_date}) 입력을 만들었습니다. 휴가(approved_leaves)를 확인한 뒤 생성하세요.`,
    );
  }, [run]);

  const result = run?.result;
  const success = result?.status === "SUCCESS";
  const canShowGrid = useMemo(
    () => !!run && Array.isArray(run.input.employees) && !!run.input.schedule_period?.start_date && !!run.input.schedule_period?.end_date,
    [run],
  );

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <label htmlFor="engine-input" className="block text-sm font-semibold">
          엔진 입력 (JSON)
        </label>
        <textarea
          id="engine-input"
          value={text}
          onChange={handleChange}
          spellCheck={false}
          aria-invalid={!!inputError}
          aria-describedby={inputError ? "input-error" : undefined}
          className="block w-full h-[28rem] rounded border border-foreground/20 bg-background p-3 font-mono text-xs leading-5 focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            aria-busy={loading}
            className="inline-flex items-center gap-2 rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden />}
            {loading ? "생성 중…" : "근무표 생성"}
          </button>
          {success && (
            <button
              type="button"
              onClick={handleNextPeriod}
              className="rounded border border-sky-600 px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950"
            >
              다음 기간 입력 만들기
            </button>
          )}
          {inputError && (
            <p id="input-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
              {inputError}
            </p>
          )}
        </div>
      </section>

      <section aria-live="polite" className="space-y-4">
        {notice && <p className="rounded bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:bg-sky-950 dark:text-sky-100">{notice}</p>}
        {requestError && (
          <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
            {requestError}
          </p>
        )}
        {result && (
          <>
            <h2 className="text-lg font-semibold">결과</h2>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5 text-sm">
              {[
                ["상태", result.status],
                ["공정성 점수", String(result.fairness_score ?? "-")],
                ["총 배정", String(result.summary?.total_shifts_assigned ?? "-")],
                ["법적 위반", String(result.summary?.legal_violations ?? "-")],
                [
                  "예상 인건비",
                  result.summary?.estimated_labor_cost != null ? `${result.summary.estimated_labor_cost.toLocaleString("ko-KR")}원` : "-",
                ],
              ].map(([k, v], i) => (
                <div
                  key={k}
                  className={`rounded border px-3 py-2 ${
                    i === 0 && !success
                      ? "border-red-500 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
                      : "border-foreground/15"
                  }`}
                >
                  <dt className="text-xs opacity-70">{k}</dt>
                  <dd className="font-semibold break-all">{v}</dd>
                </div>
              ))}
            </dl>
            {result.warnings_and_exceptions?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold">경고</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-amber-800 dark:text-amber-300">
                  {result.warnings_and_exceptions.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.schedules?.length > 0 && canShowGrid && run && <ScheduleGrid input={run.input} result={result} />}
          </>
        )}
      </section>
    </div>
  );
});
ScheduleRunner.displayName = "ScheduleRunner";

export default ScheduleRunner;
