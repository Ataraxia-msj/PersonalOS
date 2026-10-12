// @vitest-environment node
// Opt-in only: node --env-file=.env.local node_modules/vitest/vitest.mjs run src/lib/agent/qwen.live.test.ts
// Set RUN_QWEN_LIVE=1 explicitly. All account/category candidates are isolated fixtures; no database writes.
import {it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {handleFinanceTurn} from './conversation/orchestrator';
import {interpretFinanceTurn} from './qwen';
import {classifyAgentMessage} from './intent';
import {financeOptions,textInput} from './conversation/test-fixtures';
import type {FinanceTurnInput} from './conversation/types';
vi.mock('@/lib/finance/service',()=>({getAgentFinanceOptions:()=>{throw new Error('Live Qwen tests prohibit database access');}}));
vi.mock('@/lib/supabase/server',()=>({createClient:()=>{throw new Error('Live Qwen tests prohibit database access');}}));

const live=it.skipIf(process.env.RUN_QWEN_LIVE!=='1');
const now=new Date('2026-10-12T10:00:00+08:00');
const dependencies={now,uuid:randomUUID,interpret:interpretFinanceTurn};
const input=(rawText:string,state:FinanceTurnInput['state']=null)=>({...textInput(rawText,state),turnId:randomUUID()});

live('real Qwen extracts the reported sentence and supports account and amount follow-up',async()=>{
 const raw='早餐7.2元，午餐16元，晚餐前的加餐6元';
 expect(await classifyAgentMessage(raw)).toBe('finance');
 const first=await handleFinanceTurn(input(raw),financeOptions,dependencies);
 expect(first.state.items.map(i=>i.draft.amount)).toEqual([7.2,16,6]);
 expect(first.state.items.map(i=>i.draft.accountId)).toEqual([null,null,null]);
 expect(first.state.pendingQuestion?.targetIds).toHaveLength(3);
 const knownIds=first.state.items.map(i=>i.draft.draftId);
 const account=await handleFinanceTurn(input('微信',first.state),financeOptions,dependencies);
 expect(account.state.items.every(i=>i.lifecycle==='ready')).toBe(true);
 const correction=await handleFinanceTurn(input('第一笔其实是7.5元',account.state),financeOptions,dependencies);
 expect(correction.state.items.map(i=>i.draft.amount)).toEqual([7.5,16,6]);
 expect(correction.state.items.map(i=>i.draft.draftId)).toEqual(knownIds);
 expect(correction.state.items.map(i=>i.draft.accountId)).toEqual(account.state.items.map(i=>i.draft.accountId));
 console.log('REAL_QWEN_CHECK',JSON.stringify({case:'reported sentence → account → amount correction',amounts:correction.state.items.map(i=>i.draft.amount),writes:0}));
},90_000);

live.each(['帮我记早餐，金额我忘了','昨天买了午饭，但是多少钱记不清了'])('real Qwen preserves missing amounts: %s',async(raw)=>{
 const result=await handleFinanceTurn(input(raw),financeOptions,dependencies);
 expect(result.state.items).toHaveLength(1);expect(result.state.items[0].draft.amount).toBeNull();
 expect(result.state.pendingQuestion?.field).toBe('amount');
 const amount=await handleFinanceTurn(input('12.5',result.state),financeOptions,dependencies);
 expect(amount.state.items[0].draft.amount).toBe(12.5);expect(amount.state.items[0].draft.draftId).toBe(result.state.items[0].draft.draftId);
 expect(amount.state.pendingQuestion?.field).toBe('accountId');
 console.log('REAL_QWEN_CHECK',JSON.stringify({case:'missing amount',question:result.message,writes:0}));
},45_000);

live('real Qwen appends another expense without inheriting an unmentioned account',async()=>{
 const first=await handleFinanceTurn(input('微信午饭20元'),financeOptions,dependencies);
 expect(first.state.items[0].lifecycle).toBe('ready');
 const result=await handleFinanceTurn(input('另外买了咖啡15元',first.state),financeOptions,dependencies);
 expect(result.state.items.map(i=>i.draft.amount)).toEqual([20,15]);
 expect(result.state.items[1].draft.accountId).toBeNull();expect(result.state.pendingQuestion?.targetIds).toEqual([result.state.items[1].draft.draftId]);
 const ambiguous=await handleFinanceTurn(input('这笔改成18元',{...result.state,pendingQuestion:null}),financeOptions,dependencies);
 expect(ambiguous.state.items.map(i=>i.draft.amount)).toEqual([20,15]);expect(ambiguous.state.pendingQuestion?.kind).toBe('target');
 console.log('REAL_QWEN_CHECK',JSON.stringify({case:'append → ambiguous correction',amounts:ambiguous.state.items.map(i=>i.draft.amount),question:ambiguous.message,writes:0}));
},100_000);
