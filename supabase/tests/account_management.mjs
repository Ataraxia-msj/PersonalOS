// Disposable in-memory PostgreSQL only. Never accepts a database URL.
// node supabase/tests/account_management.mjs <absolute @electric-sql/pglite/dist/index.js> [--red]
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
  await db.exec(await readFile(new URL("../migrations/202610020001_account_management.sql", import.meta.url), "utf8"));
}

const rpcCount = await one("select count(*)::int n from pg_proc where proname in ('create_account','update_account','set_account_active')");
assert.equal(rpcCount.n, 3, "account management RPCs must exist");
assert.deepEqual(await sql("select table_name,grantee,privilege_type from information_schema.role_table_grants where table_schema='public' order by 1,2,3"), grantsBefore);
assert.deepEqual(await sql("select viewname,definition from pg_views where schemaname='public' order by 1"), viewsBefore);
assert.deepEqual(await sql("select tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' order by 1,2"), policiesBefore);

await db.exec("set role authenticated; set request.jwt.claim.sub='90000000-0000-0000-0000-000000000001'");

const callCreate = async ({
  id = randomUUID(), name = `account-${randomUUID()}`, accountClass = "asset",
  accountType = "bank", currency = "CNY", institution = "Test Bank",
  include = true, sort = 0, note = null, balance = 100.25,
  at = "2025-02-01T00:00:00Z",
} = {}) => (await sql(
  "select * from public.create_account($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
  [id, name, accountClass, accountType, currency, institution, include, sort, note, balance, at],
))[0];

const callUpdate = async (account, overrides = {}) => (await sql(
  "select * from public.update_account($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
  [account.id, overrides.expected ?? account.updated_at, overrides.name ?? account.name,
    overrides.accountClass ?? account.account_class, overrides.accountType ?? account.account_type,
    overrides.currency ?? account.currency, overrides.institution ?? account.institution,
    overrides.include ?? account.include_in_net_worth, overrides.sort ?? account.sort_order,
    overrides.note ?? account.note],
))[0];

const callActive = async (account, active, expected = account.updated_at) => (await sql(
  "select * from public.set_account_active($1,$2,$3)", [account.id, expected, active],
))[0];

const assetId = randomUUID();
const assetInput = {
  id: assetId, name: "Primary Bank", accountClass: "asset", accountType: "bank",
  balance: 1234.56, at: "2025-02-01T00:00:00Z", sort: 2, note: "opening",
};
const created = await callCreate(assetInput);
assert.equal(created.account_id, assetId);
assert.equal(created.snapshot_id, assetId);
assert.equal(created.replayed, false);
assert.deepEqual(await one("select name,account_class,account_type,currency,is_active,sort_order,note from accounts where id=$1", [assetId]), {
  name: "Primary Bank", account_class: "asset", account_type: "bank", currency: "CNY",
  is_active: true, sort_order: 2, note: "opening",
});
assert.deepEqual(await one("select account_id,balance::float8 balance,source,note from balance_snapshots where id=$1", [assetId]), {
  account_id: assetId, balance: 1234.56, source: "manual", note: "opening",
});
assert.equal((await callCreate(assetInput)).replayed, true);
assert.equal(Number((await one("select count(*) n from accounts where id=$1", [assetId])).n), 1);
assert.equal(Number((await one("select count(*) n from balance_snapshots where account_id=$1", [assetId])).n), 1);
await assert.rejects(callCreate({ ...assetInput, balance: 1234.57 }), /request_payload_conflict/);

const liabilityId = randomUUID();
await callCreate({ id: liabilityId, name: "Student Loan", accountClass: "liability", accountType: "loan", balance: 5000 });
assert.equal(Number((await one("select balance::float8 balance from balance_snapshots where id=$1", [liabilityId])).balance), 5000);

await assert.rejects(callCreate({ name: "Primary Bank" }), /account_name_conflict/);
const invalidInputs = [
  [{ name: "" }, /invalid_account_name/],
  [{ accountClass: "asset", accountType: "loan" }, /invalid_account_class_type/],
  [{ currency: "cny" }, /invalid_account_currency/],
  [{ sort: -1 }, /invalid_account_sort_order/],
  [{ balance: -1 }, /invalid_initial_balance/],
  [{ balance: 1.001 }, /invalid_initial_balance/],
  [{ balance: "NaN" }, /invalid_initial_balance/],
  [{ at: "2999-01-01T00:00:00Z" }, /invalid_balance_time/],
];
for (const [input, error] of invalidInputs) await assert.rejects(callCreate(input), error);

