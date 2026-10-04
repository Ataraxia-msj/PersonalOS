"use client";
import {useState} from "react";
import Link from "next/link";
import type {AffairsProjectsData} from "../types";
import {formatProgressRate} from "../format";
import styles from "./affairs.module.css";
export function ProjectList({projects,mainlines}:AffairsProjectsData) {
 const [filter,setFilter]=useState('current'),[mainline,setMainline]=useState('all');const labels={active:'进行中',paused:'已暂停',completed:'已完成',archived:'已归档'};
 const visible=projects.filter(p=>(filter==='all'||(filter==='current'?p.status!=='archived':p.status===filter))&&(mainline==='all'||(mainline==='independent'?!p.mainlineId:p.mainlineId===mainline)));
 return <section><div className={styles.filters}>{[['current','当前项目'],['active','进行中'],['paused','已暂停'],['completed','已完成'],['archived','已归档'],['all','全部']].map(([key,label])=><button type="button" key={key} aria-pressed={filter===key} className={filter===key?styles.selectedFilter:styles.filter} onClick={()=>setFilter(key)}>{label}</button>)}<label className={styles.projectSelect}>所属主线<select value={mainline} onChange={e=>setMainline(e.target.value)}><option value="all">全部主线</option><option value="independent">独立项目</option>{mainlines.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label></div><div className={styles.projectTable}>{visible.map(p=><article key={p.id} className={styles.projectTableRow}><div><Link href={'/affairs/projects/'+p.id}>{p.name}</Link><small>{mainlines.find(m=>m.id===p.mainlineId)?.name??'独立项目'}</small></div><span className={styles.badge}>{labels[p.status]}</span><div className={styles.projectRate}>{p.progressRate!==null?<progress value={p.progressRate} max="1" aria-label={p.name+'阶段进度'}/>:null}<span>{p.progressRate===null?"—":formatProgressRate(p.progressRate)}</span></div></article>)}</div>{!visible.length?<p className={styles.muted}>暂无符合条件的项目。</p>:null}</section>;
}
