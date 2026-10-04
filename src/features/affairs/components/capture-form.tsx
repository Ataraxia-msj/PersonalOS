"use client";
import {ActionForm,type AffairsAction} from "./action-form";
import styles from "./affairs.module.css";
export function CaptureForm({action,onSaved}:{action:AffairsAction;onSaved?:()=>void}) {
  return <ActionForm operation="create_affairs_inbox_entry" action={action} resetOnSuccess receiptDisplay="none" submitLabel="放入收集箱" onState={s=>{if(s.status==='success'&&s.receipt) onSaved?.();}}>
    <label className={styles.label}>收集内容<textarea name="content" required rows={2} placeholder="先记下来，稍后再整理…" onKeyDown={e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)&&!e.nativeEvent.isComposing){e.preventDefault();e.currentTarget.form?.requestSubmit();}}}/></label>
  </ActionForm>;
}
