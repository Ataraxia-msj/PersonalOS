"use client";
import Link from "next/link";
import { useState } from "react";
import {
  IconCoin,
  IconChecklist,
  IconClock,
  IconArrowRight,
} from "@tabler/icons-react";
import type { AffairsDashboardData } from "../types";
import { formatProgressRate } from "../format";
import { CoinBalance } from "./coin-balance";
import { ContributionHeatmap } from "./contribution-heatmap";
import { ProgressEntryForm } from "./progress-entry-form";
import { TaskCompletionPanel } from "./task-completion-panel";
import { ActionForm, type AffairsAction } from "./action-form";
import styles from "./affairs.module.css";
export function ProgressDashboard({
  data,
  action,
}: {
  data: AffairsDashboardData;
  action: AffairsAction;
}) {
  const [history, setHistory] = useState(false);
  const mainlines = data.mainlines.filter(
    (m) => history || m.status !== "archived",
  );
  const independent = data.tasks.filter(
    (t) =>
      t.isCore && !t.projectId && !["done", "cancelled"].includes(t.status),
  );
  return (
    <>
      <header className={styles.sectionHeader}>
        <div>
          <span className={styles.eyebrow}>AFFAIRS</span>
          <h1>事务</h1>
          <p className={styles.muted}>主线成长与奖励 · 接续上次工作</p>
        </div>
        <div className={styles.rowActions}>
          <CoinBalance balance={data.balance} shopLink />
          <ProgressEntryForm
            projects={data.projects}
            tasks={data.tasks}
            action={action}
            serverNowISO={data.serverNowISO}
          />
        </div>
      </header>
      <ContributionHeatmap
        rows={data.contributions}
        today={data.today}
        progress={data.progress}
      />
      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <h2>主线成长</h2>
          <div className={styles.rowActions}>
            <Link className={styles.textButton} href="/affairs/mainlines/new">
              新建主线
            </Link>
            <Link className={styles.textButton} href="/affairs/projects/new">
              新建项目
            </Link>
          </div>
        </header>
        <label className={styles.checkLabel}>
          <input
            type="checkbox"
            checked={history}
            onChange={(e) => setHistory(e.target.checked)}
          />
          显示归档主线
        </label>
        {mainlines.length === 0 ? (
          <p className={styles.empty}>
            先建立一条长期主线，或独立创建项目。不需要排满每天。
          </p>
        ) : (
          <div className={styles.cards}>
            {mainlines.map((m) => {
              const p = data.projects.find((p) => p.id === m.focusProjectId);
              const latest = p
                ? data.progress.find((e) => e.projectId === p.id && !e.voidedAt)
                : undefined;
              const editable =
                p &&
                !["archived", "completed"].includes(p.status) &&
                m.status !== "archived";
              return (
                <article className={styles.card} key={m.id}>
                  <header className={styles.cardHeader}>
                    <h2>{m.name}</h2>
                    <Link
                      href={"/affairs/mainlines/" + m.id + "/edit"}
                      className={styles.textButton}
                    >
                      编辑
                    </Link>
                  </header>
                  <p className={styles.muted}>
                    {m.description || "长期方向"} ·{" "}
                    {m.status === "active"
                      ? "进行中"
                      : m.status === "paused"
                        ? "已暂停"
                        : "已归档"}
                  </p>
                  <ActionForm
                    action={action}
                    operation="set_affairs_mainline_focus"
                    identity={m}
                    submitLabel="切换关注项目"
                  >
                    <label>
                      当前关注
                      <select
                        name="project_id"
                        defaultValue={m.focusProjectId ?? ""}
                      >
                        <option value="">请选择关注项目</option>
                        {data.projects
                          .filter((p) => p.mainlineId === m.id)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                              {p.status === "archived" ? "（已归档）" : ""}
                            </option>
                          ))}
                      </select>
                    </label>
                  </ActionForm>
                  {p ? (
                    <>
                      <h3 className={styles.focusProject}>{p.name}</h3>
                      <p>{p.outcome}</p>
                      <div className={styles.stageRow}>
                        <div className={styles.stageBar}>
                          {p.progressRate !== null ? (
                            <progress
                              max="1"
                              value={p.progressRate}
                              aria-label={p.name + "阶段进度"}
                            />
                          ) : null}
                          <span>{formatProgressRate(p.progressRate)}</span>
                        </div>
                        <div>
                          <strong>
                            {p.milestoneCompleted} / {p.milestoneTotal}
                          </strong>
                          <small>阶段成果</small>
                        </div>
                      </div>
                      <div className={styles.resume}>
                        <div>
                          <small>最新进展</small>
                          <p>{latest?.content || "尚未记录进展"}</p>
                        </div>
                        <div>
                          <small>下一步</small>
                          <p>
                            {latest?.nextStep ||
                              "选择一个可执行行动，或提交接续点。"}
                          </p>
                        </div>
                      </div>
                      <Link
                        className={styles.textButton}
                        href={"/affairs/projects/" + p.id}
                      >
                        继续推进 <IconArrowRight aria-hidden="true" size={16} />
                      </Link>
                      {editable ? (
                        data.tasks
                          .filter(
                            (t) =>
                              t.projectId === p.id &&
                              t.isCore &&
                              !["done", "cancelled"].includes(t.status),
                          )
                          .slice(0, 3)
                          .map((t) => (
                            <div className={styles.focusTask} key={t.id}>
                              <span>{t.title}</span>
                              <TaskCompletionPanel
                                task={t}
                                currentBalance={data.balance}
                                action={action}
                              />
                            </div>
                          ))
                      ) : (
                        <p className={styles.muted}>
                          恢复项目后继续推进，历史保留。
                        </p>
                      )}
                    </>
                  ) : (
                    <p className={styles.muted}>
                      选择关注项目后，这里会显示阶段成果和接续点。
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
      {independent.length ? (
        <section className={styles.section}>
          <h2>独立核心行动</h2>
          {independent.map((t) => (
            <article className={styles.taskRow} key={t.id}>
              <h3>{t.title}</h3>
              <TaskCompletionPanel
                task={t}
                currentBalance={data.balance}
                action={action}
              />
            </article>
          ))}
        </section>
      ) : null}
      <section className={styles.rules}>
        <h2>金币规则</h2>
        <div>
          <IconCoin aria-hidden="true" />
          <p>
            核心行动完成 <strong>+1</strong>
            <small>每个任务只保留一份净奖励</small>
          </p>
        </div>
        <div>
          <IconChecklist aria-hidden="true" />
          <p>
            普通事务不发币<small>只记录真实推进</small>
          </p>
        </div>
        <div>
          <IconClock aria-hidden="true" />
          <p>
            累计有效投入 30 分钟 <strong>+1</strong>
            <small>计时功能第二阶段接入，目前不发计时币</small>
          </p>
        </div>
      </section>
      <p className={styles.muted}>
        金币是虚拟激励，不是人民币，不影响财务资产或预算。
      </p>
    </>
  );
}
