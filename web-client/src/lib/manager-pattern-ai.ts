import { sign, verify } from "./auth";
import { isEventColor } from "./manager-event-colors";
import { DEFAULT_REST_TITLE, isWorkTitle, parseManagerCommand, splitLeadingDelete } from "./manager-pattern-language";
import type { ManagerCommand } from "./manager-pattern-language";

// 규칙 파서가 읽지 못한 문장만 Gemini에 보낸다. 삭제는 AI 경로에서 절대 일어나지 않는다: 문장 맨 앞에 삭제 절이 있으면(splitLeadingDelete)
// 규칙 파서가 문장 전체를 읽은 경우에만 처리하고 AI에는 보내지 않는다("삭제하고 싶지 않고 …" 같은 뒷말을 모델이 놓쳐 전체 삭제되는 것을 막기 위해서다).
// 문장 외의 정보(기존 일정·메모·매장)는 보내지 않고, 원문은 저장·로그하지 않는다.
// ponytail: 무료 등급 한도(분당 약 10회)는 키 하나를 모든 매장이 나눠 쓴다. 매장이 늘면 매장별 제한이나 유료 등급을 둔다
const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";
const TIMEOUT_MS = 10_000;
const COLORS = ["gray", "blue", "green", "yellow", "purple", "red"];

const SYSTEM = `너는 매장 관리자의 개인 일정 명령 문장을 정해진 JSON으로 바꾸는 해석기다. 날짜 계산은 하지 않는다. 기간(시작일~종료일)은 화면에서 따로 정해진다.
할 수 있는 명령은 두 가지뿐이다.
1) 선택한 기간의 기존 일정을 종류 구분 없이 모두 삭제 (deleteScope="all"). 문장이 일정 삭제·제거·지우기를 명령으로 요청할 때만이다. 일정 제목 안에 '삭제' 같은 글자가 있는 것은 명령이 아니다.
   deleteScope: 삭제 요청이 없으면 "none". '근무 일정을 삭제', '휴무 지워줘', '회의 일정 삭제'처럼 특정 제목·종류의 일정만 지우라는 뜻이면 "specific"(지원하지 않음, supported=false). '해당일 일정', '모든 일정', '기존 거 다', '그날 일정'처럼 범위 전체면 "all".
2) 근무 N일 + 쉬는 날 M일 반복 등록 (rule). N,M은 1~30. workTitle은 근무 일정 제목(예: 근무, 야간 근무, 오픈 근무), 1~30자, 사용자가 쓴 말 그대로. restTitle은 쉬는 날 일정 제목: 사용자가 "쉬는 날은 휴무로 저장"처럼 바꾸라고 하면 그 말(예: 휴무), 말하지 않으면 "쉬는 날".
색: 근무 색 workColor, 쉬는 날 색 restColor. 값은 gray(회색) blue(파랑) green(초록) yellow(노랑) purple(보라) red(빨강). 대상을 말하지 않고 색만 말하면 둘 다 그 색. 말하지 않은 색은 근무 blue, 쉬는 날 green.
fromToday: 문장이 '오늘부터', '오늘 기준으로'처럼 오늘을 시작 기준으로 말하면 true.
다음은 지원하지 않는다: 이미 있는 일정의 제목·색 변경, 특정 제목·종류의 일정만 삭제, 요일 지정(주말만, 월수금), '다음 주부터' 같은 오늘 외의 날짜 표현, 시각 지정, 여러 패턴 조합, 일정 내용과 무관한 말. 이런 요청이 섞이면 supported=false.
삭제만 요청하면 rule은 null. 삭제도 반복 등록도 없으면 supported=false.`;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    supported: { type: "BOOLEAN" },
    deleteScope: { type: "STRING", enum: ["none", "all", "specific"] },
    fromToday: { type: "BOOLEAN" },
    rule: {
      type: "OBJECT",
      nullable: true,
      properties: {
        workDays: { type: "INTEGER" },
        restDays: { type: "INTEGER" },
        workTitle: { type: "STRING" },
        restTitle: { type: "STRING" },
        workColor: { type: "STRING", enum: COLORS },
        restColor: { type: "STRING", enum: COLORS },
      },
      required: ["workDays", "restDays", "workTitle", "restTitle", "workColor", "restColor"],
    },
  },
  required: ["supported", "deleteScope", "fromToday", "rule"],
};

