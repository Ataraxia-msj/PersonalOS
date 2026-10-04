import type {AffairsAgentOptions, AffairsDraft, ModelAffairsItem} from './types';
import {randomUUID} from 'node:crypto';
export const ids = {mainline:'10000000-0000-4000-8000-000000000001', project:'10000000-0000-4000-8000-000000000002'};
export const options:AffairsAgentOptions={serverNowISO:'2026-10-04T04:00:00.000Z',mainlines:[{id:ids.mainline,name:'打造并持久运行个人系统',status:'active'}],projects:[{id:ids.project,name:'事务模板搭建',status:'active',mainlineId:ids.mainline}]};
export function model(overrides:Partial<ModelAffairsItem>={}):ModelAffairsItem{return {type:'task',sourceText:'面试',name:'面试',description:null,outcome:null,dueDate:null,plannedTime:null,yearInferred:false,isCore:false,coreReason:null,completionCriteria:null,parentId:null,parentIndex:null,existingId:null,...overrides};}
export function draft(overrides:Partial<AffairsDraft>={}):AffairsDraft{return {...model(),draftId:randomUUID(),requestId:randomUUID(),rawText:'面试',parentDraftId:null,mode:'create',reuseId:null,matchConfirmed:false,dateConfirmed:false,duplicateConfirmed:false,issues:[],...overrides};}
