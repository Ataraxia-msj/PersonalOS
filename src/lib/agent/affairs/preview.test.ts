// @vitest-environment node
import {describe,it,expect} from 'vitest';
import {validateAffairsDrafts,toAffairsConfirmation} from './preview';
import {draft,options,ids} from './test-fixtures';
describe('affairs preview',()=>{
 it('keeps future Shanghai time and original text, syncing edited dates',()=>{
  const item=draft({dueDate:'2026-10-08',plannedTime:'10:30',yearInferred:true,dateConfirmed:true});
  expect(validateAffairsDrafts([item],options).items[0].issues).toEqual([]);
  const command=toAffairsConfirmation(item,null);
  expect(command.kind==='task'&&command.payload.description).toContain('计划时间：2026-10-08 10:30（Asia/Shanghai）');
  expect(command.kind==='task'&&command.payload.description).toContain('原文：面试');
  const changed=toAffairsConfirmation({...item,dueDate:'2026-10-18'},null);
  expect(changed.kind==='task'&&changed.payload.description).not.toContain('2026-10-08');
  expect(validateAffairsDrafts([{...item,dueDate:null}],options).items[0].issues.join()).toContain('时间');
 });
 it('requires inferred year and semantic reuse confirmation',()=>{
  expect(validateAffairsDrafts([draft({dueDate:'2026-10-08',yearInferred:true})],options).items[0].issues.join()).toContain('年份');
  const reused=draft({type:'mainline',name:'搭建系统',mode:'reuse',reuseId:ids.mainline});
  expect(validateAffairsDrafts([reused],options).items[0].issues.join()).toContain('复用');
  expect(validateAffairsDrafts([{...reused,matchConfirmed:true}],options).items[0].issues).toEqual([]);
 });
 it('rejects fabricated source, invalid calendar, missing outcome and unknown or archived parents',()=>{
  for(const item of [draft({sourceText:'伪造'}),draft({dueDate:'2026-02-30'}),draft({type:'project'}),draft({parentId:crypto.randomUUID()}),draft({parentId:ids.mainline})]) expect(validateAffairsDrafts([item],options).items[0].issues.length).toBeGreaterThan(0);
  expect(validateAffairsDrafts([draft({parentId:ids.project})],{...options,projects:options.projects.map(p=>({...p,status:'archived'}))}).items[0].issues.length).toBeGreaterThan(0);
 });
 it('orders parents first and uses actual receipt ID for child, skipped parents block',()=>{
  const parent=draft({type:'project',outcome:'完成模块'}), child=draft({parentDraftId:parent.draftId});
  expect(validateAffairsDrafts([child,parent],options).order).toEqual([parent.draftId,child.draftId]);
  const command=toAffairsConfirmation(child,ids.project);
  expect(command.kind==='task'&&command.payload.project_id).toBe(ids.project);
  expect(validateAffairsDrafts([child,{...parent,mode:'skip'}],options).items[0].issues.join()).toContain('父级');
 });
 it('rejects invalid parent kinds, cycles and competing references',()=>{
  const a=draft({type:'project',outcome:'成果'}),b=draft({type:'mainline'});
  expect(validateAffairsDrafts([draft({parentDraftId:b.draftId}),b],options).items[0].issues.length).toBeGreaterThan(0);
  const circular=[{...a,parentDraftId:b.draftId},{...b,parentDraftId:a.draftId}];
  expect(validateAffairsDrafts(circular,options).order).toEqual([]);
  expect(validateAffairsDrafts([draft({parentId:ids.project,parentDraftId:a.draftId}),a],options).items[0].issues.length).toBeGreaterThan(0);
 });
 it('requires explicit task core fields and checks length without truncation',()=>{
  expect(validateAffairsDrafts([draft({isCore:true})],options).items[0].issues.join()).toContain('核心');
  expect(validateAffairsDrafts([draft({name:'字'.repeat(201)})],options).items[0].issues.length).toBeGreaterThan(0);
 });
});
