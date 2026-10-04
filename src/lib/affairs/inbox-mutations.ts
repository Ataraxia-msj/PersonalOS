import type {AffairsQueryClient} from './queries';
import type {InboxCommand,InboxResolveReceipt} from './inbox-types';
import type {AffairsReceipt} from './types';
import {readAffairsReceipt,readAffairsRpcRow} from './mutation-result';
import {adaptInboxResolveReceipt} from './adapters';
export function executeInboxCommand(c:AffairsQueryClient,command:InboxCommand):Promise<AffairsReceipt|InboxResolveReceipt> {
 switch(command.operation) {
 case 'create_affairs_inbox_entry': return readAffairsReceipt(c.rpc(command.operation,command.args));
 case 'update_affairs_inbox_entry': return readAffairsReceipt(c.rpc(command.operation,command.args));
 case 'discard_affairs_inbox_entry': return readAffairsReceipt(c.rpc(command.operation,command.args));
 case 'restore_affairs_inbox_entry': return readAffairsReceipt(c.rpc(command.operation,command.args));
 case 'resolve_affairs_inbox_entry': return readAffairsRpcRow(c.rpc(command.operation,command.args)).then(adaptInboxResolveReceipt);
 }
}
