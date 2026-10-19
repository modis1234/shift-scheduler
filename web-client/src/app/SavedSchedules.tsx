"use client";

import React, { memo, useEffect, useRef, useState } from "react";
import { formatDate } from "./InputForm";

export type SavedStatus = "draft" | "published" | "unpublished";
export interface ISavedSummary {
  id: string;
  startDate: string;
  endDate: string;
  status: SavedStatus;
  createdAt: string;
  updatedAt: string;
}

// 상태 → 배지 (기획서 4.2, 용어표: 작성 중 / 게시됨 / 게시 취소됨)
export const SAVED_STATUS_VIEW: Record<SavedStatus, { label: string; badge: string }> = {
  draft: { label: "작성 중", badge: "badge-neutral" },
  published: { label: "게시됨", badge: "badge-success" },
  unpublished: { label: "게시 취소됨", badge: "badge-neutral" },
};

/** ISO 시각 → "10월 16일" (브라우저 현지 날짜) */
const madeOn = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getMonth() + 1}월 ${d.getDate()}일`;
};

interface ISavedSchedulesProps {
  /** 바뀌면 목록을 다시 불러온다(저장·게시·삭제 뒤) */
  refreshKey: number;
  /** 지금 화면에 열린 근무표 id */
  currentId: string | null;
  onOpen: (id: string) => void;
  /** 401: 로그인 시간이 지남 */
  onUnauthorized: () => void;
  /** STAFF_SHARE_BETA가 켜졌을 때만 '직원 공유 링크' 줄을 보인다 */
  shareBeta: boolean;
  /** 화면 공용 확인 대화상자(ScheduleRunner) */
  onConfirm: (c: IConfirm) => void;
}

interface IConfirm {
  title: string;
  body: string;
  label: string;
  onConfirm: () => void;
}

interface IShareLinkProps {
  onConfirm: (c: IConfirm) => void;
  onUnauthorized: () => void;
}

/** '저장된 근무표' 카드 아래 '직원 공유 링크' 줄 (기획서 7-3) */
const ShareLink = memo<IShareLinkProps>(({ onConfirm, onUnauthorized }) => {
  // null = 불러오는 중, "" = 링크 없음
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copyMsg, setCopyMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const apply = (code: string | null) => setUrl(code ? `${location.origin}/s/${code}` : "");

  useEffect(() => {
    let alive = true;
    fetch("/api/share-link")
      .then(async (r) => {
        if (r.status === 401) return onUnauthorized();
        if (!r.ok) throw new Error();
        const { code } = (await r.json()) as { code: string | null };
        if (alive) apply(code);
      })
      .catch(() => alive && setError("직원 공유 링크를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요."));
    return () => {
      alive = false;
    };
  }, [onUnauthorized]);

  const create = async () => {
    setBusy(true);
    setError("");
    setCopyMsg("");
    try {
      const r = await fetch("/api/share-link", { method: "POST" });
      if (r.status === 401) return onUnauthorized();
      if (!r.ok) throw new Error();
      apply(((await r.json()) as { code: string }).code);
    } catch {
      setError("링크를 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const copy = () =>
    // http 주소 등에서는 navigator.clipboard가 없으므로 실패로 처리한다
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(url ?? ""))
      .then(
        () => setCopyMsg("복사했습니다"),
        () => {
          inputRef.current?.select();
          setCopyMsg("복사하지 못했습니다. 주소를 직접 복사해 주세요.");
        },
      );

  return (
    <div className="border-t border-border px-4 py-4 sm:px-6">
      <h3 className="subhead">직원 공유 링크</h3>
      {url === null && !error ? (
        <div className="mt-2 h-9 animate-pulse rounded-[var(--radius)] bg-surface-2" aria-hidden />
      ) : url ? (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              readOnly
              value={url}
              aria-label="직원 공유 링크 주소"
              onFocus={(e) => e.target.select()}
              className="input min-w-0 flex-1 basis-64 font-mono text-xs"
            />
            <button type="button" onClick={copy} className="btn btn-secondary btn-sm">
              복사
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                onConfirm({
                  title: "링크 새로 만들기",
                  body: "새 링크를 만들면 지금 링크는 바로 열리지 않습니다. 새로 만들까요?",
                  label: "새로 만들기",
                  onConfirm: () => void create(),
                })
              }
              className="btn btn-secondary btn-sm"
            >
              링크 새로 만들기
            </button>
          </div>
          <p className="mt-2 text-xs text-muted">게시된 근무표만 직원에게 보입니다.</p>
        </>
      ) : (
        url === "" && (
          <button type="button" disabled={busy} onClick={() => void create()} className="btn btn-secondary btn-sm mt-2">
            링크 만들기
          </button>
        )
      )}
      <p aria-live="polite" className="mt-1 text-xs">
        {copyMsg}
      </p>
      {error && (
        <p role="alert" className="alert alert-danger mt-2">
          {error}
        </p>
      )}
    </div>
  );
});
ShareLink.displayName = "ShareLink";

/** 메인 위쪽 '저장된 근무표' 목록 */
const SavedSchedules = memo<ISavedSchedulesProps>(({ refreshKey, currentId, onOpen, onUnauthorized, shareBeta, onConfirm }) => {
  const [items, setItems] = useState<ISavedSummary[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    fetch("/api/schedules")
      .then(async (r) => {
        if (r.status === 401) return onUnauthorized();
        if (!r.ok) throw new Error();
        const data = (await r.json()) as ISavedSummary[];
        if (alive) setItems(data);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [refreshKey, onUnauthorized]);

  return (
    <section aria-labelledby="saved-title" aria-busy={items === null && !failed} className="card print:hidden">
      <h2 id="saved-title" className="section-title border-b border-border px-4 py-3 sm:px-6">
        저장된 근무표
      </h2>
      <div className="p-4 sm:p-6">
        {failed ? (
          <p role="alert" className="alert alert-danger">
            저장된 근무표를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.
          </p>
        ) : items === null ? (
          <ul className="space-y-2" aria-hidden>
            {[0, 1, 2].map((i) => (
              <li key={i} className="h-10 animate-pulse rounded-[var(--radius)] bg-surface-2" />
            ))}
          </ul>
        ) : items.length === 0 ? (
          <p className="rounded-[var(--radius)] border border-dashed border-border-strong px-5 py-6 text-center text-sm text-muted">
            저장된 근무표가 없습니다. 근무표를 만든 뒤 [저장]을 눌러 주세요.
          </p>
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {items.map((s) => {
              const v = SAVED_STATUS_VIEW[s.status] ?? SAVED_STATUS_VIEW.draft;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(s.id)}
                    aria-current={s.id === currentId ? "true" : undefined}
                    className={`flex w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-[var(--radius)] border px-4 py-2 text-left text-sm transition-[background-color,box-shadow] hover:bg-surface-2 hover:shadow-[var(--shadow-xs)] ${
                      s.id === currentId ? "border-accent bg-accent-soft" : "border-border"
                    }`}
                  >
                    <span className="font-semibold tabular-nums">
                      {formatDate(s.startDate)} ~ {formatDate(s.endDate)}
                    </span>
                    <span className={`badge ${v.badge}`}>{v.label}</span>
                    <span className="text-xs text-muted sm:ml-auto">만든 날 {madeOn(s.createdAt)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {shareBeta && <ShareLink onConfirm={onConfirm} onUnauthorized={onUnauthorized} />}
    </section>
  );
});
SavedSchedules.displayName = "SavedSchedules";

export default SavedSchedules;
