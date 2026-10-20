import type { EventColor } from "./manager-event-colors";

export type ManagerPatternRule = { workDays: number; restDays: number; workTitle: string; workColor: EventColor; restColor: EventColor };
/** deleteExisting: 선택한 기간의 기존 일정을 지운다. rule: 반복 등록(없으면 삭제만). fromToday: 문장 앞머리에 "오늘부터/오늘 기준으로"가 있음 */
export type ManagerCommand = { deleteExisting: boolean; rule: ManagerPatternRule | null; fromToday: boolean };

const countValue = (value: string) => value === "하루" ? 1 : Number(value.replace("일", ""));

const COLOR_WORD = "(빨간|빨강|파란|파랑|초록|녹|노란|노랑|보라|회)";
const COLOR_OF: Record<string, EventColor> = {
  빨간: "red", 빨강: "red", 파란: "blue", 파랑: "blue", 초록: "green", 녹: "green", 노란: "yellow", 노랑: "yellow", 보라: "purple", 회: "gray",
};
const PLEASE = "(?:\\s*(?:해\\s?)?(?:줘|주세요))?";
// 절은 앞뒤가 문장 끝·공백일 때만 뗀다. "삭제방지", "빨간색연필", "회의" 같은 제목 속 글자를 명령으로 읽지 않기 위해서다
const START = "(?<=^|\\s)";
const END = "(?=\\s|$)";
// "휴무는 빨간색으로 등록", "근무는 파란색"
const TARGET_COLOR = new RegExp(`${START}(근무|휴무|휴일|쉬는\\s?날)(?:은|는)\\s*${COLOR_WORD}색(?:으로|로)?(?:\\s*(?:등록|표시|설정))?${PLEASE}${END}`, "g");
// 대상 없이 "빨간색으로" → 근무·쉬는 날 모두
const ALL_COLOR = new RegExp(`${START}${COLOR_WORD}색(?:으로|로)${END}`, "g");
// 문장 맨 앞의 삭제 절만: "해당 기간에 일정을 삭제하고", "해당일에 일정을 삭제해줘", "모든 일정을 제거하고"
const DELETE = new RegExp(
  "^(?:(?:해당|선택한|이)\\s?(?:일|날|날짜|기간)(?:에|의)?\\s*|그날\\s*)?(?:모든\\s*)?(?:기존\\s*)?일정(?:을|를)?\\s*(?:모두\\s*|전부\\s*|다\\s*)?"
  + "(?:(?:삭제|제거)(?:하고|한\\s?(?:뒤|후|다음)에?|후|하기)?|지우고|지우기)" + PLEASE + END,
);
// 문장 앞머리(또는 삭제 절 바로 뒤)의 "오늘부터/오늘 기준으로/시작일부터". "다시"는 뜻 없는 말로 버린다(날짜 기준을 바꾸지 않음)
const PREFIX = /^(?:(오늘(?:\s?날짜)?\s?(?:부터|기준으로)|시작일부터)\s*)?(?:다시\s*)?/;
const SUFFIX = /\s*(?:패턴|반복)?\s*(?:(?:으로|로)\s*)?(?:일정(?:을|를)?\s*)?(?:등록|추가)?\s*(?:해\s?(?:줘|주세요)|하기)?$/;
const CORE = /^(하루|\d{1,2}일)(?:은|는)?\s*(.+?)\s*(?:하고|후)?\s*(하루|\d{1,2}일)(?:은|는)?\s*(?:쉬기|쉬는\s?날|쉬는|휴무|휴일)$/;

/** 제한된 한국어 명령을 추측 없이 해석한다. 아는 표현을 하나씩 떼어 내고, 남는 말이 있으면 전체를 거부한다. */
export function parseManagerCommand(text: string): ManagerCommand | null {
  let rest = text.trim().replace(/[,，]/g, " ").replace(/\s+/g, " ").replace(/[.!?。]+$/, "");
  const colors: Partial<Record<"work" | "rest", EventColor>> = {};
  rest = rest.replace(TARGET_COLOR, (_m, target: string, color: string) => {
    colors[/근무/.test(target) ? "work" : "rest"] = COLOR_OF[color];
    return " ";
  });
  rest = rest.replace(ALL_COLOR, (_m, color: string) => {
    colors.work ??= COLOR_OF[color];
    colors.rest ??= COLOR_OF[color];
    return " ";
  });
  // 제목 속 "오늘부터"는 날짜 기준이 아니므로 앞머리에서 뗀 경우만 fromToday로 본다
  let fromToday = false;
  const stripPrefix = (value: string) => value.replace(PREFIX, (_m, from?: string) => {
    if (from?.startsWith("오늘")) fromToday = true;
    return "";
  });
  rest = stripPrefix(rest.replace(/\s+/g, " ").trim());
  let deleteExisting = false;
  rest = rest.replace(DELETE, () => {
    deleteExisting = true;
    return "";
  });
  rest = stripPrefix(rest.trim()).replace(SUFFIX, "").trim();

  if (!rest) return deleteExisting && !colors.work && !colors.rest ? { deleteExisting, rule: null, fromToday } : null;
  const match = rest.match(CORE);
  if (!match) return null;
  const workDays = countValue(match[1]);
  const restDays = countValue(match[3]);
  const workTitle = match[2].trim();
  if (!Number.isInteger(workDays) || !Number.isInteger(restDays) || workDays < 1 || workDays > 30 || restDays < 1 || restDays > 30) return null;
  if (!workTitle || workTitle.length > 30) return null;
  return { deleteExisting, rule: { workDays, restDays, workTitle, workColor: colors.work ?? "blue", restColor: colors.rest ?? "green" }, fromToday };
}
