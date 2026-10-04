"use client";
import {TaskFields} from "./entity-fields";
import { ActionForm, type AffairsBaseFormProps } from "./action-form";
import styles from "./affairs.module.css";
import { formatAffairsTime } from "../format";
const statusLabels = {
  todo: "待开始",
  in_progress: "推进中",
  waiting: "等待",
  done: "已完成",
  cancelled: "已取消",
};
export function TaskForm({ data, mode, action }: AffairsBaseFormProps<"task">) {
  const v = data.initialValues;
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
        <TaskFields initialValues={v} projects={data.projects}/>
      </ActionForm>
      {mode === "edit" ? (
        <section id="task-history" className={styles.section}>
          <h2>操作历史</h2>
          <p className={styles.muted}>
            完成、取消、恢复与编辑均保留原记录，重新开始不抹掉历史。
          </p>
          {data.taskHistory.length ? (
            <ol>
              {data.taskHistory.map((h) => (
                <li className={styles.taskRow} key={h.id}>
                  <div>
                    <strong>
                      {h.operation === "undo_affairs_task_completion"
                        ? "撤销误完成"
                        : h.operation === "reopen_affairs_task"
                          ? "重新打开"
                          : h.operation === "resolve_affairs_inbox_entry"
                            ? "从收集箱创建"
                            : h.operation === "create_affairs_task"
                            ? "创建行动"
                            : h.operation === "update_affairs_task"
                              ? "编辑行动"
                              : h.status
                                ? statusLabels[h.status]
                                : "状态变更"}{" "}
                      · 版本 {h.revision}
                    </strong>
                    <p className={styles.muted}>
                      {formatAffairsTime(h.appliedAt)}
                      {h.coinDelta !== 0
                        ? " · " +
                          (h.coinDelta > 0 ? "+" : "") +
                          h.coinDelta +
                          " 金币"
                        : ""}
                    </p>
                    {h.reason ? <p>{h.reason}</p> : null}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.muted}>暂无操作历史。</p>
          )}
        </section>
      ) : null}
    </section>
  );
}
