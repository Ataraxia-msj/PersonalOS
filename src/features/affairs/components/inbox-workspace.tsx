"use client";
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import Link from 'next/link';
import type {AffairsInboxData,AffairsInboxEntry} from '../types';
import type {InboxStatus} from '@/lib/affairs/inbox-types';
import type {AffairsAction} from './action-form';
import {CaptureForm} from './capture-form';
import {InboxList} from './inbox-list';
import {InboxResolvePanel} from './inbox-resolve-panel';
import {GuardedPanel,canLeaveAffairsForm} from './guarded-panel';
import styles from './affairs.module.css';
const media='(max-width:1023px)';
function subscribe(listener:()=>void){const query=window.matchMedia?.(media);query?.addEventListener('change',listener);return()=>query?.removeEventListener('change',listener);}
const narrowSnapshot=()=>window.matchMedia?.(media).matches??false;
export function InboxWorkspace({data,status,action,entryId}:{data:AffairsInboxData;status:InboxStatus;action:AffairsAction;entryId?:string}) {
 const [selected,setSelected]=useState<AffairsInboxEntry|null>(()=>data.entries.find(e=>e.id===entryId)??null);
 const narrow=useSyncExternalStore(subscribe,narrowSnapshot,()=>false);
 const root=useRef<HTMLDivElement>(null),route=useRef({status,entryId});
 useEffect(()=>{
  if(route.current.status===status&&route.current.entryId===entryId)return;
  if(root.current?.querySelector('[data-affairs-pending="true"],[data-affairs-unresolved="true"]'))return;
  route.current={status,entryId};setSelected(data.entries.find(e=>e.id===entryId)??null);
 },[status,entryId,data.entries]);
 function select(e:AffairsInboxEntry){if(e.id===selected?.id||!canLeaveAffairsForm(root.current))return;setSelected(e);}
 const pane=selected?<InboxResolvePanel key={selected.id} entry={selected} data={data} action={action} onSaved={()=>setSelected(null)}/>:null;
 return <>
  <div className={styles.captureBar}><CaptureForm action={action}/></div>
  <nav className={styles.filters} aria-label="收集状态">{([['pending','待整理'],['resolved','已整理'],['discarded','已丢弃']] as const).map(([key,label])=><Link className={status===key?styles.selectedFilter:styles.filter} href={'/affairs/inbox?status='+key} key={key} aria-current={status===key?'page':undefined}>{label}{status===key?' · '+data.entries.length:''}</Link>)}</nav>
  <div className={selected&&!narrow?styles.inboxGrid:styles.inboxSingle}>
   <InboxList entries={data.entries} selected={selected?.id??null} onSelect={select}/>
   <GuardedPanel open={!!selected} title="整理收集" inline={!narrow} onClose={()=>setSelected(null)}><div ref={root}>{pane}</div></GuardedPanel>
  </div>
 </>;
}
