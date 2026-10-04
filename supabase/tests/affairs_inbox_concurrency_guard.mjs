// Refusal protection only, NOT proof of multi-session concurrency.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(pathToFileURL(resolve(process.argv[2])).href);
const db=new PGlite();
try {
 for(const name of ['setup','sessions','cleanup']) {
  const sql=await readFile(new URL(`affairs_inbox_concurrency_${name}.sql`,import.meta.url),'utf8');
  const guard=sql.match(/do \$\$[\s\S]*?end \$\$;/)?.[0];
  assert.ok(guard);
  await assert.rejects(db.exec(guard),/isolated_test_database_required/);
  assert.equal((await db.query("select to_regclass('public.affairs_inbox_race') fixture")).rows[0].fixture,null);
 }
 const source=await readFile(new URL('affairs_inbox_concurrency_setup.sql',import.meta.url),'utf8');
 const predicate=source.match(/create function public\.affairs_inbox_lock_observed[\s\S]*?\$\$;/)[0];
 await db.exec(predicate);
 assert.deepEqual((await db.query("select affairs_inbox_lock_observed(pg_backend_pid(),clock_timestamp()) live,affairs_inbox_lock_observed(-1,clock_timestamp()) wrong_pid,affairs_inbox_lock_observed(pg_backend_pid(),'2000-01-01') stale")).rows[0],{live:true,wrong_pid:false,stale:false});
 console.log('PASS isolated database guards and live PID/time predicate; multi-session concurrency NOT executed');
} finally {await db.close();}
