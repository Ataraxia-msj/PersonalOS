import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type {
  MainlineRow,
  ProjectProgressRow,
  TaskRow,
  MilestoneRow,
  ProgressRow,
  CoinBalanceRow,
  DailyContributionRow,
  RewardRow,
  RedemptionRow,
  PenaltyRow,
  CoinLedgerRow,
} from "./types";
import { decimalInteger, validDate } from "./validation";
export type AffairsQueryClient = SupabaseClient<Database>;
interface QueryError {
  message: string;
  code?: string;
}
function read<T>(name: string, data: T, error: QueryError | null): T {
  if (error) throw new Error(`${name}: ${error.code ?? ""} ${error.message}`);
  return data;
}
async function allRows<T>(
  name: string,
  q: {
    range: (
      from: number,
      to: number,
    ) => PromiseLike<{ data: T[] | null; error: QueryError | null }>;
  },
): Promise<T[]> {
  const output: T[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await q.range(start, start + 499);
    const page = read(name, data, error);
    if (page === null) throw new Error(`${name}: missing result`);
    output.push(...page);
    if (page.length < 500) return output;
  }
}
export async function getAffairsMainlines(
  c: AffairsQueryClient,
): Promise<MainlineRow[]> {
  const q = c
    .from("affairs_mainlines")
    .select("*")
    .order("sort_order")
    .order("id");
  return allRows<MainlineRow>("affairs_mainlines", q);
}
export async function getAffairsProjects(
  c: AffairsQueryClient,
): Promise<ProjectProgressRow[]> {
  const q = c
    .from("vw_affairs_project_progress")
    .select("*")
    .order("created_at", { ascending: false })
    .order("id");
  return allRows<ProjectProgressRow>("vw_affairs_project_progress", q);
}
export async function getAffairsTasks(
  c: AffairsQueryClient,
  projectId?: string,
): Promise<TaskRow[]> {
  let q = c
    .from("affairs_tasks")
    .select("*")
    .order("created_at", { ascending: false })
    .order("id");
  if (projectId) q = q.eq("project_id", projectId);
  return allRows<TaskRow>("affairs_tasks", q);
}
export async function getAffairsMilestones(
  c: AffairsQueryClient,
  projectId: string,
): Promise<MilestoneRow[]> {
  const q = c
    .from("affairs_milestones")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order")
    .order("id");
  return allRows<MilestoneRow>("affairs_milestones", q);
}
export async function getAffairsRewards(
  c: AffairsQueryClient,
): Promise<RewardRow[]> {
  const q = c
    .from("affairs_reward_items")
    .select("*")
    .order("created_at", { ascending: false })
    .order("id");
  return allRows<RewardRow>("affairs_reward_items", q);
}
export async function getAffairsRedemptions(
  c: AffairsQueryClient,
): Promise<RedemptionRow[]> {
  const q = c
    .from("affairs_redemptions")
    .select("*")
    .order("created_at", { ascending: false })
    .order("id");
  return allRows<RedemptionRow>("affairs_redemptions", q);
}
export async function getAffairsPenalties(
  c: AffairsQueryClient,
): Promise<PenaltyRow[]> {
  const q = c
    .from("affairs_penalties")
    .select("*")
    .order("created_at", { ascending: false })
    .order("id");
  return allRows<PenaltyRow>("affairs_penalties", q);
}
export async function getAffairsProgress(
  c: AffairsQueryClient,
  filter: {
    projectId?: string;
    taskId?: string;
    fromDate?: string;
    toDate?: string;
  } = {},
): Promise<ProgressRow[]> {
  let q = c
    .from("affairs_progress_entries")
    .select("*")
    .order("occurred_at", { ascending: false })
    .order("id");
  if (filter.projectId) q = q.eq("project_id", filter.projectId);
  if (filter.taskId) q = q.eq("task_id", filter.taskId);
  if (filter.fromDate) {
    if (!validDate(filter.fromDate)) throw new Error("invalid_date");
    q = q.gte("occurred_at", filter.fromDate + "T00:00:00+08:00");
  }
  if (filter.toDate) {
    if (!validDate(filter.toDate)) throw new Error("invalid_date");
    q = q.lte("occurred_at", filter.toDate + "T23:59:59.999999+08:00");
  }
  return allRows<ProgressRow>("affairs_progress_entries", q);
}
export async function getAffairsContributions(
  c: AffairsQueryClient,
  fromDate: string,
  toDate: string,
): Promise<DailyContributionRow[]> {
  return allRows<DailyContributionRow>(
    "vw_affairs_daily_contributions",
    c
      .from("vw_affairs_daily_contributions")
      .select("*")
      .gte("business_date", fromDate)
      .lte("business_date", toDate)
      .order("business_date")
      .order("user_id"),
  );
}
export async function getAffairsCoinBalance(
  c: AffairsQueryClient,
): Promise<CoinBalanceRow | null> {
  const { data, error } = await c
    .from("vw_affairs_coin_balance")
    .select("*")
    .maybeSingle();
  return read("vw_affairs_coin_balance", data, error);
}
export async function getAffairsCoinEntry(
  c: AffairsQueryClient,
  id: string,
): Promise<CoinLedgerRow | null> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    throw new Error("invalid_event_id");
  const { data, error } = await c
    .from("vw_affairs_coin_ledger")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return read("vw_affairs_coin_ledger", data, error);
}
export async function getAffairsCoinLedger(
  c: AffairsQueryClient,
  beforeSequence?: string,
  pageSize = 30,
): Promise<CoinLedgerRow[]> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100)
    throw new Error("invalid_page_size");
  let q = c
    .from("vw_affairs_coin_ledger")
    .select("*")
    .order("wallet_sequence", { ascending: false })
    .limit(pageSize);
  if (beforeSequence)
    q = q.lt("wallet_sequence", decimalInteger(beforeSequence));
  const { data, error } = await q;
  return read("vw_affairs_coin_ledger", data, error) ?? [];
}
