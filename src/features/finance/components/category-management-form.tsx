"use client";

import { IconArrowLeft, IconExclamationCircle } from "@tabler/icons-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { initialCategoryManagementActionState, type CategoryManagementActionState } from "@/lib/finance/category-management-action-state";
import type { CategoryEditData, ExpenseBudgetBucketOption } from "@/lib/finance/category-management-types";
import type { CategoryType } from "@/lib/finance/types";
import styles from "./finance.module.css";

type Action = (previous: CategoryManagementActionState, data: FormData) => Promise<CategoryManagementActionState>;
const noActivation: Action = async () => ({ ...initialCategoryManagementActionState, status: "error", message: "当前页面不支持修改分类状态。" });
function clone(source: FormData) { const result = new FormData(); for (const [key, value] of source.entries()) result.append(key, value); return result; }

export function CategoryManagementForm({ action, activationAction = noActivation, buckets, initialValues, mode }: {
  action: Action; activationAction?: Action; buckets: ExpenseBudgetBucketOption[]; initialValues?: CategoryEditData; mode: "create" | "edit";
}) {
  const [requestId, setRequestId] = useState("");
  const [categoryType, setCategoryType] = useState<CategoryType>(initialValues?.categoryType ?? "expense");
  const [state, setState] = useState(initialCategoryManagementActionState);
  const [activationState, setActivationState] = useState(initialCategoryManagementActionState);
  const [latestUpdatedAt, setLatestUpdatedAt] = useState(initialValues?.updatedAt);
  const [pending, startTransition] = useTransition(); const [activationPending, startActivation] = useTransition();
  const unresolved = useRef<FormData | null>(null);
  const typeLocked = mode === "edit" && Boolean(initialValues?.typeLocked);
  const unavailableDefault = initialValues?.defaultBudgetBucketId
    && !buckets.some((bucket) => bucket.id === initialValues.defaultBudgetBucketId);
  const active = activationState.status === "success" && typeof activationState.isActive === "boolean" ? activationState.isActive : initialValues?.isActive ?? true;
  useEffect(() => { if (mode === "create") setRequestId(crypto.randomUUID()); }, [mode]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending || state.status === "success") return;
    const current = new FormData(event.currentTarget); let data = current;
    if (mode === "create") { if (!unresolved.current) unresolved.current = clone(current); data = clone(unresolved.current); }
    startTransition(async () => { try {
      let next = await action(state, data);
      if (mode === "create" && state.status === "uncertain" && next.status !== "success") next = { ...next, status: "uncertain", message: `${next.message ?? "重试未成功。"} 首次创建结果仍未确认。` };
      if (mode === "create" && next.status !== "uncertain") unresolved.current = null;
      if (mode === "edit" && next.status === "success" && next.updatedAt) setLatestUpdatedAt(next.updatedAt);
      setState(next);
    } catch { setState({ ...initialCategoryManagementActionState, status: "uncertain", message: mode === "create" ? "网络中断，未能确认创建结果；请重试同一次创建。" : "网络中断，未能确认修改结果；请刷新核对，不要立即重复提交。" }); } });
  }
  function submitActivation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (activationPending) return; const data = new FormData(event.currentTarget);
    startActivation(async () => { try { const next = await activationAction(activationState, data); if (next.status === "success" && next.updatedAt) setLatestUpdatedAt(next.updatedAt); setActivationState(next); }
      catch { setActivationState({ ...initialCategoryManagementActionState, status: "uncertain", message: "网络中断，未能确认分类状态；请刷新核对。" }); } });
  }
  const error = (name: string) => state.fieldErrors[name] ? <small className={styles.expenseFieldError}>{state.fieldErrors[name]}</small> : null;

  return <section aria-labelledby="category-management-title" className={styles.expenseWorkspace}>
    <Link className={styles.expenseBackLink} href="/finance/categories"><IconArrowLeft aria-hidden="true" size={16} />返回分类</Link>
    <header className={styles.expenseHeading}><p className={styles.eyebrow}>{mode === "create" ? "NEW CATEGORY" : "EDIT CATEGORY"}</p><h2 id="category-management-title">{mode === "create" ? "新增分类" : `编辑 ${initialValues?.name ?? "分类"}`}</h2><p>默认预算归属只影响未来交易，不会改写历史。</p></header>
    <form className={styles.expenseForm} onSubmit={submit}>
      {mode === "create" ? <input name="requestId" type="hidden" value={requestId} /> : <><input name="categoryId" type="hidden" value={initialValues?.id} /><input name="expectedUpdatedAt" type="hidden" value={latestUpdatedAt} /></>}
      <fieldset className={styles.accountFormFieldset} disabled={state.status === "success"}>
        <div className={styles.expenseFormGrid}>
          <label className={styles.expenseField}><span>分类名称</span><input name="name" required maxLength={200} defaultValue={initialValues?.name ?? ""} />{error("name")}</label>
          <label className={styles.expenseField}><span>分类类型</span><select aria-label="分类类型" name="categoryType" value={categoryType} disabled={typeLocked} onChange={(event) => setCategoryType(event.target.value as CategoryType)}><option value="expense">支出</option><option value="income">收入</option></select>{typeLocked ? <input name="categoryType" type="hidden" value={categoryType} /> : null}{error("categoryType")}</label>
          {categoryType === "expense" ? <label className={styles.expenseField}><span>默认预算分类（可选）</span><select name="defaultBudgetBucketId" defaultValue={unavailableDefault ? "" : initialValues?.defaultBudgetBucketId ?? ""}><option value="">{unavailableDefault ? `原默认“${initialValues?.defaultBudgetBucketName ?? "未知"}”已停用，请重新选择` : "不自动归入预算"}</option>{buckets.map((bucket) => <option key={bucket.id} value={bucket.id}>{bucket.name}</option>)}</select>{error("defaultBudgetBucketId")}</label> : null}
          <label className={styles.expenseField}><span>排序</span><input name="sortOrder" type="number" min="0" max="2147483647" step="1" required defaultValue={initialValues?.sortOrder ?? 0} />{error("sortOrder")}</label>
          <label className={`${styles.expenseField} ${styles.expenseDescription}`}><span>备注（可选）</span><input name="note" maxLength={1000} defaultValue={initialValues?.note ?? ""} />{error("note")}</label>
        </div>
        {typeLocked ? <p className={styles.expenseNotice}><IconExclamationCircle aria-hidden="true" size={16} />该分类已有交易，支出/收入类型已锁定。</p> : null}
        {state.message ? <p role={state.status === "error" || state.status === "uncertain" ? "alert" : "status"} className={state.status === "error" ? styles.expenseError : styles.expenseNotice}>{state.message}</p> : null}
        <div className={styles.expenseActions}><p>保存不会修改已有交易或预算执行历史。</p><button className={styles.expenseSubmit} disabled={pending || state.status === "success" || (mode === "edit" && state.status === "uncertain")} type="submit">{pending ? "正在保存…" : state.status === "uncertain" && mode === "create" ? "重试同一次创建" : mode === "create" ? "保存分类" : "保存修改"}</button></div>
      </fieldset>
    </form>
    {mode === "edit" && initialValues ? <section className={styles.accountStatusPanel} aria-label="分类状态"><div><h3>分类状态</h3><p>停用后不会出现在新交易中，历史数据仍然保留。</p></div><form onSubmit={submitActivation}><input name="categoryId" type="hidden" value={initialValues.id} /><input name="expectedUpdatedAt" type="hidden" value={latestUpdatedAt} /><input name="isActive" type="hidden" value={String(!active)} /><button className={styles.accountDangerAction} disabled={activationPending || activationState.status === "uncertain"} type="submit">{activationPending ? "正在处理…" : active ? "停用分类" : "重新启用分类"}</button></form>{activationState.message ? <p role={activationState.status === "error" || activationState.status === "uncertain" ? "alert" : "status"} className={activationState.status === "error" ? styles.expenseError : styles.expenseNotice}>{activationState.message}</p> : null}</section> : null}
  </section>;
}
