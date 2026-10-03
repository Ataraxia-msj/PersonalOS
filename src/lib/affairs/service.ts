import {createClient} from '@/lib/supabase/server';
import type * as Ui from '@/features/affairs/types';
import * as q from './queries';
import * as a from './adapters';
import {shanghaiInput} from './validation';
export function createAffairsServices(clientFactory:()=>Promise<q.AffairsQueryClient>){
 return {
 async getAffairsDashboardData(now=new Date()):Promise<Ui.AffairsDashboardData>{
  const c=await clientFactory();const today=shanghaiInput(now).slice(0,10);const from=new Date(today+'T00:00:00Z');from.setUTCDate(from.getUTCDate()-181);
  const fromDate=from.toISOString().slice(0,10);
  const [ml,pr,ta,progress,contributions,balance]=await Promise.all([q.getAffairsMainlines(c),q.getAffairsProjects(c),q.getAffairsTasks(c),q.getAffairsProgress(c),q.getAffairsContributions(c,fromDate,today),q.getAffairsCoinBalance(c)]);
  return {mainlines:ml.map(a.adaptMainline),projects:pr.map(a.adaptProject),tasks:ta.map(a.adaptTask),progress:progress.map(a.adaptProgress),contributions,balance:a.adaptBalance(balance),today,serverNowISO:now.toISOString()};
 },
 async getAffairsProjectsData():Promise<Ui.AffairsProject[]>{const c=await clientFactory();return (await q.getAffairsProjects(c)).map(a.adaptProject);},
 async getAffairsProjectDetailData(projectId:string):Promise<Ui.AffairsProjectDetailData|null>{
  const c=await clientFactory();const [pr,mi,ta,progress,balance]=await Promise.all([q.getAffairsProjects(c),q.getAffairsMilestones(c,projectId),q.getAffairsTasks(c,projectId),q.getAffairsProgress(c,{projectId}),q.getAffairsCoinBalance(c)]);
  const project=pr.find(r=>r.id===projectId);return project?{project:a.adaptProject(project),milestones:mi.map(a.adaptMilestone),tasks:ta.map(a.adaptTask),progress:progress.map(a.adaptProgress),balance:a.adaptBalance(balance),serverNowISO:new Date().toISOString()}:null;
 },
 async getAffairsTaskListData():Promise<Ui.AffairsTaskListData>{const c=await clientFactory();const [tasks,projects,balance]=await Promise.all([q.getAffairsTasks(c),q.getAffairsProjects(c),q.getAffairsCoinBalance(c)]);return {tasks:tasks.map(a.adaptTask),projects:projects.map(a.adaptProject),balance:a.adaptBalance(balance)};},
 async getAffairsShopData():Promise<Ui.AffairsShopData>{const c=await clientFactory();const [rewards,redemptions,balance]=await Promise.all([q.getAffairsRewards(c),q.getAffairsRedemptions(c),q.getAffairsCoinBalance(c)]);return {rewards:rewards.map(a.adaptReward),redemptions:redemptions.map(a.adaptRedemption),balance:a.adaptBalance(balance)};},
 async getAffairsCoinsData(beforeSequence?:string):Promise<Ui.AffairsCoinsData>{
  const c=await clientFactory();const [ledger,penalties,tasks,balance]=await Promise.all([q.getAffairsCoinLedger(c,beforeSequence),q.getAffairsPenalties(c),q.getAffairsTasks(c),q.getAffairsCoinBalance(c)]);
  const entries=ledger.map(a.adaptCoinEntry);return {ledger:entries,penalties:penalties.map(a.adaptPenalty),tasks:tasks.map(a.adaptTask),balance:a.adaptBalance(balance),nextBeforeSequence:entries.length===30?entries.at(-1)!.walletSequence:null};
 },
 async getAffairsFormData(resource:'mainline'|'project'|'task'|'reward',id?:string):Promise<Ui.AffairsFormData|null>{
  const c=await clientFactory();const [ml,pr,ta,rw]=await Promise.all([q.getAffairsMainlines(c),q.getAffairsProjects(c),q.getAffairsTasks(c),resource==='reward'?q.getAffairsRewards(c):Promise.resolve([])]);
  const options={mainlines:ml.map(a.adaptMainline),projects:pr.map(a.adaptProject),tasks:ta.map(a.adaptTask),serverNowISO:new Date().toISOString()};
  switch(resource){
   case 'mainline':{const initialValues=id?options.mainlines.find(r=>r.id===id):null;return initialValues===undefined?null:{...options,resource,initialValues};}
   case 'project':{const initialValues=id?options.projects.find(r=>r.id===id):null;return initialValues===undefined?null:{...options,resource,initialValues};}
   case 'task':{const initialValues=id?options.tasks.find(r=>r.id===id):null;return initialValues===undefined?null:{...options,resource,initialValues};}
   case 'reward':{const initialValues=id?rw.find(r=>r.id===id):null;return initialValues===undefined?null:{...options,resource,initialValues:initialValues?a.adaptReward(initialValues):null};}
  }
 }
 };
}
export const {getAffairsDashboardData,getAffairsProjectsData,getAffairsProjectDetailData,getAffairsTaskListData,getAffairsShopData,getAffairsCoinsData,getAffairsFormData}=createAffairsServices(createClient);

