"use client";

import React, { memo, useCallback, useState } from "react";

// JSON 직접 편집에서 어떤 값이든 들어올 수 있으므로 폼은 느슨한 객체로 다루고, 읽을 때마다 타입을 확인한다
type Obj = Record<string, unknown>;

// 엔진 _check_input과 같은 상한 (넘으면 엔진이 INVALID_INPUT)
const MAX_PERIOD_DAYS = 366;
const MAX_SHIFT_HOURS = 24;
const MAX_WEEK_HOURS = 168;
const MAX_HEADCOUNT = 10000;
const MAX_WAGE = 10_000_000;
const MAX_TIME_LIMIT = 100;
// 엔진 DEFAULT_RULES. 비워 두면 이 값이 쓰인다
const DEFAULT_MAX_CONSECUTIVE_DAYS = 5;
const DEFAULT_MAX_WEEKLY_HOURS = 52;
const OFF = "Off"; // 엔진 예약 시프트
const DAY_MS = 86_400_000;

// 저장 값은 엔진 계약 그대로, 화면에는 한국어 라벨
const EMPLOYMENT_TYPES = [
  ["Full_Time", "정규직"],
  ["Part_Time", "파트타임"],
] as const;
const LEVELS = [
  ["Senior", "숙련"],
  ["Junior", "일반"],
] as const;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const RULE_FIELDS = [
  { key: "max_weekly_hours", label: "주당 최대 근로시간", unit: "시간", max: MAX_WEEK_HOURS, min: 0, int: true, placeholder: "52" },
  { key: "min_rest_hours", label: "근무 사이 최소 휴식", unit: "시간", max: MAX_WEEK_HOURS, min: 0, int: false, placeholder: "11" },
  { key: "max_consecutive_days", label: "최대 연속 근무일", unit: "일", max: MAX_PERIOD_DAYS, min: 1, int: true, placeholder: "5" },
  { key: "default_hourly_wage", label: "기본 시급", unit: "원", max: MAX_WAGE, min: 0, int: false, placeholder: "10,320" },
  { key: "time_limit_seconds", label: "계산 시간 제한", unit: "초", max: MAX_TIME_LIMIT, min: 0, int: false, placeholder: "30" },
] as const;

