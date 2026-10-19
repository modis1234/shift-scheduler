"use client";

import Image from "next/image";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import InputForm, { formatDate, validateInput } from "./InputForm";
import ManagerCalendar from "./ManagerCalendar";
import ScheduleCalendar from "./ScheduleCalendar";
import SavedSchedules, { SAVED_STATUS_VIEW, type SavedStatus } from "./SavedSchedules";

interface IEmployee {
  id: string;
  name?: string;
  employment_type?: string;
  approved_leaves?: string[];
  [key: string]: unknown;
}

export interface IEngineInput {
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

export interface IEngineResult {
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
// 근무표 열 폭(px). 표 폭을 명시해야 table-fixed가 적용된다 (w-32, w-10과 같은 값)
const GRID_NAME_PX = 128;
const GRID_DAY_PX = 40;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
// globals.css의 시프트 팔레트 클래스
const SHIFT_COLORS = ["shift-0", "shift-1", "shift-2", "shift-3", "shift-4", "shift-5"];
const EMPLOYMENT_LABEL: Record<string, string> = { Full_Time: "정규직", Part_Time: "파트타임" };
const MAIN_TABS = [
  { id: "create", label: "근무표 만들기" },
  { id: "manage", label: "근무표 관리" },
  { id: "personal", label: "내 일정" },
] as const;
type MainTab = (typeof MAIN_TABS)[number]["id"];

// 날짜는 모두 UTC 자정 기준으로 계산해 시간대에 따라 하루가 밀리지 않게 한다
const toUtc = (d: string) => Date.parse(`${d}T00:00:00Z`);
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** ms가 속한 달의 말일(UTC 자정) */
const monthEnd = (ms: number) => {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0);
};

const periodDates = (start: string, end: string): string[] => {
  const out: string[] = [];
  for (let t = toUtc(start); t <= toUtc(end); t += DAY_MS) out.push(fromUtc(t));
  return out;
};

/** 결과의 기간 경계 carry 값으로 다음 기간 입력을 만든다. 결과에 없는 키는 건드리지 않는다. */
// 로그인 시간이 지나 /login으로 갈 때 입력(JSON 텍스트)을 이 탭에 보관하는 키. 로그인 화면도 이 키로 '시간이 지남' 안내를 띄운다
export const SAVED_INPUT_KEY = "shift-scheduler:saved-input";

export function buildNextInput(input: IEngineInput, result: IEngineResult): IEngineInput {
  const next = structuredClone(input);
  const { start_date, end_date } = input.schedule_period;
  const prevStart = toUtc(start_date);
  const prevEnd = toUtc(end_date);
  // 순환 근무 위치는 다음 기간 길이가 아니라 실제로 지나간 이전 기간 일수로 넘긴다
  const prevDays = (prevEnd - prevStart) / DAY_MS + 1;
  const start = prevEnd + DAY_MS;
  // 이전 기간이 한 달 전체(1일~말일)면 다음 달 전체, 그 외에는 같은 일수로 잇는다
  const wholeMonth = new Date(prevStart).getUTCDate() === 1 && prevEnd === monthEnd(prevStart);
  const end = wholeMonth ? monthEnd(start) : start + (prevDays - 1) * DAY_MS;
  next.schedule_period = { ...next.schedule_period, start_date: fromUtc(start), end_date: fromUtc(end) };

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
    if (ro && rp && e.id in ro) e.rotation_offset = (ro[e.id] + prevDays) % (rp.work_days + rp.off_days);
  }
  return next;
}

/** 근무조 정의 순서대로 팔레트 색을 준다(결과에만 있는 이름은 뒤에). 직원별 표와 달력이 같은 색을 쓰도록 한 곳에 둔다 */
const makeColorOf = (input: IEngineInput, result: IEngineResult) => {
  const names = Object.keys(input.shift_definitions ?? {});
  for (const s of result.schedules) if (!names.includes(s.shift)) names.push(s.shift);
  return (shift: string) => SHIFT_COLORS[names.indexOf(shift) % SHIFT_COLORS.length];
};

interface IScheduleGridProps {
  input: IEngineInput;
  result: IEngineResult;
}

