"use client";
import type {FinanceQuestion,FinanceTurn} from '@/lib/agent/conversation/types';
import styles from './agent-workspace.module.css';
export function ClarificationQuestion({question,disabled,onSelect}:{question:FinanceQuestion;disabled:boolean;onSelect:(turn:Extract<FinanceTurn,{kind:'selection'}>)=>void}) {
 return <section className={styles.question} aria-label="当前问题"><p>{question.text}</p>
  {question.choices.length?<div className={styles.questionChoices}>{question.choices.map(choice=><button type="button" key={choice.id} disabled={disabled} onClick={()=>onSelect({kind:'selection',questionId:question.id,choiceId:choice.id})}>{choice.label}</button>)}</div>:<small>在下方输入栏补充即可。</small>}
 </section>;
}
