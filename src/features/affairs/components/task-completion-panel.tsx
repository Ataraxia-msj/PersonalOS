"use client";
import { useState } from "react";
import { IconCoin } from "@tabler/icons-react";
import type { AffairsTask } from "../types";
import type { AffairsActionState } from "@/lib/affairs/action-state";
import { ActionForm, type AffairsAction } from "./action-form";
import { GuardedPanel } from "./guarded-panel";
import {IconSquare} from "@tabler/icons-react";
import styles from "./affairs.module.css";
export function TaskCompletionPanel({
  task,
  currentBalance,
  action,
  onProtectionChange,
  triggerVariant="default", initialMode=null, hideTrigger=false, onClose,
}: {
  task: AffairsTask;
  currentBalance: number;
  action: AffairsAction;
  onProtectionChange?: (protectedForm: boolean) => void;
  triggerVariant?: "default"|"checkbox";
  initialMode?: "complete"|null;
  hideTrigger?:boolean;
  onClose?:()=>void;
}) {
  const [mode, setMode] = useState<"complete" | "reopen" | "undo" | null>(initialMode);
  const [snapshot,setSnapshot]=useState(task);
  const current=mode?snapshot:task;
  const [feedback, setFeedback] = useState<AffairsActionState | null>(null);
  const choose = (next: "complete" | "reopen" | "undo") => {
    setFeedback(null);
    setSnapshot(task);
    setMode(next);
  };
  const title =
    mode === "complete"
      ? "确认行动完成"
      : mode === "reopen"
        ? "重新打开行动"
        : "撤销误完成";
  return (
    <>
      {!hideTrigger?<div className={styles.rowActions}>
        {task.status === "done" ? (
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => choose("reopen")}
          >
            重新打开
          </button>
        ) : task.status !== "cancelled" ? (
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => choose("complete")}
            aria-label={triggerVariant==="checkbox"?"完成："+task.title:undefined}
          >
            {triggerVariant==="checkbox"?<IconSquare size={17} aria-hidden="true"/>:"确认完成"}
          </button>
        ) : null}
        {task.everCompleted || task.status === "done" ? (
          <button
            type="button"
            className={styles.textButton}
            onClick={() => choose("undo")}
          >
            撤销误完成
          </button>
        ) : null}
      </div>:null}
      <GuardedPanel
        open={mode !== null}
        title={title}
        onClose={() => {setMode(null);onClose?.();}}
      >
        <h3>{current.title}</h3>
        <p>{current.completionCriteria || "确认这件事已实际完成。"}</p>
        <p className={styles.muted}>当前余额 {currentBalance} 金币</p>
        {mode === "reopen" ? (
          <p>保留已获得的奖励和完成贡献，再次完成不会重复发币。</p>
        ) : mode === "undo" ? (
          <p>
            仅用于误完成：撤销有效完成贡献，核心任务冲销 1
            金币。余额可以变负；之后真实完成只恢复一份奖励。
          </p>
        ) : (
          <p>
            {current.isCore
              ? "核心行动完成奖励固定 1 金币；已经领过的奖励不会重复发放。"
              : "普通事务完成不发金币，但留下真实完成贡献。"}
          </p>
        )}
        {mode ? (
          <ActionForm
            key={mode}
            action={action}
            operation={
              mode === "complete"
                ? "complete_affairs_task"
                : mode === "reopen"
                  ? "reopen_affairs_task"
                  : "undo_affairs_task_completion"
            }
            identity={current}
            onState={setFeedback}
            onProtectionChange={onProtectionChange}
            submitLabel={
              mode === "complete"
                ? current.isCore
                  ? "完成并领取 1 金币"
                  : "确认完成行动"
                : mode === "reopen"
                  ? "确认重新打开"
                  : "确认撤销误完成"
            }
          >
            {mode === "complete" ? (
              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  name="completion_confirmed"
                  value="true"
                  required
                />
                确认已满足完成条件
              </label>
            ) : mode === "undo" ? (
              <label>
                撤销原因
                <textarea name="reason" required />
              </label>
            ) : null}
          </ActionForm>
        ) : null}
        {feedback?.status === "success" &&
        feedback.receipt?.coinDelta === 1 &&
        !feedback.receipt.replayed ? (
          <div className={styles.coinSuccess} role="status">
            <IconCoin aria-hidden="true" size={28} />
            <strong>已到账 +1 金币</strong>
          </div>
        ) : null}
      </GuardedPanel>
    </>
  );
}
