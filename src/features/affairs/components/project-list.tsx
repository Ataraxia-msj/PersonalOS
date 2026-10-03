"use client";
import { useState } from "react";
import Link from "next/link";
import type { AffairsProject } from "../types";
import styles from "./affairs.module.css";
export function ProjectList({ projects }: { projects: AffairsProject[] }) {
  const [history, setHistory] = useState(false);
  const visible = projects.filter((p) => history || p.status !== "archived");
  return (
    <section>
      <header className={styles.sectionHeader}>
        <div>
          <h1>项目</h1>
          <p className={styles.muted}>
            用阶段成果看见成长，不用任务数量代替成果。
          </p>
        </div>
        <Link className={styles.primaryButton} href="/affairs/projects/new">
          新建项目
        </Link>
      </header>
      <label className={styles.checkLabel}>
        <input
          type="checkbox"
          checked={history}
          onChange={(e) => setHistory(e.target.checked)}
        />
        显示归档历史
      </label>
      <div className={styles.cards}>
        {visible.map((p) => (
          <Link
            className={styles.card}
            key={p.id}
            href={"/affairs/projects/" + p.id}
          >
            <span className={styles.eyebrow}>
              {p.status === "active"
                ? "推进中"
                : p.status === "paused"
                  ? "已暂停"
                  : p.status === "completed"
                    ? "已完成"
                    : "已归档"}
            </span>
            <h2>{p.name}</h2>
            <p>{p.outcome}</p>
            {p.progressRate === null ? (
              <p className={styles.muted}>尚未设置阶段成果</p>
            ) : (
              <>
                <progress
                  max="1"
                  value={p.progressRate}
                  aria-label={p.name + "阶段进度"}
                />
                <p>
                  {Math.round(p.progressRate * 100)}% · {p.milestoneCompleted} /{" "}
                  {p.milestoneTotal} 阶段成果
                </p>
              </>
            )}
          </Link>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className={styles.empty}>
          还没有项目。可以独立创建，也可以关联一条长期主线。
        </p>
      ) : null}
    </section>
  );
}
