import {render,screen} from '@testing-library/react';
import {it,expect,vi} from 'vitest';
import {ProjectDetail} from './project-detail';
import type {AffairsProjectDetailData} from '../types';
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}));
it('archived projects preserve history and require restoring before edits',()=>{const data={project:{id:'p',revision:'1',userId:'u',createdAt:'2026-10-03T00:00Z',updatedAt:'2026-10-03T00:00Z',description:null,mainlineId:null,dueDate:null,completedAt:null,name:'Archived',status:'archived',outcome:'Result',milestoneTotal:0,milestoneCompleted:0,progressRate:null},milestones:[],tasks:[],progress:[],balance:0} as AffairsProjectDetailData;render(<ProjectDetail data={data} action={vi.fn()}/>);expect(screen.getByText(/先恢复项目/)).toBeVisible();expect(screen.getByRole('button',{name:'恢复项目'})).toBeVisible();});
