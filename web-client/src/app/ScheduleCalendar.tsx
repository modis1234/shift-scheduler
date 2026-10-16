"use client";

import React, { memo, useMemo, useState } from "react";
import { formatDate, toUtc, WEEKDAYS } from "./InputForm";
import type { IEngineInput, IEngineResult } from "./ScheduleRunner";

type View = "month" | "week" | "day";
type Person = { id: string; name: string };

const DAY_MS = 86_400_000;
const addDays = (d: string, n: number) => new Date(toUtc(d) + n * DAY_MS).toISOString().slice(0, 10);
const weekday = (d: string) => new Date(toUtc(d)).getUTCDay();
const dayLabel = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일 ${WEEKDAYS[weekday(d)]}요일`;
// 주말 글자색: 일 = danger, 토 = accent (UI 가이드)
const weekendText = (d: string) => (weekday(d) === 0 ? "text-danger" : weekday(d) === 6 ? "text-accent" : "");
/** 오늘(브라우저 현지 날짜) */
const todayIso = () => {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};

/** 보기별로 화면에 보이는 날짜 범위 [처음, 끝] */
function rangeOf(view: View, cursor: string): [string, string] {
  if (view === "day") return [cursor, cursor];
  if (view === "week") {
    const sun = addDays(cursor, -weekday(cursor));
    return [sun, addDays(sun, 6)];
  }
  const first = `${cursor.slice(0, 8)}01`;
  const d = new Date(toUtc(first));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  return [first, last];
}

/** 이전·다음 이동 */
function step(view: View, cursor: string, dir: 1 | -1): string {
  if (view === "day") return addDays(cursor, dir);
  if (view === "week") return addDays(cursor, 7 * dir);
  const d = new Date(toUtc(cursor));
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + dir, 1)).toISOString().slice(0, 10);
}

interface IScheduleCalendarProps {
  input: IEngineInput;
  result: IEngineResult;
  colorOf: (shift: string) => string;
  /** 인쇄 머리에 쓰는 매장 이름·근무 기간 */
  storeName: string | null;
  periodLabel: string;
}

/** 근무표 결과를 월·주·일 달력으로 보여 준다. 결과와 입력만 쓰고 따로 계산하지 않는다 */
const ScheduleCalendar = memo<IScheduleCalendarProps>(({ input, result, colorOf, storeName, periodLabel }) => {
  const { start_date: start, end_date: end } = input.schedule_period;
  const today = useMemo(todayIso, []);
  const [view, setView] = useState<View>("month");
  // 오늘이 근무 기간 안이면 오늘, 아니면 기간 첫날로 연다
  const [cursor, setCursor] = useState(() => (today >= start && today <= end ? today : start));
  const [empFilter, setEmpFilter] = useState("");
  const [hiddenShifts, setHiddenShifts] = useState<string[]>([]);

  // 근무조 순서는 근무조 정의 순서(결과에만 있는 이름은 뒤에). 근무가 없는 쉬는 날(Off 등)은 빠진다
  const shifts = useMemo(() => {
    const used = new Set(result.schedules.map((s) => s.shift));
    const order = Object.keys(input.shift_definitions ?? {}).filter((s) => used.has(s));
    for (const s of used) if (!order.includes(s)) order.push(s);
    return order;
  }, [input.shift_definitions, result.schedules]);
  const timeOf = (s: string) => {
    const sd = input.shift_definitions?.[s] as { start?: string; end?: string } | undefined;
    return sd?.start && sd?.end ? `${sd.start}–${sd.end}` : "";
  };

  // 날짜 → 근무조 → 직원 / 날짜 → 휴가 직원
  const byDate = useMemo(() => {
    const m = new Map<string, Map<string, Person[]>>();
    for (const s of result.schedules) {
      const day = m.get(s.date) ?? new Map<string, Person[]>();
      day.set(s.shift, [...(day.get(s.shift) ?? []), ...s.assigned_employees.map((a) => ({ id: a.employee_id, name: a.name }))]);
      m.set(s.date, day);
    }
    return m;
  }, [result.schedules]);
  const leavesByDate = useMemo(() => {
    const m = new Map<string, Person[]>();
    for (const e of input.employees)
      for (const d of e.approved_leaves ?? []) if (d >= start && d <= end) m.set(d, [...(m.get(d) ?? []), { id: e.id, name: e.name ?? e.id }]);
    return m;
  }, [input.employees, start, end]);

  const visibleShifts = shifts.filter((s) => !hiddenShifts.includes(s));
  const matches = (p: Person) => !empFilter || p.id === empFilter;
  // 필터에 맞는 근무가 기간 전체에 하나도 없으면 안내만 보여 준다
  const anyMatch = result.schedules.some((s) => visibleShifts.includes(s.shift) && s.assigned_employees.some((a) => matches({ id: a.employee_id, name: a.name })));

  const [from, to] = rangeOf(view, cursor);
  const canPrev = rangeOf(view, step(view, cursor, -1))[1] >= start;
  const canNext = rangeOf(view, step(view, cursor, 1))[0] <= end;
  const rangeTitle =
    view === "month" ? `${Number(from.slice(0, 4))}년 ${Number(from.slice(5, 7))}월` : view === "week" ? `${formatDate(from)} ~ ${formatDate(to)}` : formatDate(cursor);
  const inPeriod = (d: string) => d >= start && d <= end;

  const openDay = (d: string) => {
    setCursor(d);
    setView("day");
  };
  const print = () => {
    // 인쇄는 월 보기 한 장(기획서 4.1). 다시 그린 뒤 인쇄 대화상자를 연다
    setView("month");
    setTimeout(() => window.print(), 50);
  };

  /** 이름 목록. 직원 필터가 있으면 그 직원만 굵게 강조하고 나머지는 흐린 글자 */
  const names = (people: Person[]) =>
    people.map((p, i) => (
      <span key={p.id} className={empFilter ? (matches(p) ? "font-bold text-fg" : "text-muted") : undefined}>
        {i > 0 && ", "}
        {p.name}
      </span>
    ));

  const dayBlocks = (d: string) => {
    const day = byDate.get(d);
    const leaves = leavesByDate.get(d) ?? [];
    const rows = visibleShifts.filter((s) => day?.get(s)?.length);
    if (!inPeriod(d)) return <p className="text-sm text-muted">근무 기간이 아닙니다.</p>;
    return (
      <div className="space-y-2">
        {rows.length === 0 && leaves.length === 0 && <p className="text-sm text-muted">이날은 표시할 근무가 없습니다.</p>}
        {rows.map((s) => {
          const people = day!.get(s)!;
          return (
            <div key={s} className={`rounded-[var(--radius)] border border-border px-3 py-2 ${empFilter && people.some(matches) ? "ring-2 ring-accent" : ""}`}>
              <p className="text-sm">
                <span className={`mr-2 rounded px-1.5 py-0.5 text-xs font-semibold ${colorOf(s)}`}>{s}</span>
                <span className="tabular-nums text-muted">{timeOf(s)}</span>
              </p>
              <p className="mt-1 text-sm">{names(people)}</p>
            </div>
          );
        })}
        {leaves.length > 0 && (
          <p className="text-sm">
            <span className="leave mr-2 rounded px-1.5 py-0.5 text-xs font-semibold">휴가</span>
            {names(leaves)}
          </p>
        )}
      </div>
    );
  };

  const monthCells = useMemo(() => {
    const first = addDays(from, -weekday(from));
    const cells: string[] = [];
    for (let d = first; d <= to || weekday(d) !== 0; d = addDays(d, 1)) cells.push(d);
    return cells;
  }, [from, to]);

  return (
    <div className="space-y-4">
      {/* 인쇄 머리: 화면에서는 숨김 */}
      <p className="hidden text-sm font-semibold print:block">
        {storeName ? `${storeName} · ` : ""}근무 기간 {periodLabel}
      </p>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <div className="flex gap-1" role="group" aria-label="달력 보기">
          {(
            [
              ["month", "월"],
              ["week", "주"],
              ["day", "일"],
            ] as const
          ).map(([v, label]) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`btn btn-sm ${view === v ? "btn-primary" : "btn-secondary"}`}>
              {label}
            </button>
          ))}
        </div>
        <button type="button" disabled={!canPrev} onClick={() => setCursor(step(view, cursor, -1))} className="btn btn-secondary btn-sm">
          ‹ 이전
        </button>
        <button type="button" disabled={!canNext} onClick={() => setCursor(step(view, cursor, 1))} className="btn btn-secondary btn-sm">
          다음 ›
        </button>
        <label className="flex items-center gap-1.5 text-sm">
          직원
          <select value={empFilter} onChange={(e) => setEmpFilter(e.target.value)} aria-label="직원 필터" className="input h-8">
            <option value="">전체</option>
            {input.employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name ?? e.id}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <legend className="sr-only">근무조</legend>
          {shifts.map((s) => (
            <label key={s} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={!hiddenShifts.includes(s)}
                onChange={(e) => setHiddenShifts((h) => (e.target.checked ? h.filter((x) => x !== s) : [...h, s]))}
              />
              {s}
            </label>
          ))}
        </fieldset>
        <button type="button" onClick={print} className="btn btn-secondary btn-sm sm:ml-auto">
          인쇄
        </button>
      </div>

      <h3 className="text-base font-semibold" aria-live="polite">
        {rangeTitle}
      </h3>

      {!anyMatch ? (
        <p className="card border-dashed px-5 py-8 text-center text-sm text-muted">선택한 조건에 맞는 근무가 없습니다. 필터를 바꿔 보세요.</p>
      ) : view === "month" ? (
        <div className="cal-month overflow-hidden rounded-[var(--radius)] border border-border">
          <div className="grid grid-cols-7 bg-surface-2 text-center text-xs font-semibold text-muted" aria-hidden>
            {WEEKDAYS.map((w, i) => (
              <div key={w} className={`py-1.5 ${i === 0 ? "text-danger" : i === 6 ? "text-accent" : ""}`}>
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthCells.map((d) => {
              const thisMonth = d >= from && d <= to;
              if (!thisMonth || !inPeriod(d)) return <div key={d} className="min-h-12 border-t border-l border-border bg-surface-2 sm:min-h-24 [&:nth-child(7n+1)]:border-l-0" />;
              const day = byDate.get(d);
              const leaves = leavesByDate.get(d) ?? [];
              const rows = visibleShifts.map((s) => [s, day?.get(s) ?? []] as const).filter(([, p]) => p.length);
              const label = [dayLabel(d), ...rows.map(([s, p]) => `${s} ${p.length}명`), ...(leaves.length ? [`휴가 ${leaves.length}명`] : []), ...(d === today ? ["오늘"] : [])].join(", ");
              const isToday = d === today;
              return (
                <button
                  key={d}
                  type="button"
                  aria-label={label}
                  onClick={() => openDay(d)}
                  className={`min-h-12 border-t border-l border-border p-1 text-left align-top hover:bg-surface-2 sm:min-h-24 sm:p-1.5 [&:nth-child(7n+1)]:border-l-0 ${isToday ? "outline outline-2 -outline-offset-2 outline-accent" : ""}`}
                >
                  <span className={`text-xs font-semibold tabular-nums ${weekendText(d)}`}>
                    {Number(d.slice(8, 10))}
                    {isToday && <span className="ml-1 rounded bg-accent-soft px-1 text-[10px] text-accent">오늘</span>}
                  </span>
                  {/* 데스크톱: 근무조별 줄 / 모바일: 근무조 점과 인원 */}
                  <span className="mt-1 hidden space-y-0.5 sm:block">
                    {rows.map(([s, p]) => (
                      <span
                        key={s}
                        className={`block truncate rounded px-1 text-[11px] leading-5 ${empFilter && !p.some(matches) ? "text-muted" : `${colorOf(s)} font-medium`} ${empFilter && p.some(matches) ? "ring-1 ring-current" : ""}`}
                      >
                        {s} {p.length}명
                      </span>
                    ))}
                    {leaves.length > 0 && (
                      <span className={`leave block rounded px-1 text-[11px] leading-5 ${empFilter && leaves.some(matches) ? "font-bold ring-1 ring-current" : ""}`}>휴가 {leaves.length}명</span>
                    )}
                  </span>
                  <span className="mt-0.5 flex flex-wrap gap-x-1 text-[10px] leading-4 sm:hidden" aria-hidden>
                    {rows.map(([s, p]) => (
                      <span key={s} className="flex items-center">
                        <span className={`mr-0.5 inline-block h-2 w-2 rounded-full ${colorOf(s)}`} style={{ backgroundColor: "currentColor" }} />
                        {p.length}
                      </span>
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : view === "week" ? (
        <>
          <div className="relative hidden overflow-x-auto rounded-[var(--radius)] border border-border sm:block">
            <table className="data-table w-full table-fixed border-collapse text-sm">
              <caption className="sr-only">{rangeTitle} 근무조별 근무</caption>
              <thead>
                <tr>
                  <th scope="col" className="w-36 border-b border-r border-border px-3 py-2 text-left">
                    근무조
                  </th>
                  {Array.from({ length: 7 }, (_, i) => addDays(from, i)).map((d) => (
                    <th key={d} scope="col" aria-label={dayLabel(d)} className={`border-b border-border px-2 py-2 ${weekendText(d)} ${d === today ? "outline outline-2 -outline-offset-2 outline-accent" : ""}`}>
                      {formatDate(d)}
                      {d === today && <span className="ml-1 text-accent">오늘</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleShifts.map((s) => (
                  <tr key={s}>
                    <th scope="row" className="border-b border-r border-border px-3 py-2 text-left align-top font-medium">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${colorOf(s)}`}>{s}</span>
                      <span className="mt-1 block text-xs font-normal tabular-nums text-muted">{timeOf(s)}</span>
                    </th>
                    {Array.from({ length: 7 }, (_, i) => addDays(from, i)).map((d) => (
                      <td key={d} className="border-b border-border px-2 py-2 align-top text-xs">
                        {inPeriod(d) ? names(byDate.get(d)?.get(s) ?? []) : <span className="text-muted">–</span>}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <th scope="row" className="border-r border-border px-3 py-2 text-left font-medium">
                    <span className="leave rounded px-1.5 py-0.5 text-xs font-semibold">휴가</span>
                  </th>
                  {Array.from({ length: 7 }, (_, i) => addDays(from, i)).map((d) => (
                    <td key={d} className="px-2 py-2 align-top text-xs">
                      {names(leavesByDate.get(d) ?? [])}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          {/* 모바일은 주 표 대신 날짜별 목록 */}
          <div className="space-y-4 sm:hidden">
            {Array.from({ length: 7 }, (_, i) => addDays(from, i)).map((d) => (
              <section key={d} aria-label={dayLabel(d)}>
                <h4 className={`mb-1 text-sm font-semibold ${weekendText(d)}`}>
                  {formatDate(d)}
                  {d === today && <span className="ml-1 text-accent">오늘</span>}
                </h4>
                {dayBlocks(d)}
              </section>
            ))}
          </div>
        </>
      ) : (
        dayBlocks(cursor)
      )}
    </div>
  );
});
ScheduleCalendar.displayName = "ScheduleCalendar";

export default ScheduleCalendar;
