"use client";
import { useState } from "react";
import Link from "next/link";
import type {
  AffairsCoinsData,
  AffairsPenalty,
  AffairsCoinEntry,
} from "../types";
import { formatAffairsTime } from "../format";
import { CoinBalance } from "./coin-balance";
import { PenaltyForm } from "./penalty-form";
import { ActionForm, type AffairsAction } from "./action-form";
import { ConfirmationPanel } from "./confirmation-panel";
import styles from "./affairs.module.css";
const kinds = {
  task_reward: "核心完成奖励",
  task_reward_reversal: "误完成冲销",
  redemption: "奖励兑换",
  redemption_refund: "兑换退款",
  penalty: "手动惩罚",
  penalty_reversal: "惩罚冲销",
};
function LedgerRow({ entry: e }: { entry: AffairsCoinEntry }) {
  return (
    <tr id={"coin-" + e.id}>
      <td>
        <strong>#{e.walletSequence}</strong>
        <small>生效：{formatAffairsTime(e.postedAt)}</small>
        <small>发生：{formatAffairsTime(e.occurredAt)}</small>
      </td>
      <td>
        <p>{e.descriptionSnapshot}</p>
        <span className={styles.badge}>{kinds[e.kind]}</span>
        <div className={styles.sourceLinks}>
          {e.taskId ? (
            <Link href={"/affairs/tasks/" + e.taskId + "/edit"}>查看行动</Link>
          ) : e.redemptionId ? (
            <Link href={"/affairs/shop#redemption-" + e.redemptionId}>
              查看兑换
            </Link>
          ) : e.penaltyId ? (
            <Link href={"/affairs/coins#penalty-" + e.penaltyId}>查看惩罚</Link>
          ) : null}
          {e.reversesEventId ? (
            <Link href={"/affairs/coins?event=" + e.reversesEventId}>
              查看原记录
            </Link>
          ) : null}
        </div>
      </td>
      <td className={e.amount > 0 ? styles.positive : styles.negative}>
        {e.amount > 0 ? "+" : ""}
        {e.amount}
      </td>
      <td>{e.balanceAfter}</td>
    </tr>
  );
}
export function CoinLedger({
  data,
  action,
}: {
  data: AffairsCoinsData;
  action: AffairsAction;
}) {
  const [selected, setSelected] = useState<AffairsPenalty | null>(null);
  return (
    <>
      <header className={styles.sectionHeader}>
        <div>
          <h1>金币记录</h1>
          <p className={styles.muted}>每一笔获得与支出，都有来处</p>
        </div>
        <div className={styles.rowActions}>
          <CoinBalance balance={data.balance} />
          <PenaltyForm
            currentBalance={data.balance}
            tasks={data.tasks}
            action={action}
            serverNowISO={data.serverNowISO}
          />
        </div>
      </header>
      <div className={styles.notice}>
        <p>核心行动完成 +1 · 普通事务 +0 · 手动惩罚 −1</p>
        <small className={styles.muted}>
          每累计 30 分钟有效投入 +1：计时奖励第二阶段接入。
        </small>
      </div>
      {data.balance < 0 ? (
        <p className={styles.muted}>
          当前为虚拟欠额，只影响奖励兑换，不限制任务，也不产生利息或自动追加惩罚。
        </p>
      ) : null}
      {data.linkedEntry ? (
        <section className={styles.section}>
          <h2>关联原记录</h2>
          <div className={styles.tableScroll}>
            <table className={styles.ledger}>
              <tbody>
                <LedgerRow entry={data.linkedEntry} />
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      <div className={styles.tableScroll}>
        <table className={styles.ledger}>
          <thead>
            <tr>
              <th>生效序号 / 时间</th>
              <th>记录</th>
              <th>变动</th>
              <th>操作后余额</th>
            </tr>
          </thead>
          <tbody>
            {data.ledger.map((e) => (
              <LedgerRow key={e.id} entry={e} />
            ))}
          </tbody>
        </table>
      </div>
      {!data.ledger.length ? (
        <p className={styles.empty}>暂无金币流水。</p>
      ) : null}
      <div className={styles.rowActions}>
        <Link className={styles.textButton} href="/affairs/coins">
          最新记录
        </Link>
        {data.nextBeforeSequence ? (
          <Link
            className={styles.secondaryButton}
            href={"/affairs/coins?before=" + data.nextBeforeSequence}
          >
            更早记录
          </Link>
        ) : null}
      </div>
      <details className={styles.section}>
        <summary>惩罚与撤销记录</summary>
        {data.penalties.length ? (
          data.penalties.map((p) => (
            <article
              className={styles.taskRow}
              id={"penalty-" + p.id}
              key={p.id}
            >
              <div>
                <h3>{p.reason}</h3>
                <p className={styles.muted}>
                  发生：{formatAffairsTime(p.occurredAt)} · 扣除 1 金币
                </p>
                {p.reversedAt ? (
                  <p className={styles.muted}>
                    已撤销：{p.reversedReason} ·{" "}
                    {formatAffairsTime(p.reversedAt)}
                  </p>
                ) : null}
              </div>
              {!p.reversedAt ? (
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={() => setSelected(p)}
                >
                  撤销错误惩罚
                </button>
              ) : null}
            </article>
          ))
        ) : (
          <p className={styles.muted}>暂无手动惩罚。</p>
        )}
      </details>
      <ConfirmationPanel
        open={selected !== null}
        title="撤销错误惩罚"
        onClose={() => setSelected(null)}
      >
        {selected ? (
          <>
            <p>{selected.reason}</p>
            <p>确认后追加 +1 金币冲销，原扣费记录保留。只能撤销一次。</p>
            <ActionForm
              action={action}
              operation="reverse_affairs_penalty"
              identity={selected}
              submitLabel="确认撤销 · +1 金币"
            >
              <label>
                撤销原因
                <textarea name="reason" required />
              </label>
            </ActionForm>
          </>
        ) : null}
      </ConfirmationPanel>
    </>
  );
}
