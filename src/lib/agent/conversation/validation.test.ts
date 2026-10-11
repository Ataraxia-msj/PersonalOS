// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { parseFinanceTurnInput } from './validation';
import { textInput, conversation, expenseItem, id } from './test-fixtures';
describe('finance conversation input',()=>{
  it('counts Unicode code points and rejects oversized input',()=>{
    expect(parseFinanceTurnInput(textInput('😀'.repeat(4000))).turn).toMatchObject({kind:'text'});
    expect(()=>parseFinanceTurnInput(textInput('😀'.repeat(4001)))).toThrow();
  });
  it('rejects unknown fields, stale revisions and invalid identity',()=>{
    expect(()=>parseFinanceTurnInput({...textInput('微信'),options:{}})).toThrow();
    expect(()=>parseFinanceTurnInput({...textInput('微信'),baseRevision:5})).toThrow();
    expect(()=>parseFinanceTurnInput({...textInput('微信'),ownerId:id(99)})).toThrow();
  });
  it.each([0,-1,NaN,1.001])('rejects invalid amount %s',amount=>{
    const item=expenseItem();item.draft.amount=amount;
    expect(()=>parseFinanceTurnInput(textInput('微信',conversation({items:[item]})))).toThrow();
  });
  it('rejects duplicate IDs and more than 20 items',()=>{
    expect(()=>parseFinanceTurnInput(textInput('微信',conversation({items:[expenseItem(),expenseItem()]})))).toThrow();
    const items=Array.from({length:21},(_,i)=>{const x=expenseItem({ordinal:i+1});x.draft.draftId=id(100+i);return x;});
    expect(()=>parseFinanceTurnInput(textInput('微信',conversation({items})))).toThrow();
    expect(parseFinanceTurnInput(textInput('微信',conversation({items:items.slice(0,20)}))).state?.items).toHaveLength(20);
  });
  it('rejects extra draft properties and oversized envelope',()=>{
    const input=textInput('微信');Object.assign(input.state!.items[0].draft,{secret:'x'});
    expect(()=>parseFinanceTurnInput(input)).toThrow();
    expect(()=>parseFinanceTurnInput({...textInput('微信'),padding:'x'.repeat(40001)})).toThrow();
  });
});
