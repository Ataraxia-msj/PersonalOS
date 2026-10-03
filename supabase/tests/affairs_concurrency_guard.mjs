// Only verifies refusal outside the named isolated database; NOT a concurrency test.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(resolve(process.argv[2])).href);
const db = new PGlite();
for (const file of ['affairs_concurrency.sql','affairs_concurrency_session_a.sql','affairs_concurrency_session_b.sql']) {
 const source = await readFile(new URL(file,import.meta.url),'utf8');
 const guard = source.match(/do \$\$[\s\S]*?end \$\$;/)?.[0];
 assert.ok(guard,'missing isolated database guard');
 await assert.rejects(db.exec(guard),/isolated_test_database_required/);
 assert.equal((await db.query("select to_regclass('public.affairs_test_scenarios') fixture")).rows[0].fixture,null);
}
const setup = await readFile(new URL('affairs_concurrency.sql',import.meta.url),'utf8');
const predicate = setup.match(/create function public\.affairs_test_lock_observed[\s\S]*?\$\$;/)?.[0];
assert.ok(predicate,'missing live lock-observation predicate');
await db.exec(predicate);
const row = (await db.query("select affairs_test_lock_observed(pg_backend_pid(),clock_timestamp()) live,affairs_test_lock_observed(-1,clock_timestamp()) wrong_pid,affairs_test_lock_observed(pg_backend_pid(),'2000-01-01') stale")).rows[0];
assert.deepEqual(row,{live:true,wrong_pid:false,stale:false});
const sessionA = await readFile(new URL('affairs_concurrency_session_a.sql',import.meta.url),'utf8');
const sessionB = await readFile(new URL('affairs_concurrency_session_b.sql',import.meta.url),'utf8');
assert.match(sessionA,/pg_blocking_pids/,'A must witness actual blocking');
assert.match(sessionB,/affairs_test_lock_observed/,'B must reject sequential or stale evidence');
await db.close();
console.log('PASS: all three concurrency scripts refuse an unapproved database; multi-session tests NOT executed');
