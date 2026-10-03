import type {RewardCommand,AffairsReceipt} from './types';
import type {AffairsQueryClient} from './queries';
import {readAffairsReceipt} from './mutation-result';
export async function executeRewardCommand(client:AffairsQueryClient,command:RewardCommand):Promise<AffairsReceipt>{
 switch(command.operation){
 case 'complete_affairs_task': return readAffairsReceipt(client.rpc('complete_affairs_task',command.args));
case 'reopen_affairs_task': return readAffairsReceipt(client.rpc('reopen_affairs_task',command.args));
case 'undo_affairs_task_completion': return readAffairsReceipt(client.rpc('undo_affairs_task_completion',command.args));
case 'create_affairs_reward': return readAffairsReceipt(client.rpc('create_affairs_reward',command.args));
case 'update_affairs_reward': return readAffairsReceipt(client.rpc('update_affairs_reward',command.args));
case 'redeem_affairs_reward': return readAffairsReceipt(client.rpc('redeem_affairs_reward',command.args));
case 'record_affairs_penalty': return readAffairsReceipt(client.rpc('record_affairs_penalty',command.args));
case 'reverse_affairs_penalty': return readAffairsReceipt(client.rpc('reverse_affairs_penalty',command.args));
case 'use_affairs_redemption': return readAffairsReceipt(client.rpc('use_affairs_redemption',command.args));
case 'cancel_affairs_redemption': return readAffairsReceipt(client.rpc('cancel_affairs_redemption',command.args));
 }
}

