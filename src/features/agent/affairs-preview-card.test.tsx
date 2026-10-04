import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {it,expect,vi} from 'vitest';
import {AffairsPreviewCard} from './affairs-preview-card';
import {draft,options,ids} from '@/lib/agent/affairs/test-fixtures';
it('clears planned time with date and exposes core fields only when chosen',async()=>{
 const user=userEvent.setup(),onChange=vi.fn(),item=draft({dueDate:'2026-10-08',plannedTime:'10:30'});
 const {rerender}=render(<AffairsPreviewCard draft={item} index={0} options={options} items={[item]} onChange={onChange}/>);
 await user.clear(screen.getByLabelText('计划日期'));expect(onChange).toHaveBeenLastCalledWith({dueDate:null,plannedTime:null,dateConfirmed:true});
 expect(screen.queryByLabelText('完成条件')).not.toBeInTheDocument();
 await user.click(screen.getByLabelText('设为核心行动'));expect(onChange).toHaveBeenLastCalledWith({isCore:true});
 rerender(<AffairsPreviewCard draft={{...item,isCore:true}} index={0} options={options} items={[item]} onChange={onChange}/>);
 expect(screen.getByLabelText('完成条件')).toBeVisible();
});
it('changes actual project association and allows skipping an incomplete card',async()=>{
 const user=userEvent.setup(),onChange=vi.fn(),item=draft();
 render(<AffairsPreviewCard draft={item} index={0} options={options} items={[item]} onChange={onChange}/>);
 await user.selectOptions(screen.getByLabelText('归属'),ids.project);expect(onChange).toHaveBeenLastCalledWith({parentId:ids.project,parentDraftId:null,duplicateConfirmed:false});
 await user.selectOptions(screen.getByLabelText('处理方式'),'skip');expect(onChange).toHaveBeenLastCalledWith({mode:'skip',matchConfirmed:false});
});