const INPUT = "input";
const SMALL_BTN = "btn btn-secondary btn-sm";
const DEL_BTN = "btn btn-danger-ghost";
const TH = "border-b border-border px-2 py-2 text-left whitespace-nowrap";
const LEGEND = "mb-3 text-sm font-semibold";
// 가로 스크롤 시 첫 열 고정. 배경이 있어야 지나가는 칸이 비치지 않는다
// 표를 감싼 스크롤 상자는 relative로 둔다. sr-only(absolute) 머리글이 스크롤 밖으로 빠져 모바일 페이지 폭을 늘리지 않게
const STICKY = "sticky left-0 z-10 bg-surface";
// 지난 기간 정보 표 머리글: 라벨, 도움말 (가이드 5절)
const CARRY_FIELDS = [
  ["직전까지 연속 근무일(일)", "지난 기간 마지막 날까지 쉬지 않고 일한 날 수"],
  ["마지막 근무 종료 시각", "지난 기간 마지막 근무가 끝난 날짜와 시각"],
  ["이번 주 이미 근무한 시간(시간)", "근무 기간 첫 주에 지난 기간 쪽에서 이미 일한 시간"],
  ["순환 근무 시작 위치(번째 날)", "비워 두면 자동으로 정합니다"],
] as const;
const TD = "border-b border-border px-1 py-1.5 align-top";

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const obj = (v: unknown): Obj => (isObj(v) ? v : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const numStr = (v: unknown) => (typeof v === "number" ? String(v) : "");

/** draft[key]가 객체가 아니면 새 객체로 바꾸고 돌려준다 */
const child = (draft: Obj, key: string): Obj => {
  if (!isObj(draft[key])) draft[key] = {};
  return draft[key] as Obj;
};
/** 숫자 입력값 반영. 빈 칸은 키 삭제(엔진 기본값 사용) */
const setNum = (target: Obj, key: string, raw: string) => {
  if (raw === "") delete target[key];
  else target[key] = Number(raw);
};

const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && lo <= v && v <= hi;
const isNum = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isFinite(v) && lo <= v && v <= hi;
const isHhmm = (v: unknown) => typeof v === "string" && /^\d{2}:\d{2}$/.test(v) && Number(v.slice(0, 2)) <= 24 && Number(v.slice(3)) < 60;
const isSlot = (v: unknown) => typeof v === "string" && v.split("-").length === 2 && v.split("-").every(isHhmm);
const toUtc = (d: string) => Date.parse(`${d}T00:00:00Z`);
const fmtNum = (n: number) => n.toLocaleString("ko-KR");

/** "2026-11-01" → "11월 1일 (일)". 형식이 아니면 원문 그대로 */
export function formatDate(iso: string): string {
  if (!isYmd(iso)) return iso;
  const [, m, d] = iso.split("-").map(Number);
  return `${m}월 ${d}일 (${WEEKDAYS[new Date(toUtc(iso)).getUTCDay()]})`;
}
// 2026-02-30처럼 넘어가는 날짜도 거른다
const isYmd = (v: unknown) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(toUtc(v)) && new Date(toUtc(v)).toISOString().startsWith(v);

// 2^53 이상 정수는 JSON.parse에서 이미 반올림되어 폼·전송·다음 기간 입력 모두 원문과 달라진다. 감지해서 거부한다
const hasUnsafeInt = (v: unknown): boolean =>
  typeof v === "number"
    ? Number.isInteger(v) && !Number.isSafeInteger(v)
    : Array.isArray(v)
      ? v.some(hasUnsafeInt)
      : isObj(v) && Object.values(v).some(hasUnsafeInt);

/** 화면에 보일 직원 표시: "김매니저(E01)" */
const whoOf = (e: Obj, n: number) => {
  const id = str(e.id).trim();
  const name = str(e.name).trim();
  return name && id ? `${name}(${id})` : name || id || `${n + 1}번째 직원`;
};

/** 클라이언트 검증. 엔진이 최종 판정을 하므로 자주 틀리는 것만 잡는다. 빈 배열이면 통과 */
export function validateInput(input: Obj): string[] {
  const errs: string[] = [];
  if (hasUnsafeInt(input)) errs.push(`${fmtNum(Number.MAX_SAFE_INTEGER)}보다 큰 숫자는 정확히 다룰 수 없습니다. 숫자를 줄여 주세요.`);
  const p = obj(input.schedule_period);
  if (!isYmd(p.start_date) || !isYmd(p.end_date)) errs.push("근무 기간의 시작일과 종료일을 입력하세요.");
  else {
    const days = (toUtc(p.end_date as string) - toUtc(p.start_date as string)) / DAY_MS + 1;
    if (days < 1) errs.push("근무 기간의 시작일이 종료일보다 늦습니다.");
    else if (days > MAX_PERIOD_DAYS) errs.push(`근무 기간은 최대 ${MAX_PERIOD_DAYS}일까지 정할 수 있습니다.`);
  }

  const rules = obj(input.rules);
  for (const f of RULE_FIELDS) {
    if (f.key in rules && !(f.int ? isInt : isNum)(rules[f.key], f.min, f.max))
      errs.push(`${f.label}은(는) ${fmtNum(f.min)}~${fmtNum(f.max)}${f.unit} 사이${f.int ? "의 정수" : ""}로 입력하세요.`);
  }
  if ("time_limit_seconds" in rules && rules.time_limit_seconds === 0) errs.push("계산 시간 제한은 0초보다 커야 합니다.");
  const mcd = typeof rules.max_consecutive_days === "number" ? rules.max_consecutive_days : DEFAULT_MAX_CONSECUTIVE_DAYS;
  const ruleWeek = typeof rules.max_weekly_hours === "number" ? rules.max_weekly_hours : DEFAULT_MAX_WEEKLY_HOURS;
  const rp = rules.rotation_pattern;
  let cycle = 0;
  if (rp !== undefined) {
    const { work_days: w, off_days: o } = obj(rp);
    if (!isInt(w, 1, MAX_PERIOD_DAYS) || !isInt(o, 1, MAX_PERIOD_DAYS)) errs.push(`순환 근무의 근무일과 쉬는 날은 1~${MAX_PERIOD_DAYS}일로 입력하세요.`);
    else if (w > mcd) errs.push(`순환 근무의 근무일(${w}일)이 최대 연속 근무일(${mcd}일)보다 깁니다.`);
    else cycle = w + o;
  }

  const shifts = obj(input.shift_definitions);
  if (!isObj(input.shift_definitions)) errs.push("근무조가 하나도 없습니다.");
  for (const [name, sd] of Object.entries(shifts)) {
    const s = obj(sd);
    if (!name.trim()) errs.push("이름이 비어 있는 근무조가 있습니다.");
    if (!isHhmm(s.start) || !isHhmm(s.end)) errs.push(`근무조 ${name}: 시작·종료 시각을 09:00처럼 입력하세요.`);
    if ("hours" in s && !isInt(s.hours, 0, MAX_SHIFT_HOURS)) errs.push(`근무조 ${name}: 근무 시간은 0~${MAX_SHIFT_HOURS}시간 사이의 정수로 입력하세요.`);
  }
  for (const [name, r] of Object.entries(obj(input.shift_requirements))) {
    if (!(name in shifts)) errs.push(`필요 인원에 등록되지 않은 근무조 ${name}이(가) 있습니다.`);
    for (const [f, label] of [["min_count", "최소 인원"], ["min_senior", "최소 숙련 인원"]]) {
      const v = obj(r)[f];
      if (v !== undefined && !isInt(v, 0, MAX_HEADCOUNT)) errs.push(`근무조 ${name}: ${label}은 0~${fmtNum(MAX_HEADCOUNT)}명 사이로 입력하세요.`);
    }
  }

  if (!Array.isArray(input.employees)) errs.push("직원 목록이 없습니다.");
  const seen = new Set<string>();
  arr(input.employees).forEach((raw, n) => {
    const e = obj(raw);
    const id = str(e.id).trim();
    const who = whoOf(e, n);
    if (!id) errs.push(`${who}: 직원 번호를 입력하세요.`);
    else if (seen.has(id)) errs.push(`직원 번호 ${id}이(가) 두 번 이상 쓰였습니다.`);
    seen.add(id);
    if (typeof e.name !== "string" || !e.name.trim()) errs.push(`${who}: 이름을 입력하세요.`);
    if (!EMPLOYMENT_TYPES.some(([t]) => t === e.employment_type)) errs.push(`${who}: 고용 형태를 고르세요.`);
    if (!LEVELS.some(([l]) => l === e.level)) errs.push(`${who}: 숙련도를 고르세요.`);
    if ("max_weekly_hours" in e && !isInt(e.max_weekly_hours, 0, MAX_WEEK_HOURS))
      errs.push(`${who}: 주당 최대 근로시간은 0~${MAX_WEEK_HOURS}시간 사이의 정수로 입력하세요.`);
    if ("hourly_wage" in e && !isNum(e.hourly_wage, 0, MAX_WAGE)) errs.push(`${who}: 시급은 0~${fmtNum(MAX_WAGE)}원 사이로 입력하세요.`);
    if (!arr(e.approved_leaves).every(isYmd)) errs.push(`${who}: 휴가 날짜가 올바르지 않습니다.`);
    if (e.available_time_slots !== undefined && !arr(e.available_time_slots).every(isSlot))
      errs.push(`${who}: 근무 가능 시간은 11:00-15:00처럼 입력하세요.`);
    const pref = obj(e.preferences).preferred_shift;
    if (pref !== undefined && !(typeof pref === "string" && pref in shifts)) errs.push(`${who}: 선호 근무조 ${String(pref)}이(가) 등록되어 있지 않습니다.`);
    if (cycle && e.employment_type === "Full_Time" && e.rotation_offset != null && !isInt(e.rotation_offset, 0, cycle - 1))
      errs.push(`${who}: 순환 근무 시작 위치는 1~${cycle}번째 날 중에서 고르세요.`);
    if ("prior_consecutive_work_days" in e && !isInt(e.prior_consecutive_work_days, 0, mcd))
      errs.push(`${who}: 직전까지 연속 근무일은 0~${mcd}일 사이로 입력하세요.`);
    // 엔진 _cap: min(규칙 주 상한, 직원 주 상한)
    const cap = Math.min(ruleWeek, typeof e.max_weekly_hours === "number" ? e.max_weekly_hours : ruleWeek);
    if ("prior_week_hours" in e && !isInt(e.prior_week_hours, 0, cap)) errs.push(`${who}: 이번 주 이미 근무한 시간은 0~${cap}시간 사이로 입력하세요.`);
    if (e.prior_last_shift_end != null && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(str(e.prior_last_shift_end)))
      errs.push(`${who}: 마지막 근무 종료 시각이 올바르지 않습니다.`);
  });
  return errs;
}

/** 문자열 목록(휴가 날짜, 가용 시간대) 편집: 칩 + 입력 + 추가 */
const ListCell = memo<{
  items: unknown[];
  onChange: (items: unknown[]) => void;
  type: "date" | "text";
  label: string;
  placeholder?: string;
  format?: (v: string) => string;
}>(({ items, onChange, type, label, placeholder, format = (v) => v }) => {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v && !items.includes(v)) onChange([...items, v].sort());
    setDraft("");
  };
  return (
    <div className="flex min-w-44 flex-col gap-1">
      <ul className="flex flex-wrap gap-1">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-1 rounded-md border border-border bg-surface-2 py-0.5 pl-2 pr-1 text-xs tabular-nums">
            {format(String(it))}
            <button type="button" aria-label={`${label} ${format(String(it))} 빼기`} onClick={() => onChange(items.filter((_, j) => j !== i))} className="rounded px-1 text-muted hover:bg-danger-soft hover:text-danger">
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-1">
        <input
          type={type}
          value={draft}
          placeholder={placeholder}
          aria-label={`${label} 추가`}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          className={`${INPUT} h-8 w-32 text-xs`}
        />
        <button type="button" onClick={add} className={SMALL_BTN}>
          추가
        </button>
      </div>
    </div>
  );
});
ListCell.displayName = "ListCell";

