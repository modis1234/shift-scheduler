"use client";

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { holidayName } from "@/lib/holidays";
import { EVENT_COLORS } from "@/lib/manager-event-colors";
import type { EventColor } from "@/lib/manager-event-colors";
import type { ManagerEvent, ManagerEventWrite } from "@/lib/manager-events";
import ManagerPatternMaker from "./ManagerPatternMaker";

const DAY_MS = 86_400_000;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const toUtc = (date: string) => Date.parse(`${date}T00:00:00Z`);
const fromUtc = (time: number) => new Date(time).toISOString().slice(0, 10);
const localToday = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const monthStart = (date: string) => `${date.slice(0, 7)}-01`;
const moveMonth = (date: string, delta: number) => {
  const base = new Date(`${monthStart(date)}T00:00:00Z`);
  return `${base.getUTCFullYear() + Math.floor((base.getUTCMonth() + delta) / 12)}-${String(((base.getUTCMonth() + delta) % 12 + 12) % 12 + 1).padStart(2, "0")}-01`;
};
const moveDateMonth = (date: string, delta: number) => {
  const value = new Date(`${date}T00:00:00Z`);
  const target = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + delta, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(value.getUTCDate(), lastDay)).padStart(2, "0")}`;
};
const formatDay = (date: string) => {
  const value = new Date(`${date}T00:00:00Z`);
  return `${value.getUTCMonth() + 1}월 ${value.getUTCDate()}일 (${WEEKDAYS[value.getUTCDay()]})${holidayName(date) ? ` · ${holidayName(date)}` : ""}`;
};

const calendarDates = (cursor: string) => {
  const first = toUtc(monthStart(cursor));
  const start = first - new Date(first).getUTCDay() * DAY_MS;
  return Array.from({ length: 42 }, (_, index) => fromUtc(start + index * DAY_MS));
};

type Draft = { id: string | null; date: string; title: string; allDay: boolean; startTime: string; endTime: string; note: string; color: EventColor };

interface IManagerCalendarProps {
  active: boolean;
  onUnauthorized: () => void;
}

const ManagerCalendar = memo<IManagerCalendarProps>(({ active, onUnauthorized }) => {
  const today = useMemo(localToday, []);
  const [cursor, setCursor] = useState(monthStart(today));
  const [selected, setSelected] = useState(today);
  const [events, setEvents] = useState<ManagerEvent[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const loadVersionRef = useRef(0);

  const dates = useMemo(() => calendarDates(cursor), [cursor]);
  const from = dates[0];
  const to = dates[dates.length - 1];
  const title = useMemo(() => {
    const date = new Date(`${cursor}T00:00:00Z`);
    return `${date.getUTCFullYear()}년 ${date.getUTCMonth() + 1}월`;
  }, [cursor]);

  const load = useCallback(async () => {
    const version = ++loadVersionRef.current;
    setLoadError("");
    setEvents(null);
    try {
      const response = await fetch(`/api/manager-events?from=${from}&to=${to}`);
      if (version !== loadVersionRef.current) return;
      if (response.status === 401) return onUnauthorized();
      if (!response.ok) throw new Error();
      const data = (await response.json()) as ManagerEvent[];
      if (version !== loadVersionRef.current) return;
      setEvents(data);
    } catch {
      if (version !== loadVersionRef.current) return;
      setLoadError("일정을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
      setEvents([]);
    }
  }, [from, onUnauthorized, to]);

  useEffect(() => {
    if (active && events === null && !loadError) void load();
  }, [active, events, load, loadError]);

  const byDate = useMemo(() => {
    const map = new Map<string, ManagerEvent[]>();
    for (const event of events ?? []) map.set(event.date, [...(map.get(event.date) ?? []), event]);
    return map;
  }, [events]);
  const selectedEvents = byDate.get(selected) ?? [];

  const focusDate = useCallback((date: string) => {
    requestAnimationFrame(() => document.getElementById(`manager-date-${date}`)?.focus());
  }, []);

  const chooseDate = useCallback((date: string, focus = false) => {
    setSelected(date);
    if (monthStart(date) !== cursor) {
      loadVersionRef.current += 1;
      setCursor(monthStart(date));
      setEvents(null);
      setLoadError("");
    }
    if (focus) focusDate(date);
  }, [cursor, focusDate]);

  const onDateKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, date: string) => {
    if (event.key === "Enter") {
      event.preventDefault();
      chooseDate(date);
      requestAnimationFrame(() => document.getElementById("selected-day-title")?.focus());
      return;
    }
    let delta: number | null = null;
    if (event.key === "ArrowLeft") delta = -1;
    if (event.key === "ArrowRight") delta = 1;
    if (event.key === "ArrowUp") delta = -7;
    if (event.key === "ArrowDown") delta = 7;
    if (event.key === "Home") delta = -new Date(toUtc(date)).getUTCDay();
    if (event.key === "End") delta = 6 - new Date(toUtc(date)).getUTCDay();
    if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      const next = moveDateMonth(date, event.key === "PageUp" ? -1 : 1);
      chooseDate(next, true);
      return;
    }
    if (delta !== null) {
      event.preventDefault();
      chooseDate(fromUtc(toUtc(date) + delta * DAY_MS), true);
    }
  };

  const showDraft = (next: Draft) => {
    setDraft(next);
    setFormError("");
    requestAnimationFrame(() => dialogRef.current?.showModal());
  };
  const add = () => showDraft({ id: null, date: selected, title: "", allDay: true, startTime: "09:00", endTime: "10:00", note: "", color: "gray" });
  const edit = (event: ManagerEvent) => showDraft({
    id: event.id,
    date: event.date,
    title: event.title,
    allDay: event.allDay,
    startTime: event.startTime ?? "09:00",
    endTime: event.endTime ?? "10:00",
    note: event.note,
    color: event.color,
  });

  const validate = (value: Draft): string => {
    if (!value.title.trim()) return "일정 제목을 입력해 주세요.";
    if (value.title.trim().length > 50) return "일정 제목은 50자까지 입력할 수 있습니다.";
    if (value.note.trim().length > 200) return "메모는 200자까지 입력할 수 있습니다.";
    if (!value.allDay && (!value.startTime || !value.endTime || value.endTime <= value.startTime)) return "종료 시각은 시작 시각보다 늦어야 합니다.";
    return "";
  };

  const writeBody = (value: Draft): ManagerEventWrite => ({
    date: value.date,
    title: value.title.trim(),
    allDay: value.allDay,
    startTime: value.allDay ? null : value.startTime,
    endTime: value.allDay ? null : value.endTime,
    note: value.note.trim(),
    color: value.color,
  });

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    const error = validate(draft);
    if (error) return setFormError(error);
    setBusy(true);
    setFormError("");
    try {
      const response = await fetch(draft.id ? `/api/manager-events/${encodeURIComponent(draft.id)}` : "/api/manager-events", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(writeBody(draft)),
      });
      if (response.status === 401) return onUnauthorized();
      const data = (await response.json().catch(() => null)) as ManagerEvent | { error?: string } | null;
      if (!response.ok || !data || !("id" in data)) throw new Error(data && "error" in data ? data.error : undefined);
      setEvents((current) => [...(current ?? []).filter((item) => item.id !== data.id), data].sort((a, b) =>
        a.date.localeCompare(b.date) || Number(b.allDay) - Number(a.allDay) || (a.startTime ?? "").localeCompare(b.startTime ?? ""),
      ));
      setSelected(data.date);
      if (monthStart(data.date) !== cursor) {
        setCursor(monthStart(data.date));
        setEvents(null);
      }
      dialogRef.current?.close();
    } catch (error) {
      setFormError(error instanceof Error && error.message ? error.message : "일정을 저장하지 못했습니다. 입력한 내용은 그대로 두었습니다. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!draft?.id || !window.confirm("이 일정을 삭제할까요? 삭제하면 되돌릴 수 없습니다.")) return;
    setBusy(true);
    setFormError("");
    try {
      const response = await fetch(`/api/manager-events/${encodeURIComponent(draft.id)}`, { method: "DELETE" });
      if (response.status === 401) return onUnauthorized();
      if (!response.ok) throw new Error();
      setEvents((current) => (current ?? []).filter((event) => event.id !== draft.id));
      dialogRef.current?.close();
    } catch {
      setFormError("일정을 삭제하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const changeMonth = (delta: number) => {
    const next = moveMonth(cursor, delta);
    loadVersionRef.current += 1;
    setCursor(next);
    setSelected(next);
    setEvents(null);
    setLoadError("");
  };
  const goToday = () => {
    loadVersionRef.current += 1;
    setCursor(monthStart(today));
    setSelected(today);
    setEvents(null);
    setLoadError("");
  };

  const patternCreated = (_created: ManagerEvent[], _skipped: number, startDate: string) => {
    loadVersionRef.current += 1;
    setSelected(startDate);
    setCursor(monthStart(startDate));
    setEvents(null);
    setLoadError("");
  };

  return (
    <section aria-labelledby="manager-calendar-title" className="card print:hidden">
      <div className="border-b border-border px-4 py-4 sm:px-6">
        <h2 id="manager-calendar-title" className="section-title">내 일정</h2>
        <p className="mt-1 text-sm text-muted">매장 관리자 본인의 일정입니다. 직원 근무표에는 반영되지 않습니다.</p>
      </div>
      <div className="space-y-5 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <button type="button" onClick={() => changeMonth(-1)} className="btn btn-secondary btn-sm" aria-label="이전 달">‹ 이전 달</button>
            <button type="button" onClick={goToday} className="btn btn-secondary btn-sm">오늘</button>
          </div>
          <h3 className="text-base font-semibold tabular-nums" aria-live="polite">{title}</h3>
          <button type="button" onClick={() => changeMonth(1)} className="btn btn-secondary btn-sm" aria-label="다음 달">다음 달 ›</button>
        </div>

        {loadError && (
          <div role="alert" className="alert alert-danger flex flex-wrap items-center justify-between gap-2">
            <span>{loadError}</span>
            <button type="button" onClick={() => { loadVersionRef.current += 1; setEvents(null); setLoadError(""); }} className="btn btn-secondary btn-sm">다시 시도</button>
          </div>
        )}

        <div role="grid" aria-label={`${title} 내 일정 달력`} aria-busy={events === null} className="manager-calendar-grid">
          {WEEKDAYS.map((weekday, index) => (
            <div key={weekday} role="columnheader" className={`py-2 text-center text-xs font-semibold ${index === 0 ? "text-danger" : index === 6 ? "text-accent" : "text-muted"}`}>{weekday}</div>
          ))}
          {dates.map((date) => {
            const dayEvents = byDate.get(date) ?? [];
            const value = new Date(toUtc(date));
            const currentMonth = date.slice(0, 7) === cursor.slice(0, 7);
            const holiday = holidayName(date);
            const label = `${value.getUTCMonth() + 1}월 ${value.getUTCDate()}일 ${WEEKDAYS[value.getUTCDay()]}요일${holiday ? ` ${holiday}` : ""}, 일정 ${dayEvents.length}개`;
            return (
              <div key={date} role="gridcell" aria-selected={selected === date}>
                <button
                  id={`manager-date-${date}`}
                  type="button"
                  aria-label={label}
                  aria-current={today === date ? "date" : undefined}
                  tabIndex={selected === date ? 0 : -1}
                  onClick={() => chooseDate(date)}
                  onKeyDown={(event) => onDateKeyDown(event, date)}
                  className={`${currentMonth ? "" : "opacity-45"} ${selected === date ? "is-selected" : ""} ${today === date ? "is-today" : ""}`}
                >
                  <span className={`flex items-center justify-between gap-1 text-xs font-semibold tabular-nums ${value.getUTCDay() === 0 || holiday ? "text-danger" : value.getUTCDay() === 6 ? "text-accent" : ""}`}>
                    {value.getUTCDate()}
                    {today === date && <span className="text-[10px] text-accent">오늘</span>}
                  </span>
                  {holiday && <span className="hidden truncate text-left text-[10px] font-medium text-danger sm:block">{holiday}</span>}
                  <span className="mt-1 hidden space-y-1 sm:block">
                    {dayEvents.slice(0, 2).map((item) => (
                      <span key={item.id} className={`block truncate rounded-md px-1.5 py-0.5 text-left text-[11px] ${EVENT_COLORS[item.color].className}`}>
                        {item.allDay ? "" : `${item.startTime} `}{item.title}
                      </span>
                    ))}
                    {dayEvents.length > 2 && <span className="block text-left text-[10px] text-muted">외 {dayEvents.length - 2}개</span>}
                  </span>
                  {dayEvents.length > 0 && <span className="mt-2 flex items-center justify-center gap-1 text-[10px] text-accent sm:hidden"><span aria-hidden>●</span>{dayEvents.length}개</span>}
                </button>
              </div>
            );
          })}
        </div>

        {events === null && !loadError && <div className="h-12 animate-pulse rounded-[var(--radius)] bg-surface-2" aria-hidden />}

        <section aria-labelledby="selected-day-title" className="rounded-[var(--radius)] border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 id="selected-day-title" tabIndex={-1} className="font-semibold tabular-nums">{formatDay(selected)}</h3>
            <div className="flex flex-wrap justify-end gap-2">
              <ManagerPatternMaker onCreated={patternCreated} onUnauthorized={onUnauthorized} />
              <button type="button" onClick={add} className="btn btn-primary btn-sm">일정 추가</button>
            </div>
          </div>
          {selectedEvents.length === 0 ? (
            <p className="mt-3 text-sm text-muted">이 날짜에 등록한 일정이 없습니다.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {selectedEvents.map((event) => (
                <li key={event.id} className="flex flex-wrap items-center gap-3 rounded-[var(--radius)] border border-border px-3 py-2">
                  <span className="min-w-24 text-xs font-medium text-muted">{event.allDay ? "하루 종일" : `${event.startTime}~${event.endTime}`}</span>
                  <span className="flex flex-1 items-center gap-2 font-medium">
                    <span aria-hidden className={`inline-block h-3 w-3 shrink-0 rounded-full border border-border ${EVENT_COLORS[event.color].className}`} />
                    {event.title}
                  </span>
                  <button type="button" onClick={() => edit(event)} className="btn btn-secondary btn-sm" aria-label={`${event.title} 일정 수정`}>수정</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <dialog
        ref={dialogRef}
        onCancel={(event) => { if (busy) event.preventDefault(); }}
        onClose={() => { setDraft(null); setFormError(""); }}
        aria-labelledby="manager-event-dialog-title"
        className="card m-auto w-[calc(100%-2rem)] max-w-[520px] p-6 text-fg"
      >
        {draft && (
          <form onSubmit={save} className="space-y-4">
            <h2 id="manager-event-dialog-title" className="section-title">{draft.id ? "일정 수정" : "일정 추가"}</h2>
            <label className="block text-sm font-medium">일정 제목
              <input autoFocus value={draft.title} maxLength={50} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="input mt-1 w-full" />
            </label>
            <label className="block text-sm font-medium">날짜
              <input type="date" required value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} className="input mt-1 w-full" />
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={draft.allDay} onChange={(event) => setDraft({ ...draft, allDay: event.target.checked })} /> 하루 종일
            </label>
            {!draft.allDay && (
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm font-medium">시작 시각<input type="time" required value={draft.startTime} onChange={(event) => setDraft({ ...draft, startTime: event.target.value })} className="input mt-1 w-full" /></label>
                <label className="text-sm font-medium">종료 시각<input type="time" required value={draft.endTime} onChange={(event) => setDraft({ ...draft, endTime: event.target.value })} className="input mt-1 w-full" /></label>
              </div>
            )}
            <fieldset>
              <legend className="text-sm font-medium">색</legend>
              <div className="mt-1 flex flex-wrap gap-2">
                {(Object.keys(EVENT_COLORS) as EventColor[]).map((key) => (
                  <label key={key} className={`flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium has-[:checked]:ring-2 has-[:checked]:ring-accent ${EVENT_COLORS[key].className}`}>
                    <input type="radio" name="manager-event-color" value={key} checked={draft.color === key} onChange={() => setDraft({ ...draft, color: key })} />
                    {EVENT_COLORS[key].label}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block text-sm font-medium">메모
              <textarea value={draft.note} maxLength={200} rows={4} onChange={(event) => setDraft({ ...draft, note: event.target.value })} className="input mt-1 h-auto w-full py-2" />
            </label>
            {formError && <p role="alert" className="alert alert-danger">{formError}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              {draft.id && <button type="button" disabled={busy} onClick={() => void remove()} className="btn btn-danger-ghost mr-auto">{busy ? "처리 중…" : "삭제"}</button>}
              <button type="button" disabled={busy} onClick={() => dialogRef.current?.close()} className="btn btn-secondary">취소</button>
              <button type="submit" disabled={busy} className="btn btn-primary">{busy ? "저장하는 중…" : "저장"}</button>
            </div>
          </form>
        )}
      </dialog>
    </section>
  );
});
ManagerCalendar.displayName = "ManagerCalendar";

export default ManagerCalendar;
