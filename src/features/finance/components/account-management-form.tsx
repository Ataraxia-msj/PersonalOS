"use client";

import { IconArrowLeft, IconExclamationCircle } from "@tabler/icons-react";
import Link from "next/link";
import { useEffect, useState, useTransition, type FormEvent } from "react";

import {
  initialAccountManagementActionState,
  type AccountManagementActionState,
} from "@/lib/finance/account-management-action-state";
import type { AccountEditData } from "@/lib/finance/account-management-types";
import { ACCOUNT_TYPES_BY_CLASS } from "@/lib/finance/account-management-validation";
import type { AccountClass, AccountType } from "@/lib/finance/types";

import styles from "./finance.module.css";

type Action = (previous: AccountManagementActionState, data: FormData) => Promise<AccountManagementActionState>;

const typeLabels: Record<AccountType, string> = {
  bank: "银行账户", cash: "现金", consumer_credit: "消费信贷", credit_card: "信用卡",
  ewallet: "电子钱包", investment: "投资账户", loan: "贷款", money_market: "货币基金",
  other: "其他", payable: "应付款", receivable: "应收款", time_deposit: "定期存款",
  wallet_pocket: "钱包子账户",
};

const noActivation: Action = async () => ({
  ...initialAccountManagementActionState,
  message: "当前页面不支持修改账户状态。",
  status: "error",
});

function SubmitButton({ mode, done, pending, uncertain }: {
  mode: "create" | "edit"; done: boolean; pending: boolean; uncertain: boolean;
}) {
  const normal = mode === "create" ? "保存账户" : "保存修改";
  return (
    <button className={styles.expenseSubmit} disabled={done || pending} type="submit">
      {pending ? "正在保存…" : uncertain && mode === "create" ? "重试同一次创建" : normal}
    </button>
  );
}

function ActivationButton({ active, pending }: { active: boolean; pending: boolean }) {
  return (
    <button className={styles.accountDangerAction} disabled={pending} type="submit">
      {pending ? "正在处理…" : active ? "停用账户" : "重新启用账户"}
    </button>
  );
}

