"use client";

import { IconArrowLeft, IconCheck, IconExclamationCircle } from "@tabler/icons-react";
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  initialExpenseTransactionActionState,
  type ExpenseTransactionActionState,
} from "@/lib/finance/action-state";

import { formatCurrency } from "../format";
import type {
  ExpenseTransactionFormData,
  ExpenseTransactionInitialValues,
} from "../types";
import styles from "./finance.module.css";

export type ExpenseTransactionFormAction = (
  state: ExpenseTransactionActionState,
  formData: FormData,
) => Promise<ExpenseTransactionActionState>;

interface ExpenseTransactionFormProps {
  action: ExpenseTransactionFormAction;
  data: ExpenseTransactionFormData;
  defaultOccurredAt?: string;
  initialValues?: ExpenseTransactionInitialValues;
  mode?: "create" | "edit";
}

function SubmitButton({ disabled, mode }: { disabled: boolean; mode: "create" | "edit" }) {
  const { pending } = useFormStatus();

  return (
    <button className={styles.expenseSubmit} disabled={disabled || pending} type="submit">
      {pending ? (mode === "edit" ? "正在保存…" : "正在记录…") : (mode === "edit" ? "保存修改" : "记录支出")}
    </button>
  );
}

export function ExpenseTransactionForm({
  action,
  data,
  defaultOccurredAt,
  initialValues,
  mode = "create",
}: ExpenseTransactionFormProps) {
  const [state, formAction] = useActionState(action, initialExpenseTransactionActionState);
  const [occurredAt, setOccurredAt] = useState(initialValues?.occurredAt ?? defaultOccurredAt ?? "");
  const [categoryId, setCategoryId] = useState(
    initialValues?.categoryId ?? data.categories[0]?.id ?? "",
  );
  const [budgetBucketId, setBudgetBucketId] = useState(initialValues?.budgetBucketId ?? "");
  const [excludeFromBudget, setExcludeFromBudget] = useState(
    initialValues?.excludeFromBudget ?? false,
  );
  const budgetLocked = initialValues?.budgetLocked ?? false;
  const occurredDate = occurredAt.slice(0, 10);
  const matchingPeriods = useMemo(
    () => data.budgetPeriods.filter(
      (period) => period.startDate <= occurredDate && occurredDate <= period.endDate,
    ),
    [data.budgetPeriods, occurredDate],
  );
  const period = matchingPeriods.length === 1 ? matchingPeriods[0] : null;
  const category = data.categories.find((item) => item.id === categoryId) ?? null;
  const defaultBucket = period?.buckets.find(
    (bucket) => bucket.id === category?.defaultBudgetBucketId,
  ) ?? null;
  const budgetDisabled = budgetLocked
    || excludeFromBudget
    || !period
    || period.status === "closed"
    || period.buckets.length === 0;
  const formDisabled = data.accounts.length === 0 || data.categories.length === 0;

  function handleOccurredAtChange(value: string) {
    const date = value.slice(0, 10);
    const nextPeriods = data.budgetPeriods.filter(
      (item) => item.startDate <= date && date <= item.endDate,
    );
    const nextBuckets = nextPeriods.length === 1 && nextPeriods[0]?.status !== "closed"
      ? nextPeriods[0]?.buckets ?? []
      : [];
    if (!nextBuckets.some((bucket) => bucket.id === budgetBucketId)) {
      setBudgetBucketId("");
    }
    setOccurredAt(value);
  }

  return (
    <section aria-labelledby="expense-title" className={styles.expenseWorkspace}>
      <Link className={styles.expenseBackLink} href="/finance/transactions">
        <IconArrowLeft aria-hidden="true" size={16} stroke={1.7} />
        返回交易记录
      </Link>

      <div className={styles.expenseHeading}>
        <p className={styles.eyebrow}>{mode === "edit" ? "EDIT TRANSACTION" : "NEW TRANSACTION"}</p>
        <h2 id="expense-title">{mode === "edit" ? "修改支出" : "新增支出"}</h2>
        <p>
          {mode === "edit"
            ? "修改一笔已确认的普通支出。保存后以数据库返回结果为准。"
            : "记录一笔已发生的普通消费。提交后以数据库返回结果为准。"}
        </p>
      </div>

      <form action={formAction} className={styles.expenseForm}>
        {mode === "edit" && initialValues ? (
          <input name="entryId" type="hidden" value={initialValues.entryId} />
        ) : null}
        <div className={styles.expenseFormGrid}>
          <label className={styles.expenseField}>
            <span>日期 / 时间</span>
            <input
              aria-label="日期 / 时间"
              aria-describedby={state.fieldErrors.occurredAt ? "occurred-at-error" : undefined}
              max="9999-12-31T23:59"
              name="occurredAt"
              onChange={(event) => handleOccurredAtChange(event.target.value)}
              required
              type="datetime-local"
              value={occurredAt}
            />
            {state.fieldErrors.occurredAt ? (
              <small className={styles.expenseFieldError} id="occurred-at-error">
                {state.fieldErrors.occurredAt}
              </small>
            ) : null}
          </label>

          <label className={styles.expenseField}>
            <span>金额</span>
            <span className={styles.expenseAmountInput}>
              <i>¥</i>
              <input
                aria-label="金额"
                aria-describedby={state.fieldErrors.amount ? "amount-error" : undefined}
                inputMode="decimal"
                min="0.01"
                name="amount"
                placeholder="0.00"
                required
                step="0.01"
                type="number"
                defaultValue={initialValues?.amount}
              />
            </span>
            {state.fieldErrors.amount ? (
              <small className={styles.expenseFieldError} id="amount-error">
                {state.fieldErrors.amount}
              </small>
            ) : null}
          </label>

          <label className={styles.expenseField}>
            <span>账户</span>
            <select
              aria-label="账户"
              defaultValue={initialValues?.accountId ?? data.accounts[0]?.id}
              name="accountId"
              required
            >
              {data.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} · {formatCurrency(account.balance, 2)}
                </option>
              ))}
            </select>
            {data.accounts.length === 0 ? <small>暂无可用真实账户。</small> : null}
          </label>

          <label className={styles.expenseField}>
            <span>分类</span>
            <select
              aria-label="分类"
              name="categoryId"
              onChange={(event) => {
                setCategoryId(event.target.value);
                setBudgetBucketId("");
              }}
              required
              value={categoryId}
            >
              {data.categories.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
            {data.categories.length === 0 ? <small>暂无启用的真实支出分类。</small> : null}
          </label>

          <label className={styles.expenseField}>
            <span>预算分类</span>
            <select
              aria-label="预算分类"
              disabled={budgetDisabled}
              name="budgetBucketId"
              onChange={(event) => setBudgetBucketId(event.target.value)}
              value={budgetBucketId}
            >
              <option value="">
                {defaultBucket ? `自动 · ${defaultBucket.name}` : "自动使用分类默认值"}
              </option>
              {period?.buckets.map((bucket) => (
                <option key={bucket.id} value={bucket.id}>{bucket.name}</option>
              ))}
            </select>
            {budgetLocked ? (
              <small>该月份预算已关闭；可以修改交易事实，但原预算记录保持不变。</small>
            ) : excludeFromBudget ? (
              <small>该支出已明确排除预算，提交时不会创建 budget impact。</small>
            ) : matchingPeriods.length > 1 ? (
              <small className={styles.expenseFieldError}>该日期匹配到多个预算月份，提交会被拒绝。</small>
            ) : !period ? (
              <small>该日期没有预算月份；交易仍会记账，但不会计入预算。</small>
            ) : period.status === "closed" ? (
              <small>该预算月份已关闭；交易仍会记账，但不会修改预算。</small>
            ) : period.buckets.length === 0 ? (
              <small>该预算月份没有可用预算分类。</small>
            ) : (
              <small>留空时使用所选分类的默认预算分类。</small>
            )}
          </label>

          <label className={styles.expenseBudgetExclusion}>
            <input
              aria-label="不计入预算"
              checked={excludeFromBudget}
              disabled={budgetLocked}
              name="excludeFromBudget"
              onChange={(event) => {
                const checked = event.target.checked;
                setExcludeFromBudget(checked);
                if (checked) setBudgetBucketId("");
              }}
              type="checkbox"
            />
            <span>
              <strong>不计入预算</strong>
              <small>
                {budgetLocked
                  ? "已关闭月份的预算归属不可修改。"
                  : "仍计入本月支出并影响账户余额和净资产，但不占用预算。"}
              </small>
            </span>
          </label>

          <label className={`${styles.expenseField} ${styles.expenseDescription}`}>
            <span>描述</span>
            <input
              aria-label="描述"
              aria-describedby={state.fieldErrors.description ? "description-error" : undefined}
              maxLength={120}
              name="description"
              placeholder="例如：午餐、地铁、日用品"
              required
              type="text"
              defaultValue={initialValues?.description}
            />
            {state.fieldErrors.description ? (
              <small className={styles.expenseFieldError} id="description-error">
                {state.fieldErrors.description}
              </small>
            ) : null}
          </label>
        </div>

        {state.message ? (
          <div
            className={state.status === "error" ? styles.expenseError : styles.expenseNotice}
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.status === "success" ? (
              <IconCheck aria-hidden="true" size={18} stroke={1.8} />
            ) : (
              <IconExclamationCircle aria-hidden="true" size={18} stroke={1.8} />
            )}
            <span>{state.message}</span>
          </div>
        ) : null}

        <div className={styles.expenseActions}>
          <p>
            {mode === "edit"
              ? "原子更新 journal entry、journal line，并按预算状态同步 budget impact。"
              : "写入 journal entry、journal line，并在适用时写入 budget impact。"}
          </p>
          <SubmitButton
            disabled={formDisabled || matchingPeriods.length > 1}
            mode={mode}
          />
        </div>
      </form>
    </section>
  );
}
