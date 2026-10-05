import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect,it} from 'vitest';
import {ContributionHeatmap} from './contribution-heatmap';
it('keeps date interaction without explanatory headings',async()=>{
 render(<ContributionHeatmap rows={[]} today="2026-10-05" progress={[]}/>);
 for(const text of ['推进轨迹','近半年 · 全部主线','如何阅读'])expect(screen.queryByText(text)).toBeNull();
 await userEvent.click(screen.getByRole('button',{name:'2026-10-05 · 0 次推进'}));
 expect(screen.getByText('2026-10-05 的推进')).toBeVisible();
});
