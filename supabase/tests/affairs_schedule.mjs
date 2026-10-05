// Disposable PostgreSQL only: argument is a local PGlite module, never a database URL.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
process.on('uncaughtException', e => { console.error(e.message, e.detail ?? '', e.where ?? ''); process.exit(1); });
const { PGlite } = await import(pathToFileURL(resolve(process.argv[2])).href);
const db = new PGlite();
const file = p => readFile(new URL(p, import.meta.url), 'utf8');
const rows = async (q, p = []) => (await db.query(q, p)).rows;
const one = async (q, p = []) => (await rows(q, p))[0];
const owner = 'a0000000-0000-0000-0000-000000000001';
const login = async (id = owner) => db.exec(`reset role;set request.jwt.claim.role='authenticated';set request.jwt.claim.sub='${id}';set role authenticated`);
const create = async (kind, payload, request) => one(`select * from create_affairs_${kind}($1,$2)`, [request ?? (await one('select gen_random_uuid() id')).id, payload]);
const update = async (kind, id, revision, payload) => one(`select * from update_affairs_${kind}(gen_random_uuid(),$1,$2,$3)`, [id, revision, payload]);
const snapshot = async () => ({
  views: await rows("select viewname,definition from pg_views where schemaname='public' and viewname not like 'vw_affairs_%' order by 1"),
  grants: await rows("select table_name,grantee,privilege_type from information_schema.role_table_grants where table_schema='public' order by 1,2,3"),
  policies: await rows("select tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' order by 1,2"),
  finance: await one('select (select count(*) from accounts) accounts,(select count(*) from journal_entries) entries,(select count(*) from journal_lines) lines,(select count(*) from budget_impacts) impacts'),
  rpcs: await rows("select oid::regprocedure::text signature,pg_get_function_result(oid) result,proacl::text acl from pg_proc where pronamespace='public'::regnamespace order by 1"),
});
try {
  for (const p of ['./fixtures/transfer_base.sql','./fixtures/affairs_base.sql','../migrations/202610030005_affairs_foundation.sql','../migrations/202610030006_affairs_rewards.sql','../migrations/202610040001_affairs_inbox.sql']) await db.exec(await file(p));
  const before = await snapshot();
  const preflight=await one(await file('../checks/affairs_schedule_preflight.sql'));
  assert.ok(preflight.report?.columns?.length,'preflight returns one exportable report with all sections');
  assert.equal(preflight.report.functions.length,3);
  assert.ok(preflight.report.policies.length);
  const columns = await rows("select column_name,data_type from information_schema.columns where table_schema='public' and table_name='vw_affairs_project_progress' order by ordinal_position");
  await login();
  const oldCommands = [];
  for (const [kind,payload] of [['project',{name:'Old project',outcome:'Outcome'}],['task',{title:'Old task'}]]) {
    const request = (await one('select gen_random_uuid() id')).id;
    oldCommands.push({kind,payload,request,receipt:await create(kind,payload,request)});
  }
  const captured = await one("select * from create_affairs_inbox_entry(gen_random_uuid(),'Old inbox')");
  const inboxRequest = (await one('select gen_random_uuid() id')).id;
  const inboxArgs = [inboxRequest,captured.object_id,1,'task',{title:'Old resolve'}];
  const oldResolve = await one('select * from resolve_affairs_inbox_entry($1,$2,$3,$4,$5)',inboxArgs);
  await db.exec('reset role');
  if (!process.argv.includes('--red')) await db.exec(await file('../migrations/202610050001_affairs_schedule.sql'));
  assert.equal((await rows("select column_name from information_schema.columns where table_schema='public' and table_name='affairs_tasks' and column_name='planned_time'")).length,1,'missing planned_time column');
  await db.exec(await file('./affairs_schedule.sql'));
  const newColumns = await rows("select column_name,data_type from information_schema.columns where table_schema='public' and table_name='vw_affairs_project_progress' order by ordinal_position");
  assert.deepEqual(newColumns.slice(0,-2),columns,'old View column order/types preserved');
  assert.deepEqual(newColumns.slice(-2),[{column_name:'planned_start_date',data_type:'date'},{column_name:'planned_time',data_type:'time without time zone'}]);
  assert.deepEqual(await snapshot(),before,'Finance, public RPC, RLS and grants unchanged');
  const postflight=await one(await file('../checks/affairs_schedule_postflight.sql'));
  assert.equal(postflight.report.columns.length,6);
  assert.ok(postflight.report.invalid_rows.every(r=>r.invalid_rows===0));
  await login();
  for (const c of oldCommands) {
    const replay = await create(c.kind,c.payload,c.request);
    assert.deepEqual({...replay,replayed:false},c.receipt);
    const p = c.kind==='task'?{title:'Renamed',due_date:'2026-10-08'}:{name:'Renamed',outcome:'Outcome',due_date:'2026-10-08'};
    await update(c.kind,c.receipt.object_id,1,p);
    assert.equal((await create(c.kind,c.payload,c.request)).replayed,true,'replay precedes changed object/revision');
  }
  assert.deepEqual({...await one('select * from resolve_affairs_inbox_entry($1,$2,$3,$4,$5)',inboxArgs),replayed:false},oldResolve);
  for (const kind of ['project','task']) {
    const base = kind==='project'?{name:'Scheduled project',outcome:'Goal'}:{title:'Scheduled task'};
    const payload={...base,planned_start_date:'2026-10-01',due_date:'2026-10-08',planned_time:'10:30'};
    const receipt=await create(kind,payload);
    const record=()=>one(`select planned_start_date::text start,due_date::text due,planned_time::text time,revision::text revision from affairs_${kind}s where id=$1`,[receipt.object_id]);
    assert.deepEqual(await record(),{start:'2026-10-01',due:'2026-10-08',time:'10:30:00',revision:'1'});
    await update(kind,receipt.object_id,1,{...base,due_date:'2026-10-09'});
    assert.equal((await record()).time,'10:30:00','old edit preserves time');
    assert.equal((await record()).start,'2026-10-01','old edit preserves start');
    await assert.rejects(update(kind,receipt.object_id,2,{...base,due_date:'2026-09-30'}),/schedule|check constraint/);
    await update(kind,receipt.object_id,2,{...base,due_date:null});
    assert.deepEqual(await record(),{start:'2026-10-01',due:null,time:null,revision:'3'});
    await update(kind,receipt.object_id,3,{...base,planned_start_date:null,planned_time:'00:00',due_date:'2026-10-08'});
    assert.deepEqual(await record(),{start:null,due:'2026-10-08',time:'00:00:00',revision:'4'});
    for(const fields of [{planned_start_date:'2026-10-09',due_date:'2026-10-08'}, {planned_time:'10:30'}, {planned_time:'24:00',due_date:'2026-10-08'}, {planned_time:'10:30:01',due_date:'2026-10-08'}, {planned_start_date:123}, {planned_time:{bad:true}}, {planned_start_date:'2026-02-30'}]) {
      const counts=await one('select (select count(*) from affairs_commands) commands,(select count(*) from affairs_coin_events) coins');
      await assert.rejects(create(kind,{...base,...fields}),/invalid_payload|schedule|date|check constraint/);
      assert.deepEqual(await one('select (select count(*) from affairs_commands) commands,(select count(*) from affairs_coin_events) coins'),counts,'atomic failure');
    }
    await create(kind,{...base,planned_time:'23:59',due_date:'2026-10-08'});
    const inbox=await one("select * from create_affairs_inbox_entry(gen_random_uuid(),'New scheduled inbox')");
    const resolved=await one('select * from resolve_affairs_inbox_entry(gen_random_uuid(),$1,1,$2,$3)',[inbox.object_id,kind,payload]);
    const row=await one(`select planned_time::text time from affairs_${kind}s where id=$1`,[resolved.resolved_object_id]);
    assert.equal(row.time,'10:30:00','inbox saves structured schedule');
  }
  assert.equal(Number((await one('select count(*) n from affairs_coin_events')).n),0,'scheduling awards nothing');
  const task=oldCommands[1].receipt.object_id;
  await login('b0000000-0000-0000-0000-000000000002');
  assert.equal((await rows('select * from affairs_tasks where id=$1',[task])).length,0,'RLS');
  await assert.rejects(update('task',task,2,{title:'Other owner'}),/not_found/);
  await login();
  await assert.rejects(db.query("update affairs_tasks set planned_time='12:00'"),/permission denied/);
  await db.exec("reset role;set role anon;set request.jwt.claim.role='anon'");
  await assert.rejects(create('task',{title:'Anon'}),/permission denied/);
  console.log('PASS schedule: columns, View order, legacy replay, omission/null, forms/inbox, ranges/times, rollback, owner RLS, auth-only, no DML, zero coins, Finance unchanged');
} finally { await db.close(); }
