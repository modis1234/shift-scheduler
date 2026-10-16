"use client";

import React, { memo, useEffect, useState } from "react";
import { SAVED_INPUT_KEY } from "../ScheduleRunner";

type AlertKind = "info" | "warning" | "danger";

// 콜백이 돌려주는 ?error=<코드> → 화면 문구 (기획서 4.1). 모르는 코드는 카카오 오류로 본다
const ERROR_VIEW: Record<string, { kind: AlertKind; text: string }> = {
  not_registered: {
    kind: "warning",
    text: "이 카카오 계정은 등록되어 있지 않습니다. 매장 등록은 운영 담당자에게 문의해 주세요. 받은 초대 링크가 있다면 그 링크로 다시 들어와 주세요.",
  },
  invite_invalid: { kind: "warning", text: "초대 링크가 만료되었거나 이미 사용되었습니다. 운영 담당자에게 새 링크를 요청해 주세요." },
  already_linked: {
    kind: "warning",
    text: "이 카카오 계정은 이미 다른 매장에 연결되어 있습니다. 다른 카카오 계정으로 로그인하거나 운영 담당자에게 문의해 주세요.",
  },
  consent_denied: { kind: "info", text: "카카오 로그인을 취소했습니다. 다시 하려면 [카카오로 시작하기]를 눌러 주세요." },
  kakao_error: { kind: "danger", text: "카카오 로그인을 마치지 못했습니다. 잠시 뒤 다시 시도해 주세요." },
  rate_limited: { kind: "warning", text: "로그인 시도가 너무 많습니다. 잠시 뒤 다시 시도해 주세요." },
};
const EXPIRED_TEXT = "로그인 시간이 지나 다시 로그인해 주세요. 입력하던 근무 조건은 이 브라우저에 보관했습니다.";

/** 같은 사이트 경로만 허용, 아니면 / (기획서 3.4). 서버 lib/auth.ts safeNext와 같은 규칙(그 모듈은 node:crypto라 여기서 못 씀).
 * 줄바꿈 등 제어 문자는 브라우저가 지워 "/\n//evil.example"이 외부 주소가 되므로 URL 파서로 origin을 한 번 더 본다 */
const safeNext = (next: string) => {
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  const url = new URL(next, "http://same.invalid");
  return url.origin === "http://same.invalid" ? url.pathname + url.search + url.hash : "/";
};

/** 카카오 말풍선 심볼. 경로는 카카오 디벨로퍼스 로그인 리소스(developers.kakao.com/tool/resource/login)의
 * 공식 버튼 SVG에서 그대로 가져왔다. 색은 디자인 가이드대로 검정 */
const KakaoSymbol = () => (
  <svg aria-hidden width="18" height="18" viewBox="27.02 16.5 12.96 12.96">
    <path
      fill="#000"
      d="m33.501 16.5225c-3.5788 0-6.4785 2.4812-6.4785 5.5416 0 1.9671 1.1994 3.6955 3.0067 4.6782l-.6111 2.469c-.0227.0737-.0049.1527.0438.2071.0356.0386.0842.0596.1312.0596.0406 0 .0811-.014.1151-.0439l2.6258-1.9197c.3777.0579.7667.0895 1.1654.0895 3.5773 0 6.4786-2.4813 6.4786-5.5416s-2.8997-5.5398-6.477-5.5398z"
    />
  </svg>
);

interface ILoginViewProps {
  error: string;
  invite: string;
  next: string;
  loggedOut: boolean;
}

const LoginView = memo<ILoginViewProps>(({ error, invite, next, loggedOut }) => {
  const [remember, setRemember] = useState(false);
  const [moving, setMoving] = useState(false);
  // 초대 링크: 확인 중(undefined) → 매장 이름 | 사용 불가(null)
  const [inviteStore, setInviteStore] = useState<string | null | undefined>(undefined);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    // 이미 로그인한 상태로 /login에 오면 바로 원래 주소로
    fetch("/api/me")
      .then((r) => r.ok && location.replace(safeNext(next)))
      .catch(() => {});
    // 로그인 시간이 지나 메인에서 입력을 보관하고 넘어온 경우
    try {
      setExpired(sessionStorage.getItem(SAVED_INPUT_KEY) !== null);
    } catch {}
    // 뒤로 가기로 돌아오면(bfcache) '이동 중' 상태를 풀어 준다
    const onShow = (e: PageTransitionEvent) => e.persisted && setMoving(false);
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, [next]);

  useEffect(() => {
    if (!invite || error) return;
    fetch(`/api/invite?code=${encodeURIComponent(invite)}`)
      .then(async (r) => setInviteStore(r.ok ? ((await r.json()) as { storeName?: string }).storeName ?? null : null))
      .catch(() => setInviteStore(null));
  }, [invite, error]);

  const alert: { kind: AlertKind; text: string } | null = error
    ? (ERROR_VIEW[error] ?? ERROR_VIEW.kakao_error)
    : invite && inviteStore === null
      ? ERROR_VIEW.invite_invalid
      : loggedOut
        ? { kind: "info", text: "로그아웃했습니다." }
        : expired
          ? { kind: "info", text: EXPIRED_TEXT }
          : null;

  const params = new URLSearchParams({ next: safeNext(next) });
  if (invite) params.set("invite", invite);
  if (remember) params.set("remember", "1");
  const startHref = `/auth/kakao/start?${params}`;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold tracking-tight">교대근무 스케줄러</h1>
        <p className="mt-1 text-sm text-muted">근무 조건을 넣으면 근무표를 만들어 드립니다.</p>
      </div>
      <section aria-labelledby="login-title" className="card w-full max-w-[400px] space-y-4 p-5">
        <h2 id="login-title" className="text-base font-semibold">
          로그인
        </h2>
        {alert && (
          <p role={alert.kind === "danger" ? "alert" : undefined} className={`alert alert-${alert.kind}`}>
            {alert.text}
          </p>
        )}
        {invite && !error && inviteStore && (
          <p className="text-sm">
            <strong className="font-semibold">{inviteStore}</strong> 관리자로 초대받았습니다.
          </p>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          로그인 상태 유지 <span className="text-xs text-muted">(개인 기기에서만)</span>
        </label>
        {/* 서버 라우트로 이동하는 링크. 누른 뒤에는 두 번 누르지 않게 막는다. 비활성은 opacity 없이 표시(노랑이 바래면 글자 대비가 떨어짐) */}
        <a
          href={startHref}
          onClick={(e) => (moving ? e.preventDefault() : setMoving(true))}
          aria-disabled={moving}
          className={`kakao-btn ${moving ? "pointer-events-none" : ""}`}
        >
          {moving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : <KakaoSymbol />}
          {moving ? "카카오로 이동하는 중…" : "카카오로 시작하기"}
        </a>
        <p className="text-xs text-muted">
          {invite && !error && inviteStore
            ? `카카오 로그인을 마치면 이 카카오 계정이 ${inviteStore}에 연결됩니다.`
            : "등록된 매장 관리자만 쓸 수 있습니다. 처음이라면 받은 초대 링크로 들어와 주세요."}
        </p>
      </section>
    </main>
  );
});
LoginView.displayName = "LoginView";

export default LoginView;
