"use client";
import { useState } from "react";
import { ActionForm, type AffairsBaseFormProps } from "./action-form";
import styles from "./affairs.module.css";
export function TaskForm({ data, mode, action }: AffairsBaseFormProps<"task">) {
  const v = data.initialValues;
  const [core, setCore] = useState(v?.isCore ?? false);
  const project = data.projects.find((p) => p.id === v?.projectId);
  const blocked =
    v?.status === "done" ||
    project?.status === "archived" ||
    project?.status === "completed";
  return (
    <section className={styles.formPage}>
      <h1>{mode === "create" ? "新建行动" : "编辑行动"}</h1>
      {blocked ? <p>请先重新打开行动或恢复项目，再编辑内容。</p> : null}
      <ActionForm
        action={action}
        operation={
          mode === "create" ? "create_affairs_task" : "update_affairs_task"
        }
        identity={v ?? undefined}
        submitLabel="保存行动"
        disabled={blocked}
      >
        <label>
          行动名称
          <input name="title" required defaultValue={v?.title ?? ""} />
        </label>
        <label>
          所属项目
          <select name="project_id" defaultValue={v?.projectId ?? ""}>
            <option value="">独立行动 / 零散事务</option>
            {data.projects
              .filter(
                (p) =>
                  !["archived", "completed"].includes(p.status) ||
                  p.id === v?.projectId,
              )
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
        <label className={styles.checkLabel}>
          <input
            type="checkbox"
            checked={core}
            onChange={(e) => setCore(e.target.checked)}
            disabled={v?.everCompleted ?? false}
          />
          核心行动
        </label>
        <input type="hidden" name="is_core" value={String(core)} />
        <p className={styles.muted}>
          {v?.everCompleted
            ? "曾完成的行动不能改变奖励资格。"
            : "核心行动完成 +1 金币；普通事务不发金币。"}
        </p>
        <label>
          推进的目标
          <textarea
            name="core_reason"
            required={core}
            defaultValue={v?.coreReason ?? ""}
          />
        </label>
        <label>
          完成条件
          <textarea
            name="completion_criteria"
            required={core}
            defaultValue={v?.completionCriteria ?? ""}
          />
        </label>
        <label>
          截止日期（可选）
          <input name="due_date" type="date" defaultValue={v?.dueDate ?? ""} />
        </label>
        <label>
          说明
          <textarea name="description" defaultValue={v?.description ?? ""} />
        </label>
      </ActionForm>
    </section>
  );
}