/** 시프트 이름은 입력 중 키가 바뀌지 않도록 blur/Enter 시점에 반영한다. key={name}으로 외부 변경 시 초기화 */
const ShiftNameInput = memo<{ name: string; onRename: (to: string) => void }>(({ name, onRename }) => {
  const [draft, setDraft] = useState(name);
  const commit = () => {
    const to = draft.trim();
    if (to && to !== name) onRename(to);
    setDraft(name); // 이름이 바뀌면 key가 바뀌어 다시 마운트되고, 거부되면(중복 등) 원래 이름으로 돌아간다
  };
  return (
    <input
      value={draft}
      aria-label="근무조 이름"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
      className={`${INPUT} w-32`}
    />
  );
});
ShiftNameInput.displayName = "ShiftNameInput";

const NumInput = ({ value, onChange, label, min = 0, max, step = 1, placeholder, className = "w-20" }: {
  value: unknown;
  onChange: (raw: string) => void;
  label: string;
  min?: number;
  max?: number;
  step?: number | "any";
  placeholder?: string;
  className?: string;
}) => (
  <input
    type="number"
    value={numStr(value)}
    min={min}
    max={max}
    step={step}
    placeholder={placeholder}
    aria-label={label}
    onChange={(e) => onChange(e.target.value)}
    className={`${INPUT} ${className}`}
  />
);

