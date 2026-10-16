"use client";

import React, { memo, useEffect, useState } from "react";
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
}

/** 메인 위쪽 '저장된 근무표' 목록 */
const SavedSchedules = memo<ISavedSchedulesProps>(({ refreshKey, currentId, onOpen, onUnauthorized }) => {
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
      <h2 id="saved-title" className="border-b border-border px-5 py-3 text-base font-semibold">
        저장된 근무표
      </h2>
      <div className="p-5">
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
                    className={`flex w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-[var(--radius)] border px-4 py-2 text-left text-sm hover:bg-surface-2 ${
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
    </section>
  );
});
SavedSchedules.displayName = "SavedSchedules";

export default SavedSchedules;
