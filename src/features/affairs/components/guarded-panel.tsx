"use client";
import {useRef, type ReactNode} from "react";
import {ConfirmationPanel} from "./confirmation-panel";

export function canLeaveAffairsForm(root: HTMLElement | null): boolean {
  if (root?.querySelector('[data-affairs-pending="true"],[data-affairs-unresolved="true"]')) return false;
  return !root?.querySelector('[data-affairs-dirty="true"]') || window.confirm("放弃尚未保存的内容？");
}
export function GuardedPanel({open,title,onClose,children,inline=false}:{open:boolean;title:string;onClose:()=>void;children:ReactNode;inline?:boolean}) {
  const root=useRef<HTMLDivElement>(null);
  return <ConfirmationPanel open={open} title={title} inline={inline} onClose={()=>{if(canLeaveAffairsForm(root.current)) onClose();}}><div ref={root}>{children}</div></ConfirmationPanel>;
}
