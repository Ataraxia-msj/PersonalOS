"use client";
import { useState } from "react";
import type { AffairsProject, AffairsTask } from "../types";
import { shanghaiInput } from "@/lib/affairs/validation";
import { ActionForm, type AffairsAction } from "./action-form";
import { GuardedPanel } from "./guarded-panel";
import styles from "./affairs.module.css";
export function ProgressEntryForm({
  projects,
  tasks,
  action,
  serverNowISO,
  embedded=false,
  onSaved,
}: {
  projects: AffairsProject[];
  tasks: AffairsTask[];
  action: AffairsAction;
  serverNowISO: string;
  embedded?:boolean;
  onSaved?:()=>void;
}) {
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState("");
  const available = projects.filter(
    (p) => !["archived", "completed"].includes(p.status),
  );
  const form=(<ActionForm
          operation="record_affairs_progress"
          action={action}
          submitLabel="保存进展"
          resetOnSuccess={embedded} receiptDisplay={embedded?"none":"full"}
          onState={s=>{if(s.status==='success'&&s.receipt)onSaved?.();}}
        >
          <label>
            项目
            <select
              name="project_id"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">不关联项目</option>
              {available.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            行动（可选）
            <select key={projectId} name="task_id" defaultValue="">
              <option value="">不关联行动</option>
              {tasks
                .filter((t) =>
                  projectId ? t.projectId === projectId : !t.projectId,
                )
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
            </select>
          </label>
          <label>
            做了什么
            <textarea name="content" required />
          </label>
          <label>
            下次从哪里继续
            <textarea name="next_step" />
          </label>
          <label>
            实际时间
            <input
              name="occurred_at"
              type="datetime-local"
              required
              defaultValue={shanghaiInput(new Date(serverNowISO))}
            />
          </label>
        </ActionForm>);
  if(embedded) return form;
  return <><button className={styles.primaryButton} type="button" onClick={()=>setOpen(true)}>提交进展</button><GuardedPanel open={open} title="提交进展" onClose={()=>setOpen(false)}>{form}</GuardedPanel></>;
}