export const UNSUPPORTED_MESSAGE = "문장을 해석하지 못했습니다. “2일 근무하고 1일 쉬기”, “해당 기간 일정을 삭제하고 2일 근무 1일 휴무, 휴무는 빨간색”처럼 입력해 주세요.";

export type CommandResolution =
  | { command: ManagerCommand; source: "rule" | "ai"; token?: string; error?: never }
  | { error: string; status: 400 | 503; command?: never };

const isDays = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 30;

type Lead = ReturnType<typeof splitLeadingDelete>;

/** 모델 응답을 규칙 파서와 같은 조건으로 검증한다. 모델이 문장에서 삭제 요청을 봤다면(제외·특정 제목·맨 앞이 아닌 삭제) 거부한다 */
function toCommand(value: unknown, lead: Lead): ManagerCommand | null {
  if (typeof value !== "object" || value === null) return null;
  const out = value as Record<string, unknown>;
  if (out.supported !== true || typeof out.fromToday !== "boolean" || out.deleteScope !== "none") return null;
  if (typeof out.rule !== "object" || out.rule === null) return null;
  const rule = out.rule as Record<string, unknown>;
  const workTitle = typeof rule.workTitle === "string" ? rule.workTitle.trim() : "";
  const restTitle = typeof rule.restTitle === "string" && rule.restTitle.trim() ? rule.restTitle.trim() : DEFAULT_REST_TITLE;
  if (!isDays(rule.workDays) || !isDays(rule.restDays) || !isWorkTitle(workTitle) || !isWorkTitle(restTitle)) return null;
  if (!isEventColor(rule.workColor) || !isEventColor(rule.restColor)) return null;
  return {
    deleteExisting: false,
    rule: { workDays: rule.workDays, restDays: rule.restDays, workTitle, restTitle, workColor: rule.workColor, restColor: rule.restColor },
    fromToday: lead.fromToday || out.fromToday,
  };
}

async function askGemini(text: string): Promise<CommandResolution> {
  const key = process.env.GEMINI_API_KEY;
  const lead = splitLeadingDelete(text);
  if (!key || lead.deleteExisting) return { error: UNSUPPORTED_MESSAGE, status: 400 };
  let response: Response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0 },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { error: "지금은 문장을 해석할 수 없습니다. 잠시 뒤 다시 시도하거나 예시처럼 입력해 주세요.", status: 503 };
  }
  if (response.status === 429) return { error: "지금은 문장 해석 요청이 많습니다. 1분쯤 뒤 다시 시도하거나 예시처럼 입력해 주세요.", status: 503 };
  if (!response.ok) return { error: "지금은 문장을 해석할 수 없습니다. 잠시 뒤 다시 시도하거나 예시처럼 입력해 주세요.", status: 503 };
  try {
    const data = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const command = toCommand(JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text ?? ""), lead);
    if (!command) return { error: UNSUPPORTED_MESSAGE, status: 400 };
    return { command, source: "ai", token: sign("pattern-command", { t: text, c: command }) };
  } catch {
    return { error: UNSUPPORTED_MESSAGE, status: 400 };
  }
}

/** 미리보기용: 규칙 파서 → 실패하면 Gemini. AI 해석에는 저장 단계에서 재호출하지 않도록 서명 토큰을 붙인다 */
export async function resolveManagerCommand(text: string): Promise<CommandResolution> {
  const command = parseManagerCommand(text);
  return command ? { command, source: "rule" } : askGemini(text);
}

/** 저장용: 규칙 파서 → 실패하면 미리보기에서 받은 토큰(같은 문장일 때만). 모델을 다시 부르지 않는다 */
export function storedManagerCommand(text: string, token: unknown): ManagerCommand | null {
  const command = parseManagerCommand(text);
  if (command) return command;
  if (typeof token !== "string") return null;
  const payload = verify<{ t: string; c: ManagerCommand }>("pattern-command", token);
  return payload && payload.t === text ? payload.c : null;
}
