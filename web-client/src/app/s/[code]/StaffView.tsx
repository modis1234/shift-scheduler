"use client";

import Image from "next/image";
import React, { memo, useEffect, useMemo, useState } from "react";
import { formatDate } from "../../InputForm";
import { addDays, HolidayTag, todayIso, weekday, weekendText } from "../../ScheduleCalendar";

// GET /api/s/<code> 응답(기획서 7-3 계약)
interface IStaffPeriod {
  startDate: string;
  endDate: string;
  shifts: { name: string; start: string; end: string }[];
  employees: string[];
  days: { date: string; shift: string; names: string[] }[];
  leaves: { date: string; name: string }[];
}
interface IStaffShare {
  storeName: string;
  periods: IStaffPeriod[];
}

type View = "mine" | "day" | "week";

const nameKey = (code: string) => `shift-scheduler:staff-name:${code}`;
/** 이 기기에서 마지막으로 연 직원 공유 코드. 앱 시작 화면(/app)이 읽는다 */
export const LAST_SHARE_KEY = "shift-scheduler:last-share-code";

/** 처음 여는 기간: 오늘이 든 기간 → 가장 가까운 앞으로의 기간 → 가장 최근에 끝난 기간. periods는 startDate 오름차순 */
function pickPeriod(periods: IStaffPeriod[], today: string): number {
  const now = periods.findIndex((p) => p.startDate <= today && today <= p.endDate);
  if (now >= 0) return now;
  const next = periods.findIndex((p) => p.startDate > today);
  if (next >= 0) return next;
  return periods.reduce((best, p, i) => (p.endDate > periods[best].endDate ? i : best), 0);
}

