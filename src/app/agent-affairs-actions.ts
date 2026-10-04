'use server';
import {revalidatePath} from 'next/cache';
import {createClient} from '@/lib/supabase/server';
import {confirmAgentAffairs} from '@/lib/agent/affairs/confirm';
import {getAgentTaskDuplicates} from '@/lib/affairs/service';
import type {AffairsConfirmation,AffairsConfirmationResult,AffairsTaskDuplicate} from '@/lib/agent/affairs/types';

async function authenticatedClient(){
 const client=await createClient();
 const {data,error}=await client.auth.getClaims();
 if(error||!data?.claims?.sub)throw new Error('unauthenticated');
 return client;
}
export async function confirmAgentAffairsAction(command:AffairsConfirmation):Promise<AffairsConfirmationResult>{
 let client;
 try{client=await authenticatedClient();}catch{return {status:'error',message:'无法验证登录状态，请重新登录。',receipt:null,objectId:null,reused:false};}
 const result=await confirmAgentAffairs(client,command);
 if(result.status==='success'){
  try{revalidatePath('/affairs','layout');}catch{return {...result,message:`${result.message} 页面刷新失败，请手动刷新，不要重复创建。`};}
 }
 return result;
}
export async function checkAgentAffairsDuplicatesAction(titles:string[]):Promise<{status:'success';items:AffairsTaskDuplicate[]}|{status:'error';message:string}>{
 try{
  const client=await authenticatedClient();
  return {status:'success',items:await getAgentTaskDuplicates(client,titles)};
 }catch{return {status:'error',message:'无法核对同名行动，请稍后重试。'};}
}