const ScheduleGrid = memo<IScheduleGridProps>(({ input, result }) => {
  const dates = useMemo(
    () => periodDates(input.schedule_period.start_date, input.schedule_period.end_date),
    [input.schedule_period],
  );

  const colorOf = useMemo(() => makeColorOf(input, result), [input, result]);

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

  // 월은 머리글마다 쓰지 않고 그리드 제목에 한 번만
  const monthTitle = useMemo(() => {
    const months = [...new Set(dates.map((d) => Number(d.slice(5, 7))))];
    return `${months.length > 1 ? `${months[0]}월~${months[months.length - 1]}월` : `${months[0]}월`} 근무표`;
  }, [dates]);

  const usedShifts = useMemo(() => [...new Set(result.schedules.map((s) => s.shift))], [result.schedules]);

  return (
    <div className="space-y-3">
      <h3 className="text-base font-semibold">{monthTitle}</h3>
      <ul className="flex flex-wrap items-center gap-2 text-xs" aria-label="근무조 색상 안내">
        {usedShifts.map((s) => (
          <li key={s} className={`rounded-md px-2 py-1 font-medium ${colorOf(s)}`}>{s}</li>
        ))}
        <li className="leave rounded-md px-2 py-1 font-medium">휴가</li>
        <li className="rounded-md border border-dashed border-border-strong px-2 py-1 text-muted">빈 칸: 쉬는 날</li>
      </ul>
      <div className="relative overflow-x-auto rounded-[var(--radius)] border border-border">
        {/* 날짜 열을 40px로 고정해 1440px 화면에서 한 달이 가로 스크롤 없이 보이게 한다 */}
        <table className="data-table table-fixed border-collapse text-xs" style={{ width: GRID_NAME_PX + GRID_DAY_PX * dates.length }}>
          <caption className="sr-only">직원별 근무표</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 w-32 border-b border-r border-border px-3 py-2 text-left">
                직원
              </th>
              {dates.map((d) => {
                const wd = new Date(toUtc(d)).getUTCDay();
                // 한국 달력 관례: 일요일 빨강, 토요일 파랑
                return (
                  <th
                    key={d}
                    scope="col"
                    aria-label={`${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일 ${WEEKDAYS[wd]}요일`}
                    className={`w-10 border-b border-border px-0 py-1.5 tabular-nums ${wd === 0 ? "text-danger" : wd === 6 ? "text-accent" : ""}`}
                  >
                    {Number(d.slice(8, 10))}
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
                  <th
                    scope="row"
                    title={`${e.name ?? e.id} ${EMPLOYMENT_LABEL[e.employment_type ?? ""] ?? e.employment_type ?? ""}`}
                    className="sticky left-0 z-10 truncate border-b border-r border-border bg-surface px-3 py-1 text-left font-medium"
                  >
                    {e.name ?? e.id}
                    <span className="ml-1.5 font-normal text-muted">
                      {EMPLOYMENT_LABEL[e.employment_type ?? ""] ?? e.employment_type}
                    </span>
                  </th>
                  {dates.map((d) => {
                    const assigned = cells.get(`${e.id}|${d}`);
                    const wd = new Date(toUtc(d)).getUTCDay();
                    const weekend = wd === 0 || wd === 6;
                    return (
                      <td key={d} className={`border-b border-border p-0.5 text-center ${weekend ? "bg-surface-2" : ""}`}>
                        {assigned ? (
                          assigned.map((a) => (
                            <div key={a.shift} title={`${a.shift} · ${a.reason}`} className={`truncate rounded-[6px] px-0.5 py-1 font-medium ${colorOf(a.shift)}`}>
                              {a.shift}
                            </div>
                          ))
                        ) : leaves.has(d) ? (
                          <div className="leave rounded-[6px] px-1 py-1 font-medium">휴가</div>
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

// 엔진 status → 화면 문구, 배지, 다음 행동 안내
const STATUS_VIEW: Record<string, { label: string; badge: string; hint?: string }> = {
  SUCCESS: { label: "근무표 생성 완료", badge: "badge-success" },
  INFEASIBLE: {
    label: "조건을 모두 만족하는 근무표가 없음",
    badge: "badge-warning",
    hint: "근무조별 필요 인원이 직원 수에 비해 많지 않은지, 휴가가 같은 날에 몰리지 않았는지, 주당 최대 근로시간·연속 근무일 규칙이 너무 빡빡하지 않은지 확인한 뒤 다시 만들어 보세요.",
  },
  INVALID_INPUT: { label: "입력값 확인 필요", badge: "badge-danger", hint: "아래 안내에 나온 항목을 고친 뒤 다시 만들어 보세요." },
};

/** API 오류를 관리자가 할 일이 보이는 문장으로 바꾼다 */
function requestErrorMessage(status: number, serverMessage?: string): string {
  switch (status) {
    case 429:
      return "지금 다른 근무표를 만드는 중입니다. 30초쯤 뒤에 다시 [근무표 만들기]를 눌러 주세요.";
    case 504:
      return "근무표를 만드는 데 시간이 너무 오래 걸려 중단했습니다. 근무 기간을 줄이거나 계산 시간 제한을 낮춘 뒤 다시 시도해 주세요.";
    case 413:
      return "입력한 내용이 너무 많습니다. 직원 수나 근무 기간을 줄여 주세요.";
    case 400:
      return "입력 형식이 올바르지 않습니다. 근무 조건을 다시 확인해 주세요.";
    case 500:
      return "근무표를 만드는 중에 서버 문제가 생겼습니다. 잠시 뒤 다시 시도하고, 계속되면 관리 담당자에게 알려 주세요.";
    default:
      return `요청을 처리하지 못했습니다(오류 코드 ${status}). ${serverMessage ?? "잠시 뒤 다시 시도해 주세요."}`;
  }
}

const StepNumber = ({ n }: { n: number }) => (
  <span aria-hidden className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent">
    {n}
  </span>
);

interface IScheduleRunnerProps {
  initialInput: string;
  /** STAFF_SHARE_BETA=1일 때만 '직원 공유 링크' 영역을 보인다 */
  staffShareBeta?: boolean;
}

const ScheduleRunner = memo<IScheduleRunnerProps>(({ initialInput, staffShareBeta = false }) => {
  const [activeTab, setActiveTab] = useState<MainTab>("create");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const savedLoadVersionRef = useRef(0);
  const openSavedErrorRef = useRef<HTMLParagraphElement>(null);
  const [openingSavedId, setOpeningSavedId] = useState<string | null>(null);
  const [openSavedError, setOpenSavedError] = useState("");
  // 폼과 JSON 탭은 text 하나를 공유한다. 폼은 text가 파싱될 때만 그 값을 보여 준다
  const [text, setText] = useState(initialInput);
  // 저장 항목을 열 때 현재 입력을 잃는지 판단하는 기준. 생성·열기·저장 성공 때 갱신한다.
  const [cleanText, setCleanText] = useState(initialInput);
  const [mode, setMode] = useState<"form" | "json">("form");
  const [inputError, setInputError] = useState<string | null>(null);
  // 생성이 막혔을 때 스크린리더에만 읽어 줄 세부 오류
  const [inputErrorDetail, setInputErrorDetail] = useState("");
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const logoutDialogRef = useRef<HTMLDialogElement>(null);
  const [resultView, setResultView] = useState<"grid" | "calendar">("grid");
  // 화면의 결과가 저장된 근무표면 그 id·상태. 새로 만들거나 다음 기간을 준비하면 null(아직 저장 안 함)
  const [saved, setSaved] = useState<{ id: string; status: SavedStatus } | null>(null);
  const [listKey, setListKey] = useState(0);
  const [saveMsg, setSaveMsg] = useState<{ kind: "info" | "danger"; text: string } | null>(null);
  const [savingBusy, setSavingBusy] = useState(false);
  // 게시·삭제 확인 대화상자
  const [confirm, setConfirm] = useState<{ title: string; body: string; label: string; onConfirm: () => void } | null>(null);
  const confirmRef = useRef<HTMLDialogElement>(null);
  // 생성·다음 기간 준비 뒤 포커스가 사라지지 않게 결과(또는 오류)·안내 문구로 옮긴다
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const requestErrorRef = useRef<HTMLParagraphElement>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // 결과와 짝이 맞는 입력. 생성 후 textarea를 고쳐도 그리드·다음 기간 계산은 실제로 보낸 입력 기준
  const [run, setRun] = useState<{ input: IEngineInput; result: IEngineResult } | null>(null);

  const selectMainTab = useCallback((tab: MainTab, focus = false) => {
    setActiveTab(tab);
    if (focus) {
      const index = MAIN_TABS.findIndex((item) => item.id === tab);
      requestAnimationFrame(() => tabRefs.current[index]?.focus());
    }
  }, []);

  const onMainTabKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === "ArrowLeft") next = (index + MAIN_TABS.length - 1) % MAIN_TABS.length;
    else if (event.key === "ArrowRight") next = (index + 1) % MAIN_TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = MAIN_TABS.length - 1;
    else return;
    event.preventDefault();
    selectMainTab(MAIN_TABS[next].id, true);
  }, [selectMainTab]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value), []);
  const handleFormChange = useCallback((next: Record<string, unknown>) => setText(JSON.stringify(next, null, 2)), []);

  const parsed = useMemo(() => {
    try {
      const v: unknown = JSON.parse(text);
      return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }, [text]);
  const validationErrors = useMemo(() => (parsed ? validateInput(parsed) : []), [parsed]);

  // 로그인 시간이 지남(401): 입력을 보관하고 로그인 화면으로. 다시 로그인하면 복원된다.
  // 입력은 ref로 읽어 이 함수가 입력마다 바뀌지 않게 한다(목록이 다시 불러와지지 않도록)
  const textRef = useRef(text);
  textRef.current = text;
  const toLogin = useCallback(() => {
    try {
      sessionStorage.setItem(SAVED_INPUT_KEY, textRef.current);
    } catch {}
    location.assign("/login?next=/");
  }, []);

  const handleGenerate = useCallback(async () => {
    let input: unknown;
    try {
      input = JSON.parse(text);
    } catch (e) {
      setInputError(`JSON 형식이 올바르지 않습니다: ${(e as Error).message}`);
      setInputErrorDetail("");
      return;
    }
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      setInputError("입력 데이터는 { }로 감싼 JSON 객체여야 합니다.");
      setInputErrorDetail("");
      return;
    }
    const errs = validateInput(input as Record<string, unknown>);
    if (errs.length > 0) {
      setInputError(`확인이 필요한 항목 ${errs.length}건을 먼저 고쳐 주세요.`);
      setInputErrorDetail(errs.slice(0, 3).map((e) => e.message).join(" ") + (errs.length > 3 ? ` 외 ${errs.length - 3}건은 목록에서 확인하세요.` : ""));
      // 오류 요약 패턴: 목록으로 포커스를 옮겨 바로 읽고 이동할 수 있게
      errorSummaryRef.current?.focus();
      return;
    }
    setInputError(null);
    setInputErrorDetail("");
    setRestored(false);
    setSaveMsg(null);
    setRequestError(null);
    setNotice(null);
    setRun(null);
    setLoading(true);
    try {
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // 검증한 값을 다시 직렬화해 보낸다. 원문의 8.0 같은 표기는 JS에선 정수지만 엔진(Python)에선 float라 거부되기 때문
        body: JSON.stringify(input),
      });
      if (res.status === 401) return toLogin();
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setRequestError(requestErrorMessage(res.status, data?.error));
        return;
      }
      setRun({ input: input as IEngineInput, result: data as IEngineResult });
      setCleanText(text);
      setSaved(null);
    } catch {
      setRequestError("서버에 연결할 수 없습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }, [text, toLogin]);

  useEffect(() => {
    fetch("/api/me")
      .then(async (r) => {
        if (r.status === 401) location.assign("/login?next=/");
        else if (r.ok) setStoreName(((await r.json()) as { storeName?: string }).storeName ?? null);
      })
      .catch(() => {});
    // 로그인 시간이 지나 보관해 둔 입력이 있으면 한 번 복원하고 지운다
    try {
      const saved = sessionStorage.getItem(SAVED_INPUT_KEY);
      if (saved !== null) {
        sessionStorage.removeItem(SAVED_INPUT_KEY);
        setText(saved);
        setRestored(true);
      }
    } catch {}
  }, []);

  /** 오류 목록에서 그 입력칸으로: JSON 편집 중이면 폼으로 바꾸고, 접힌 '지난 기간 정보'는 펼친 뒤 포커스 */
  const goToField = useCallback((field: string) => {
    setMode("form");
    setTimeout(() => {
      const el = document.getElementById(field);
      const details = el?.closest("details");
      if (details) details.open = true;
      el?.focus();
      el?.scrollIntoView({ block: "center" });
    }, 0);
  }, []);

  const doLogout = useCallback(async () => {
    setLoggingOut(true);
    try {
      const res = await fetch("/auth/logout", { method: "POST" });
      const data = (await res.json().catch(() => null)) as { kakaoLogoutUrl?: string } | null;
      if (!res.ok || !data?.kakaoLogoutUrl) throw new Error();
      // 카카오 계정 로그아웃을 거쳐 /login?logged_out=1로 돌아온다
      location.assign(data.kakaoLogoutUrl);
    } catch {
      logoutDialogRef.current?.close();
      setLoggingOut(false);
      setRequestError("로그아웃하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
    }
  }, []);

  /** 저장된 근무표를 실제로 불러와 입력 폼과 결과(직원별 표/달력)를 채운다. */
  const loadSaved = useCallback(
    async (id: string) => {
      const version = ++savedLoadVersionRef.current;
      setOpeningSavedId(id);
      setOpenSavedError("");
      setSaveMsg(null);
      try {
        const res = await fetch(`/api/schedules/${encodeURIComponent(id)}`);
        if (version !== savedLoadVersionRef.current) return;
        if (res.status === 401) return toLogin();
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { id: string; status: SavedStatus; input: IEngineInput; result: IEngineResult };
        if (version !== savedLoadVersionRef.current) return;
        const nextText = JSON.stringify(data.input, null, 2);
        setActiveTab("create");
        setText(nextText);
        setCleanText(nextText);
        setRun({ input: data.input, result: data.result });
        setSaved({ id: data.id, status: data.status });
        setNotice(null);
        setRequestError(null);
        setInputError(null);
        requestAnimationFrame(() => resultHeadingRef.current?.focus());
      } catch {
        if (version !== savedLoadVersionRef.current) return;
        setOpenSavedError("근무표를 불러오지 못했습니다. 목록을 새로 고친 뒤 다시 시도해 주세요.");
        setListKey((k) => k + 1);
        requestAnimationFrame(() => openSavedErrorRef.current?.focus());
      } finally {
        if (version === savedLoadVersionRef.current) setOpeningSavedId(null);
      }
    },
    [toLogin],
  );

  /** 저장하지 않은 입력·결과가 있으면 확인한 뒤 저장된 근무표를 연다. */
  const openSaved = useCallback((id: string) => {
    const needsConfirm = text !== cleanText || (!!run && !saved);
    if (!needsConfirm) return void loadSaved(id);
    setConfirm({
      title: "저장된 근무표 열기",
      body: "현재 입력과 저장하지 않은 결과가 바뀝니다. 저장된 근무표를 열까요?",
      label: "열기",
      onConfirm: () => void loadSaved(id),
    });
  }, [cleanText, loadSaved, run, saved, text]);

  /** 저장·게시·게시 취소·삭제 요청. 성공하면 목록을 다시 불러온다 */
  const callSaved = useCallback(
    async (url: string, method: string, body: unknown, failText: string, onOk: (res: Response) => Promise<void> | void) => {
      setSavingBusy(true);
      setSaveMsg(null);
      try {
        const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
        if (res.status === 401) return toLogin();
        if (!res.ok) throw new Error();
        await onOk(res);
        setListKey((k) => k + 1);
      } catch {
        setSaveMsg({ kind: "danger", text: failText });
      } finally {
        setSavingBusy(false);
      }
    },
    [toLogin],
  );

  const handleSave = () =>
    run &&
    callSaved("/api/schedules", "POST", { input: run.input, result: run.result }, "근무표를 저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요. 화면의 근무표는 그대로 있습니다.", async (res) => {
      const { id } = (await res.json()) as { id: string };
      setSaved({ id, status: "draft" });
      setCleanText(JSON.stringify(run.input, null, 2));
      setSaveMsg({ kind: "info", text: "근무표를 저장했습니다." });
    });

  const handlePublish = () =>
    saved &&
    setConfirm({
      title: "게시하기",
      body: "게시하면 직원이 이 근무표를 볼 수 있습니다. 게시할까요?",
      label: "게시하기",
      onConfirm: () =>
        callSaved(`/api/schedules/${encodeURIComponent(saved.id)}/publish`, "POST", null, "근무표를 게시하지 못했습니다. 잠시 뒤 다시 시도해 주세요.", () => {
          setSaved({ ...saved, status: "published" });
          setSaveMsg({ kind: "info", text: "게시했습니다." });
        }),
    });

  const handleUnpublish = () =>
    saved &&
    callSaved(`/api/schedules/${encodeURIComponent(saved.id)}/unpublish`, "POST", null, "게시를 취소하지 못했습니다. 잠시 뒤 다시 시도해 주세요.", () => {
      setSaved({ ...saved, status: "unpublished" });
      setSaveMsg({ kind: "info", text: "게시를 취소했습니다." });
    });

  const handleDelete = () =>
    saved &&
    setConfirm({
      title: "삭제",
      body: "저장된 이 근무표를 삭제할까요? 삭제하면 되돌릴 수 없습니다. 화면의 근무표는 남아 있어 다시 저장할 수 있습니다.",
      label: "삭제",
      onConfirm: () =>
        callSaved(`/api/schedules/${encodeURIComponent(saved.id)}`, "DELETE", null, "근무표를 삭제하지 못했습니다. 잠시 뒤 다시 시도해 주세요.", () => {
          setSaved(null);
          setSaveMsg({ kind: "info", text: "저장된 근무표를 삭제했습니다." });
        }),
    });

  useEffect(() => {
    if (confirm) confirmRef.current?.showModal();
  }, [confirm]);

  const handleNextPeriod = useCallback(() => {
    if (!run) return;
    const next = buildNextInput(run.input, run.result);
    setText(JSON.stringify(next, null, 2));
    setRun(null);
    setSaved(null);
    setSaveMsg(null);
    setNotice(
      `다음 기간(${formatDate(next.schedule_period.start_date)} ~ ${formatDate(next.schedule_period.end_date)}) 근무 조건을 준비했습니다. 직원 휴가를 확인한 뒤 [근무표 만들기]를 누르세요.`,
    );
  }, [run]);

  const periodLabel = useMemo(() => {
    const p = parsed?.schedule_period as { start_date?: unknown; end_date?: unknown } | undefined;
    const ok = (d: unknown): d is string => typeof d === "string" && !Number.isNaN(toUtc(d));
    if (!p || !ok(p.start_date) || !ok(p.end_date)) return "정하지 않음";
    const days = (toUtc(p.end_date) - toUtc(p.start_date)) / DAY_MS + 1;
    return `${formatDate(p.start_date)} ~ ${formatDate(p.end_date)}${days > 0 ? ` · ${days}일` : ""}`;
  }, [parsed]);

  useEffect(() => {
    if (run) resultHeadingRef.current?.focus();
  }, [run]);
  useEffect(() => {
    if (requestError) requestErrorRef.current?.focus();
  }, [requestError]);
  useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);

  const timeLimit = useMemo(() => {
    const t = (parsed?.rules as { time_limit_seconds?: unknown } | undefined)?.time_limit_seconds;
    return typeof t === "number" && t > 0 ? t : 30;
  }, [parsed]);
  const result = run?.result;
  const statusView = result ? (STATUS_VIEW[result.status] ?? { label: result.status, badge: "badge-danger" }) : null;
  const success = result?.status === "SUCCESS";
  const canShowGrid = useMemo(
    () => !!run && Array.isArray(run.input.employees) && !!run.input.schedule_period?.start_date && !!run.input.schedule_period?.end_date,
    [run],
  );
  const hasGrid = !!result && result.schedules?.length > 0 && canShowGrid;
  const runColorOf = useMemo(() => (run ? makeColorOf(run.input, run.result) : null), [run]);

  return (
    <div className="min-h-screen">
      {/* 모바일(<640px)에서는 헤더가 화면을 많이 차지해 sticky를 끈다 */}
      <header className="app-header top-0 z-30 border-b border-border sm:sticky print:hidden">
        <div className="mx-auto flex min-h-14 max-w-[1600px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2 sm:px-8">
          <div className="flex items-center gap-3">
            <Image src="/app-icon.svg" alt="" width={28} height={28} unoptimized className="rounded-lg" />
            <div>
              <h1 className="text-[15px] font-bold tracking-[-0.01em]">교대근무 스케줄러</h1>
              <p className="hidden text-xs text-muted sm:block">근무 조건을 입력하면 근로시간·휴식 규칙을 지키는 근무표를 자동으로 만듭니다.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {activeTab === "create" && (
              <p className="chip">
                <span className="text-muted">근무 기간</span>
                <span className="font-semibold tabular-nums">{periodLabel}</span>
              </p>
            )}
            {storeName && (
              <div className="flex items-center gap-3 sm:border-l sm:border-border sm:pl-4">
                <span className="text-xs text-muted">{storeName}</span>
                <button
                  type="button"
                  onClick={() => (success ? logoutDialogRef.current?.showModal() : void doLogout())}
                  disabled={loggingOut}
                  className="btn btn-secondary btn-sm"
                >
                  로그아웃
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <nav aria-label="메인 기능" className="main-tabs-shell print:hidden">
        <div role="tablist" aria-label="메인 기능" className="main-tabs mx-auto max-w-[1600px] px-4 sm:px-8">
          {MAIN_TABS.map((tab, index) => (
            <button
              key={tab.id}
              ref={(element) => { tabRefs.current[index] = element; }}
              id={`main-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`main-panel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => selectMainTab(tab.id)}
              onKeyDown={(event) => onMainTabKeyDown(event, index)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* 게시·삭제 확인. 로그아웃 확인과 같은 규칙(배경 클릭 무시, Esc는 취소, 처음 포커스 [취소]) */}
      <dialog
        ref={confirmRef}
        onClose={() => setConfirm(null)}
        aria-labelledby="confirm-title"
        aria-describedby="confirm-desc"
        className="card m-auto w-[calc(100%-2rem)] max-w-[400px] p-6 text-fg"
      >
        <h2 id="confirm-title" className="section-title">
          {confirm?.title}
        </h2>
        <p id="confirm-desc" className="mt-2 text-sm">
          {confirm?.body}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => confirmRef.current?.close()} className="btn btn-secondary">
            취소
          </button>
          <button
            type="button"
            onClick={() => {
              confirm?.onConfirm();
              confirmRef.current?.close();
            }}
            className="btn btn-primary"
          >
            {confirm?.label}
          </button>
        </div>
      </dialog>

      {/* 결과 근무표가 있을 때만 확인. 네이티브 dialog: 배경을 눌러도 닫히지 않고 Esc는 취소, 처음 포커스는 [취소] */}
      <dialog
        ref={logoutDialogRef}
        aria-labelledby="logout-title"
        aria-describedby="logout-desc"
        className="card m-auto w-[calc(100%-2rem)] max-w-[400px] p-6 text-fg"
      >
        <h2 id="logout-title" className="section-title">
          로그아웃
        </h2>
        <p id="logout-desc" className="mt-2 text-sm">
          로그아웃하면 화면의 근무표가 사라집니다. 카카오 계정에서도 로그아웃됩니다. 로그아웃할까요?
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => logoutDialogRef.current?.close()} className="btn btn-secondary">
            취소
          </button>
          <button type="button" onClick={() => void doLogout()} disabled={loggingOut} className="btn btn-primary">
            {loggingOut ? "로그아웃하는 중…" : "로그아웃"}
          </button>
        </div>
      </dialog>

      <main className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 sm:px-8 sm:py-8">
        <div
          id="main-panel-manage"
          role="tabpanel"
          aria-labelledby="main-tab-manage"
          hidden={activeTab !== "manage"}
          className="space-y-4"
        >
          {openSavedError && <p ref={openSavedErrorRef} tabIndex={-1} role="alert" className="alert alert-danger">{openSavedError}</p>}
          <SavedSchedules
            refreshKey={listKey}
            currentId={saved?.id ?? null}
            openingId={openingSavedId}
            onOpen={openSaved}
            onUnauthorized={toLogin}
            shareBeta={staffShareBeta}
            onConfirm={setConfirm}
            onCreate={() => {
              setActiveTab("create");
              requestAnimationFrame(() => document.getElementById("step-input")?.focus());
            }}
          />
        </div>

        <div
          id="main-panel-create"
          role="tabpanel"
          aria-labelledby="main-tab-create"
          hidden={activeTab !== "create"}
          className="space-y-6"
        >
          {restored && <p className="alert alert-info print:hidden">로그인 전에 입력하던 근무 조건을 불러왔습니다.</p>}
        <section aria-labelledby="step-input" className="card print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
            <h2 id="step-input" tabIndex={-1} className="section-title flex items-center gap-2">
              <StepNumber n={1} />
              근무 조건 입력
            </h2>
            <button type="button" aria-pressed={mode === "json"} onClick={() => setMode(mode === "json" ? "form" : "json")} className="btn btn-sm text-muted hover:bg-surface-2">
              {mode === "json" ? "입력 폼으로 돌아가기" : "고급: JSON 직접 편집"}
            </button>
          </div>
          <div className="space-y-4 p-4 sm:p-6">
            {mode === "form" ? (
              parsed ? (
                <InputForm value={parsed} onChange={handleFormChange} errors={validationErrors} />
              ) : (
                <p role="alert" className="alert alert-warning">
                  입력 데이터 형식이 올바르지 않아 입력 폼을 보여 줄 수 없습니다. [고급: JSON 직접 편집]에서 고쳐 주세요.
                </p>
              )
            ) : (
              <>
                <label htmlFor="engine-input" className="sr-only">
                  근무 조건(JSON)
                </label>
                <textarea
                  id="engine-input"
                  value={text}
                  onChange={handleChange}
                  spellCheck={false}
                  aria-invalid={!!inputError}
                  aria-describedby={inputError ? "input-error" : undefined}
                  className="input block h-[32rem] w-full py-3 font-mono text-xs leading-5"
                />
              </>
            )}
            {validationErrors.length > 0 && (
              <div ref={errorSummaryRef} tabIndex={-1} aria-labelledby="error-summary-title" className="alert alert-warning scroll-mt-24">
                <p id="error-summary-title" className="font-semibold">확인이 필요한 항목 {validationErrors.length}건</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {validationErrors.map((e, i) => (
                    // id는 입력칸 aria-describedby가 가리킨다. 칸이 있는 오류는 눌러서 그 칸으로 이동
                    <li key={i} id={`err-${i}`}>
                      {e.field ? (
                        <button type="button" onClick={() => goToField(e.field!)} className="text-left underline underline-offset-2 hover:no-underline">
                          {e.message}
                        </button>
                      ) : (
                        e.message
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>

        {/* 입력이 길어서 넓은 화면에서는 생성 버튼을 화면 아래에 붙여 둔다. 모바일은 바가 입력을 가리므로 붙이지 않는다 */}
        <section aria-labelledby="step-generate" className="float-bar z-20 sm:sticky sm:bottom-4 print:hidden">
          <div className="flex flex-wrap items-center gap-3 px-5 py-3">
            <h2 id="step-generate" className="sr-only">근무표 만들기</h2>
            <StepNumber n={2} />
            <button type="button" onClick={handleGenerate} disabled={loading} aria-busy={loading} className="btn btn-primary">
              {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
              {loading ? "근무표 만드는 중…" : "근무표 만들기"}
            </button>
            {success && (
              <button type="button" onClick={handleNextPeriod} className="btn btn-secondary">
                다음 기간 준비하기
              </button>
            )}
            {inputError && (
              <p id="input-error" role="alert" className="text-sm font-medium text-danger">
                {inputError}
                {inputErrorDetail && <span className="sr-only"> {inputErrorDetail}</span>}
              </p>
            )}
            {!inputError && validationErrors.length > 0 && (
              <p className="text-sm text-warning">확인이 필요한 항목 {validationErrors.length}건</p>
            )}
          </div>
        </section>

        {/* pb-20: 화면 아래 붙은 2단계 바가 결과 마지막 줄을 가리지 않게 */}
        <section aria-live="polite" aria-labelledby={result ? "step-result" : undefined} className="space-y-4 pb-20">
          {notice && (
            <p ref={noticeRef} tabIndex={-1} className="alert alert-info">
              {notice}
            </p>
          )}
          {loading && (
            <p className="card px-5 py-8 text-center text-sm text-muted">
              근무표를 만들고 있습니다. 조건에 따라 최대 {timeLimit}초쯤 걸립니다.
            </p>
          )}
          {!loading && !result && !requestError && !notice && (
            <p className="card border-dashed px-5 py-8 text-center text-sm text-muted">
              아직 만든 근무표가 없습니다. 근무 조건을 확인한 뒤 [근무표 만들기]를 누르세요.
            </p>
          )}
          {requestError && (
            <p ref={requestErrorRef} tabIndex={-1} role="alert" className="alert alert-danger">
              {requestError}
            </p>
          )}
          {result && statusView && (
            // 좌우 여백은 20px: 24px이면 1440px에서 근무표(직원 128 + 날짜 40×30)가 4px 넘쳐 가로 스크롤이 생긴다
            <div className="card space-y-5 p-4 sm:px-5 sm:py-6">
              <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
                <h2 id="step-result" ref={resultHeadingRef} tabIndex={-1} className="section-title flex items-center gap-2">
                  <StepNumber n={3} />
                  결과
                </h2>
                {/* 배정이 하나도 없는 SUCCESS(필요 인원 0 등)도 저장·게시할 수 있게 그리드 유무와 따로 본다 */}
                {success && run && (
                  <div className="flex flex-wrap items-center gap-2" role="group" aria-label="근무표 저장·게시">
                    {saved ? (
                      <>
                        <span className={`badge ${SAVED_STATUS_VIEW[saved.status].badge}`}>{SAVED_STATUS_VIEW[saved.status].label}</span>
                        {saved.status === "published" ? (
                          <button type="button" onClick={handleUnpublish} disabled={savingBusy} className="btn btn-secondary btn-sm">
                            게시 취소
                          </button>
                        ) : (
                          <button type="button" onClick={handlePublish} disabled={savingBusy} className="btn btn-secondary btn-sm">
                            게시하기
                          </button>
                        )}
                        <button type="button" onClick={handleDelete} disabled={savingBusy} className="btn btn-danger-ghost">
                          삭제
                        </button>
                      </>
                    ) : (
                      <button type="button" onClick={handleSave} disabled={savingBusy} className="btn btn-secondary btn-sm">
                        저장
                      </button>
                    )}
                  </div>
                )}
                {hasGrid && (
                  // 보기 전환은 세그먼트 컨트롤(주 버튼은 화면당 하나 규칙)
                  <div className="segmented sm:ml-auto" role="group" aria-label="결과 보기">
                    {(
                      [
                        ["grid", "직원별 표"],
                        ["calendar", "달력"],
                      ] as const
                    ).map(([v, label]) => (
                      <button key={v} type="button" aria-pressed={resultView === v} onClick={() => setResultView(v)}>
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {saveMsg && (
                <p role={saveMsg.kind === "danger" ? "alert" : "status"} className={`alert alert-${saveMsg.kind} print:hidden`}>
                  {saveMsg.text}
                </p>
              )}
              {statusView.hint && <p className={`alert print:hidden ${statusView.badge === "badge-warning" ? "alert-warning" : "alert-danger"}`}>{statusView.hint}</p>}
              {/* 근무표가 없으면(SUCCESS 아님) 지표는 '-'. '위반 0건'이 문제없음으로 읽히지 않게 */}
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 print:hidden">
                {(
                  [
                    ["상태", <span key="s" className={`badge ${statusView.badge}`}>{statusView.label}</span>],
                    ["근무 공평성(100점 만점)", success && result.fairness_score != null ? `${result.fairness_score.toLocaleString("ko-KR")}점` : "-"],
                    ["총 배정 근무", success && result.summary?.total_shifts_assigned != null ? `${result.summary.total_shifts_assigned.toLocaleString("ko-KR")}회` : "-"],
                    [
                      "근로 규칙 위반",
                      <span key="v" className={success && result.summary?.legal_violations ? "text-danger" : undefined}>
                        {success && result.summary?.legal_violations != null ? `${result.summary.legal_violations}건` : "-"}
                      </span>,
                    ],
                    [
                      "예상 인건비",
                      success && result.summary?.estimated_labor_cost != null ? `${result.summary.estimated_labor_cost.toLocaleString("ko-KR")}원` : "-",
                    ],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="metric px-4 py-3">
                    <dt className="text-xs font-medium text-muted">{k}</dt>
                    <dd className="metric-value mt-1 whitespace-nowrap">{v}</dd>
                  </div>
                ))}
              </dl>
              {/* INFEASIBLE 엔진 알림은 위 안내 상자와 같은 내용이라 숨긴다 */}
              {result.status !== "INFEASIBLE" && result.warnings_and_exceptions?.length > 0 && (
                <div className="alert alert-warning print:hidden">
                  <h3 className="font-semibold">알림</h3>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {result.warnings_and_exceptions.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
              {hasGrid && run && resultView === "grid" && <ScheduleGrid input={run.input} result={result} />}
              {hasGrid && run && resultView === "calendar" && (
                <ScheduleCalendar input={run.input} result={result} colorOf={runColorOf!} storeName={storeName} periodLabel={periodLabel} />
              )}
            </div>
          )}
        </section>
        </div>

        <div
          id="main-panel-personal"
          role="tabpanel"
          aria-labelledby="main-tab-personal"
          hidden={activeTab !== "personal"}
        >
          <ManagerCalendar active={activeTab === "personal"} onUnauthorized={toLogin} />
        </div>
      </main>
    </div>
  );
});
ScheduleRunner.displayName = "ScheduleRunner";

export default ScheduleRunner;
