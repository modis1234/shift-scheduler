"use client";

import React, { memo, useCallback, useState } from "react";

// JSON 탭에서 어떤 값이든 들어올 수 있으므로 폼은 느슨한 객체로 다루고, 읽을 때마다 타입을 확인한다
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

const EMPLOYMENT_TYPES = [
  ["Full_Time", "정규"],
  ["Part_Time", "파트"],
] as const;
const LEVELS = ["Senior", "Junior"] as const;

const RULE_FIELDS = [
  { key: "max_weekly_hours", label: "주 최대 근로(h)", max: MAX_WEEK_HOURS, min: 0, int: true, placeholder: "52" },
  { key: "min_rest_hours", label: "최소 휴식(h)", max: MAX_WEEK_HOURS, min: 0, int: false, placeholder: "11" },
  { key: "max_consecutive_days", label: "최대 연속 근무일", max: MAX_PERIOD_DAYS, min: 1, int: true, placeholder: "5" },
  { key: "default_hourly_wage", label: "기본 시급(원)", max: MAX_WAGE, min: 0, int: false, placeholder: "10320" },
  { key: "time_limit_seconds", label: "계산 제한(초)", max: MAX_TIME_LIMIT, min: 0, int: false, placeholder: "30" },
] as const;

const INPUT = "rounded border border-foreground/20 bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500";
const SMALL_BTN = "rounded border border-foreground/20 px-2 py-0.5 text-xs hover:bg-foreground/5";
const DEL_BTN = "rounded px-2 py-0.5 text-xs text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950";
const TH = "border-b border-foreground/15 px-2 py-1 text-left font-medium whitespace-nowrap";
const TD = "border-b border-foreground/10 px-1 py-1 align-top";

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

