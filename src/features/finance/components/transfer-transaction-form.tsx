"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { transferLabels, type TransferActionState, type TransferFormData, type TransferPurpose } from "@/lib/finance/transfer-types";
import { validateTransferInput } from "@/lib/finance/transfer-validation";
import styles from "./finance.module.css";
import transferStyles from "./transfer.module.css";

const pendingKey = "personal-os:pending-transfer:v1";

export function TransferTransactionForm({ action, data, defaultOccurredAt }: {
  action: (data: FormData) => Promise<TransferActionState>;
  data: TransferFormData;
  defaultOccurredAt: string;
}) {
  const router = useRouter();
  const [purpose, setPurpose] = useState<TransferPurpose>("general");
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [bucketId, setBucketId] = useState("");
  const [state, setState] = useState<TransferActionState | null>(null);
  const [ready, setReady] = useState(false);
  const [occurredAt, setOccurredAt] = useState(defaultOccurredAt);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);
  const submitted = useRef<FormData | null>(null);
  const uncertain = state?.status === "uncertain";
  const saved = state?.status === "success";
  const sources = data.accounts.filter((account) => account.accountClass === "asset");
  const source = sources.find((account) => account.id === fromId);
  const destinations = data.accounts.filter((account) => source && account.id !== fromId
    && account.currency === source.currency && account.accountClass === (purpose === "debt" ? "liability" : "asset"));
  const buckets = data.budgetBuckets.filter((bucket) => purpose !== "general" && bucket.kind === purpose);
  const canSubmit = Boolean(source && destinations.some((account) => account.id === toId));
  const accountLabel = (account: TransferFormData["accounts"][number]) => `${account.name} · 估算 ${account.currency} ${new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(account.balance)}`;

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(pendingKey);
      if (stored) {
        const values: unknown = JSON.parse(stored);
        if (!Array.isArray(values) || values.length > 12) throw new Error("Invalid pending request");
        const payload = new FormData();
        for (const pair of values) {
          if (!Array.isArray(pair) || pair.length !== 2 || pair.some((value) => typeof value !== "string")) throw new Error("Invalid pending request");
          payload.set(pair[0], pair[1]);
        }
        if (!validateTransferInput(payload).args) throw new Error("Invalid pending request");
        submitted.current = payload;
        setFromId(String(payload.get("fromAccountId")));
        setToId(String(payload.get("toAccountId")));
        setPurpose(String(payload.get("purpose")) as TransferPurpose);
        setBucketId(String(payload.get("budgetBucketId") ?? ""));
        setOccurredAt(String(payload.get("occurredAt")));
        setAmount(String(payload.get("amount")));
        setDescription(String(payload.get("description")));
        setState({ status: "uncertain", errors: {}, result: null, message: "已恢复上一次未确认的转账。请核对原内容，再重试同一次转账。" });
      }
      setReady(true);
    } catch {
      setState({ status: "error", errors: {}, result: null, message: "无法读取浏览器中的转账重试信息，请先核对交易记录并检查浏览器存储设置，暂不允许新建转账。" });
    }
  }, []);

  useEffect(() => {
    if (!uncertain && !pending) return;
    const preventExit = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", preventExit);
    return () => window.removeEventListener("beforeunload", preventExit);
  }, [uncertain, pending]);

  function changePurpose(next: TransferPurpose) {
    setPurpose(next);
    setToId("");
    const matching = data.budgetBuckets.filter((bucket) => next !== "general" && bucket.kind === next);
    setBucketId(matching.length === 1 ? matching[0].id : "");
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || inFlight.current || saved || (!uncertain && !canSubmit)) return;
    if (!uncertain) {
      const payload = new FormData(event.currentTarget);
      try {
        payload.set("requestId", crypto.randomUUID());
        // Preserve identity before any possible server write; never automatically replay it.
        sessionStorage.setItem(pendingKey, JSON.stringify(Array.from(payload.entries())));
      } catch {
        setState({ status: "error", errors: {}, result: null, message: "浏览器无法保留重试信息，本次未提交。请检查浏览器存储设置。" });
        return;
      }
      submitted.current = payload;
    }
    if (!submitted.current) return;
    const payload = submitted.current;
    inFlight.current = true;
    startTransition(async () => {
      let next: TransferActionState;
      try { next = await action(payload); }
      catch { next = { status: "uncertain", errors: {}, result: null,
        message: "尚未确认保存结果。请保留本页面，重试同一次转账，不要新建另一笔。" }; }
      // A later failure says nothing about an earlier request's commit outcome.
      if (uncertain && next.status !== "success") next = { ...next, status: "uncertain",
        message: `${next.message} 首次提交结果仍未确认，请保留原请求重试。` };
      if (next.status !== "uncertain") {
        try {
          // A detached old request can finish after a newer transfer has begun.
          // It must never delete that newer transfer's recovery identity.
          if (sessionStorage.getItem(pendingKey) === JSON.stringify(Array.from(payload.entries()))) {
            sessionStorage.removeItem(pendingKey);
          }
        }
        catch {
          // Do not turn confirmed success into another writable request.
          next = { ...next, message: `${next.message} 浏览器未能清理重试信息，重新打开时请核对原记录。` };
          setReady(false);
        }
      }
      setState(next);
      inFlight.current = false;
      if (next.status === "success") router.refresh();
    });
  }

  return <section className={styles.expenseWorkspace} aria-label="新增转账">
    <Link className={styles.expenseBackLink} href="/finance/transactions">← 返回交易</Link>
    <header className={styles.expenseHeading}>
      <p className={styles.eyebrow}>TRANSFER</p><h2>记录转账</h2>
      <p>本人同币种账户之间的资金移动，不计入收入或支出。</p>
    </header>
    {!saved ? <form aria-label="转账表单" onSubmit={submit} className={styles.expenseForm}>
      <fieldset disabled={!ready || pending || uncertain} className={transferStyles.fields}>
        <div className={styles.expenseFormGrid}>
          <label className={styles.expenseField}><span>用途</span>
            <select name="purpose" value={purpose} onChange={(e) => changePurpose(e.target.value as TransferPurpose)}>
              {Object.entries(transferLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className={styles.expenseField}><span>日期 / 时间（北京时间）</span>
            <input name="occurredAt" type="datetime-local" step="1" required value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
          </label>
          <label className={styles.expenseField}><span>转出账户</span>
            <select name="fromAccountId" required value={fromId} onChange={(e) => { setFromId(e.target.value); setToId(""); }}>
              <option value="">选择资产账户</option>
              {uncertain && fromId && !sources.some((account) => account.id === fromId) ? <option value={fromId}>原转出账户 {fromId}（当前不可选）</option> : null}
              {sources.map((account) => <option key={account.id} value={account.id}>{accountLabel(account)}</option>)}
            </select>
          </label>
          <label className={styles.expenseField}><span>转入账户</span>
            <select name="toAccountId" required value={toId} onChange={(e) => setToId(e.target.value)} disabled={!source}>
              <option value="">{purpose === "debt" ? "选择负债账户" : "选择资产账户"}</option>
              {uncertain && toId && !destinations.some((account) => account.id === toId) ? <option value={toId}>原转入账户 {toId}（当前不可选）</option> : null}
              {destinations.map((account) => <option key={account.id} value={account.id}>{accountLabel(account)}</option>)}
            </select>
          </label>
          <label className={styles.expenseField}><span>金额</span>
            <input aria-label="金额" name="amount" type="number" inputMode="decimal" min="0.01" max="999999999999.99" step="0.01" required placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <small>币种：{source?.currency ?? "请先选择转出账户"}</small>
          </label>
          {purpose !== "general" ? <label className={styles.expenseField}><span>预算分类</span>
            <select name="budgetBucketId" value={bucketId} onChange={(e) => setBucketId(e.target.value)}>
              <option value="">不指定预算分类</option>
              {uncertain && bucketId && !buckets.some((bucket) => bucket.id === bucketId) ? <option value={bucketId}>原预算分类 {bucketId}（当前不可选）</option> : null}
              {buckets.map((bucket) => <option key={bucket.id} value={bucket.id}>{bucket.name}</option>)}
            </select>
          </label> : null}
          <label className={`${styles.expenseField} ${styles.expenseDescription}`}><span>描述</span>
            <input name="description" required maxLength={1000} placeholder="例如：转入本月储蓄" value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
        </div>
        <p className={styles.expenseNotice}>{purpose === "general" ? "普通转账不占用预算。储蓄或投资资金转回时也选择普通转账，不算收入。"
          : purpose === "debt" ? "仅记录还款本金，负债余额随之减少；利息、手续费请另记一笔支出。"
            : "按累计投入计入预算；转回不冲减，再次投入会继续累计。不代表净资产增加。"}</p>
        {purpose !== "general" ? <p className={styles.expenseNotice}>{bucketId
          ? "预算按交易的北京时间归属。尚未建立该月预算时先保存归属，之后建预算会自动计入；已关闭月份不修改。"
          : "未选择预算分类：仍可记账，但不会计入预算，且当前版本暂不能补改转账归属。"}</p> : null}
        {!sources.length ? <p role="status" className={styles.expenseNotice}>没有可用的转出资产账户，请先检查账户数据。</p>
          : source && !destinations.length ? <p role="status" className={styles.expenseNotice}>没有符合用途、币种的转入账户。</p> : null}
        <p className={styles.expenseNotice}>账户显示的是估算余额，不作为余额不足时的记账限制。请勿补录校准时点之前的资金移动，否则可能不改变当前余额。</p>
      </fieldset>
      {state ? <div role="alert" className={styles.expenseNotice}>
        <p>{state.message}</p>
        {Object.entries(state.errors).map(([key, message]) => <p key={key}>{message}</p>)}
        {uncertain ? <p>请勿关闭或刷新本页。需要重新登录时请在新标签页登录，再返回这里重试。</p> : null}
      </div> : null}
      <div className={styles.expenseActions}><p>确认成功后读取真实财务数据，不预先修改余额。</p>
        <button className={styles.expenseSubmit} type="submit" disabled={!ready || pending || (!uncertain && !canSubmit)}>
          {pending ? "正在记录…" : uncertain ? "重试同一次转账" : "记录转账"}
        </button>
      </div>
    </form> : <div role="status" className={styles.expenseNotice}>
      <p>{state.message}</p>
      <Link className={styles.viewAll} href="/finance/transactions">查看交易记录 →</Link>
    </div>}
  </section>;
}
