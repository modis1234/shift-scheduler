"use client";

import Image from "next/image";
import React, { memo, useCallback, useEffect, useState } from "react";
import { LAST_SHARE_KEY } from "../s/[code]/StaffView";

type State = "checking" | "choose" | "expired" | "offline";

const readLastCode = () => {
  try {
    return localStorage.getItem(LAST_SHARE_KEY);
  } catch {
    return null;
  }
};

/** 앱 시작 화면(기획 android-app.md 4.1·6.1절): 마지막 직원 링크가 살아 있으면 그리로, 아니면 역할 선택 */
const AppStartView = memo(() => {
  const [state, setState] = useState<State>("checking");

  const check = useCallback(() => {
    const code = readLastCode();
    if (!code) return setState("choose");
    setState("checking");
    fetch(`/api/s/${encodeURIComponent(code)}`, { cache: "no-store" })
      .then((r) => {
        if (r.ok) return location.replace(`/s/${encodeURIComponent(code)}`);
        if (r.status !== 404) throw new Error();
        try {
          localStorage.removeItem(LAST_SHARE_KEY);
        } catch {}
        setState("expired");
      })
      .catch(() => setState("offline"));
  }, []);

  useEffect(check, [check]);

  return (
    <main className="login-glow flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="mb-6 flex flex-col items-center text-center">
        <Image src="/app-icon.svg" alt="" width={56} height={56} unoptimized priority className="mb-4 rounded-2xl" />
        <h1 className="text-xl font-bold">교대근무 스케줄러</h1>
      </div>
      <section aria-live="polite" aria-busy={state === "checking"} className="card w-full max-w-[400px] space-y-4 p-6 text-center">
        {state === "checking" && <p className="text-sm text-muted">열 화면을 확인하는 중…</p>}
        {state === "offline" && (
          <>
            <p role="alert" className="text-sm">인터넷에 연결되지 않았습니다. 연결한 뒤 다시 시도해 주세요.</p>
            <button type="button" onClick={check} className="btn btn-primary w-full">다시 시도</button>
          </>
        )}
        {(state === "choose" || state === "expired") && (
          <>
            {state === "expired" && (
              <p role="alert" className="alert alert-warning text-left text-sm">직원 공유 링크가 바뀌었습니다. 매장에서 새 링크를 받아 열어 주세요.</p>
            )}
            <h2 className="font-semibold">어떤 화면을 열까요?</h2>
            <div>
              <a href="/login" className="btn btn-primary w-full">매장 관리자 로그인</a>
              <p className="mt-2 text-sm text-muted">근무표를 만들고 내 일정을 관리합니다.</p>
            </div>
            <p className="border-t border-border pt-4 text-sm text-muted">
              직원은 매장에서 받은 직원 공유 링크를 카카오톡·문자에서 눌러 열어 주세요.
            </p>
          </>
        )}
      </section>
    </main>
  );
});
AppStartView.displayName = "AppStartView";

export default AppStartView;
