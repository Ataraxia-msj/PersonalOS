"use client";
import Link from "next/link";
import {useRef} from 'react';
import type {AffairsTask,AffairsProject} from "../types";
import {ActionForm,type AffairsAction} from "./action-form";
import {TaskCompletionPanel} from "./task-completion-panel";
import styles from "./affairs.module.css";
const labels={todo:"待开始",in_progress:"推进中",waiting:"等待",done:"已完成",cancelled:"已取消"};
export function ActionRow({task,project,balance,action,onProtectionChange}:{task:AffairsTask;project:AffairsProject|null;balance:number;action:AffairsAction;onProtectionChange?:(active:boolean)=>void}) {
  const protection=useRef({completion:false,status:false});
  function protect(kind:'completion'|'status',active:boolean){protection.current[kind]=active;onProtectionChange?.(protection.current.completion||protection.current.status);}
  const blocked =
              project?.status === "archived" || project?.status === "completed";
  return (
              <article className={styles.taskRow}>
                <div>
                  <Link href={"/affairs/tasks/" + task.id + "/edit"}>
                    <h3>{task.title}</h3>
                  </Link>
                  <p className={styles.muted}>
                    {task.isCore ? "核心行动" : "普通事务"} ·{" "}
                    {labels[task.status]}
                    {project ? " · " + project.name : ""}
                    {task.dueDate ? " · 截止 " + task.dueDate : ""}
                  </p>
                  {task.waitingReason ? <p>{task.waitingReason}</p> : null}
                </div>
                <div className={styles.rowActions}>
                  <Link
                    className={styles.textButton}
                    href={"/affairs/tasks/" + task.id + "/edit"}
                  >
                    编辑
                  </Link>
                  <Link
                    className={styles.textButton}
                    href={"/affairs/tasks/" + task.id + "/edit#task-history"}
                  >
                    查看历史
                  </Link>
                  {!blocked ? (
                    <>
                      <TaskCompletionPanel
                        task={task}
                        currentBalance={balance}
                        action={action}
                        onProtectionChange={active=>protect('completion',active)}
                      />
                      {task.status !== "done" ? (
                        <details>
                          <summary className={styles.textButton}>
                            更改状态
                          </summary>
                          <ActionForm
                            action={action}
                            operation="set_affairs_task_status"
                            identity={task}
                            submitLabel="保存状态"
                            onProtectionChange={active=>protect('status',active)}
                          >
                            <label>
                              状态
                              <select name="status" defaultValue={task.status}>
                                <option value="todo">待开始</option>
                                <option value="in_progress">推进中</option>
                                <option value="waiting">等待</option>
                                <option value="cancelled">已取消</option>
                              </select>
                            </label>
                            <label>
                              等待说明
                              <input
                                name="waiting_reason"
                                defaultValue={task.waitingReason ?? ""}
                              />
                            </label>
                          </ActionForm>
                        </details>
                      ) : null}
                    </>
                  ) : null}
                  {blocked ? (
                    <span className={styles.muted}>请先恢复项目</span>
                  ) : null}
                </div>
              </article>
  );
}
