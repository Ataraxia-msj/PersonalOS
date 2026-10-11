"use client";
import {IconChartLine,IconChevronDown,IconPaperclip,IconReceipt,IconSearch,IconSend2} from '@tabler/icons-react';
import {useRef,useState,type FormEvent,type KeyboardEvent} from 'react';
import {confirmAgentTransactionAction,getAgentIdentityAction,interpretAgentTurnAction} from '@/app/agent-actions';
import type {AgentTurnResult,FinanceTurn,FinanceTurnInput} from '@/lib/agent/conversation/types';
import type {AffairsConfirmAction} from './affairs-queue';
import type {checkAgentAffairsDuplicatesAction} from '@/app/agent-affairs-actions';
import {agentCommands} from './data';
import {useFinanceConversation} from './use-finance-conversation';
import {FinanceConversationPreview} from './finance-conversation-preview';
import {TransactionPreview} from './transaction-preview';
import {AffairsPreview} from './affairs-preview';
import styles from './agent-workspace.module.css';

interface AgentWorkspaceProps {
 ownerId:string;turnAction?:(input:FinanceTurnInput)=>Promise<AgentTurnResult>;
 identityAction?:typeof getAgentIdentityAction;confirmAction?:typeof confirmAgentTransactionAction;
 affairsConfirmAction?:AffairsConfirmAction;affairsDuplicateAction?:typeof checkAgentAffairsDuplicatesAction;
}
const commandIcons={search:IconSearch,trend:IconChartLine,receipt:IconReceipt} as const;
export function AgentWorkspace({ownerId,turnAction=interpretAgentTurnAction,identityAction=getAgentIdentityAction,confirmAction=confirmAgentTransactionAction,affairsConfirmAction,affairsDuplicateAction}:AgentWorkspaceProps) {
 const [input,setInput]=useState(''),[checked,setChecked]=useState(false),[protectedPreviews,setProtectedPreviews]=useState<string[]>([]);
 const [inputError,setInputError]=useState('');
 const affairsProtection=useRef(new Set<string>()),financeProtection=useRef(false),composing=useRef(false);
 const finance=useFinanceConversation({ownerId,turnAction,identityAction,confirmAction,externalBlocked:protectedPreviews.length>0,onProtectionChange:value=>{financeProtection.current=value;}});
 const inputLocked=finance.pending||finance.blocked||protectedPreviews.length>0;
 const hasConversation=finance.messages.length>0||Boolean(finance.state)||finance.blocked&&!finance.pending;
 function updateProtection(id:string,value:boolean){
  if(value)affairsProtection.current.add(id);else affairsProtection.current.delete(id);
  setProtectedPreviews([...affairsProtection.current]);
 }
 function turn(value:FinanceTurn){
  if(affairsProtection.current.size||financeProtection.current)return;
  void finance.sendTurn(value);
 }
 function submitMessage(rawMessage:string){
  const text=rawMessage.trim();if(!text||inputLocked||affairsProtection.current.size||financeProtection.current)return;
  if([...text].length>4000){setInputError('单次输入不能超过 4000 个字符，请拆分发送。');return;}
  setInputError('');
  setInput('');turn({kind:'text',rawText:text});
 }
 function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!composing.current)submitMessage(input);}
 function keyDown(event:KeyboardEvent<HTMLTextAreaElement>){
  if(event.key==='Enter'&&!event.shiftKey&&!composing.current&&!event.nativeEvent.isComposing&&event.keyCode!==229){event.preventDefault();submitMessage(input);}
 }
 return <main className={hasConversation?styles.workspaceConversation:styles.workspace}>
  {hasConversation?<section aria-live="polite" className={styles.conversation}>
   <div className={styles.conversationHeader}><span className={styles.statusDot}/><div><p>当前对话</p><small>写入前需要确认</small></div></div>
   <div className={styles.messages} role="log">{finance.messages.map(message=><article key={message.id} className={message.role==='user'?styles.userMessage:styles.agentMessage}>
    <span>{message.role==='user'?'你':'Agent'}</span><div><p role={message.error?'alert':undefined}>{message.text}</p>
     {message.interpretation?<div className={styles.interpretation}><AffairsPreview interpretation={message.interpretation} confirmAction={affairsConfirmAction} duplicateAction={affairsDuplicateAction} externalBlocked={finance.pending||finance.blocked||protectedPreviews.some(id=>id!==message.id)} onProtectionChange={value=>updateProtection(message.id,value)}/></div>:null}
    </div></article>)}
    {finance.pending?<article className={styles.agentMessage}><span>Agent</span><div className={styles.pendingReply}>正在整理内容…</div></article>:null}
   </div>
   {finance.receipts.length?<section aria-label="已记录交易回执">{finance.receipts.map(item=><TransactionPreview key={item.draft.draftId} draft={item.draft} index={item.ordinal-1} controlled={{result:item.confirmation,isPending:false,disabled:true,onConfirm:()=>{}}}/>)}</section>:null}
   {finance.state&&finance.options?<FinanceConversationPreview state={finance.state} options={finance.options} disabled={inputLocked} onTurn={turn} onConfirm={id=>{if(!affairsProtection.current.size)void finance.confirm(id);}}/>:null}
   {finance.blocked&&!finance.pending?<section className={styles.protectionPanel} aria-label="提交结果待核对"><p>有提交结果需要核对。请先查看交易记录，不要重复录入。</p><a href="/finance/transactions" target="_blank" rel="noreferrer">打开交易记录</a><label><input type="checkbox" checked={checked} onChange={event=>setChecked(event.target.checked)}/>我已核对交易记录</label><button type="button" className={styles.confirmButton} disabled={!checked} onClick={()=>{void finance.acknowledgeCheckedResult(checked);setChecked(false);}}>结束待核对保护</button></section>:null}
  </section>:<section className={styles.hero}><div className={styles.status}><span className={styles.statusDot}/>Agent 已就绪</div><h1>今天想处理什么？</h1></section>}
  <div className={hasConversation?styles.composerDock:styles.composerRegion}>
   <form className={styles.composer} onSubmit={submit}>
    <button aria-label="附件暂未开放" className={styles.iconButton} disabled type="button"><IconPaperclip aria-hidden="true" size={22} stroke={1.6}/></button>
    <textarea aria-label="给 Agent 发消息" data-agent-input disabled={inputLocked} value={input} onChange={event=>setInput(event.target.value)} onKeyDown={keyDown} onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;}} placeholder="说发生了什么，缺的信息我会接着问…" rows={1}/>
    <button aria-label="当前模型" className={styles.modelButton} disabled type="button">Qwen 3.7 Flash<IconChevronDown aria-hidden="true" size={16} stroke={1.6}/></button><span aria-hidden="true" className={styles.composerDivider}/>
    <button aria-label={finance.pending?'正在识别':'发送消息'} className={styles.sendButton} disabled={inputLocked} type="submit"><IconSend2 aria-hidden="true" size={23} stroke={1.7}/></button>
   </form>
   {inputError?<p role="alert">{inputError}</p>:null}
   {!hasConversation?<><div aria-label="建议命令" className={styles.commands}>{agentCommands.map(command=>{const Icon=commandIcons[command.icon];return <button className={styles.command} key={command.id} disabled={inputLocked} onClick={()=>setInput(command.prompt)} type="button"><Icon aria-hidden="true" size={18} stroke={1.6}/><kbd>{command.shortcut}</kbd><span>{command.label}</span></button>;})}</div><p className={styles.commandHint}>一段话可记录多笔 · 缺少的信息逐项补充 · 确认后才保存</p></>:null}
  </div>
 </main>;
}
