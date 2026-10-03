import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
process.on('uncaughtException',e=>{console.error(e.message,e.detail??'',e.where??'');process.exit(1);});
const { PGlite }=await import(pathToFileURL(resolve(process.argv[2])).href);
const db=new PGlite();
const file=p=>readFile(new URL(p,import.meta.url),'utf8');
const rows=async(q,p=[]) => (await db.query(q,p)).rows;
await db.exec(await file('./fixtures/transfer_base.sql'));
await db.exec(await file('./fixtures/affairs_base.sql'));
const finance=()=>rows("select table_name,column_name,data_type,column_default from information_schema.columns where table_schema='public' and table_name not like 'affairs_%' and table_name not like 'vw_affairs_%' order by 1,2");
const before=await finance();
await db.exec(await file('../migrations/202610030005_affairs_foundation.sql'));
if(!process.argv.includes('--red')) await db.exec(await file('../migrations/202610030006_affairs_rewards.sql'));
assert.equal((await rows("select count(*)::int n from pg_proc where proname='complete_affairs_task'"))[0].n,1,'missing complete_affairs_task');
await db.exec(await file('./affairs_rewards.sql'));
for(const table of ['reward_items','redemptions','penalties','coin_events']) {
 assert.equal((await rows(`select has_table_privilege('authenticated','affairs_${table}','INSERT,UPDATE,DELETE') allowed`))[0].allowed,false);
 assert.equal((await rows(`select has_table_privilege('anon','affairs_${table}','SELECT') allowed`))[0].allowed,false);
}
await db.exec("set role authenticated;set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='b0000000-0000-0000-0000-000000000002'");
assert.equal((await rows('select * from vw_affairs_coin_ledger')).length,0,'cross-owner ledger hidden');
await assert.rejects(db.exec("insert into affairs_coin_events(user_id,wallet_sequence,kind,amount,command_id,description_snapshot) values(auth.uid(),1,'penalty',-1,gen_random_uuid(),'illegal')"),/permission denied/);
await db.exec('reset role');
assert.deepEqual(await finance(),before,'Finance unchanged');
// Inject failures at every completion write; verify statement rollback including wallet sequence.
for(const target of ['affairs_tasks','affairs_progress_entries','affairs_coin_events','affairs_commands']) {
 await db.exec("set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='a0000000-0000-0000-0000-000000000001'");
 const t=(await rows("select * from create_affairs_task(gen_random_uuid(),'{\"title\":\"Fault check\",\"is_core\":true,\"core_reason\":\"Goal\",\"completion_criteria\":\"Done\"}')"))[0];
 const snapshot=await rows("select (select count(*) from affairs_coin_events) events,(select count(*) from affairs_commands) commands,(select count(*) from affairs_progress_entries) progress,(select last_sequence from affairs_wallets where user_id=auth.uid()) seq");
 await db.exec(`create function public.affairs_test_fault() returns trigger language plpgsql as $$ begin raise exception 'injected_failure'; end $$; create trigger affairs_test_fault before insert or update on public.${target} for each row execute function public.affairs_test_fault();`);
 await assert.rejects(db.query('select * from complete_affairs_task(gen_random_uuid(),$1,1,true)',[t.object_id]),/injected_failure/);
 await db.exec(`drop trigger affairs_test_fault on public.${target};drop function public.affairs_test_fault();`);
 assert.deepEqual(await rows("select (select count(*) from affairs_coin_events) events,(select count(*) from affairs_commands) commands,(select count(*) from affairs_progress_entries) progress,(select last_sequence from affairs_wallets where user_id=auth.uid()) seq"),snapshot);
 assert.equal((await rows('select status from affairs_tasks where id=$1',[t.object_id]))[0].status,'todo');
}
console.log('PASS affairs rewards: completion/reopen/undo, idempotency, shop snapshots/refunds, penalties, ledger, rollback fault injection, Finance unchanged');
await db.close();