let asset = await one("select * from accounts where id=$1", [assetId]);
const metadata = await callUpdate(asset, { name: "Primary Bank Renamed", institution: "New Bank", include: false, sort: 4, note: "updated" });
assert.equal(metadata.structure_locked, true);
asset = await one("select * from accounts where id=$1", [assetId]);
assert.equal(asset.name, "Primary Bank Renamed");
assert.equal(asset.include_in_net_worth, false);
await assert.rejects(callUpdate(asset, { accountClass: "liability", accountType: "loan" }), /account_structure_locked/);
await assert.rejects(callUpdate(asset, { expected: "2000-01-01T00:00:00Z", name: "stale" }), /stale_account/);

const emptyId = randomUUID();
await sql("insert into accounts(id,name,account_class,account_type,currency) values($1,'Legacy Empty','asset','bank','CNY')", [emptyId]);
let empty = await one("select * from accounts where id=$1", [emptyId]);
const changed = await callUpdate(empty, { accountClass: "liability", accountType: "loan", currency: "USD" });
assert.equal(changed.structure_locked, false);
empty = await one("select * from accounts where id=$1", [emptyId]);
assert.equal(empty.account_class, "liability");
assert.equal(empty.account_type, "loan");
assert.equal(empty.currency, "USD");

const entryId = randomUUID();
await sql("insert into journal_entries(id,occurred_at,entry_type,description,source,status) values($1,'2025-02-02','expense','history','manual','confirmed')", [entryId]);
await sql("insert into journal_lines(entry_id,account_id,amount,sort_order) values($1,$2,-1,0)", [entryId, assetId]);
asset = await one("select * from accounts where id=$1", [assetId]);
const factsBefore = await one("select (select count(*)::int from balance_snapshots where account_id=$1) snapshots,(select count(*)::int from journal_lines where account_id=$1) lines", [assetId]);
const disabled = await callActive(asset, false);
assert.equal(disabled.is_active, false);
asset = await one("select * from accounts where id=$1", [assetId]);
assert.deepEqual(await one("select (select count(*)::int from balance_snapshots where account_id=$1) snapshots,(select count(*)::int from journal_lines where account_id=$1) lines", [assetId]), factsBefore);
await assert.rejects(callActive(asset, true, "2000-01-01T00:00:00Z"), /stale_account/);
const enabled = await callActive(asset, true);
assert.equal(enabled.is_active, true);

await db.exec("reset role");
const privileges = await one("select has_function_privilege('public','public.create_account(uuid,text,text,text,text,text,boolean,integer,text,numeric,timestamptz)','execute') public_can, has_function_privilege('anon','public.create_account(uuid,text,text,text,text,text,boolean,integer,text,numeric,timestamptz)','execute') anon_can, has_function_privilege('authenticated','public.create_account(uuid,text,text,text,text,text,boolean,integer,text,numeric,timestamptz)','execute') authenticated_can");
assert.deepEqual(privileges, { public_can: false, anon_can: false, authenticated_can: true });
await db.exec("set role anon");
await assert.rejects(callCreate(), /permission denied/);

await db.exec("reset role");
const rollbackId = randomUUID();
await db.exec(`
  create function fail_account_snapshot() returns trigger language plpgsql as $$ begin raise exception 'injected_snapshot_failure'; end $$;
  create trigger fail_account_snapshot after insert on balance_snapshots for each row when (new.account_id = '${rollbackId}') execute function fail_account_snapshot();
  set role authenticated; set request.jwt.claim.sub='90000000-0000-0000-0000-000000000001';
`);
await assert.rejects(callCreate({ id: rollbackId, name: "Rollback Account" }), /injected_snapshot_failure/);
assert.equal(Number((await one("select count(*) n from accounts where id=$1", [rollbackId])).n), 0);
assert.equal(Number((await one("select count(*) n from balance_snapshots where account_id=$1", [rollbackId])).n), 0);

console.log("PASS: account create/update/activation validation, idempotency, atomicity, history preservation, and privileges");
await db.close();
