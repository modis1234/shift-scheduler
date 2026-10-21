"use client";

import React, { memo, useRef, useState } from "react";
import type { ManagerEvent } from "@/lib/manager-events";
import { EVENT_COLORS } from "@/lib/manager-event-colors";
import type { ManagerPatternPreview } from "@/lib/manager-pattern";

type PreviewResult = ManagerPatternPreview & { source: "rule" | "ai"; commandToken?: string };

type PatternInput = { startDate: string; endDate: string; referenceDate: string; patternText: string };

interface Props {
  onCreated: (events: ManagerEvent[], skipped: number, startDate: string) => void;
  onUnauthorized: () => void;
}

const formatDate = (date: string) => {
  const value = new Date(`${date}T00:00:00Z`);
  return `${value.getUTCMonth() + 1}월 ${value.getUTCDate()}일`;
};
const localToday = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const ManagerPatternMaker = memo<Props>(({ onCreated, onUnauthorized }) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dialogTitleRef = useRef<HTMLHeadingElement>(null);
  const previewTitleRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const dialogVersionRef = useRef(0);
  const [input, setInput] = useState<PatternInput>(() => {
    const today = localToday();
    return { startDate: today, endDate: "", referenceDate: today, patternText: "" };
  });
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"preview" | "save" | null>(null);
  const [status, setStatus] = useState("");

  const open = () => {
    dialogVersionRef.current += 1;
    const today = localToday();
    setInput({ startDate: today, endDate: "", referenceDate: today, patternText: "" });
    setPreview(null);
    setError("");
    dialogRef.current?.showModal();
    requestAnimationFrame(() => dialogTitleRef.current?.focus());
  };
  const update = (change: Partial<PatternInput>) => {
    setInput((current) => ({ ...current, ...change }));
    setPreview(null);
    setError("");
  };
  const request = async <T,>(url: string, body: unknown): Promise<T> => {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (response.status === 401) {
      onUnauthorized();
      throw new Error("로그인이 필요합니다.");
    }
    const data: unknown = await response.json().catch(() => null);
    const message = typeof data === "object" && data !== null && "error" in data && typeof data.error === "string" ? data.error : "";
    if (!response.ok || !data) throw new Error(message || "요청을 처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
    return data as T;
  };
  // 종료일을 비우면 시작일 하루만
  const body = { ...input, endDate: input.endDate || input.startDate };
  const showError = (message: string) => {
    setError(message);
    requestAnimationFrame(() => errorRef.current?.focus());
  };

  const makePreview = async (event: React.FormEvent) => {
    event.preventDefault();
    const version = dialogVersionRef.current;
    setBusy("preview");
    setError("");
    try {
      const result = await request<PreviewResult>("/api/manager-events/pattern-preview", body);
      if (version !== dialogVersionRef.current) return;
      setPreview(result);
      requestAnimationFrame(() => previewTitleRef.current?.focus());
    } catch (reason) {
      if (version !== dialogVersionRef.current) return;
      showError(reason instanceof Error ? reason.message : "일정을 미리보지 못했습니다.");
    } finally {
      if (version === dialogVersionRef.current) setBusy(null);
    }
  };

  const save = async () => {
    if (!preview) return;
    if (preview.summary.deletes > 0 && !window.confirm(`기존 일정 ${preview.summary.deletes}개를 삭제합니다. 삭제하면 되돌릴 수 없습니다. 계속할까요?`)) return;
    setBusy("save");
    setError("");
    try {
      const result = await request<{ created: number; skippedDuplicates: number; deleted: number; renamed: number; events: ManagerEvent[] }>(
        "/api/manager-events/pattern-batch",
        { ...body, expectedDigest: preview.digest, commandToken: preview.commandToken },
      );
      dialogRef.current?.close();
      setStatus([
        result.deleted ? `${result.deleted}개 일정을 삭제했습니다.` : "",
        result.renamed ? `${result.renamed}개 일정의 제목을 바꿨습니다.` : "",
        result.created ? `${result.created}개 일정을 등록했습니다.` : "",
        result.skippedDuplicates ? `중복 ${result.skippedDuplicates}개는 건너뛰었습니다.` : "",
      ].filter(Boolean).join(" "));
      onCreated(result.events, result.skippedDuplicates, input.startDate);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "일정을 등록하지 못했습니다. 저장된 일정은 없습니다. 잠시 뒤 다시 시도해 주세요.";
      showError(message);
      if (message.includes("새 미리보기")) setPreview(null);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <button type="button" onClick={open} className="btn btn-secondary btn-sm">문장으로 여러 일정 만들기</button>
      {status && <p role="status" className="basis-full text-sm text-success">{status}</p>}
      <dialog
        ref={dialogRef}
        onCancel={(event) => { if (busy === "save") event.preventDefault(); }}
        onClose={() => { dialogVersionRef.current += 1; setBusy(null); }}
        aria-labelledby="manager-pattern-dialog-title"
        className="card m-auto w-[calc(100%-2rem)] max-w-[680px] p-6 text-fg"
      >
        <form onSubmit={makePreview} aria-busy={busy !== null} className="space-y-4">
          <div>
            <h2 ref={dialogTitleRef} tabIndex={-1} id="manager-pattern-dialog-title" className="section-title">문장으로 여러 일정 만들기</h2>
            <p className="mt-1 text-sm text-muted">기간과 문장을 입력하면 등록·삭제될 일정을 먼저 보여 드립니다.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">시작일
              <input type="date" required disabled={!!busy} value={input.startDate} onChange={(event) => update({ startDate: event.target.value })} className="input mt-1 w-full" />
            </label>
            <label className="text-sm font-medium">종료일 <span className="font-normal text-muted">(하루만이면 비워 두기)</span>
              <input type="date" disabled={!!busy} value={input.endDate} onChange={(event) => update({ endDate: event.target.value })} className="input mt-1 w-full" />
            </label>
          </div>
          <label className="block text-sm font-medium">패턴 문장
            <input
              type="text"
              required
              maxLength={100}
              disabled={!!busy}
              value={input.patternText}
              onChange={(event) => update({ patternText: event.target.value })}
              placeholder="예: 오늘 날짜부터 2일은 근무하고 하루는 쉬는 패턴으로 일정을 등록해줘"
              className="input mt-1 w-full"
            />
            <span className="mt-1 block text-xs font-normal text-muted">예: “2일 근무하고 1일 쉬기”, “해당일에 일정을 삭제해줘”, “해당 기간에 일정을 삭제하고 2일 근무 하루 휴무로 등록해줘, 휴무는 빨간색으로”, “쉬는 날은 휴무로 수정”. 예시와 다른 문장은 외부 AI(Google Gemini API 무료 등급)가 해석합니다. 이 서비스는 문장을 저장하지 않지만, Google은 무료 등급의 입력·응답을 서비스 개선에 쓰고 사람이 검토할 수 있습니다. 이름·연락처 같은 개인정보나 민감한 내용은 넣지 마세요.</span>
          </label>

          {error && <p ref={errorRef} tabIndex={-1} role="alert" className="alert alert-danger">{error}</p>}

          {preview && (
            <section aria-labelledby="manager-pattern-preview-title" className="rounded-[var(--radius)] border border-border p-4">
              <h3 ref={previewTitleRef} tabIndex={-1} id="manager-pattern-preview-title" className="font-semibold">
                미리보기: {formatDate(body.startDate)}{body.endDate !== body.startDate && `~${formatDate(body.endDate)}`}
              </h3>
              {preview.source === "ai" && <p className="mt-1 text-sm font-medium text-warning">AI가 해석한 결과입니다. 아래 내용이 맞는지 확인해 주세요.</p>}
              <p className="mt-1 text-sm text-muted">
                {[
                  preview.normalized.deleteExisting && "이 기간의 기존 일정을 모두 삭제합니다.",
                  preview.normalized.rename && `이 기간의 ‘${preview.normalized.rename.from}’ 일정 제목을 ‘${preview.normalized.rename.to}’(으)로 바꿉니다.`,
                  preview.normalized.rule && `${preview.normalized.rule.workDays}일 ${preview.normalized.rule.workTitle}(${EVENT_COLORS[preview.normalized.rule.workColor].label}) + ${preview.normalized.rule.restDays}일 ${preview.normalized.rule.restTitle}(${EVENT_COLORS[preview.normalized.rule.restColor].label})을 반복합니다.`,
                ].filter(Boolean).join(" ")}
              </p>
              <p className="mt-2 text-sm font-medium" aria-live="polite">
                {preview.normalized.rename ? `제목 변경 ${preview.summary.renames}개` : <>
                  {preview.normalized.deleteExisting && <strong className="text-danger">삭제 {preview.summary.deletes}개 · </strong>}
                  새 일정 {preview.summary.creatable}개{!preview.normalized.deleteExisting && ` · 중복 ${preview.summary.duplicates}개 · 기존 일정 있는 날 ${preview.summary.datesWithExisting}일`}
                </>}
              </p>
              {preview.deletes.length > 0 && (
                <ul aria-label="삭제할 일정" className="alert alert-danger mt-3 max-h-40 space-y-0.5 overflow-y-auto text-sm">
                  {preview.deletes.map((item, index) => (
                    <li key={`${item.date}-${index}`}><span className="tabular-nums">{formatDate(item.date)}</span> {item.title} — 삭제</li>
                  ))}
                </ul>
              )}
              {preview.renames.length > 0 && (
                <ul aria-label="제목을 바꿀 일정" className="mt-3 max-h-40 space-y-0.5 overflow-y-auto rounded-md border border-border p-2 text-sm">
                  {preview.renames.map((item) => (
                    <li key={item.date}><span className="tabular-nums">{formatDate(item.date)}</span> {item.from} → {item.to}</li>
                  ))}
                </ul>
              )}
              {preview.events.length > 0 && <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto border-t border-border pt-2">
                {preview.events.map((item) => (
                  <li key={`${item.date}-${item.kind}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-1.5 text-sm odd:bg-surface-2">
                    <span className="min-w-20 tabular-nums">{formatDate(item.date)}</span>
                    <span className="flex flex-1 items-center gap-2 font-medium">
                      <span aria-hidden className={`inline-block h-3 w-3 shrink-0 rounded-full border border-border ${EVENT_COLORS[item.color].className}`} />
                      {item.title}
                    </span>
                    <span className="text-xs text-muted">
                      {item.status === "duplicate" ? "중복 — 등록하지 않음" : item.status === "existing-date" ? "기존 일정 있음" : "새 일정"}
                    </span>
                  </li>
                ))}
              </ul>}
            </section>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" disabled={busy === "save"} onClick={() => preview ? setPreview(null) : dialogRef.current?.close()} className="btn btn-secondary">
              {preview ? "입력 수정" : "취소"}
            </button>
            {!preview && <button type="submit" disabled={!!busy} className="btn btn-primary">{busy === "preview" ? "미리보는 중…" : "일정 미리보기"}</button>}
            {preview && preview.summary.creatable + preview.summary.deletes + preview.summary.renames > 0 && (
              <button type="button" disabled={!!busy} onClick={() => void save()} className="btn btn-primary">
                {busy === "save" ? "처리하는 중…" : [
                  preview.summary.deletes && `${preview.summary.deletes}개 삭제`,
                  preview.summary.renames && `${preview.summary.renames}개 제목 변경`,
                  preview.summary.creatable && `${preview.summary.creatable}개 등록`,
                ].filter(Boolean).join("하고 ")}
              </button>
            )}
          </div>
          {preview && preview.summary.creatable + preview.summary.deletes + preview.summary.renames === 0 && (
            <p className="text-right text-sm text-muted">
              {preview.normalized.rename ? `이 기간에 ‘${preview.normalized.rename.from}’ 일정이 없습니다.` : preview.normalized.rule ? "등록할 새 일정이 없습니다. 같은 일정이 이미 등록되어 있습니다." : "이 기간에 삭제할 일정이 없습니다."}
            </p>
          )}
        </form>
      </dialog>
    </>
  );
});
ManagerPatternMaker.displayName = "ManagerPatternMaker";

export default ManagerPatternMaker;
