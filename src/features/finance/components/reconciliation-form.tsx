"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import type { ReconciliationActionState, ReconciliationPageData } from "@/lib/finance/reconciliation-types";
import { shanghaiDateTime } from "@/lib/finance/reconciliation-validation";
import styles from "./finance.module.css";
import calibration from "./reconciliation.module.css";

type Action = (previous: ReconciliationActionState, data: FormData) => Promise<ReconciliationActionState>;
const idle: ReconciliationActionState = { status: "idle", errors: {}, message: null, preview: null, result: null };
const sources = { manual: "手动", import: "导入", system: "系统" };
export function ReconciliationForm({ data, previewAction, saveAction }: {
  data: ReconciliationPageData; previewAction: Action; saveAction: Action;
}) {
  const router = useRouter();
  const [state, setState] = useState<ReconciliationActionState>(idle);
  const [pending, startTransition] = useTransition();
  const [balance, setBalance] = useState("");
  const [snapshotAt, setSnapshotAt] = useState(data.defaultSnapshotAt);
  const [note, setNote] = useState("");
  const account = data.account;
  const debt = account.account_class === "liability";
  const currency = state.preview?.row.currency ?? account.currency;
  const money = (amount: number) => new Intl.NumberFormat("zh-CN", { style: "currency", currency, minimumFractionDigits: 2 }).format(amount);
  const time = (value: string) => shanghaiDateTime(new Date(value)).replace("T", " ");

  function handlePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    startTransition(async () => {
      try { setState(await previewAction(idle, values)); }
      catch { setState({ ...idle, status: "error", message: "读取失败，请检查网络后重试。" }); }
    });
  }
  function handleSave() {
    const preview = state.preview;
    if (!preview || pending) return;
    const values = new FormData();
    Object.entries({ accountId: preview.input.accountId, snapshotAt: shanghaiDateTime(new Date(preview.input.snapshotAt)),
      balance: String(preview.input.balance), note: preview.input.note ?? "", requestId: preview.requestId,
      expectedBalance: String(preview.row.estimated_balance), expectedSnapshotId: preview.row.latest_snapshot_id ?? "",
    }).forEach(([key, value]) => values.set(key, value));
    startTransition(async () => {
      let next: ReconciliationActionState;
      try { next = await saveAction(idle, values); }
      catch { next = { ...idle, status: "uncertain", message: "网络中断，未能确认结果。请重试同一次校准或返回账户核对历史。" }; }
      // A failed retry cannot tell us whether an earlier request committed.
      if (state.status === "uncertain" && next.status !== "success") {
        next = { ...next, status: "uncertain", message: `${next.message ?? "重试未成功。"} 首次保存结果仍未确认，请保留同一次校准重试，或返回账户核对历史。` };
      }
      setState({ ...next, preview: next.status === "success" ? null : preview });
      if (next.status === "success") router.refresh();
    });
  }
  const difference = state.preview ? state.preview.input.balance - state.preview.row.estimated_balance : 0;

  return <section className={styles.expenseWorkspace} aria-label="账户余额校准">
    <Link className={styles.expenseBackLink} href="/finance/accounts">← 返回账户</Link>
    <header className={styles.expenseHeading}>
      <p className={styles.eyebrow}>BALANCE RECONCILIATION</p>
      <h2>{account.account_name} · 余额校准</h2>
      <p>以实际{debt ? "欠款" : "余额"}作为新的计算基准，不生成收支或预算记录。</p>
    </header>
    <p className={calibration.current}>当前系统估算{debt ? "欠款" : "余额"} <strong>{money(account.estimated_balance)}</strong><small>{account.currency}</small></p>
    {!account.include_in_net_worth ? <p className={styles.expenseNotice}>此账户未纳入净资产，校准不会改变净资产汇总。</p> : null}
    {!account.is_active ? <p role="status" className={styles.expenseNotice}>账户已停用，仅可查看快照历史。</p> : null}

    {account.is_active && !state.preview && state.status !== "success" ? <form onSubmit={handlePreview} className={styles.expenseForm}>
      <input type="hidden" name="accountId" value={account.account_id} />
      <fieldset disabled={pending} className={calibration.fields}>
        <div className={styles.expenseFormGrid}>
          <label className={styles.expenseField}><span>核对时间（北京时间）</span>
            <input name="snapshotAt" type="datetime-local" step="1" required value={snapshotAt} onChange={(e) => setSnapshotAt(e.target.value)} />
          </label>
          <label className={styles.expenseField}><span>{debt ? "实际欠款" : "实际余额"}</span>
            <input aria-label={debt ? "实际欠款" : "实际余额"} aria-describedby={debt ? "debt-help" : undefined}
              name="balance" type="number" inputMode="decimal" min="0" max="999999999999.99" step="0.01" required
              value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0.00" />
            {debt ? <small id="debt-help">正数填写欠款，还清填写 0；不要填写负数。</small> : null}
          </label>
          <label className={`${styles.expenseField} ${styles.expenseDescription}`}><span>备注（可选）</span>
            <input name="note" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如：核对微信钱包余额" />
          </label>
        </div>
        <p className={styles.expenseNotice}>实际金额应对应所选时间，并已包含该时刻及之前发生的收支。选择过去时间可能改变历史净资产。</p>
        <div className={styles.expenseActions}><p>校准前的交易不会再次累加；后续新交易继续更新余额。</p>
          <button className={styles.expenseSubmit} disabled={pending} type="submit">{pending ? "正在核对…" : "查看校准差额"}</button>
        </div>
      </fieldset>
    </form> : null}

    {state.preview ? <section aria-label="校准确认" className={calibration.preview}>
      <h3>确认校准</h3><p>{time(state.preview.input.snapshotAt)} · 北京时间</p>
      <dl className={calibration.metrics}>
        <div><dt>该时点系统估算</dt><dd>{money(state.preview.row.estimated_balance)}</dd></div>
        <div><dt>{debt ? "实际欠款" : "实际余额"}</dt><dd>{money(state.preview.input.balance)}</dd></div>
        <div><dt>校准差额（不是收支）</dt><dd data-testid="reconciliation-difference">{difference > 0 ? "+" : ""}{money(difference)}</dd></div>
      </dl>
      {state.preview.input.note ? <p className={calibration.note}>备注：{state.preview.input.note}</p> : null}
      {state.preview.row.has_later_snapshot ? <p className={styles.expenseNotice}>该账户已有更晚的快照。本次保存的是历史快照，当前余额仍以更晚的快照为准；历史净资产可能变化。</p> : null}
      <div className={calibration.buttons}>
        {state.status !== "uncertain" ? <button className={calibration.secondary} type="button" disabled={pending} onClick={() => setState(idle)}>返回修改</button> : null}
        {state.status === "preview" || state.status === "uncertain" ? <button type="button" className={styles.expenseSubmit} disabled={pending} onClick={handleSave}>
          {pending ? "正在保存…" : state.status === "uncertain" ? "重试同一次校准" : "确认校准"}
        </button> : null}
      </div>
    </section> : null}
    {state.message ? <p role={state.status === "error" || state.status === "uncertain" ? "alert" : "status"}
      className={state.status === "error" ? styles.expenseError : styles.expenseNotice}>{state.message}</p> : null}
    {Object.entries(state.errors).map(([key, error]) => <p role="alert" className={styles.expenseFieldError} key={key}>{error}</p>)}
    {state.status === "success" ? <Link className={styles.viewAll} href="/finance/accounts">查看账户余额 →</Link> : null}

    <section className={calibration.history} aria-label="余额快照历史">
      <h3>快照历史</h3><p>仅展示核对时间、实际金额和备注，不保存历史校准差额。时间均为北京时间。</p>
      {data.snapshots.length ? <div className={styles.tableWrap}><table className={styles.dataTable}>
        <thead><tr><th>核对时间</th><th>{debt ? "实际欠款" : "实际余额"}</th><th>来源</th><th>备注</th></tr></thead>
        <tbody>{data.snapshots.map((snapshot) => <tr key={snapshot.id}>
          <td data-label="核对时间"><time dateTime={snapshot.snapshot_at}>{time(snapshot.snapshot_at)}</time></td>
          <td data-label={debt ? "实际欠款" : "实际余额"}>{money(snapshot.balance)}</td>
          <td data-label="来源">{sources[snapshot.source]}</td><td className={calibration.note} data-label="备注">{snapshot.note ?? "—"}</td>
        </tr>)}</tbody>
      </table></div> : <p className={styles.emptyState}>暂无余额快照</p>}
    </section>
  </section>;
}