export function AccountManagementForm({
  action,
  activationAction = noActivation,
  defaultBalanceAt,
  initialValues,
  mode,
}: {
  action: Action;
  activationAction?: Action;
  defaultBalanceAt?: string;
  initialValues?: AccountEditData;
  mode: "create" | "edit";
}) {
  const [requestId, setRequestId] = useState("");
  const [accountClass, setAccountClass] = useState<AccountClass>(initialValues?.accountClass ?? "asset");
  const initialType = initialValues?.accountType ?? ACCOUNT_TYPES_BY_CLASS.asset[0];
  const [accountType, setAccountType] = useState<AccountType>(initialType);
  const [state, setState] = useState(initialAccountManagementActionState);
  const [activationState, setActivationState] = useState(initialAccountManagementActionState);
  const [pending, startTransition] = useTransition();
  const [activationPending, startActivationTransition] = useTransition();
  const structureLocked = mode === "edit" && Boolean(initialValues?.structureLocked);

  useEffect(() => {
    if (mode === "create") setRequestId(crypto.randomUUID());
  }, [mode]);

  function changeClass(next: AccountClass) {
    setAccountClass(next);
    if (!(ACCOUNT_TYPES_BY_CLASS[next] as readonly string[]).includes(accountType)) {
      setAccountType(ACCOUNT_TYPES_BY_CLASS[next][0]);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || state.status === "success") return;
    const data = new FormData(event.currentTarget);
    startTransition(async () => setState(await action(state, data)));
  }

  function submitActivation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activationPending) return;
    const data = new FormData(event.currentTarget);
    startActivationTransition(async () => setActivationState(await activationAction(activationState, data)));
  }

  const fieldError = (name: string) => state.fieldErrors[name]
    ? <small className={styles.expenseFieldError}>{state.fieldErrors[name]}</small>
    : null;

  return (
    <section aria-labelledby="account-management-title" className={styles.expenseWorkspace}>
      <Link className={styles.expenseBackLink} href="/finance/accounts">
        <IconArrowLeft aria-hidden="true" size={16} stroke={1.7} />
        返回账户
      </Link>
      <header className={styles.expenseHeading}>
        <p className={styles.eyebrow}>{mode === "create" ? "NEW ACCOUNT" : "EDIT ACCOUNT"}</p>
        <h2 id="account-management-title">{mode === "create" ? "新增账户" : `编辑 ${initialValues?.name ?? "账户"}`}</h2>
        <p>{mode === "create" ? "建立账户及第一条真实余额快照。" : "修改账户资料；余额请使用校准功能更新。"}</p>
      </header>

      <form onSubmit={submit} className={styles.expenseForm}>
        {mode === "create" ? <input name="requestId" type="hidden" value={requestId} /> : (
          <>
            <input name="accountId" type="hidden" value={initialValues?.id} />
            <input name="expectedUpdatedAt" type="hidden" value={initialValues?.updatedAt} />
          </>
        )}
        <fieldset className={styles.accountFormFieldset} disabled={state.status === "success"}>
          <div className={styles.expenseFormGrid}>
            <label className={styles.expenseField}><span>账户名称</span>
              <input name="name" maxLength={200} required defaultValue={initialValues?.name ?? ""} />
              {fieldError("name")}
            </label>
            <label className={styles.expenseField}><span>机构（可选）</span>
              <input name="institution" maxLength={200} defaultValue={initialValues?.institution ?? ""} />
              {fieldError("institution")}
            </label>
            <label className={styles.expenseField}><span>资产 / 负债</span>
              <select aria-label="资产 / 负债" disabled={structureLocked} name="accountClass" value={accountClass}
                onChange={(event) => changeClass(event.target.value as AccountClass)}>
                <option value="asset">资产</option><option value="liability">负债</option>
              </select>
              {structureLocked ? <input name="accountClass" type="hidden" value={accountClass} /> : null}
              {fieldError("accountClass")}
            </label>
            <label className={styles.expenseField}><span>账户类型</span>
              <select aria-label="账户类型" disabled={structureLocked} name="accountType" value={accountType}
                onChange={(event) => setAccountType(event.target.value as AccountType)}>
                {ACCOUNT_TYPES_BY_CLASS[accountClass].map((type) => <option key={type} value={type}>{typeLabels[type]}</option>)}
              </select>
              {structureLocked ? <input name="accountType" type="hidden" value={accountType} /> : null}
              {fieldError("accountType")}
            </label>
            <label className={styles.expenseField}><span>币种</span>
              <input aria-label="币种" disabled={structureLocked} name="currency" maxLength={3} pattern="[A-Z]{3}"
                required defaultValue={initialValues?.currency ?? "CNY"} />
              {structureLocked ? <input name="currency" type="hidden" value={initialValues?.currency ?? "CNY"} /> : null}
              {fieldError("currency")}
            </label>
            <label className={styles.expenseField}><span>排序</span>
              <input name="sortOrder" type="number" min="0" step="1" required defaultValue={initialValues?.sortOrder ?? 0} />
              {fieldError("sortOrder")}
            </label>
            {mode === "create" ? <>
              <label className={styles.expenseField}><span>当前余额</span>
                <input aria-label="当前余额" name="initialBalance" type="number" min="0" max="999999999999.99"
                  step="0.01" inputMode="decimal" placeholder="0.00" required />
                {fieldError("initialBalance")}
              </label>
              <label className={styles.expenseField}><span>余额时间（北京时间）</span>
                <input aria-label="余额时间（北京时间）" name="balanceAt" type="datetime-local" step="1"
                  max="9999-12-31T23:59:59" required defaultValue={defaultBalanceAt} />
                {fieldError("balanceAt")}
              </label>
            </> : null}
            <label className={`${styles.expenseField} ${styles.expenseDescription}`}><span>备注（可选）</span>
              <input name="note" maxLength={1000} defaultValue={initialValues?.note ?? ""} />
              {fieldError("note")}
            </label>
            <label className={styles.expenseBudgetExclusion}>
              <input name="includeInNetWorth" type="checkbox" defaultChecked={initialValues?.includeInNetWorth ?? true} />
              <span><strong>计入净资产</strong><small>关闭后，账户仍保留余额与历史，但不会进入净资产汇总。</small></span>
            </label>
          </div>
          {structureLocked ? <p className={styles.expenseNotice}>
            <IconExclamationCircle aria-hidden="true" size={16} />账户已有余额或交易，资产/负债类别、账户类型和币种已锁定。
          </p> : null}
          {state.message ? <p role={state.status === "error" || state.status === "uncertain" ? "alert" : "status"}
            className={state.status === "error" ? styles.expenseError : styles.expenseNotice}>{state.message}</p> : null}
          <div className={styles.expenseActions}>
            <p>{mode === "create" ? "保存时会同时建立第一条余额快照；不会生成收支交易。" : "账户余额请在账户列表使用“校准 / 历史”更新。"}</p>
            <SubmitButton mode={mode} done={state.status === "success"} pending={pending} uncertain={state.status === "uncertain"} />
          </div>
        </fieldset>
      </form>

      {mode === "edit" && initialValues ? <section className={styles.accountStatusPanel} aria-label="账户状态">
        <div><h3>账户状态</h3><p>{initialValues.isActive ? "停用后不会出现在新交易的账户选项中，历史数据仍保留。" : "重新启用后可继续用于新交易。"}</p></div>
        <form onSubmit={submitActivation}>
          <input name="accountId" type="hidden" value={initialValues.id} />
          <input name="expectedUpdatedAt" type="hidden" value={initialValues.updatedAt} />
          <input name="isActive" type="hidden" value={String(!initialValues.isActive)} />
          <ActivationButton active={initialValues.isActive} pending={activationPending} />
        </form>
        {activationState.message ? <p role={activationState.status === "error" || activationState.status === "uncertain" ? "alert" : "status"}
          className={activationState.status === "error" ? styles.expenseError : styles.expenseNotice}>{activationState.message}</p> : null}
      </section> : null}
    </section>
  );
}