/** 클라이언트 검증. 엔진이 최종 판정을 하므로 자주 틀리는 것만 잡는다. 빈 배열이면 통과 */
export function validateInput(input: Obj): string[] {
  const errs: string[] = [];
  if (hasUnsafeInt(input)) errs.push(`±${Number.MAX_SAFE_INTEGER}를 넘는 정수는 정확히 다룰 수 없습니다. 값을 줄이세요.`);
  const p = obj(input.schedule_period);
  if (!isYmd(p.start_date) || !isYmd(p.end_date)) errs.push("기간의 시작일과 종료일을 입력하세요.");
  else {
    const days = (toUtc(p.end_date as string) - toUtc(p.start_date as string)) / DAY_MS + 1;
    if (days < 1) errs.push("기간 시작일이 종료일보다 늦습니다.");
    else if (days > MAX_PERIOD_DAYS) errs.push(`기간은 최대 ${MAX_PERIOD_DAYS}일입니다.`);
  }

  const rules = obj(input.rules);
  for (const f of RULE_FIELDS) {
    if (f.key in rules && !(f.int ? isInt : isNum)(rules[f.key], f.min, f.max))
      errs.push(`규칙 ${f.label}: ${f.min}~${f.max} ${f.int ? "정수" : "숫자"}여야 합니다.`);
  }
  if ("time_limit_seconds" in rules && rules.time_limit_seconds === 0) errs.push("규칙 계산 제한(초)은 0보다 커야 합니다.");
  const mcd = typeof rules.max_consecutive_days === "number" ? rules.max_consecutive_days : DEFAULT_MAX_CONSECUTIVE_DAYS;
  const ruleWeek = typeof rules.max_weekly_hours === "number" ? rules.max_weekly_hours : DEFAULT_MAX_WEEKLY_HOURS;
  const rp = rules.rotation_pattern;
  let cycle = 0;
  if (rp !== undefined) {
    const { work_days: w, off_days: o } = obj(rp);
    if (!isInt(w, 1, MAX_PERIOD_DAYS) || !isInt(o, 1, MAX_PERIOD_DAYS)) errs.push(`순환 패턴 근무일·휴무일은 1~${MAX_PERIOD_DAYS} 정수여야 합니다.`);
    else if (w > mcd) errs.push(`순환 패턴 근무일(${w})이 최대 연속 근무일(${mcd})보다 깁니다.`);
    else cycle = w + o;
  }

  const shifts = obj(input.shift_definitions);
  if (!isObj(input.shift_definitions)) errs.push("시프트 정의가 없습니다.");
  for (const [name, sd] of Object.entries(shifts)) {
    const s = obj(sd);
    if (!name.trim()) errs.push("이름이 빈 시프트가 있습니다.");
    if (!isHhmm(s.start) || !isHhmm(s.end)) errs.push(`시프트 ${name}: 시작·종료는 HH:MM 형식이어야 합니다.`);
    if ("hours" in s && !isInt(s.hours, 0, MAX_SHIFT_HOURS)) errs.push(`시프트 ${name}: 시간은 0~${MAX_SHIFT_HOURS} 정수여야 합니다.`);
  }
  for (const [name, r] of Object.entries(obj(input.shift_requirements))) {
    if (!(name in shifts)) errs.push(`필요 인원의 ${name}은(는) 정의되지 않은 시프트입니다.`);
    for (const f of ["min_count", "min_senior"]) {
      const v = obj(r)[f];
      if (v !== undefined && !isInt(v, 0, MAX_HEADCOUNT)) errs.push(`시프트 ${name} ${f}: 0~${MAX_HEADCOUNT} 정수여야 합니다.`);
    }
  }

  if (!Array.isArray(input.employees)) errs.push("직원 목록이 없습니다.");
  const seen = new Set<string>();
  arr(input.employees).forEach((raw, n) => {
    const e = obj(raw);
    const id = str(e.id).trim();
    const who = id || `${n + 1}번째 직원`;
    if (!id) errs.push(`${who}: ID를 입력하세요.`);
    else if (seen.has(id)) errs.push(`직원 ID ${id}가 중복되었습니다.`);
    seen.add(id);
    if (typeof e.name !== "string" || !e.name.trim()) errs.push(`${who}: 이름을 입력하세요.`);
    if (!EMPLOYMENT_TYPES.some(([t]) => t === e.employment_type)) errs.push(`${who}: 고용 형태를 선택하세요.`);
    if (!LEVELS.some((l) => l === e.level)) errs.push(`${who}: 숙련도를 선택하세요.`);
    if ("max_weekly_hours" in e && !isInt(e.max_weekly_hours, 0, MAX_WEEK_HOURS))
      errs.push(`${who}: 주 최대 근로는 0~${MAX_WEEK_HOURS} 정수여야 합니다.`);
    if ("hourly_wage" in e && !isNum(e.hourly_wage, 0, MAX_WAGE)) errs.push(`${who}: 시급은 0~${MAX_WAGE} 숫자여야 합니다.`);
    if (!arr(e.approved_leaves).every(isYmd)) errs.push(`${who}: 휴가 날짜 형식이 잘못되었습니다.`);
    if (e.available_time_slots !== undefined && !arr(e.available_time_slots).every(isSlot))
      errs.push(`${who}: 가용 시간대는 HH:MM-HH:MM 형식이어야 합니다.`);
    const pref = obj(e.preferences).preferred_shift;
    if (pref !== undefined && !(typeof pref === "string" && pref in shifts)) errs.push(`${who}: 선호 시프트 ${String(pref)}이(가) 정의되지 않았습니다.`);
    if (cycle && e.employment_type === "Full_Time" && e.rotation_offset != null && !isInt(e.rotation_offset, 0, cycle - 1))
      errs.push(`${who}: rotation_offset은 0~${cycle - 1} 정수여야 합니다.`);
    if ("prior_consecutive_work_days" in e && !isInt(e.prior_consecutive_work_days, 0, mcd))
      errs.push(`${who}: prior_consecutive_work_days는 0~${mcd} 정수여야 합니다.`);
    // 엔진 _cap: min(규칙 주 상한, 직원 주 상한)
    const cap = Math.min(ruleWeek, typeof e.max_weekly_hours === "number" ? e.max_weekly_hours : ruleWeek);
    if ("prior_week_hours" in e && !isInt(e.prior_week_hours, 0, cap)) errs.push(`${who}: prior_week_hours는 0~${cap} 정수여야 합니다.`);
    if (e.prior_last_shift_end != null && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(str(e.prior_last_shift_end)))
      errs.push(`${who}: prior_last_shift_end는 YYYY-MM-DDTHH:MM 형식이어야 합니다.`);
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
}>(({ items, onChange, type, label, placeholder }) => {
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
          <li key={i} className="flex items-center gap-1 rounded bg-foreground/10 px-1.5 py-0.5 text-xs">
            {String(it)}
            <button type="button" aria-label={`${label} ${String(it)} 삭제`} onClick={() => onChange(items.filter((_, j) => j !== i))} className="opacity-60 hover:opacity-100">
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
          aria-label={`${label} 입력`}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          className={`${INPUT} w-32 py-0.5 text-xs`}
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
      aria-label="시프트 이름"
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

  return (
    <div className="space-y-6 text-sm">
      <fieldset className="space-y-2">
        <legend className="mb-2 font-semibold">기간</legend>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            aria-label="시작일"
            value={str(period.start_date)}
            onChange={(e) => edit((d) => void (child(d, "schedule_period").start_date = e.target.value))}
            className={INPUT}
          />
          <span>~</span>
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

      <fieldset className="space-y-3">
        <legend className="mb-2 font-semibold">규칙 (비워 두면 엔진 기본값)</legend>
        <div className="flex flex-wrap gap-3">
          {RULE_FIELDS.map((f) => (
            <label key={f.key} className="flex flex-col gap-1 text-xs">
              {f.label}
              <NumInput
                label={f.label}
                value={rules[f.key]}
                min={f.min}
                max={f.max}
                step={f.int ? 1 : "any"}
                placeholder={f.placeholder}
                className="w-28"
                onChange={(raw) => edit((d) => setNum(child(d, "rules"), f.key, raw))}
              />
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs">기피 시프트</span>
          {undesirableOptions.map((s) => (
            <label key={s} className="flex items-center gap-1">
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
              {!workShifts.includes(s) && <span className="text-xs opacity-60">(미정의)</span>}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1">
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
            순환 패턴 (풀타임)
          </label>
          {rp && (
            <>
              <label className="flex items-center gap-1 text-xs">
                근무
                <NumInput
                  label="순환 근무일"
                  value={rp.work_days}
                  min={1}
                  max={mcd}
                  onChange={(raw) => edit((d) => setNum(child(child(d, "rules"), "rotation_pattern"), "work_days", raw))}
                />
                일
              </label>
              <label className="flex items-center gap-1 text-xs">
                휴무
                <NumInput
                  label="순환 휴무일"
                  value={rp.off_days}
                  min={1}
                  max={MAX_PERIOD_DAYS}
                  onChange={(raw) => edit((d) => setNum(child(child(d, "rules"), "rotation_pattern"), "off_days", raw))}
                />
                일
              </label>
            </>
          )}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-2 font-semibold">시프트 정의 · 필요 인원</legend>
        <div className="overflow-x-auto rounded border border-foreground/15">
          <table className="border-collapse">
            <thead>
              <tr>
                <th scope="col" className={TH}>이름</th>
                <th scope="col" className={TH}>시작</th>
                <th scope="col" className={TH}>종료</th>
                <th scope="col" className={TH}>시간(h)</th>
                <th scope="col" className={TH}>최소 인원</th>
                <th scope="col" className={TH}>최소 시니어</th>
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
                    <td className={TD}>
                      {name === OFF ? (
                        <span className="px-2" title="엔진 예약 시프트">{OFF}</span>
                      ) : (
                        <ShiftNameInput key={name} name={name} onRename={(to) => renameShift(name, to)} />
                      )}
                    </td>
                    {name === OFF ? (
                      <td colSpan={3} className={`${TD} px-2 text-xs opacity-60`}>
                        {str(sd.start)}–{str(sd.end)}, {numStr(sd.hours) || 0}h (엔진 예약값, 수정 불가)
                      </td>
                    ) : (
                      <>
                        <td className={TD}>
                          <input value={str(sd.start)} placeholder="HH:MM" aria-label={`${name} 시작`} onChange={(e) => setDef("start", e.target.value)} className={`${INPUT} w-20`} />
                        </td>
                        <td className={TD}>
                          <input value={str(sd.end)} placeholder="HH:MM" aria-label={`${name} 종료`} onChange={(e) => setDef("end", e.target.value)} className={`${INPUT} w-20`} />
                        </td>
                        <td className={TD}>
                          <NumInput
                            label={`${name} 시간`}
                            value={sd.hours}
                            max={MAX_SHIFT_HOURS}
                            onChange={(raw) => edit((d) => setNum(child(child(d, "shift_definitions"), name), "hours", raw))}
                          />
                        </td>
                      </>
                    )}
                    <td className={TD}>
                      {name !== OFF && <NumInput label={`${name} 최소 인원`} value={r.min_count} max={MAX_HEADCOUNT} onChange={(raw) => setReq("min_count", raw)} />}
                    </td>
                    <td className={TD}>
                      {name !== OFF && <NumInput label={`${name} 최소 시니어`} value={r.min_senior} max={MAX_HEADCOUNT} onChange={(raw) => setReq("min_senior", raw)} />}
                    </td>
                    <td className={TD}>
                      {name !== OFF && (
                        <button type="button" onClick={() => removeShift(name)} className={DEL_BTN}>
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
          + 시프트 추가
        </button>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-2 font-semibold">직원 ({employees.length}명)</legend>
        <div className="overflow-x-auto rounded border border-foreground/15">
          <table className="border-collapse">
            <thead>
              <tr>
                <th scope="col" className={TH}>ID</th>
                <th scope="col" className={TH}>이름</th>
                <th scope="col" className={TH}>고용</th>
                <th scope="col" className={TH}>숙련도</th>
                <th scope="col" className={TH}>주 최대(h)</th>
                <th scope="col" className={TH}>시급(원)</th>
                <th scope="col" className={TH}>선호 시프트</th>
                <th scope="col" className={TH}>휴가</th>
                <th scope="col" className={TH}>가용 시간대(파트)</th>
                <th scope="col" className={TH}><span className="sr-only">삭제</span></th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e, i) => {
                const who = str(e.id) || `${i + 1}번째 직원`;
                const pref = obj(e.preferences).preferred_shift;
                return (
                  <tr key={i}>
                    <td className={TD}>
                      <input value={str(e.id)} aria-label="직원 ID" onChange={(ev) => editEmployee(i, (x) => void (x.id = ev.target.value))} className={`${INPUT} w-16`} />
                    </td>
                    <td className={TD}>
                      <input value={str(e.name)} aria-label={`${who} 이름`} onChange={(ev) => editEmployee(i, (x) => void (x.name = ev.target.value))} className={`${INPUT} w-24`} />
                    </td>
                    <td className={TD}>
                      <select value={str(e.employment_type)} aria-label={`${who} 고용 형태`} onChange={(ev) => editEmployee(i, (x) => void (x.employment_type = ev.target.value))} className={INPUT}>
                        {!EMPLOYMENT_TYPES.some(([t]) => t === e.employment_type) && <option value="">선택</option>}
                        {EMPLOYMENT_TYPES.map(([t, label]) => (
                          <option key={t} value={t}>{label}</option>
                        ))}
                      </select>
                    </td>
                    <td className={TD}>
                      <select value={str(e.level)} aria-label={`${who} 숙련도`} onChange={(ev) => editEmployee(i, (x) => void (x.level = ev.target.value))} className={INPUT}>
                        {!LEVELS.some((l) => l === e.level) && <option value="">선택</option>}
                        {LEVELS.map((l) => (
                          <option key={l} value={l}>{l}</option>
                        ))}
                      </select>
                    </td>
                    <td className={TD}>
                      <NumInput label={`${who} 주 최대 근로`} value={e.max_weekly_hours} max={MAX_WEEK_HOURS} placeholder="규칙" onChange={(raw) => editEmployee(i, (x) => setNum(x, "max_weekly_hours", raw))} />
                    </td>
                    <td className={TD}>
                      <NumInput label={`${who} 시급`} value={e.hourly_wage} max={MAX_WAGE} step="any" placeholder="기본" className="w-24" onChange={(raw) => editEmployee(i, (x) => setNum(x, "hourly_wage", raw))} />
                    </td>
                    <td className={TD}>
                      <select
                        value={typeof pref === "string" ? pref : ""}
                        aria-label={`${who} 선호 시프트`}
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
                        {typeof pref === "string" && !workShifts.includes(pref) && <option value={pref}>{pref} (미정의)</option>}
                        {workShifts.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td className={TD}>
                      <ListCell type="date" label={`${who} 휴가`} items={arr(e.approved_leaves)} onChange={(items) => editEmployee(i, (x) => void (x.approved_leaves = items))} />
                    </td>
                    <td className={TD}>
                      {e.employment_type === "Part_Time" ? (
                        <ListCell
                          type="text"
                          label={`${who} 가용 시간대`}
                          placeholder="11:00-15:00"
                          items={arr(e.available_time_slots)}
                          onChange={(items) =>
                            editEmployee(i, (x) => {
                              if (items.length) x.available_time_slots = items;
                              else delete x.available_time_slots;
                            })
                          }
                        />
                      ) : (
                        <span className="px-2 opacity-50">—</span>
                      )}
                    </td>
                    <td className={TD}>
                      <button type="button" onClick={() => edit((d) => void arr(d.employees).splice(i, 1))} className={DEL_BTN}>
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

        <details className="rounded border border-foreground/15 px-3 py-2">
          <summary className="cursor-pointer text-xs font-semibold">고급: 이전 기간에서 이어받는 값 (보통 [다음 기간 입력 만들기]가 채움)</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="border-collapse">
              <thead>
                <tr>
                  <th scope="col" className={TH}>ID</th>
                  <th scope="col" className={TH}>rotation_offset</th>
                  <th scope="col" className={TH}>prior_consecutive_work_days</th>
                  <th scope="col" className={TH}>prior_week_hours</th>
                  <th scope="col" className={TH}>prior_last_shift_end</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e, i) => {
                  const who = str(e.id) || `${i + 1}번째 직원`;
                  return (
                    <tr key={i}>
                      <th scope="row" className={`${TD} px-2 text-left font-medium`}>{who}</th>
                      <td className={TD}>
                        <NumInput
                          label={`${who} rotation_offset`}
                          value={e.rotation_offset}
                          max={rp && isInt(rp.work_days, 1, MAX_PERIOD_DAYS) && isInt(rp.off_days, 1, MAX_PERIOD_DAYS) ? (rp.work_days as number) + (rp.off_days as number) - 1 : undefined}
                          placeholder="자동"
                          onChange={(raw) => editEmployee(i, (x) => setNum(x, "rotation_offset", raw))}
                        />
                      </td>
                      <td className={TD}>
                        <NumInput label={`${who} prior_consecutive_work_days`} value={e.prior_consecutive_work_days} max={mcd} placeholder="0" onChange={(raw) => editEmployee(i, (x) => setNum(x, "prior_consecutive_work_days", raw))} />
                      </td>
                      <td className={TD}>
                        <NumInput label={`${who} prior_week_hours`} value={e.prior_week_hours} max={Math.min(ruleWeek, typeof e.max_weekly_hours === "number" ? e.max_weekly_hours : ruleWeek)} placeholder="0" onChange={(raw) => editEmployee(i, (x) => setNum(x, "prior_week_hours", raw))} />
                      </td>
                      <td className={TD}>
                        <input
                          type="datetime-local"
                          value={str(e.prior_last_shift_end)}
                          aria-label={`${who} prior_last_shift_end`}
                          onChange={(ev) =>
                            editEmployee(i, (x) => {
                              if (ev.target.value) x.prior_last_shift_end = ev.target.value.slice(0, 16);
                              else delete x.prior_last_shift_end;
                            })
                          }
                          className={INPUT}
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
