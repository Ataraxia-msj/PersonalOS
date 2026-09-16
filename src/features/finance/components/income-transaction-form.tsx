"use client";

import { IconArrowLeft, IconCheck, IconExclamationCircle } from "@tabler/icons-react";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  initialIncomeActionState,
  type IncomeActionState,
} from "@/lib/finance/income-types";

import { formatCurrency } from "../format";
import type { IncomeTransactionFormData } from "../types";
import styles from "./finance.module.css";

export type IncomeTransactionFormAction = (data: FormData) => Promise<IncomeActionState>;

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className={styles.expenseSubmit} disabled={disabled || pending} type="submit">
      {pending ? "正在记录…" : "记录收入"}
    </button>
  );
}

export function IncomeTransactionForm({ action, data, defaultOccurredAt }: {
  action: IncomeTransactionFormAction;
  data: IncomeTransactionFormData;
  defaultOccurredAt: string;
}) {
  const [requestId, setRequestId] = useState("");
  const [state, formAction] = useActionState(
    async (_previous: IncomeActionState, formData: FormData) => action(formData),
    initialIncomeActionState,
  );
  const formDisabled = !requestId || data.accounts.length === 0 || data.categories.length === 0;

  useEffect(() => {
    setRequestId(crypto.randomUUID());
  }, []);

  return (
    <section aria-labelledby="income-title" className={styles.expenseWorkspace}>
      <Link className={styles.expenseBackLink} href="/finance/transactions">
        <IconArrowLeft aria-hidden="true" size={16} stroke={1.7} />
        返回交易记录
      </Link>

      <div className={styles.expenseHeading}>
        <p className={styles.eyebrow}>NEW INCOME</p>
        <h2 id="income-title">新增收入</h2>
        <p>记录一笔已到账收入。收入只进入资产账户，不占用预算分类。</p>
      </div>

      <form action={formAction} className={styles.expenseForm}>
        <input name="requestId" type="hidden" value={requestId} />
        <div className={styles.expenseFormGrid}>
          <label className={styles.expenseField}>
            <span>日期 / 时间（北京时间）</span>
            <input
              aria-label="日期 / 时间（北京时间）"
              defaultValue={defaultOccurredAt}
              max="9999-12-31T23:59:59"
              name="occurredAt"
              required
              step="1"
              type="datetime-local"
            />
            {state.errors.occurredAt ? <small className={styles.expenseFieldError}>{state.errors.occurredAt}</small> : null}
          </label>

          <label className={styles.expenseField}>
            <span>金额</span>
            <span className={styles.expenseAmountInput}>
              <i>¥</i>
              <input aria-label="金额" inputMode="decimal" max="999999999999.99"
                min="0.01" name="amount" placeholder="0.00" required step="0.01" type="number" />
            </span>
            {state.errors.amount ? <small className={styles.expenseFieldError}>{state.errors.amount}</small> : null}
          </label>

          <label className={styles.expenseField}>
            <span>入账账户</span>
            <select aria-label="入账账户" defaultValue={data.accounts[0]?.id} name="accountId" required>
              {data.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} · {formatCurrency(account.balance, 2)}
                </option>
              ))}
            </select>
            {data.accounts.length === 0 ? <small>暂无可用的真实资产账户。</small> : null}
            {state.errors.accountId ? <small className={styles.expenseFieldError}>{state.errors.accountId}</small> : null}
          </label>

          <label className={styles.expenseField}>
            <span>收入分类</span>
            <select aria-label="收入分类" defaultValue={data.categories[0]?.id} name="categoryId" required>
              {data.categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
            {data.categories.length === 0 ? <small>暂无启用的真实收入分类。</small> : null}
            {state.errors.categoryId ? <small className={styles.expenseFieldError}>{state.errors.categoryId}</small> : null}
          </label>

          <label className={`${styles.expenseField} ${styles.expenseDescription}`}>
            <span>描述</span>
            <input aria-label="描述" maxLength={1000} name="description"
              placeholder="例如：九月工资、奖学金、兼职收入" required type="text" />
            {state.errors.description ? <small className={styles.expenseFieldError}>{state.errors.description}</small> : null}
          </label>
        </div>

        {state.message ? (
          <div className={state.status === "error" ? styles.expenseError : styles.expenseNotice}
            role={state.status === "error" ? "alert" : "status"}>
            {state.status === "success"
              ? <IconCheck aria-hidden="true" size={18} stroke={1.8} />
              : <IconExclamationCircle aria-hidden="true" size={18} stroke={1.8} />}
            <span>{state.message}</span>
          </div>
        ) : null}

        <div className={styles.expenseActions}>
          <p>原子写入 journal entry 和一条正数 journal line；成功后读取真实财务数据。</p>
          <SubmitButton disabled={formDisabled || state.status === "success"} />
        </div>
      </form>
    </section>
  );
}
