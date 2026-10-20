import type { EventColor } from "./manager-event-colors";

export type ManagerPatternRule = { workDays: number; restDays: number; workTitle: string; workColor: EventColor; restColor: EventColor };
/** deleteExisting: 선택한 기간의 기존 일정을 지운다. rule: 반복 등록(없으면 삭제만). fromToday: 문장 앞머리에 "오늘부터/오늘 기준으로"가 있음 */
export type ManagerCommand = { deleteExisting: boolean; rule: ManagerPatternRule | null; fromToday: boolean };

const KOREAN_DAYS: Record<string, number> = { 하루: 1, 이틀: 2, 사흘: 3, 나흘: 4, 닷새: 5, 엿새: 6, 이레: 7, 여드레: 8, 아흐레: 9, 열흘: 10 };
const countValue = (value: string) => KOREAN_DAYS[value] ?? Number(value.replace("일", ""));
/** 근무 제목: 1~30자. 제목 안에 "1일 휴무"나 따로 떨어진 기간("3일", "3일간", "사흘 동안")이 있으면 패턴 두 개를 하나로 읽은 것이므로 거부("쉬프트", "휴일근무", "3일차", "하루방"은 허용) */
const DURATION = "(?:\\d{1,2}\\s?일|하루|이틀|사흘|나흘|닷새|엿새|이레|여드레|아흐레|열흘)";
export const isWorkTitle = (title: string) => title.length >= 1 && title.length <= 30
  && !new RegExp(`${DURATION}(?:간|\\s?동안)?(?:은|는)?\\s*(?:쉬기|쉬는|휴무|휴일)`).test(title)
  && !new RegExp(`(?:^|\\s)${DURATION}(?:간|\\s?동안)?(?:은|는|을|를)?(?=\\s|$)`).test(title);

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
// 문장 맨 앞의 완전한 삭제 절만: "해당 기간에 일정을 삭제하고", "해당일에 일정을 삭제해줘", "모든 일정을 제거하고", "기존 거 다 날리고", "그날 일정 싹 지워줘".
// 앞에 제목이 오거나("병원 일정 빼고 …") 뒤에 부정이 붙으면("삭제하지 말고") 일치하지 않는다
const DELETE = new RegExp(
  "^(?:(?:해당|선택한|이)\\s?(?:일|날|날짜|기간)(?:에|의)?\\s*(?:있는\\s*)?|그날\\s*)?(?:모든\\s*|전체\\s*)?(?:기존\\s*)?(?:일정|거|것)(?:을|를)?\\s*(?:모두\\s*|전부\\s*|다\\s*|싹\\s*)?"
  // 등록이 이어지면 "삭제하고/삭제한 뒤/삭제 후/지우고"처럼 접속어까지 있어야 하고, 삭제만이면 동사 뒤가 문장 끝이어야 한다.
  // 그래서 "삭제 안 하고", "삭제 말고", "삭제하지"는 삭제 절이 아니다
  + "(?:(?:(?:삭제|제거)(?:하고|한\\s?(?:뒤|후|다음)에?|\\s?후에?)|지우고|날리고|비우고)" + END
  + "|(?:(?:삭제|제거)(?:하기)?|지우기|지워|날려|비워)" + PLEASE + "$)",
);
// 문장 앞머리(또는 삭제 절 바로 뒤)의 "오늘부터/오늘 기준으로/시작일부터". "다시"는 뜻 없는 말로 버린다(날짜 기준을 바꾸지 않음)
const PREFIX = /^(?:(오늘(?:\s?날짜)?\s?(?:부터|기준으로)|시작일부터)\s*)?(?:다시\s*)?/;
const SUFFIX = /\s*(?:패턴|반복)?\s*(?:(?:으로|로)\s*)?(?:일정(?:을|를)?\s*)?(?:등록|추가)?\s*(?:해\s?(?:줘|주세요)|하기)?$/;
const COUNT = "(하루|이틀|사흘|나흘|닷새|엿새|이레|여드레|아흐레|열흘|\\d{1,2}일)";
const CORE = new RegExp(`^${COUNT}(?:은|는)?\\s*(.+?)\\s*(?:하고|후)?\\s*${COUNT}(?:은|는)?\\s*(?:쉬기|쉬는\\s?날|쉬는|휴무|휴일)$`);

const normalize = (text: string) => text.trim().replace(/[,，]/g, " ").replace(/\s+/g, " ").replace(/[.!?。]+$/, "");

/** 앞머리의 "오늘부터"와 문장 맨 앞의 완전한 삭제 절을 떼어 낸다. 삭제 여부는 이 함수만 정한다. 삭제가 잡힌 문장은 AI로 넘기지 않는다(manager-pattern-ai.ts) */
export function splitLeadingDelete(text: string): { deleteExisting: boolean; fromToday: boolean; rest: string } {
  // 제목 속 "오늘부터"는 날짜 기준이 아니므로 앞머리에서 뗀 경우만 fromToday로 본다
  let fromToday = false;
  const stripPrefix = (value: string) => value.replace(PREFIX, (_m, from?: string) => {
    if (from?.startsWith("오늘")) fromToday = true;
    return "";
  });
  let deleteExisting = false;
  const rest = stripPrefix(stripPrefix(normalize(text)).replace(DELETE, () => {
    deleteExisting = true;
    return "";
  }).trim()).trim();
  return { deleteExisting, fromToday, rest };
}

/** 제한된 한국어 명령을 추측 없이 해석한다. 아는 표현을 하나씩 떼어 내고, 남는 말이 있으면 전체를 거부한다. */
export function parseManagerCommand(text: string): ManagerCommand | null {
  let rest = normalize(text);
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
  const lead = splitLeadingDelete(rest);
  const { deleteExisting, fromToday } = lead;
  rest = lead.rest.replace(SUFFIX, "").trim();

  if (!rest) return deleteExisting && !colors.work && !colors.rest ? { deleteExisting, rule: null, fromToday } : null;
  const match = rest.match(CORE);
  if (!match) return null;
  const workDays = countValue(match[1]);
  const restDays = countValue(match[3]);
  const workTitle = match[2].trim();
  if (!Number.isInteger(workDays) || !Number.isInteger(restDays) || workDays < 1 || workDays > 30 || restDays < 1 || restDays > 30) return null;
  if (!isWorkTitle(workTitle)) return null;
  return { deleteExisting, rule: { workDays, restDays, workTitle, workColor: colors.work ?? "blue", restColor: colors.rest ?? "green" }, fromToday };
}
