"use client";
import {useEffect} from 'react';
import {canLeaveAffairsForm} from './guarded-panel';

const indexKey='__affairsHistoryIndex';
type NavigationState=Record<string,unknown> | null;
function index(state: NavigationState):number|null {
 const value=state?.[indexKey];return typeof value==='number'&&Number.isSafeInteger(value)?value:null;
}
// Preserve Next's history state; only tag navigation positions, never auth or data.
// Capture phase runs before Next's bubble-phase popstate handler. Rejected Back/
// Forward restores the existing entry rather than pushing a duplicate route.
export function AffairsNavigationGuard() {
 useEffect(()=>{
  let position=index(window.history.state)??0;
  let restoring=false;
  const push=window.history.pushState,replace=window.history.replaceState;
  replace.call(window.history,{...window.history.state,[indexKey]:position},'',window.location.href);
  const guardedPush:History['pushState']=function(this:History,data,unused,url){
   push.call(this,{...data,[indexKey]:position+1},unused,url);position+=1;
  };
  const guardedReplace:History['replaceState']=function(this:History,data,unused,url){replace.call(this,{...data,[indexKey]:position},unused,url);};
  window.history.pushState=guardedPush;window.history.replaceState=guardedReplace;
  const pop=(event:PopStateEvent)=>{
   if(restoring){event.stopImmediatePropagation();restoring=false;return;}
   const target=index(event.state);
   if(canLeaveAffairsForm(document.body)){
    position=target??position-1;
    if(target===null)replace.call(window.history,{...event.state,[indexKey]:position},'',window.location.href);
    return;
   }
   event.stopImmediatePropagation();
   const delta=target===null?1:position-target;
   if(delta!==0){restoring=true;window.history.go(delta);}
  };
  window.addEventListener('popstate',pop,true);
  return ()=>{
   window.removeEventListener('popstate',pop,true);
   if(window.history.pushState===guardedPush)window.history.pushState=push;
   if(window.history.replaceState===guardedReplace)window.history.replaceState=replace;
  };
 },[]);
 return null;
}
