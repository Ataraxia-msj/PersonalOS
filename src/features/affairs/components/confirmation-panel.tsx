'use client';
import {useEffect,useRef,type ReactNode} from 'react';
import {IconX} from '@tabler/icons-react';
import styles from './affairs.module.css';
export function ConfirmationPanel({open,title,onClose,children}:{open:boolean;title:string;onClose:()=>void;children:ReactNode}){
 const panel=useRef<HTMLElement>(null);const closeRef=useRef(onClose);
 useEffect(()=>{closeRef.current=onClose;},[onClose]);
 const close=()=>{if(!panel.current?.querySelector('[data-affairs-unresolved="true"],[data-affairs-pending="true"]'))closeRef.current();};
 useEffect(()=>{
 if(!open)return;const previous=document.activeElement as HTMLElement|null;const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
 const root=panel.current;const focusable=()=>Array.from(root?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled):not([type=hidden]),select:not(:disabled),textarea:not(:disabled)')??[]).filter(el=>!el.closest('[hidden]'));
 (focusable()[0]??root)?.focus();
 const key=(event:KeyboardEvent)=>{
 if(event.key==='Escape'){event.preventDefault();if(!root?.querySelector('[data-affairs-unresolved="true"],[data-affairs-pending="true"]'))closeRef.current();}
 if(event.key==='Tab'){const elements=focusable();const first=elements[0],last=elements.at(-1);if(!first){event.preventDefault();root?.focus();}else if(event.shiftKey&&(document.activeElement===first||document.activeElement===root)){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
 };
 document.addEventListener('keydown',key);return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus();};
 },[open]);
 if(!open)return null;
 return <div className={styles.backdrop} onMouseDown={e=>{if(e.target===e.currentTarget)close();}}><section className={styles.panel} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={panel}><header className={styles.panelHeader}><h2>{title}</h2><button type="button" className={styles.iconButton} aria-label="关闭确认" onClick={close}><IconX size={22}/></button></header>{children}<button type="button" className={styles.secondaryButton} onClick={close}>关闭</button></section></div>;
}

