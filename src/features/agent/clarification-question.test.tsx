import {it,expect,vi} from 'vitest';
import {render} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {ClarificationQuestion} from './clarification-question';
import {id} from '@/lib/agent/conversation/test-fixtures';
it('allows keyboard selection of the actual account ID without model work',async()=>{
 const select=vi.fn(),user=userEvent.setup();
 render(<ClarificationQuestion question={{id:'q',kind:'field',field:'accountId',targetIds:[id(10)],text:'哪个账户？',choices:[{id:id(2),label:'情侣小荷包'}]}} disabled={false} onSelect={select}/>);
 await user.tab();await user.keyboard('{Enter}');expect(select).toHaveBeenCalledWith({kind:'selection',questionId:'q',choiceId:id(2)});
});
