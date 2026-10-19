export type ManagerPatternRule = { workDays: number; restDays: number; workTitle: string };

const countValue = (value: string) => value === "하루" ? 1 : Number(value.replace("일", ""));

/** 제한된 한국어 반복 문장을 추측 없이 해석한다. */
export function parseManagerPattern(text: string): ManagerPatternRule | null {
  const compact = text.trim().replace(/[,，]/g, " ").replace(/\s+/g, " ").replace(/[.!?。]+$/, "");
  const match = compact.match(
    /^(?:(?:오늘(?: 날짜)?부터|시작일부터)\s+)?(하루|\d{1,2}일)(?:은|는)?\s+(.+?)\s*(?:하고|후)\s+(하루|\d{1,2}일)(?:은|는)?\s*(?:쉬기|쉬는 날|쉬는 패턴|휴무)(?:\s*반복)?(?:(?:으로|로)\s*일정을?\s*등록해\s*(?:줘|주세요))?$/,
  );
  if (!match) return null;
  const workDays = countValue(match[1]);
  const restDays = countValue(match[3]);
  const workTitle = match[2].trim();
  if (!Number.isInteger(workDays) || !Number.isInteger(restDays) || workDays < 1 || workDays > 30 || restDays < 1 || restDays > 30) return null;
  if (!workTitle || workTitle.length > 30) return null;
  return { workDays, restDays, workTitle };
}
