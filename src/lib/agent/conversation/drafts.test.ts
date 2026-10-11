// @vitest-environment node
import {describe,it,expect} from 'vitest';
import {normalizeConversationItem} from './drafts';
import {expenseItem,financeOptions,id} from './test-fixtures';
const now=new Date('2026-10-11T10:00:00+08:00');
describe('conversation normalization',()=>{
  it('fixes a default timestamp once, and retains only the missing account',()=>{
    const first=normalizeConversationItem(expenseItem(),financeOptions,now,()=>id(50));
    expect(first.draft.issues).toEqual(['需要选择账户']);
    expect(first.timeAssumption).toBe('recorded_now');
    const later=normalizeConversationItem(first,financeOptions,new Date('2026-10-12T01:00:00+08:00'),()=>id(51));
    expect(later.draft.occurredAt).toBe(first.draft.occurredAt);
    expect(later.draft.draftId).toBe(id(10));
  });
  it('uses midnight for a date only and never replaces invalid dates with today',()=>{
    const item=expenseItem();item.draft.occurredAt='2026-10-10';
    const normal=normalizeConversationItem(item,financeOptions,now,()=>id(50));
    expect(normal.draft.occurredAt).toBe('2026-10-10T00:00');expect(normal.timeAssumption).toBe('date_only');
    item.draft.occurredAt='2026-02-30';
    const bad=normalizeConversationItem(item,financeOptions,now,()=>id(50));
    expect(bad.draft.occurredAt).toBe('2026-02-30T00:00');expect(bad.draft.status).toBe('needs_input');
  });
  it('refreshes category defaults but retains an explicit budget through exclusion',()=>{
    const item=expenseItem();item.origins.budgetBucketId='default';
    const normal=normalizeConversationItem(item,financeOptions,now,()=>id(50));
    expect(normal.draft.budgetBucketName).toBe('变动必要开销');
    const changed=structuredClone(financeOptions);changed.expenseCategories[0].defaultBudgetBucketId=null;
    expect(normalizeConversationItem(normal,changed,now,()=>id(50)).draft.budgetBucketName).toBeNull();
    item.budgetChoice=id(6);item.origins.budgetBucketId='explicit';item.draft.excludeFromBudget=true;
    const excluded=normalizeConversationItem(item,financeOptions,now,()=>id(50));expect(excluded.draft.budgetBucketId).toBeNull();
    excluded.draft.excludeFromBudget=false;
    expect(normalizeConversationItem(excluded,financeOptions,now,()=>id(50)).draft.budgetBucketId).toBe(id(6));
  });
  it('never guesses accounts and rejects income liability and invalid transfers',()=>{
    const item=expenseItem();expect(normalizeConversationItem(item,financeOptions,now,()=>id(50)).draft.accountId).toBeNull();
    item.draft.type='income';item.draft.accountId=id(3);item.draft.categoryId=id(7);
    expect(normalizeConversationItem(item,financeOptions,now,()=>id(50)).draft.status).toBe('needs_input');
    item.draft.type='transfer';item.draft.purpose='general';item.draft.fromAccountId=id(1);item.draft.toAccountId=id(1);
    expect(normalizeConversationItem(item,financeOptions,now,()=>id(50)).draft.issues).toContain('转出和转入账户不能相同');
  });
});
