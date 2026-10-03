import type * as Row from './types';
import type * as Ui from '@/features/affairs/types';
import {decimalInteger,safeInteger} from './validation';
function camel<T>(row:unknown):T{
 if(!row||typeof row!=='object')throw new Error('invalid_affairs_row');
 return Object.fromEntries(Object.entries(row).map(([key,value])=>[key.replace(/_([a-z])/g,(_,s:string)=>s.toUpperCase()),value])) as T;
}
function revision(row:{revision:Row.DbInteger}):string{return decimalInteger(row.revision);}
export function adaptBalance(row:Row.CoinBalanceRow|null):number{return row===null?0:safeInteger(row.balance_coins);}
export function adaptReceipt(r:Row.AffairsRpcReceiptRow):Row.AffairsReceipt {
 if(!r || typeof r.object_id!=='string'||typeof r.command_id!=='string'||typeof r.replayed!=='boolean')throw new Error('invalid_receipt');
 return {objectId:r.object_id,revision:r.object_revision===null?null:decimalInteger(r.object_revision),commandId:r.command_id,coinDelta:safeInteger(r.coin_delta),balanceAtCommand:safeInteger(r.balance_coins),replayed:r.replayed};
}
export function adaptMainline(r:Row.MainlineRow):Ui.AffairsMainline{return {...camel<Ui.AffairsMainline>(r),revision:revision(r)};}
export function adaptTask(r:Row.TaskRow):Ui.AffairsTask{return {...camel<Ui.AffairsTask>(r),revision:revision(r),completionCycle:decimalInteger(r.completion_cycle)};}
export function adaptProject(r:Row.ProjectProgressRow):Ui.AffairsProject{
 if(r.progress_rate!==null&&(!Number.isFinite(r.progress_rate)||r.progress_rate<0||r.progress_rate>1))throw new Error('invalid_progress_rate');
 return {...camel<Ui.AffairsProject>(r),revision:revision(r),milestoneTotal:safeInteger(r.milestone_total),milestoneCompleted:safeInteger(r.milestone_completed)};
}
export function adaptMilestone(r:Row.MilestoneRow):Ui.AffairsMilestone{return {...camel<Ui.AffairsMilestone>(r),revision:revision(r)};}
export function adaptProgress(r:Row.ProgressRow):Ui.AffairsProgress{return {...camel<Ui.AffairsProgress>(r),completionCycle:r.completion_cycle===null?null:decimalInteger(r.completion_cycle)};}
export function adaptReward(r:Row.RewardRow):Ui.AffairsReward{return {...camel<Ui.AffairsReward>(r),revision:revision(r),priceCoins:safeInteger(r.price_coins)};}
export function adaptRedemption(r:Row.RedemptionRow):Ui.AffairsRedemption{return {...camel<Ui.AffairsRedemption>(r),revision:revision(r),priceSnapshot:safeInteger(r.price_snapshot)};}
export function adaptPenalty(r:Row.PenaltyRow):Ui.AffairsPenalty{return {...camel<Ui.AffairsPenalty>(r),revision:revision(r)};}
export function adaptCoinEntry(r:Row.CoinLedgerRow):Ui.AffairsCoinEntry{return {...camel<Ui.AffairsCoinEntry>(r),walletSequence:decimalInteger(r.wallet_sequence),amount:safeInteger(r.amount),balanceAfter:safeInteger(r.balance_after)};}

