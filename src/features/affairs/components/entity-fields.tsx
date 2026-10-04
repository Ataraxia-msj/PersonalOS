"use client";
import {useState} from "react";
import type {AffairsTask,AffairsProject,AffairsMainline} from "../types";
import styles from "./affairs.module.css";
export function TaskFields({initialValues:v,projects,titleLabel="行动名称"}:{initialValues?:Partial<AffairsTask>|null;projects:AffairsProject[];titleLabel?:string}) {
  const [core,setCore]=useState(v?.isCore??false);
  return <>
    <label>{titleLabel}<input name="title" required defaultValue={v?.title??""}/></label>
    <label>所属项目<select name="project_id" defaultValue={v?.projectId??""}><option value="">独立行动 / 零散事务</option>{projects.filter(p=>!['archived','completed'].includes(p.status)||p.id===v?.projectId).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <label className={styles.checkLabel}><input type="checkbox" checked={core} onChange={e=>setCore(e.target.checked)} disabled={v?.everCompleted??false}/>核心行动</label><input type="hidden" name="is_core" value={String(core)}/>
    {core?<><label>推进的目标<textarea name="core_reason" required defaultValue={v?.coreReason??""}/></label><label>完成条件<textarea name="completion_criteria" required defaultValue={v?.completionCriteria??""}/></label></>:<><input type="hidden" name="core_reason" value=""/><input type="hidden" name="completion_criteria" value=""/></>}
    <details><summary>更多选项</summary><label>截止日期（可选）<input name="due_date" type="date" defaultValue={v?.dueDate??""}/></label><label>说明<textarea name="description" defaultValue={v?.description??""}/></label></details>
  </>;
}
export function ProjectFields({initialValues:v,mainlines}:{initialValues?:Partial<AffairsProject>|null;mainlines:AffairsMainline[]}) {
  return <><label>项目名称<input name="name" required defaultValue={v?.name??""}/></label><label>想获得的成果<textarea name="outcome" required defaultValue={v?.outcome??""}/></label><label>所属主线<select name="mainline_id" defaultValue={v?.mainlineId??""}><option value="">不关联主线</option>{mainlines.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label><details><summary>更多选项</summary><label>截止日期（可选）<input name="due_date" type="date" defaultValue={v?.dueDate??""}/></label><label>说明<textarea name="description" defaultValue={v?.description??""}/></label></details></>;
}
