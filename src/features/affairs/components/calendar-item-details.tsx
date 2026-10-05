"use client";
import Link from "next/link";
import type {CalendarItem} from "../schedule";
import type {AffairsTask,AffairsProject} from "../types";
import type {AffairsAction} from "./action-form";
import {GuardedPanel} from "./guarded-panel";
import styles from "./month-calendar.module.css";
const labels:Record<string,string>={active:"进行中",paused:"已暂停",todo:"待开始",in_progress:"推进中",waiting:"等待",done:"已完成",cancelled:"已取消",completed:"已完成",archived:"已归档"};
export function CalendarItemDetails({item,task,onClose,onComplete}:{item:CalendarItem;task:AffairsTask|null;project:AffairsProject|null;balance:number;action:AffairsAction;onClose:()=>void;onComplete?:()=>void}) {
 const date=item.startDate&&item.endDate?item.startDate+" — "+item.endDate:item.endDate??item.startDate??"未安排";
 return <GuardedPanel open title={item.title} onClose={onClose}>
  <dl className={styles.detailFields}><dt>日期</dt><dd>{date}</dd>{item.time?<><dt>时间</dt><dd>{item.time} · 上海</dd></>:null}
  {item.projectName?<><dt>所属项目</dt><dd>{item.projectName}</dd></>:null}<dt>状态</dt><dd>{labels[item.status]??item.status}</dd></dl>
  <Link className={styles.editLink} href={item.href}>{item.resource==="project"?"查看 / 编辑项目":"编辑行动"}</Link>
  {task&&onComplete?<button type="button" className={styles.editLink} onClick={onComplete}>确认完成</button>:null}
 </GuardedPanel>;
}
