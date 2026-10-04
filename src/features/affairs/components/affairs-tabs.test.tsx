import {render,screen} from '@testing-library/react';
import {it,expect,vi} from 'vitest';
import {AffairsTabs} from './affairs-tabs';
vi.mock('next/navigation',()=>({usePathname:()=>'/affairs/inbox'}));
it('has five sections, no actions tab and unknown count is not zero',()=>{render(<AffairsTabs pendingCount={null}/>);expect(screen.getAllByRole('link')).toHaveLength(5);expect(screen.getByRole('link',{name:/收集箱/})).toHaveTextContent('—');expect(screen.queryByRole('link',{name:'行动'})).toBeNull();expect(screen.getByRole('link',{name:/收集箱/})).toHaveAttribute('aria-current','page');});
