import {it,expect,vi} from 'vitest';
import {render,screen,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {FinanceConversationPreview} from './finance-conversation-preview';
import {conversation,expenseItem,financeOptions,id} from '@/lib/agent/conversation/test-fixtures';
it('edits the same draft and never invents candidates or writes directly',async()=>{
 const user=userEvent.setup(),onTurn=vi.fn(),onConfirm=vi.fn(),item=expenseItem({lifecycle:'ready',timeAssumption:'recorded_now',draft:{...expenseItem().draft,status:'ready',accountId:id(1),accountName:'微信',occurredAt:'2026-10-11T10:00',issues:[]}});
 render(<FinanceConversationPreview state={conversation({items:[item]})} options={financeOptions} disabled={false} onTurn={onTurn} onConfirm={onConfirm}/>);
 expect(screen.getByText('默认记录时间')).toBeVisible();
 await user.click(screen.getByRole('button',{name:'修改金额'}));await user.clear(screen.getByLabelText('金额'));await user.type(screen.getByLabelText('金额'),'25');await user.click(screen.getByRole('button',{name:'更新预览'}));
 expect(onTurn).toHaveBeenCalledWith({kind:'edit',draftId:id(10),changes:[{field:'amount',value:25,origin:'explicit'}]});expect(onConfirm).not.toHaveBeenCalled();
});
it('retains stable numbers and makes receipts read only without a warning wall',()=>{
 const item=expenseItem({ordinal:2,lifecycle:'saved',confirmation:{status:'warning',entryId:id(80),message:'已记录，预算缺失'},draft:{...expenseItem().draft,status:'ready'}});
 render(<FinanceConversationPreview state={conversation({items:[expenseItem({lifecycle:'discarded'}),item]})} options={financeOptions} disabled={false} onTurn={vi.fn()} onConfirm={vi.fn()}/>);
 const card=screen.getByRole('article',{name:'交易预览 2'});expect(within(card).getByRole('button',{name:'已记录'})).toBeDisabled();expect(within(card).queryByRole('button',{name:'修改金额'})).toBeNull();
 expect(screen.queryByRole('article',{name:'交易预览 1'})).toBeNull();expect(screen.queryByText('需要选择账户')).toBeNull();
});
