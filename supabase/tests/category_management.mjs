// Disposable in-memory PostgreSQL only. Never accepts a database URL.
// node supabase/tests/category_management.mjs <absolute @electric-sql/pglite/dist/index.js> [--red]
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const sql = async (query, args = []) => (await db.query(query, args)).rows;
const one = async (query, args = []) => (await sql(query, args))[0];

await db.exec(await readFile(new URL("./fixtures/transfer_base.sql", import.meta.url), "utf8"));
const grantsBefore = await sql("select table_name,grantee,privilege_type from information_schema.role_table_grants where table_schema='public' order by 1,2,3");
const viewsBefore = await sql("select viewname,definition from pg_views where schemaname='public' order by 1");
const policiesBefore = await sql("select tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' order by 1,2");
if (!process.argv.includes("--red")) {
  await db.exec(await readFile(new URL("../migrations/202610030001_category_management.sql", import.meta.url), "utf8"));
}

assert.equal((await one("select count(*)::int n from pg_proc where proname in ('create_category','update_category','set_category_active')")).n, 3);
assert.deepEqual(await sql("select table_name,grantee,privilege_type from information_schema.role_table_grants where table_schema='public' order by 1,2,3"), grantsBefore);
assert.deepEqual(await sql("select viewname,definition from pg_views where schemaname='public' order by 1"), viewsBefore);
assert.deepEqual(await sql("select tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' order by 1,2"), policiesBefore);

const expenseBucket = randomUUID();
const savingBucket = randomUUID();
await sql("insert into budget_buckets(id,name,bucket_kind,is_active) values($1,'日常消费','expense',true),($2,'储蓄','saving',true)", [expenseBucket, savingBucket]);
await db.exec("set role authenticated; set request.jwt.claim.sub='90000000-0000-0000-0000-000000000001'");

const create = async ({ id = randomUUID(), name = `分类-${randomUUID()}`, type = "expense", bucket = expenseBucket, sort = 0, note = null } = {}) =>
  (await sql("select * from public.create_category($1,$2,$3,$4,$5,$6)", [id, name, type, bucket, sort, note]))[0];
const update = async (category, overrides = {}) => (await sql(
  "select * from public.update_category($1,$2,$3,$4,$5,$6,$7)",
  [category.id, overrides.expected ?? category.updated_at, overrides.name ?? category.name,
    overrides.type ?? category.category_type,
    Object.hasOwn(overrides, "bucket") ? overrides.bucket : category.default_budget_bucket_id,
    overrides.sort ?? category.sort_order, overrides.note ?? category.note],
))[0];
const active = async (category, value, expected = category.updated_at) =>
  (await sql("select * from public.set_category_active($1,$2,$3)", [category.id, expected, value]))[0];

const id = randomUUID();
const original = { id, name: "餐饮", type: "expense", bucket: expenseBucket, sort: 2, note: "daily" };
assert.equal((await create(original)).replayed, false);
assert.deepEqual(await one("select name,category_type,parent_id,default_budget_bucket_id,is_active,sort_order,note from categories where id=$1", [id]), {
  name: "餐饮", category_type: "expense", parent_id: null, default_budget_bucket_id: expenseBucket,
  is_active: true, sort_order: 2, note: "daily",
});
assert.equal((await create(original)).replayed, true);
await assert.rejects(create({ ...original, sort: 3 }), /request_payload_conflict/);
await sql("update budget_buckets set is_active=false where id=$1", [expenseBucket]);
assert.equal((await create(original)).replayed, true, "replay must not depend on the bucket's current state");
await sql("update budget_buckets set is_active=true where id=$1", [expenseBucket]);
await assert.rejects(create({ name: "餐饮" }), /category_name_conflict/);
await assert.rejects(create({ name: "工资", type: "income", bucket: expenseBucket }), /income_category_budget_bucket_forbidden/);
await assert.rejects(create({ bucket: savingBucket }), /invalid_default_budget_bucket/);
await assert.rejects(create({ name: "", bucket: null }), /invalid_category_name/);
await assert.rejects(create({ sort: -1, bucket: null }), /invalid_category_sort_order/);

let category = await one("select * from categories where id=$1", [id]);
const parentId = randomUUID();
await sql("insert into categories(id,name,category_type) values($1,'生活','expense')", [parentId]);
await sql("update categories set parent_id=$1 where id=$2", [parentId, id]);
category = await one("select * from categories where id=$1", [id]);
await update(category, { name: "餐饮食品", bucket: null, sort: 4 });
category = await one("select * from categories where id=$1", [id]);
assert.equal(category.parent_id, parentId, "metadata edits must preserve an existing parent relationship");
assert.equal((await create(original)).replayed, true, "original create payload must replay after edits");
await assert.rejects(update(category, { expected: "2000-01-01T00:00:00Z" }), /stale_category/);

const account = randomUUID(); const entry = randomUUID();
await sql("insert into accounts(id,name,account_class,account_type,currency) values($1,'Test','asset','bank','CNY')", [account]);
await sql("insert into journal_entries(id,occurred_at,entry_type,description,source,status) values($1,now(),'expense','used','manual','confirmed')", [entry]);
await sql("insert into journal_lines(entry_id,account_id,amount,category_id,sort_order) values($1,$2,-1,$3,0)", [entry, account, id]);
category = await one("select * from categories where id=$1", [id]);
await assert.rejects(update(category, { type: "income", bucket: null }), /category_type_locked/);
assert.equal((await active(category, false)).is_active, false);
category = await one("select * from categories where id=$1", [id]);
assert.equal((await active(category, true)).is_active, true);
assert.equal(Number((await one("select count(*) n from journal_lines where category_id=$1", [id])).n), 1);

await db.exec("reset role");
const privileges = await one("select has_function_privilege('public','public.create_category(uuid,text,text,uuid,integer,text)','execute') public_can, has_function_privilege('anon','public.create_category(uuid,text,text,uuid,integer,text)','execute') anon_can, has_function_privilege('authenticated','public.create_category(uuid,text,text,uuid,integer,text)','execute') authenticated_can");
assert.deepEqual(privileges, { public_can: false, anon_can: false, authenticated_can: true });
await db.exec("set role anon");
await assert.rejects(create({ bucket: null }), /permission denied/);

console.log("PASS: category create/update/activation validation, idempotency, history preservation, and privileges");
await db.close();
