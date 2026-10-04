"use client";
import {useRef,useState} from 'react';
import Link from 'next/link';
import type {AffairsInboxData,AffairsInboxEntry} from '../types';
import type {InboxStatus} from '@/lib/affairs/inbox-types';
import type {AffairsAction} from './action-form';
import {CaptureForm} from './capture-form';
import {InboxList} from './inbox-list';
import {InboxResolvePanel} from './inbox-resolve-panel';
import {GuardedPanel,canLeaveAffairsForm} from './guarded-panel';
import styles from './affairs.module.css';
export function InboxWorkspace({data,status,action,entryId}:{data:AffairsInboxData;status:InboxStatus;action:AffairsAction;entryId?:string}) {
 const [selected,setSelected]=useState<AffairsInboxEntry|null>(()=>data.entries.find(e=>e.id===entryId)??null),[drawer,setDrawer]=useState(false);const root=useRef<HTMLDivElement>(null);
 function select(e:AffairsInboxEntry){if(e.id===selected?.id||!canLeaveAffairsForm(root.current))return;setDrawer(window.matchMedia?.('(max-width:1023px)').matches??false);setSelected(e);}
 function close(){if(canLeaveAffairsForm(root.current))setSelected(null);}
 const pane=selected?<InboxResolvePanel key={selected.id} entry={selected} data={data} action={action} onSaved={()=>setSelected(null)}/>:null;
 return <><div className={styles.captureBar}><CaptureForm action={action}/></div><nav className={styles.filters} aria-label="收集状态">{([['pending','待整理'],['resolved','已整理'],['discarded','已丢弃']] as const).map(([key,label])=><Link className={status===key?styles.selectedFilter:styles.filter} href={'/affairs/inbox?status='+key} key={key} aria-current={status===key?'page':undefined}>{label}{status===key?' · '+data.entries.length:''}</Link>)}</nav><div className={selected&&!drawer?styles.inboxGrid:styles.inboxSingle}><InboxList entries={data.entries} selected={selected?.id??null} onSelect={select}/>{drawer?<GuardedPanel open={!!selected} title="整理收集" onClose={close}><div ref={root}>{pane}</div></GuardedPanel>:selected?<aside ref={root} className={styles.inboxAside}><button type="button" className={styles.textButton} onClick={close}>关闭整理</button>{pane}</aside>:null}</div></>;
}