interface IInputFormProps {
  value: Obj;
  onChange: (next: Obj) => void;
}

/** 엔진 입력 폼. value를 복사해 고치므로 폼이 모르는 키는 그대로 남는다 */
const InputForm = memo<IInputFormProps>(({ value, onChange }) => {
  const edit = useCallback(
    (fn: (draft: Obj) => void) => {
      const next = structuredClone(value);
      fn(next);
      onChange(next);
    },
    [value, onChange],
  );

  const period = obj(value.schedule_period);
  const rules = obj(value.rules);
  const rp = isObj(rules.rotation_pattern) ? rules.rotation_pattern : null;
  const shifts = obj(value.shift_definitions);
  const shiftNames = Object.keys(shifts);
  const workShifts = shiftNames.filter((s) => s !== OFF);
  const reqs = obj(value.shift_requirements);
  const undesirable = arr(rules.undesirable_shifts).filter((s): s is string => typeof s === "string");
  // 정의되지 않은 항목(엔진 기본값의 Night 등)도 보여 줘야 지울 수 있다
  const undesirableOptions = [...workShifts, ...undesirable.filter((s) => !workShifts.includes(s))];
  const employees = arr(value.employees).map(obj);
  const mcd = typeof rules.max_consecutive_days === "number" ? rules.max_consecutive_days : DEFAULT_MAX_CONSECUTIVE_DAYS;
  const ruleWeek = typeof rules.max_weekly_hours === "number" ? rules.max_weekly_hours : DEFAULT_MAX_WEEKLY_HOURS;

  const editEmployee = (i: number, fn: (e: Obj) => void) =>
    edit((d) => {
      const list = Array.isArray(d.employees) ? d.employees : (d.employees = []);
      if (!isObj(list[i])) list[i] = {};
      fn(list[i] as Obj);
    });

  const renameShift = (from: string, to: string) =>
    edit((d) => {
      if (to === OFF || to in obj(d.shift_definitions)) return; // 중복 이름은 무시(입력칸은 원래 이름으로 돌아감)
      const rename = (o: Obj) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k === from ? to : k, v]));
      d.shift_definitions = rename(obj(d.shift_definitions));
      if (isObj(d.shift_requirements)) d.shift_requirements = rename(d.shift_requirements);
      const r = child(d, "rules");
      if (Array.isArray(r.undesirable_shifts)) r.undesirable_shifts = r.undesirable_shifts.map((s) => (s === from ? to : s));
      for (const e of arr(d.employees)) {
        const pref = isObj(e) && isObj(e.preferences) ? e.preferences : null;
        if (pref?.preferred_shift === from) pref.preferred_shift = to;
      }
    });

  const removeShift = (name: string) =>
    edit((d) => {
      delete child(d, "shift_definitions")[name];
      if (isObj(d.shift_requirements)) delete d.shift_requirements[name];
      const r = obj(d.rules);
      if (Array.isArray(r.undesirable_shifts)) r.undesirable_shifts = r.undesirable_shifts.filter((s) => s !== name);
      // 직원 선호 시프트는 남겨 두고 검증 오류로 알린다
    });

  const addShift = () =>
    edit((d) => {
      const defs = child(d, "shift_definitions");
      let n = Object.keys(defs).length;
      while (`Shift${n}` in defs) n++;
      defs[`Shift${n}`] = { start: "09:00", end: "18:00", hours: 8 };
    });

  const addEmployee = () =>
    edit((d) => {
      const list = Array.isArray(d.employees) ? d.employees : (d.employees = []);
      const ids = new Set(list.map((e) => str(obj(e).id)));
      let n = list.length + 1;
      while (ids.has(`E${String(n).padStart(2, "0")}`)) n++;
      const id = `E${String(n).padStart(2, "0")}`;
      list.push({ id, name: "", employment_type: "Full_Time", level: "Junior", approved_leaves: [] });
    });

  const cycle = rp && isInt(rp.work_days, 1, MAX_PERIOD_DAYS) && isInt(rp.off_days, 1, MAX_PERIOD_DAYS) ? rp.work_days + rp.off_days : undefined;

  return (
    // fieldset 기본 min-width(min-content)가 표를 카드 밖으로 밀어내지 않게 min-w-0
    <div className="divide-y divide-border text-sm [&>fieldset]:min-w-0 [&>fieldset]:py-5 [&>fieldset:first-child]:pt-0">
      <fieldset className="space-y-2">
        <legend className={LEGEND}>근무 기간</legend>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            aria-label="시작일"
            value={str(period.start_date)}
            onChange={(e) => edit((d) => void (child(d, "schedule_period").start_date = e.target.value))}
            className={INPUT}
          />
          <span aria-hidden>~</span>
          <input
            type="date"
            aria-label="종료일"
            value={str(period.end_date)}
            min={str(period.start_date) || undefined}
            onChange={(e) => edit((d) => void (child(d, "schedule_period").end_date = e.target.value))}
            className={INPUT}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className={LEGEND}>
          근무 규칙 <span className="font-normal text-muted">· 비워 두면 기본값을 씁니다</span>
        </legend>
        <div className="flex flex-wrap gap-4">
          {RULE_FIELDS.map((f) => (
            <label key={f.key} className="flex flex-col gap-1 text-xs font-medium text-muted">
              {f.label}({f.unit})
              <NumInput
                label={`${f.label}(${f.unit})`}
                value={rules[f.key]}
                min={f.min}
                max={f.max}
                step={f.int ? 1 : "any"}
                placeholder={f.placeholder}
                className="w-32"
                onChange={(raw) => edit((d) => setNum(child(d, "rules"), f.key, raw))}
              />
            </label>
          ))}
        </div>
        <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <legend className="mb-1 w-full text-xs font-medium text-muted">기피 근무조 · 직원들에게 공평하게 나눠 배정합니다</legend>
          {undesirableOptions.map((s) => (
            <label key={s} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={undesirable.includes(s)}
                onChange={(e) =>
                  edit((d) => {
                    const r = child(d, "rules");
                    const cur = arr(r.undesirable_shifts);
                    r.undesirable_shifts = e.target.checked ? [...cur, s] : cur.filter((x) => x !== s);
                  })
                }
              />
              {s}
              {!workShifts.includes(s) && <span className="text-xs text-muted">(등록되지 않은 근무조)</span>}
            </label>
          ))}
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={!!rp}
              onChange={(e) =>
                edit((d) => {
                  const r = child(d, "rules");
                  if (e.target.checked) r.rotation_pattern = { work_days: Math.min(5, mcd), off_days: 2 };
                  else delete r.rotation_pattern;
                })
              }
            />
            순환 근무 사용 <span className="text-xs text-muted">(정규직만)</span>
          </label>
          {rp && (
            <>
              <label className="flex items-center gap-1.5 text-xs">
                근무
                <NumInput
                  label="순환 근무 근무일(일)"
                  value={rp.work_days}
                  min={1}
                  max={mcd}
                  className="w-16"
                  onChange={(raw) => edit((d) => setNum(child(child(d, "rules"), "rotation_pattern"), "work_days", raw))}
                />
                일 ·
              </label>
              <label className="flex items-center gap-1.5 text-xs">
                쉬는 날
                <NumInput
                  label="순환 근무 쉬는 날(일)"
                  value={rp.off_days}
                  min={1}
                  max={MAX_PERIOD_DAYS}
                  className="w-16"
                  onChange={(raw) => edit((d) => setNum(child(child(d, "rules"), "rotation_pattern"), "off_days", raw))}
                />
                일 반복
              </label>
            </>
          )}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className={LEGEND}>근무조와 필요 인원</legend>
        <div className="relative overflow-x-auto rounded-[var(--radius)] border border-border">
          <table className="data-table border-collapse">
            <caption className="sr-only">근무조별 시간과 필요 인원</caption>
            <thead>
              <tr>
                <th scope="col" className={`${TH} sticky left-0 z-10`}>근무조 이름</th>
                <th scope="col" className={TH}>시작</th>
                <th scope="col" className={TH}>종료</th>
                <th scope="col" className={TH}>근무 시간(시간)</th>
                <th scope="col" className={TH}>최소 인원(명)</th>
                <th scope="col" className={TH}>최소 숙련 인원(명)</th>
                <th scope="col" className={TH}><span className="sr-only">삭제</span></th>
              </tr>
            </thead>
            <tbody>
              {shiftNames.map((name) => {
                const sd = obj(shifts[name]);
                const r = obj(reqs[name]);
                const setDef = (key: string, v: string) => edit((d) => void (child(child(d, "shift_definitions"), name)[key] = v));
                const setReq = (key: string, raw: string) =>
                  edit((d) => {
                    const all = child(d, "shift_requirements");
                    setNum(child(all, name), key, raw);
                    if (Object.keys(obj(all[name])).length === 0) delete all[name];
                  });
                return (
                  <tr key={name}>
                    <td className={`${TD} ${STICKY}`}>
                      {name === OFF ? (
                        <span className="px-2 font-medium">쉬는 날</span>
                      ) : (
                        <ShiftNameInput key={name} name={name} onRename={(to) => renameShift(name, to)} />
                      )}
                    </td>
                    {name === OFF ? (
                      <td colSpan={5} className={`${TD} px-2 text-xs text-muted`}>
                        근무가 없는 날입니다. 따로 설정하지 않아도 됩니다.
                      </td>
                    ) : (
                      <>
                        <td className={TD}>
                          <input value={str(sd.start)} placeholder="09:00" aria-label={`${name} 시작 시각`} onChange={(e) => setDef("start", e.target.value)} className={`${INPUT} w-20 tabular-nums`} />
                        </td>
                        <td className={TD}>
                          <input value={str(sd.end)} placeholder="18:00" aria-label={`${name} 종료 시각`} onChange={(e) => setDef("end", e.target.value)} className={`${INPUT} w-20 tabular-nums`} />
                        </td>
                        <td className={TD}>
                          <NumInput
                            label={`${name} 근무 시간(시간)`}
                            value={sd.hours}
                            max={MAX_SHIFT_HOURS}
                            onChange={(raw) => edit((d) => setNum(child(child(d, "shift_definitions"), name), "hours", raw))}
                          />
                        </td>
                        <td className={TD}>
                          <NumInput label={`${name} 최소 인원(명)`} value={r.min_count} max={MAX_HEADCOUNT} onChange={(raw) => setReq("min_count", raw)} />
                        </td>
                        <td className={TD}>
                          <NumInput label={`${name} 최소 숙련 인원(명)`} value={r.min_senior} max={MAX_HEADCOUNT} onChange={(raw) => setReq("min_senior", raw)} />
                        </td>
                      </>
                    )}
                    <td className={TD}>
                      {name !== OFF && (
                        <button type="button" onClick={() => removeShift(name)} aria-label={`근무조 ${name} 삭제`} className={DEL_BTN}>
                          삭제
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={addShift} className={SMALL_BTN}>
          + 근무조 추가
        </button>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className={LEGEND}>직원 ({employees.length}명)</legend>
        <div className="relative overflow-x-auto rounded-[var(--radius)] border border-border">
          <table className="data-table border-collapse">
            <caption className="sr-only">직원 목록</caption>
            <thead>
              <tr>
                <th scope="col" className={`${TH} sticky left-0 z-10`}>직원 번호</th>
                <th scope="col" className={TH}>이름</th>
                <th scope="col" className={TH}>고용 형태</th>
                <th scope="col" className={TH}>숙련도</th>
                <th scope="col" className={TH}>주당 최대 근로(시간)</th>
                <th scope="col" className={TH}>시급(원)</th>
                <th scope="col" className={TH}>선호 근무조</th>
                <th scope="col" className={TH}>휴가</th>
                <th scope="col" className={TH}>근무 가능 시간(파트타임)</th>
                <th scope="col" className={TH}><span className="sr-only">삭제</span></th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e, i) => {
                // 접근성 이름은 입력 중 바뀌지 않도록 직원 번호 기준
                const who = `직원 ${str(e.id) || i + 1}`;
                const pref = obj(e.preferences).preferred_shift;
                return (
                  <tr key={i}>
                    <td className={`${TD} ${STICKY}`}>
                      <input value={str(e.id)} aria-label="직원 번호" onChange={(ev) => editEmployee(i, (x) => void (x.id = ev.target.value))} className={`${INPUT} w-16`} />
                    </td>
                    <td className={TD}>
                      <input value={str(e.name)} aria-label={`${who} 이름`} onChange={(ev) => editEmployee(i, (x) => void (x.name = ev.target.value))} className={`${INPUT} w-28`} />
                    </td>
                    <td className={TD}>
                      <select value={str(e.employment_type)} aria-label={`${who} 고용 형태`} onChange={(ev) => editEmployee(i, (x) => void (x.employment_type = ev.target.value))} className={INPUT}>
                        {!EMPLOYMENT_TYPES.some(([t]) => t === e.employment_type) && <option value="">고르세요</option>}
                        {EMPLOYMENT_TYPES.map(([t, label]) => (
                          <option key={t} value={t}>{label}</option>
                        ))}
                      </select>
                    </td>
                    <td className={TD}>
                      <select value={str(e.level)} aria-label={`${who} 숙련도`} onChange={(ev) => editEmployee(i, (x) => void (x.level = ev.target.value))} className={INPUT}>
                        {!LEVELS.some(([l]) => l === e.level) && <option value="">고르세요</option>}
                        {LEVELS.map(([l, label]) => (
                          <option key={l} value={l}>{label}</option>
                        ))}
                      </select>
                    </td>
                    <td className={TD}>
                      <NumInput label={`${who} 주당 최대 근로(시간)`} value={e.max_weekly_hours} max={MAX_WEEK_HOURS} placeholder="규칙대로" className="w-24" onChange={(raw) => editEmployee(i, (x) => setNum(x, "max_weekly_hours", raw))} />
                    </td>
                    <td className={TD}>
                      <NumInput label={`${who} 시급(원)`} value={e.hourly_wage} max={MAX_WAGE} step="any" placeholder="기본 시급" className="w-28" onChange={(raw) => editEmployee(i, (x) => setNum(x, "hourly_wage", raw))} />
                    </td>
                    <td className={TD}>
                      <select
                        value={typeof pref === "string" ? pref : ""}
                        aria-label={`${who} 선호 근무조`}
                        onChange={(ev) =>
                          editEmployee(i, (x) => {
                            const p = child(x, "preferences");
                            if (ev.target.value) p.preferred_shift = ev.target.value;
                            else delete p.preferred_shift;
                            if (Object.keys(p).length === 0) delete x.preferences;
                          })
                        }
                        className={INPUT}
                      >
                        <option value="">없음</option>
                        {typeof pref === "string" && !workShifts.includes(pref) && <option value={pref}>{pref} (등록되지 않은 근무조)</option>}
                        {workShifts.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td className={TD}>
                      <ListCell type="date" label={`${who} 휴가`} format={formatDate} items={arr(e.approved_leaves)} onChange={(items) => editEmployee(i, (x) => void (x.approved_leaves = items))} />
                    </td>
                    <td className={TD}>
                      {e.employment_type === "Part_Time" ? (
                        <ListCell
                          type="text"
                          label={`${who} 근무 가능 시간`}
                          placeholder="11:00-15:00"
                          format={(v) => v.replace("-", " ~ ")}
                          items={arr(e.available_time_slots)}
                          onChange={(items) =>
                            editEmployee(i, (x) => {
                              if (items.length) x.available_time_slots = items;
                              else delete x.available_time_slots;
                            })
                          }
                        />
                      ) : (
                        <span className="px-2 text-muted">해당 없음</span>
                      )}
                    </td>
                    <td className={TD}>
                      <button type="button" onClick={() => edit((d) => void arr(d.employees).splice(i, 1))} aria-label={`${who} 삭제`} className={DEL_BTN}>
                        삭제
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={addEmployee} className={SMALL_BTN}>
          + 직원 추가
        </button>

        <details className="rounded-[var(--radius)] border border-border bg-surface-2 px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">고급: 지난 기간에서 이어지는 정보</summary>
          <p className="mt-2 text-xs text-muted">
            지난달 근무가 이번 달 규칙 계산에 이어집니다. [다음 기간 준비하기]를 쓰면 자동으로 채워지니, 처음 쓰실 때만 직접 입력하세요.
          </p>
          <div className="relative mt-3 overflow-x-auto rounded-[var(--radius)] border border-border bg-surface">
            <table className="data-table border-collapse">
              <caption className="sr-only">지난 기간에서 이어지는 정보</caption>
              <thead>
                <tr>
                  <th scope="col" className={`${TH} sticky left-0 z-10 align-top`}>직원</th>
                  {CARRY_FIELDS.map(([label, help]) => (
                    <th key={label} scope="col" className={`${TH} align-top`}>
                      {label}
                      <span className="mt-0.5 block max-w-48 whitespace-normal font-normal">{help}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employees.map((e, i) => {
                  const who = `직원 ${str(e.id) || i + 1}`;
                  return (
                    <tr key={i}>
                      <th scope="row" className={`${TD} ${STICKY} whitespace-nowrap px-3 text-left font-medium`}>{whoOf(e, i)}</th>
                      <td className={TD}>
                        <NumInput label={`${who} 직전까지 연속 근무일(일)`} value={e.prior_consecutive_work_days} max={mcd} placeholder="0" onChange={(raw) => editEmployee(i, (x) => setNum(x, "prior_consecutive_work_days", raw))} />
                      </td>
                      <td className={TD}>
                        <input
                          type="datetime-local"
                          value={str(e.prior_last_shift_end)}
                          aria-label={`${who} 마지막 근무 종료 시각`}
                          onChange={(ev) =>
                            editEmployee(i, (x) => {
                              if (ev.target.value) x.prior_last_shift_end = ev.target.value.slice(0, 16);
                              else delete x.prior_last_shift_end;
                            })
                          }
                          className={INPUT}
                        />
                      </td>
                      <td className={TD}>
                        <NumInput label={`${who} 이번 주 이미 근무한 시간(시간)`} value={e.prior_week_hours} max={Math.min(ruleWeek, typeof e.max_weekly_hours === "number" ? e.max_weekly_hours : ruleWeek)} placeholder="0" onChange={(raw) => editEmployee(i, (x) => setNum(x, "prior_week_hours", raw))} />
                      </td>
                      <td className={TD}>
                        {/* 엔진 값은 0부터, 화면은 1번째 날부터 센다 */}
                        <NumInput
                          label={`${who} 순환 근무 시작 위치(번째 날)`}
                          value={typeof e.rotation_offset === "number" ? e.rotation_offset + 1 : undefined}
                          min={1}
                          max={cycle}
                          placeholder="자동"
                          className="w-24"
                          onChange={(raw) => editEmployee(i, (x) => setNum(x, "rotation_offset", raw === "" ? "" : String(Number(raw) - 1)))}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      </fieldset>
    </div>
  );
});
InputForm.displayName = "InputForm";

export default InputForm;
