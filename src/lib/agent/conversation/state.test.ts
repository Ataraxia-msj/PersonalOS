// @vitest-environment node
import {describe,it,expect} from 'vitest';
import {applyFinanceChanges,setFinanceSubmission} from './state';
import {conversation,expenseItem,id,modelTurn,meal} from './test-fixtures';
describe('finance conversation state',()=>{
  it('assigns independent IDs on explicit append',()=>{
    let n=60;
    const after=applyFinanceChanges(conversation(),id(30),modelTurn({kind:'append',additions:[meal]}),()=>id(n++));
    expect(after.items).toHaveLength(2);expect(after.items[1].draft.draftId).toBe(id(60));expect(after.items[1].ordinal).toBe(2);
  });
  it('patches without replacing identity or origin text',()=>{
    const before=conversation();
    const after=applyFinanceChanges(before,id(30),modelTurn({updates:[{draftId:id(10),changes:[{field:'accountId',value:id(2),origin:'explicit'}]}]}),()=>id(90));
    expect(after.items[0].draft).toMatchObject({draftId:id(10),amount:20,accountId:id(2),rawText:'午饭花了20'});
    expect(before.items[0].draft.accountId).toBeNull();
    expect(after.revision).toBe(1);
    expect(applyFinanceChanges(after,id(30),modelTurn({additions:[meal]}),()=>id(90))).toEqual(after);
  });
  it('updates second item only and keeps ordinal after discard',()=>{
    const second=expenseItem({ordinal:2});second.draft.draftId=id(11);
    const after=applyFinanceChanges(conversation({items:[expenseItem({lifecycle:'discarded'}),second]}),id(30),modelTurn({updates:[{draftId:id(11),changes:[{field:'excludeFromBudget',value:true,origin:'explicit'}]}]}),()=>id(90));
    expect(after.items[0].draft.excludeFromBudget).toBe(false);expect(after.items[1].ordinal).toBe(2);expect(after.items[1].draft.excludeFromBudget).toBe(true);
  });
  it.each(['saved','saving','uncertain','discarded'] as const)('does not edit %s items',lifecycle=>{
    expect(()=>applyFinanceChanges(conversation({items:[expenseItem({lifecycle})]}),id(30),modelTurn({updates:[{draftId:id(10),changes:[{field:'amount',value:25,origin:'explicit'}]}]}),()=>id(90))).toThrow();
  });
  it('locks unknown submission and makes successful receipt immutable',()=>{
    const item=expenseItem({lifecycle:'ready'});item.draft.status='ready';
    const pending=setFinanceSubmission(conversation({items:[item]}),id(10),{kind:'start'});
    expect(pending.items[0].lifecycle).toBe('saving');
    const done=setFinanceSubmission(pending,id(10),{kind:'result',result:{status:'warning',entryId:id(40),message:'已记录'}});
    expect(done.items[0].lifecycle).toBe('saved');expect(()=>setFinanceSubmission(done,id(10),{kind:'start'})).toThrow();
    const unknown=setFinanceSubmission(pending,id(10),{kind:'result',result:{status:'uncertain',entryId:null,message:'核对'}});
    expect(()=>setFinanceSubmission(unknown,id(10),{kind:'start'})).toThrow();
  });
});
