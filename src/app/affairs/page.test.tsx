import {render,screen} from '@testing-library/react';import {it,expect,vi} from 'vitest';
vi.mock('@/lib/affairs/service',()=>({getAffairsDashboardData:vi.fn(async()=>({mainlines:[],projects:[],tasks:[],progress:[],contributions:[],balance:0,today:'2026-10-03',serverNowISO:'2026-10-03T00:00Z'}))}));
vi.mock('./actions',()=>({submitAffairsAction:vi.fn()}));vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}));
import Page from './page';
it('page delegates to service, never embeds query or fake examples',async()=>{render(await Page());expect(screen.getByRole('heading',{name:'事务'})).toBeVisible();});
