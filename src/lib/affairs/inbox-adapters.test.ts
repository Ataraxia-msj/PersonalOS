import {expect,it} from 'vitest';
import {adaptInboxResolveReceipt,adaptTaskHistory} from './adapters';
import type {CommandRow} from './types';
const row={object_id:'inbox',object_revision:2,command_id:'command',coin_delta:0,balance_coins:1,replayed:false,resolved_resource:'task' as const,resolved_object_id:'task',resolved_object_revision:'9007199254740993'};
it('keeps inbox and target identities/revisions separate in receipts and history',()=>{
 expect(adaptInboxResolveReceipt(row)).toMatchObject({objectId:'inbox',revision:'2',resolvedObjectId:'task',resolvedObjectRevision:'9007199254740993'});
 const h=adaptTaskHistory({id:'command',user_id:'u',created_at:'now',request_id:'r',operation:'resolve_affairs_inbox_entry',payload:{},result:row,applied_at:'now'} as CommandRow);
 expect(h).toMatchObject({taskId:'task',revision:'9007199254740993',status:'todo',coinDelta:0});
});
it('rejects a resolve receipt lacking the persisted target rather than pretending success',()=>{
 expect(()=>adaptInboxResolveReceipt({...row,resolved_object_id:undefined} as unknown as typeof row)).toThrow();
});
