"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { initialBudgetActionState, type BudgetActionState } from "@/lib/finance/budget-action-state";
import { moneyToCents } from "@/lib/finance/budget-validation";
import type { BudgetFormData } from "../types";
import styles from "./finance.module.css";

export type BudgetFormAction = (state: BudgetActionState, data: FormData) => Promise<BudgetActionState>;
function SaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" className={styles.expenseSubmit} disabled={pending || disabled}>{pending ? "正在保存…" : "保存预算"}</button>;
}
export function BudgetForm({ data, action }: { data: BudgetFormData; action: BudgetFormAction }) {
  const [state, formAction] = useActionState(action, initialBudgetActionState);
  const [month, setMonth] = useState(data.period?.month ?? data.defaultMonth);
  const [income, setIncome] = useState(data.period ? String(data.period.income) : "");
  const [amounts, setAmounts] = useState<Record<string, string>>(() => Object.fromEntries(
    data.buckets.map((bucket) => [bucket.id, bucket.amount === null ? "" : String(bucket.amount)]),
  ));
  const readOnly = !!data.period && (data.period.status !== "active" || data.period.currency !== "CNY");
  const collision = !data.period && data.periods.find((period) => period.startDate.slice(0, 7) <= month && period.endDate.slice(0, 7) >= month);
  const cents = Object.values(amounts).map(moneyToCents);
  const total = cents.some((value) => value === null) ? null : cents.reduce<number>((sum, value) => sum + value!, 0);
  const incomeCents = moneyToCents(income);
  const format = (value: number | null) => value === null ? "—" : (value / 100).toLocaleString("zh-CN", { style: "currency", currency: "CNY" });
  const groups = [
    { title: "消费预算", buckets: data.buckets.filter((bucket) => bucket.kind === "expense") },
    { title: "资金安排", buckets: data.buckets.filter((bucket) => bucket.kind !== "expense") },
  ];
  return <section className={styles.expenseWorkspace} aria-label="预算设置">
    <Link href="/finance/budget" className={styles.expenseBackLink}>← 返回预算</Link>
    <div className={styles.expenseHeading}><p className={styles.eyebrow}>MONTHLY BUDGET</p>
      <h2>{data.period ? "调整预算" : "创建预算"}</h2><p>保存即生效，按交易日期和已保存的预算分类自动归集。</p></div>
    {readOnly ? <p role="status" className={styles.expenseNotice}>该预算已关闭、为旧草稿或非人民币预算，目前仅供查看。</p> : null}
    <form action={formAction} className={styles.expenseForm}>
      <input type="hidden" name="periodId" value={data.period?.id ?? ""} />
      <input type="hidden" name="version" value={data.period?.updatedAt ?? ""} />
      <div className={styles.expenseFormGrid}>
        <label className={styles.expenseField}><span>月份</span><input aria-label="月份" type="month" name="month" required min="0001-01" max="9999-12"
          readOnly={!!data.period} value={month} onChange={(event) => setMonth(event.target.value)} /></label>
        <label className={styles.expenseField}><span>计划收入</span><input aria-label="计划收入" name="plannedIncome" type="number" min="0" step="0.01" max="999999999999.99" required
          readOnly={readOnly} value={income} onChange={(event) => setIncome(event.target.value)} /></label>
      </div>
      {collision ? <p role="alert" className={styles.expenseNotice}>该月份已有预算。<Link href={`/finance/budget/${collision.id}/edit`}>打开已有预算</Link></p> : null}
      {groups.map((group) => <section key={group.title} className={styles.budgetFormSection}>
        <h3>{group.title}</h3><div className={styles.expenseFormGrid}>
          {group.buckets.map((bucket) => <label key={bucket.id} className={styles.expenseField}>
            <span>{bucket.name}{!bucket.active ? "（已停用，保留原值）" : ""}</span>
            <input aria-label={bucket.name} aria-describedby={state.errors[`allocation:${bucket.id}`] ? `error-${bucket.id}` : undefined}
              type="number" min="0" max="999999999999.99" step="0.01" required name={`allocation:${bucket.id}`}
              readOnly={readOnly || !bucket.active} value={amounts[bucket.id] ?? ""}
              onChange={(event) => setAmounts((previous) => ({ ...previous, [bucket.id]: event.target.value }))} />
            {state.errors[`allocation:${bucket.id}`] ? <small id={`error-${bucket.id}`} className={styles.expenseFieldError}>{state.errors[`allocation:${bucket.id}`]}</small> : null}
          </label>)}
        </div>
      </section>)}
      {!data.buckets.length ? <p className={styles.expenseNotice}>暂无真实预算分类，暂时不能保存。</p> : null}
      <div className={styles.budgetPlanTotals}><span>计划分配 <strong>{format(total)}</strong></span>
        <span>未分配 <strong>{format(total !== null && incomeCents !== null ? incomeCents - total : null)}</strong></span></div>
      {total !== null && incomeCents !== null && total > incomeCents ? <p className={styles.expenseNotice}>计划超过收入，需要动用结余。</p> : null}
      {state.message ? <div role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? styles.expenseError : styles.expenseNotice}>
        <span>{state.message}{state.result ? <> <Link href={`/finance/budget?period=${state.result.budget_period_id}`}>查看已保存预算</Link></> : null}</span>
      </div> : null}
      {Object.entries(state.errors).filter(([key]) => !key.startsWith("allocation:")).map(([key, error]) => <p role="alert" key={key} className={styles.expenseFieldError}>{error}</p>)}
      <div className={styles.expenseActions}><p>不重复记账；明确“不计入预算”的支出始终排除。</p>
        {!readOnly ? <SaveButton disabled={!!collision || !data.buckets.length || state.status === "success"} /> : null}</div>
    </form>
  </section>;
}
