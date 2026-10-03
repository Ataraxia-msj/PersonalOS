"use client";

import { useState, useTransition } from "react";

import { confirmAgentTransactionAction } from "@/app/agent-actions";
import type {
  AgentConfirmationResult,
  AgentTransactionDraft,
} from "@/lib/agent/types";

import styles from "./agent-workspace.module.css";

const typeLabels = {
  expense: "支出",
  income: "收入",
  transfer: "转账",
} as const;

const purposeLabels = {
  general: "普通转账",
  saving: "储蓄",
  investment: "投资",
  debt: "还款",
} as const;

function formatAmount(amount: number | null) {
  return amount === null
    ? "待补充"
    : `¥${amount.toLocaleString("zh-CN", {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      })}`;
}

function formatDate(value: string | null) {
  return value ? value.replace("T", " ") : "待补充";
}

interface TransactionPreviewProps {
  draft: AgentTransactionDraft;
  index: number;
  confirmAction?: (draft: AgentTransactionDraft) => Promise<AgentConfirmationResult>;
}

export function TransactionPreview({
  confirmAction = confirmAgentTransactionAction,
  draft,
  index,
}: TransactionPreviewProps) {
  const [result, setResult] = useState<AgentConfirmationResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const account = draft.type === "transfer"
    ? `${draft.fromAccountName ?? "待补充"} → ${draft.toAccountName ?? "待补充"}`
    : draft.accountName ?? "待补充";
  const budget = draft.excludeFromBudget
    ? "不计入预算"
    : draft.budgetBucketName ?? "未指定";
  const committed = result?.status === "success" || result?.status === "warning";
  const uncertain = result?.status === "uncertain";

  const confirm = () => {
    if (isPending || committed || uncertain) return;
    startTransition(async () => {
      try {
        setResult(await confirmAction(draft));
      } catch {
        setResult({
          entryId: null,
          message: "尚未确认保存结果。请先核对交易记录，不要重复提交。",
          status: "uncertain",
        });
      }
    });
  };

  return (
    <article aria-label={`交易预览 ${index + 1}`} className={styles.previewCard}>
      <header className={styles.previewHeader}>
        <div>
          <span className={styles.previewType}>{typeLabels[draft.type]}</span>
          <span className={draft.status === "ready" && result?.status !== "error" ? styles.previewReady : styles.previewNeedsInput}>
            {committed
              ? "已记录"
              : uncertain
                ? "结果待核对"
                : result?.status === "error"
                  ? "确认失败"
                  : draft.status === "ready" ? "准备确认" : "需要补充"}
          </span>
        </div>
        <strong className={styles.previewAmount}>{formatAmount(draft.amount)}</strong>
      </header>

      <p className={styles.previewDescription}>{draft.description ?? draft.sourceText}</p>

      <dl className={styles.previewGrid}>
        <div>
          <dt>日期 / 时间</dt>
          <dd>{formatDate(draft.occurredAt)}</dd>
        </div>
        <div>
          <dt>{draft.type === "transfer" ? "账户流向" : "账户"}</dt>
          <dd>{account}</dd>
        </div>
        {draft.type === "transfer" ? (
          <div>
            <dt>用途</dt>
            <dd>{draft.purpose ? purposeLabels[draft.purpose] : "待补充"}</dd>
          </div>
        ) : (
          <div>
            <dt>分类</dt>
            <dd>{draft.categoryName ?? "待补充"}</dd>
          </div>
        )}
        {draft.type !== "income" ? (
          <div>
            <dt>预算</dt>
            <dd>{budget}</dd>
          </div>
        ) : null}
      </dl>

      {draft.issues.length > 0 ? (
        <ul className={styles.previewIssues}>
          {draft.issues.map((issue) => <li key={issue}>{issue}</li>)}
        </ul>
      ) : null}

      {result ? (
        <p
          className={`${styles.confirmationMessage} ${styles[`confirmation_${result.status}`]}`}
          role={result.status === "error" || result.status === "uncertain" ? "alert" : "status"}
        >
          {result.message}
        </p>
      ) : null}

      {draft.status === "ready" ? (
        <button
          aria-label={isPending ? "正在提交" : committed ? "已记录" : uncertain ? "请先核对" : "确认并记录"}
          className={styles.confirmButton}
          disabled={isPending || committed || uncertain}
          onClick={confirm}
          type="button"
        >
          {isPending ? "正在提交…" : committed ? "已记录" : uncertain ? "请先核对交易记录" : "确认并记录"}
        </button>
      ) : null}
    </article>
  );
}
