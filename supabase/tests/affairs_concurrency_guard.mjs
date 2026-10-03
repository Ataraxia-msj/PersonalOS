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
await db.close();
console.log('PASS: all three concurrency scripts refuse an unapproved database; multi-session tests NOT executed');
