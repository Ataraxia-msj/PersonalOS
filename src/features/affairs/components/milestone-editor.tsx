"use client";
import { useState } from "react";
import type { AffairsProject, AffairsMilestone } from "../types";
import { ActionForm, type AffairsAction } from "./action-form";
import type { MilestoneMetadata } from "@/lib/affairs/types";
import styles from "./affairs.module.css";
export function MilestoneEditor({
  project,
  milestones,
  action,
}: {
  project: AffairsProject;
  milestones: AffairsMilestone[];
  action: AffairsAction;
}) {
  const [items, setItems] = useState<MilestoneMetadata[]>(() =>
    milestones.map((m) => ({
      id: m.id,
      expected_revision: m.revision,
      title: m.title,
      completion_criteria: m.completionCriteria,
      sort_order: m.sortOrder,
    })),
  );
  const update = (
    i: number,
    k: "title" | "completion_criteria",
    value: string,
  ) =>
    setItems((rows) =>
      rows.map((r, n) => (n === i ? { ...r, [k]: value } : r)),
    );
  return (
    <details className={styles.card}>
      <summary>编辑阶段成果</summary>
      <p className={styles.muted}>
        成果进度按阶段验收计算，保存后共 {items.length}{" "}
        个阶段。已完成阶段需先撤销完成才能移除。
      </p>
      <ActionForm
        action={action}
        operation="save_affairs_milestones"
        identity={project}
        submitLabel="保存阶段成果"
      >
        <input type="hidden" name="milestones" value={JSON.stringify(items)} />
        {items.map((m, i) => (
          <div className={styles.milestoneFields} key={m.id ?? "new-" + i}>
            <label>
              阶段 {i + 1}
              <input
                required
                value={m.title}
                onChange={(e) => update(i, "title", e.target.value)}
              />
            </label>
            <label>
              验收条件
              <textarea
                required
                value={m.completion_criteria}
                onChange={(e) =>
                  update(i, "completion_criteria", e.target.value)
                }
              />
            </label>
            <button
              type="button"
              className={styles.textButton}
              disabled={
                milestones.find((old) => old.id === m.id)?.status ===
                "completed"
              }
              onClick={() => setItems((rows) => rows.filter((_, n) => n !== i))}
            >
              移除阶段
            </button>
          </div>
        ))}
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() =>
            setItems((rows) => [
              ...rows,
              {
                id: null,
                expected_revision: null,
                title: "",
                completion_criteria: "",
                sort_order: rows.length,
              },
            ])
          }
        >
          添加阶段
        </button>
      </ActionForm>
    </details>
  );
}
