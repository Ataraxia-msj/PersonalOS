import type {AffairsInboxEntry} from '../types';
import {formatAffairsTime} from '../format';
import styles from './affairs.module.css';
export function InboxList({entries,selected,onSelect}:{entries:AffairsInboxEntry[];selected:string|null;onSelect:(entry:AffairsInboxEntry)=>void}) {return <div className={styles.inboxList}>{entries.map(e=><button key={e.id} type="button" aria-pressed={selected===e.id} className={styles.inboxItem} onClick={()=>onSelect(e)}><span>{e.content}</span><small>{formatAffairsTime(e.createdAt)}</small></button>)}{!entries.length?<p className={styles.muted}>这里暂时没有记录。</p>:null}</div>;}
