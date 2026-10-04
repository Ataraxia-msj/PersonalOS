import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {it,expect} from 'vitest';
import {ProjectList} from './project-list';
import type {AffairsProject} from '../types';
it('keeps independent and archived projects accessible, shows unknown stage rate as unknown',async()=>{render(<ProjectList mainlines={[]} projects={[{id:'a',name:'Project A',mainlineId:null,status:'active',progressRate:null},{id:'b',name:'Archived',status:'archived',mainlineId:null,progressRate:.5}] as AffairsProject[]}/>);expect(screen.getByRole('link',{name:'Project A'})).toHaveAttribute('href','/affairs/projects/a');expect(screen.getByText('独立项目',{selector:'small'})).toBeVisible();expect(screen.getByText('—')).toBeVisible();expect(screen.queryByText('Archived')).toBeNull();await userEvent.click(screen.getByRole('button',{name:'已归档'}));expect(screen.getByText('Archived')).toBeVisible();expect(screen.queryByText('用阶段成果看见成长，不用任务数量代替成果。')).toBeNull();});
