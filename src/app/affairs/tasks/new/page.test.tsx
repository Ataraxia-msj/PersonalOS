import {render,screen} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
vi.mock('@/lib/affairs/service',()=>({getAffairsFormData:vi.fn(async()=>({resource:'task',initialValues:null,mainlines:[],projects:[{id:'a0000000-0000-0000-0000-000000000001',name:'Interview',status:'active'}],tasks:[],serverNowISO:'2026-10-05T00:00Z',taskHistory:[]}))}));
vi.mock('../../actions',()=>({submitAffairsAction:vi.fn()}));
vi.mock('next/navigation',()=>({notFound:vi.fn(),useRouter:()=>({refresh:vi.fn()})}));
import Page from './page';
import {submitAffairsAction} from '../../actions';
it('validates URL prefill while preserving project selection, without saving',async()=>{
 render(await Page({searchParams:Promise.resolve({projectId:'a0000000-0000-0000-0000-000000000001',dueDate:'2026-10-08'})}));
 expect(screen.getByLabelText('所属项目')).toHaveValue('a0000000-0000-0000-0000-000000000001');
 expect(screen.getByLabelText('截止日期（可选）')).toHaveValue('2026-10-08');
 expect(submitAffairsAction).not.toHaveBeenCalled();
});
it('rejects duplicate or invalid dates rather than silently choosing one',async()=>{
 render(await Page({searchParams:Promise.resolve({dueDate:['2026-10-08','2026-10-09']})}));
 expect(screen.getByRole('alert')).toHaveTextContent('日期参数无效');
 expect(screen.getByLabelText('截止日期（可选）')).toHaveValue('');
});