/** 직원 공유 링크 화면(/s/<코드>). 로그인 없음, 읽기 전용, 모바일 우선 */
const StaffView = memo<{ code: string }>(({ code }) => {
  // null = 로딩, "gone" = 링크가 잘못됨·중지됨(404), "failed" = 그 밖의 실패
  const [data, setData] = useState<IStaffShare | "gone" | "failed" | null>(null);
  const [periodIdx, setPeriodIdx] = useState(0);
  const [me, setMe] = useState("");
  const [view, setView] = useState<View>("mine");
  const [cursor, setCursor] = useState("");
  const today = useMemo(todayIso, []);

  useEffect(() => {
    let alive = true;
    fetch(`/api/s/${encodeURIComponent(code)}`, { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 404) {
          // 앱 시작 화면(/app)이 바뀐 링크로 다시 보내지 않게 지운다
          try {
            if (localStorage.getItem(LAST_SHARE_KEY) === code) localStorage.removeItem(LAST_SHARE_KEY);
          } catch {}
          return alive && setData("gone");
        }
        if (!r.ok) throw new Error();
        const d = (await r.json()) as IStaffShare;
        try {
          localStorage.setItem(LAST_SHARE_KEY, code);
        } catch {}
        if (alive) {
          setData(d);
          if (d.periods.length) setPeriodIdx(pickPeriod(d.periods, today));
        }
      })
      .catch(() => alive && setData("failed"));
    return () => {
      alive = false;
    };
  }, [code, today]);

  const period = typeof data === "object" && data ? data.periods[periodIdx] : undefined;

  // 기간이 바뀌면 이름(저장된 이름이 이 기간 직원에 없으면 비움)과 일·주 보기 날짜를 다시 정한다
  useEffect(() => {
    if (!period) return;
    let saved = "";
    try {
      saved = localStorage.getItem(nameKey(code)) ?? "";
    } catch {}
    setMe(period.employees.includes(saved) ? saved : "");
    setCursor(today >= period.startDate && today <= period.endDate ? today : period.startDate);
  }, [period, code, today]);

  const chooseMe = (name: string) => {
    setMe(name);
    try {
      if (name) localStorage.setItem(nameKey(code), name);
      else localStorage.removeItem(nameKey(code));
    } catch {}
  };

  const shiftIndex = useMemo(() => new Map(period?.shifts.map((s, i) => [s.name, i]) ?? []), [period]);
  const shiftLabel = (name: string) => {
    const i = shiftIndex.get(name);
    const s = i === undefined ? undefined : period!.shifts[i];
    return (
      <>
        {/* 근무조 색은 관리자 화면과 같은 팔레트(shift-0~5), 이름을 항상 같이 쓴다 */}
        <span className={`mr-2 rounded-[6px] px-1.5 py-0.5 text-xs font-semibold ${i === undefined ? "badge-neutral" : `shift-${i % 6}`}`}>{name}</span>
        {s && <span className="tabular-nums text-muted">{`${s.start}–${s.end}`}</span>}
      </>
    );
  };

  const names = (list: string[]) =>
    list.map((n, i) => (
      <React.Fragment key={n + i}>
        {i > 0 && ", "}
        <span className={n === me ? "font-semibold text-accent" : ""}>{n}</span>
      </React.Fragment>
    ));

  const dayBlock = (d: string) => {
    const rows = (period?.days ?? [])
      .filter((x) => x.date === d && x.names.length)
      .sort((a, b) => (shiftIndex.get(a.shift) ?? 99) - (shiftIndex.get(b.shift) ?? 99));
    const leaves = (period?.leaves ?? []).filter((l) => l.date === d).map((l) => l.name);
    return (
      <div className="space-y-2">
        {rows.length === 0 && leaves.length === 0 && <p className="text-sm text-muted">이날은 표시할 근무가 없습니다.</p>}
        {rows.map((r) => (
          <div key={r.shift} className={`rounded-[var(--radius)] border px-3 py-2 ${r.names.includes(me) ? "border-accent" : "border-border"}`}>
            <p className="text-sm">{shiftLabel(r.shift)}</p>
            <p className="mt-1 text-sm">{names(r.names)}</p>
          </div>
        ))}
        {leaves.length > 0 && (
          <p className="text-sm">
            <span className="leave mr-2 rounded-[6px] px-1.5 py-0.5 text-xs font-semibold">휴가</span>
            {names(leaves)}
          </p>
        )}
      </div>
    );
  };

  const mine = useMemo(() => {
    if (!period || !me) return [];
    const work = period.days.filter((d) => d.names.includes(me)).map((d) => ({ date: d.date, shift: d.shift, with: d.names.filter((n) => n !== me) }));
    const off = period.leaves.filter((l) => l.name === me).map((l) => ({ date: l.date, shift: null, with: [] as string[] }));
    return [...work, ...off].sort((a, b) => a.date.localeCompare(b.date) || (shiftIndex.get(a.shift ?? "") ?? 99) - (shiftIndex.get(b.shift ?? "") ?? 99));
  }, [period, me, shiftIndex]);

  // 주 보기: 일~토 중 근무 기간 안의 날짜만(모바일에서는 일 목록으로 보여 준다)
  const weekDates = useMemo(() => {
    if (!period || !cursor) return [];
    const sun = addDays(cursor, -weekday(cursor));
    return Array.from({ length: 7 }, (_, i) => addDays(sun, i)).filter((d) => d >= period.startDate && d <= period.endDate);
  }, [period, cursor]);
  const stepBy = view === "week" ? 7 : 1;
  const canPrev = !!period && (view === "week" ? weekDates[0] > period.startDate : cursor > period.startDate);
  const canNext = !!period && (view === "week" ? weekDates[weekDates.length - 1] < period.endDate : cursor < period.endDate);
  const move = (dir: 1 | -1) => {
    const d = addDays(cursor, dir * stepBy);
    setCursor(d < period!.startDate ? period!.startDate : d > period!.endDate ? period!.endDate : d);
  };

  const store = typeof data === "object" && data ? data.storeName : null;

  return (
    <div className="min-h-screen">
      <header className="app-header border-b border-border">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3">
          <Image src="/app-icon.svg" alt="" width={28} height={28} unoptimized className="rounded-lg" />
          <h1 className="min-w-0 flex-1 truncate text-[15px] font-bold tracking-[-0.01em]">{store ?? "근무표"}</h1>
          <span className="badge badge-neutral">베타</span>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-4 px-4 py-4" aria-busy={data === null}>
        {data === null ? (
          <ul className="space-y-2" aria-label="불러오는 중">
            {[0, 1, 2, 3, 4].map((i) => (
              <li key={i} className="h-14 animate-pulse rounded-[var(--radius)] bg-surface-2" />
            ))}
          </ul>
        ) : data === "gone" ? (
          <p role="alert" className="alert alert-danger">
            링크를 열 수 없습니다. 매장 관리자에게 새 링크를 요청해 주세요.
          </p>
        ) : data === "failed" ? (
          <p role="alert" className="alert alert-danger">
            근무표를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.
          </p>
        ) : !period ? (
          <p className="rounded-[var(--radius)] border border-dashed border-border-strong px-5 py-6 text-center text-sm text-muted">
            아직 게시된 근무표가 없습니다. 매장 관리자에게 문의해 주세요.
          </p>
        ) : (
          <>
            <section className="card space-y-3 p-4">
              {data.periods.length > 1 ? (
                <label className="block text-sm">
                  <span className="subhead">근무 기간</span>
                  <select value={periodIdx} onChange={(e) => setPeriodIdx(Number(e.target.value))} className="input mt-1 w-full">
                    {data.periods.map((p, i) => (
                      <option key={i} value={i}>
                        {formatDate(p.startDate)} ~ {formatDate(p.endDate)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="text-sm">
                  <span className="text-muted">근무 기간</span>{" "}
                  <span className="font-semibold tabular-nums">
                    {formatDate(period.startDate)} ~ {formatDate(period.endDate)}
                  </span>
                </p>
              )}
              <label className="block text-sm">
                <span className="subhead">내 이름 선택</span>
                <select value={me} onChange={(e) => chooseMe(e.target.value)} className="input mt-1 w-full">
                  <option value="">이름을 고르세요</option>
                  {period.employees.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            <div className="segmented" role="group" aria-label="보기">
              {(
                [
                  ["mine", "내 근무"],
                  ["day", "일"],
                  ["week", "주"],
                ] as const
              ).map(([v, label]) => (
                <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
                  {label}
                </button>
              ))}
            </div>

            {view === "mine" ? (
              <section className="card p-4" aria-live="polite">
                {!me ? (
                  <p className="text-sm text-muted">위에서 내 이름을 고르면 내 근무가 보입니다.</p>
                ) : mine.length === 0 ? (
                  <p className="text-sm text-muted">이 기간에는 배정된 근무가 없습니다.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {mine.map((m, i) => (
                      <li key={i} className={`py-2.5 text-sm first:pt-0 last:pb-0 ${m.date === today ? "font-medium" : ""}`}>
                        <p className="tabular-nums">
                          <span className="font-semibold">{formatDate(m.date)}</span>
                          {m.date === today && <span className="ml-2 text-xs font-semibold text-accent">오늘</span>}
                          <HolidayTag date={m.date} className="text-xs" />
                        </p>
                        <p className="mt-1">
                          {m.shift ? (
                            shiftLabel(m.shift)
                          ) : (
                            <span className="leave rounded-[6px] px-1.5 py-0.5 text-xs font-semibold">휴가</span>
                          )}
                        </p>
                        {m.with.length > 0 && <p className="mt-1 text-muted">함께: {m.with.join(", ")}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : (
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <button type="button" disabled={!canPrev} onClick={() => move(-1)} className="btn btn-secondary btn-sm">
                    ‹ 이전
                  </button>
                  <h2 className="flex-1 text-center text-sm font-semibold tabular-nums" aria-live="polite">
                    {view === "day" ? <>{formatDate(cursor)}<HolidayTag date={cursor} className="text-xs" /></> : weekDates.length ? `${formatDate(weekDates[0])} ~ ${formatDate(weekDates[weekDates.length - 1])}` : ""}
                  </h2>
                  <button type="button" disabled={!canNext} onClick={() => move(1)} className="btn btn-secondary btn-sm">
                    다음 ›
                  </button>
                </div>
                {view === "day" ? (
                  <div className="card p-4">{dayBlock(cursor)}</div>
                ) : (
                  weekDates.map((d) => (
                    <div key={d} className="card p-4">
                      <h3 className={`mb-2 text-sm font-semibold tabular-nums ${weekendText(d)}`}>
                        {formatDate(d)}
                        {d === today && <span className="ml-2 text-xs text-accent">오늘</span>}
                        <HolidayTag date={d} className="text-xs" />
                      </h3>
                      {dayBlock(d)}
                    </div>
                  ))
                )}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
});
StaffView.displayName = "StaffView";

export default StaffView;
