// 내 일정 뱃지 색. 화면과 서버가 함께 쓰므로 서버 전용 모듈을 import하지 않는다.
// 색 클래스는 근무조 색(globals.css .shift-*)을 재사용해 라이트·다크 대비를 맞춘다.
// 키를 바꾸면 db/migrations의 CHECK 목록도 함께 바꾼다.
export const EVENT_COLORS = {
  gray: { label: "회색", className: "bg-surface-2" },
  blue: { label: "파랑", className: "shift-0" },
  green: { label: "초록", className: "shift-1" },
  yellow: { label: "노랑", className: "shift-3" },
  purple: { label: "보라", className: "shift-2" },
  red: { label: "빨강", className: "leave" },
} as const;

export type EventColor = keyof typeof EVENT_COLORS;

export const isEventColor = (value: unknown): value is EventColor => typeof value === "string" && Object.hasOwn(EVENT_COLORS, value);
