import {it,expect,vi} from 'vitest';
import {createClient} from '@/lib/supabase/server';
import {redirect} from 'next/navigation';
import Page from './page';
vi.mock('@/lib/supabase/server',()=>({createClient:vi.fn()}));
vi.mock('next/navigation',()=>({redirect:vi.fn(()=>{throw new Error('redirect');})}));
vi.mock('@/features/agent/agent-workspace',()=>({AgentWorkspace:()=>null}));
it('passes only verified owner id and redirects expired users',async()=>{
 vi.mocked(createClient).mockResolvedValue({auth:{getClaims:async()=>({data:{claims:{sub:'verified-user'}},error:null})}} as never);
 expect((await Page()).props).toEqual({ownerId:'verified-user'});
 vi.mocked(createClient).mockResolvedValue({auth:{getClaims:async()=>({data:null,error:null})}} as never);
 await expect(Page()).rejects.toThrow('redirect');expect(redirect).toHaveBeenCalledWith('/login?next=%2F');
});
