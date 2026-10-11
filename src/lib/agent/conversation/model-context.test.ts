// @vitest-environment node
import {it,expect} from 'vitest';
import {buildFinanceModelContext} from './model-context';
import {conversation,expenseItem,financeOptions,id,textInput} from './test-fixtures';
it('keeps unfinished facts and question with a short answer, without saved facts',()=>{
 const saved=expenseItem({lifecycle:'saved',draft:{...expenseItem().draft,draftId:id(11),description:'private-saved-text',rawText:'private-saved-text'}});
 const state=conversation({items:[expenseItem(),saved],recentUserTexts:['private-saved-text','午饭20'],pendingQuestion:{id:'q',kind:'field',field:'accountId',text:'哪个账户？',targetIds:[id(10)],choices:[]}});
 const context=buildFinanceModelContext(textInput('情侣小荷包',state),state,financeOptions,new Date('2026-10-11T10:00:00+08:00'));
 expect(context.items[0].amount).toBe(20);expect(context.pendingQuestion?.field).toBe('accountId');expect(context.rawText).toBe('情侣小荷包');
 expect(JSON.stringify(context)).not.toContain('private-saved-text');expect(JSON.stringify(context)).not.toContain('confirmation');
});
it('bounds recent context to six texts and 6000 code points',()=>{
 const state=conversation({recentUserTexts:Array(6).fill('😀'.repeat(1000))});
 const context=buildFinanceModelContext(textInput('😀'.repeat(4000),state),state,financeOptions,new Date());
 expect(context.recentUserTexts.length).toBeLessThanOrEqual(6);expect(context.recentUserTexts.reduce((n,t)=>n+[...t].length,0)).toBeLessThanOrEqual(6000);
});
