"use client";

import type { AgentTransactionDraft } from "@/lib/agent/types";

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

export function TransactionPreview({ draft, index }: { draft: AgentTransactionDraft; index: number }) {
  const account = draft.type === "transfer"
    ? `${draft.fromAccountName ?? "待补充"} → ${draft.toAccountName ?? "待补充"}`
    : draft.accountName ?? "待补充";
  const budget = draft.excludeFromBudget
    ? "不计入预算"
    : draft.budgetBucketName ?? "未指定";

  return (
    <article aria-label={`交易预览 ${index + 1}`} className={styles.previewCard}>
      <header className={styles.previewHeader}>
        <div>
          <span className={styles.previewType}>{typeLabels[draft.type]}</span>
          <span className={draft.status === "ready" ? styles.previewReady : styles.previewNeedsInput}>
            {draft.status === "ready" ? "准备确认" : "需要补充"}
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
    </article>
  );
}
