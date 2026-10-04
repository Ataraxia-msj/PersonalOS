"use client";
import {
  useRef,
  useState,
  useEffect,
  type ReactNode,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import type { submitAffairsAction } from "@/app/affairs/actions";
import {
  initialAffairsActionState,
  type AffairsActionState,
} from "@/lib/affairs/action-state";
import type { AffairsOperation } from "@/lib/affairs/types";
import type { AffairsFormData } from "../types";
import styles from "./affairs.module.css";
export type AffairsAction = typeof submitAffairsAction;
export interface AffairsBaseFormProps<R extends AffairsFormData["resource"]> {
  data: Extract<AffairsFormData, { resource: R }>;
  mode: "create" | "edit";
  action: AffairsAction;
}
function copy(data: FormData) {
  const next = new FormData();
  for (const [key, value] of data) next.append(key, value);
  return next;
}
export function ActionForm({
  operation,
  identity,
  action,
  children,
  submitLabel = "确认保存",
  disabled = false,
  onState,
  resetOnSuccess = false,
  receiptDisplay = "full",
  onProtectionChange,
}: {
  operation: AffairsOperation;
  identity?: { id: string; revision: string };
  action: AffairsAction;
  children?: ReactNode;
  submitLabel?: string;
  disabled?: boolean;
  onState?: (state: AffairsActionState) => void;
  resetOnSuccess?: boolean;
  receiptDisplay?: "full" | "changes" | "none";
  onProtectionChange?: (protectedForm: boolean) => void;
}) {
  const router = useRouter();
  const [state, setState] = useState(initialAffairsActionState);
  const [busy, setBusy] = useState(false);
  const [formEpoch, setFormEpoch] = useState(0);
  const [dirty, setDirty] = useState(false);
  const saved = useRef<FormData | null>(null);
  const protectionCallback = useRef(onProtectionChange);
  protectionCallback.current = onProtectionChange;
  useEffect(() => {
    protectionCallback.current?.(dirty || busy || state.status === 'uncertain');
  }, [dirty, busy, state.status]);
  useEffect(() => {
    if (!dirty && !busy && state.status !== 'uncertain') return;
    const guard = (event: MouseEvent) => {
      const anchor=(event.target as Element)?.closest('a[href]');
      if (!anchor || anchor.getAttribute('href')?.startsWith('#')) return;
      if (busy || state.status === 'uncertain' || !window.confirm('放弃尚未保存的内容？')) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    document.addEventListener('click',guard,true);
    return ()=>document.removeEventListener('click',guard,true);
  },[dirty,busy,state.status]);
  const identityId = identity?.id;
  const identityRevision = identity?.revision;
  const locked =
    busy || state.status === "uncertain" || (state.status === "success" && !resetOnSuccess);
  useEffect(() => {
    if (!dirty && !busy && state.status !== "uncertain") return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state.status, dirty, busy]);
  useEffect(() => {
    const submitted = saved.current;
    // Only confirmed commands may start a new form lifecycle. Refreshing
    // unrelated props must never discard an unresolved command.
    if (state.status !== "success" || !submitted || !identityId) return;
    if (
      identityId === submitted.get("id") &&
      identityRevision === submitted.get("revision")
    )
      return;
    saved.current = null;
    setDirty(false);
    setState(initialAffairsActionState);
    setFormEpoch((n) => n + 1);
  }, [identityId, identityRevision, state.status]);
  async function send(data: FormData) {
    if (busy) return;
    setBusy(true);
    let result: AffairsActionState;
    try {
      result = await action(state, copy(data));
    } catch {
      result = {
        status: "uncertain",
        fieldErrors: {},
        receipt: null,
        message: "提交结果暂不明确，请保持原内容重试。",
      };
    }
    // Failure of this retry says nothing about the first unknown attempt.
    if (state.status === "uncertain" && result.status !== "success")
      result = { ...result, status: "uncertain", receipt: null };
    setState(result);
    setBusy(false);
    if (result.status === "success" && result.receipt) {
      setDirty(false);
      if (resetOnSuccess) {
        saved.current = null;
        setFormEpoch((n) => n + 1);
      }
    }
    onState?.(result);
    if (result.status === "success") router.refresh();
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || (state.status === "success" && !resetOnSuccess)) return;
    if (state.status === "uncertain" && saved.current) {
      void send(saved.current);
      return;
    }
    const data = new FormData(event.currentTarget);
    data.set("requestId", crypto.randomUUID());
    saved.current = copy(data);
    void send(data);
  }
  return (
    <form
      onSubmit={submit}
      className={styles.form}
      data-affairs-unresolved={state.status === "uncertain"}
      data-affairs-pending={busy}
      data-affairs-dirty={dirty}
      onChange={() => setDirty(true)}
    >
      <input type="hidden" name="operation" value={operation} />
      {identity ? (
        <>
          <input type="hidden" name="id" value={identity.id} />
          <input type="hidden" name="revision" value={identity.revision} />
        </>
      ) : null}
      <fieldset
        key={formEpoch}
        disabled={locked || disabled}
        className={styles.fieldset}
      >
        {children}
      </fieldset>
      <div
        aria-live="polite"
        role={state.status === "error" ? "alert" : "status"}
        className={styles.feedback}
      >
        {state.message ? <p>{state.message}</p> : null}
        {Object.entries(state.fieldErrors).map(([k, v]) => (
          <p key={k}>{v}</p>
        ))}
        {state.receipt && (receiptDisplay === "full" || (receiptDisplay === "changes" && state.receipt.coinDelta !== 0)) ? (
          <p>
            当次结算：{state.receipt.coinDelta > 0 ? "+" : ""}
            {state.receipt.coinDelta} 金币 · 原回执余额{" "}
            {state.receipt.balanceAtCommand} 金币
            {state.receipt.replayed ? " · 重放回执" : ""}
          </p>
        ) : null}
      </div>
      {state.status === "uncertain" ? (
        <>
          <p className={styles.muted}>
            原内容已锁定，避免重试时重复记账。先核对结果，或重试同一次提交。
          </p>
          <button
            className={styles.primaryButton}
            type="button"
            disabled={busy}
            onClick={() => saved.current && void send(saved.current)}
          >
            {busy ? "正在核对…" : "重试同一次提交"}
          </button>
        </>
      ) : (
        <button
          className={styles.primaryButton}
          type="submit"
          disabled={busy || disabled || (state.status === "success" && !resetOnSuccess)}
        >
          {busy
            ? "正在保存…"
            : state.status === "success" && !resetOnSuccess
              ? "已保存"
              : submitLabel}
        </button>
      )}
    </form>
  );
}
