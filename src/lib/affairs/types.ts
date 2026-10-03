export type DbInteger = number | string;
export type MainlineStatus = "active" | "paused" | "archived";
export type ProjectStatus = MainlineStatus | "completed";
export type TaskStatus =
  "todo" | "in_progress" | "waiting" | "done" | "cancelled";
export interface BaseRow {
  id: string;
  user_id: string;
  created_at: string;
}
export interface MutableRow extends BaseRow {
  updated_at: string;
  revision: DbInteger;
}
export interface MainlineRow extends MutableRow {
  name: string;
  description: string | null;
  status: MainlineStatus;
  sort_order: number;
  focus_project_id: string | null;
}
export interface ProjectRow extends MutableRow {
  mainline_id: string | null;
  name: string;
  outcome: string;
  description: string | null;
  status: ProjectStatus;
  due_date: string | null;
  completed_at: string | null;
}
export interface MilestoneRow extends MutableRow {
  project_id: string;
  title: string;
  completion_criteria: string;
  sort_order: number;
  status: "pending" | "completed";
  completed_at: string | null;
}
export interface TaskRow extends MutableRow {
  project_id: string | null;
  title: string;
  description: string | null;
  is_core: boolean;
  core_reason: string | null;
  completion_criteria: string | null;
  status: TaskStatus;
  waiting_reason: string | null;
  due_date: string | null;
  completed_at: string | null;
  ever_completed: boolean;
  completion_cycle: DbInteger;
  reward_state: "never" | "awarded" | "reversed" | "ineligible";
}
export interface ProgressRow extends BaseRow {
  project_id: string | null;
  task_id: string | null;
  kind: "manual" | "task_completion";
  content: string;
  next_step: string | null;
  occurred_at: string;
  completion_cycle: DbInteger | null;
  voided_at: string | null;
  voided_reason: string | null;
}
export interface WalletRow extends BaseRow {
  last_sequence: DbInteger;
}
export interface RewardRow extends MutableRow {
  name: string;
  description: string | null;
  price_coins: number;
  is_active: boolean;
}
export interface RedemptionRow extends MutableRow {
  reward_item_id: string;
  name_snapshot: string;
  price_snapshot: number;
  status: "available" | "used" | "cancelled";
  used_at: string | null;
  cancelled_at: string | null;
  charge_event_id: string;
  refund_event_id: string | null;
}
export interface PenaltyRow extends MutableRow {
  task_id: string | null;
  reason: string;
  occurred_at: string;
  charge_event_id: string;
  reversed_at: string | null;
  reversed_reason: string | null;
  reversal_event_id: string | null;
}
export type CoinKind =
  | "task_reward"
  | "task_reward_reversal"
  | "redemption"
  | "redemption_refund"
  | "penalty"
  | "penalty_reversal";
export interface CoinEventRow extends BaseRow {
  wallet_sequence: DbInteger;
  kind: CoinKind;
  amount: number;
  task_id: string | null;
  redemption_id: string | null;
  penalty_id: string | null;
  reverses_event_id: string | null;
  command_id: string;
  description_snapshot: string;
  posted_at: string;
}
export interface CommandRow extends BaseRow {
  request_id: string;
  operation: string;
  payload: Record<string, unknown>;
  result: AffairsRpcReceiptRow;
  applied_at: string;
}
export interface AffairsRowMap {
  mainlines: MainlineRow;
  projects: ProjectRow;
  milestones: MilestoneRow;
  tasks: TaskRow;
  progress_entries: ProgressRow;
  wallets: WalletRow;
  coin_events: CoinEventRow;
  reward_items: RewardRow;
  redemptions: RedemptionRow;
  penalties: PenaltyRow;
  commands: CommandRow;
}
export interface ProjectProgressRow extends ProjectRow {
  milestone_total: number;
  milestone_completed: number;
  progress_rate: number | null;
}
export interface DailyContributionRow {
  user_id: string;
  business_date: string;
  contribution_count: number;
}
export interface CoinBalanceRow {
  user_id: string;
  balance_coins: DbInteger;
  last_sequence: DbInteger;
}
export interface CoinLedgerRow extends CoinEventRow {
  balance_after: DbInteger;
  occurred_at: string;
}
export interface AffairsRpcReceiptRow {
  object_id: string;
  object_revision: DbInteger | null;
  command_id: string;
  coin_delta: number;
  balance_coins: DbInteger;
  replayed: boolean;
}
export interface AffairsReceipt {
  objectId: string;
  revision: string | null;
  commandId: string;
  coinDelta: number;
  balanceAtCommand: number;
  replayed: boolean;
}
export interface MainlineMetadata {
  name: string;
  description: string | null;
  sort_order: number;
}
export interface ProjectMetadata {
  name: string;
  outcome: string;
  description: string | null;
  mainline_id: string | null;
  due_date: string | null;
}
export interface TaskMetadata {
  title: string;
  description: string | null;
  project_id: string | null;
  is_core: boolean;
  core_reason: string | null;
  completion_criteria: string | null;
  due_date: string | null;
}
export interface MilestoneMetadata {
  id: string | null;
  expected_revision: string | null;
  title: string;
  completion_criteria: string;
  sort_order: number;
}
export interface RewardMetadata {
  name: string;
  description: string | null;
  price_coins: number;
  is_active: boolean;
}
export interface AffairsRpcArgsMap {
  create_affairs_mainline: {
    p_request_id: string;
    p_payload: MainlineMetadata;
  };
  create_affairs_project: { p_request_id: string; p_payload: ProjectMetadata };
  create_affairs_task: { p_request_id: string; p_payload: TaskMetadata };
  update_affairs_mainline: {
    p_request_id: string;
    p_mainline_id: string;
    p_expected_revision: string;
    p_payload: MainlineMetadata;
  };
  update_affairs_project: {
    p_request_id: string;
    p_project_id: string;
    p_expected_revision: string;
    p_payload: ProjectMetadata;
  };
  update_affairs_task: {
    p_request_id: string;
    p_task_id: string;
    p_expected_revision: string;
    p_payload: TaskMetadata;
  };
  set_affairs_mainline_status: {
    p_request_id: string;
    p_mainline_id: string;
    p_expected_revision: string;
    p_status: MainlineStatus;
  };
  set_affairs_project_status: {
    p_request_id: string;
    p_project_id: string;
    p_expected_revision: string;
    p_status: ProjectStatus;
    p_outcome_confirmed: boolean;
  };
  set_affairs_task_status: {
    p_request_id: string;
    p_task_id: string;
    p_expected_revision: string;
    p_status: Exclude<TaskStatus, "done">;
    p_waiting_reason: string | null;
  };
  set_affairs_mainline_focus: {
    p_request_id: string;
    p_mainline_id: string;
    p_expected_revision: string;
    p_project_id: string | null;
  };
  save_affairs_milestones: {
    p_request_id: string;
    p_project_id: string;
    p_expected_revision: string;
    p_milestones: MilestoneMetadata[];
  };
  set_affairs_milestone_completed: {
    p_request_id: string;
    p_milestone_id: string;
    p_expected_revision: string;
    p_completed: boolean;
  };
  record_affairs_progress: {
    p_request_id: string;
    p_project_id: string | null;
    p_task_id: string | null;
    p_content: string;
    p_next_step: string | null;
    p_occurred_at: string;
  };
  complete_affairs_task: {
    p_request_id: string;
    p_task_id: string;
    p_expected_revision: string;
    p_completion_confirmed: boolean;
  };
  reopen_affairs_task: {
    p_request_id: string;
    p_task_id: string;
    p_expected_revision: string;
  };
  undo_affairs_task_completion: {
    p_request_id: string;
    p_task_id: string;
    p_expected_revision: string;
    p_reason: string;
  };
  create_affairs_reward: { p_request_id: string; p_payload: RewardMetadata };
  update_affairs_reward: {
    p_request_id: string;
    p_reward_id: string;
    p_expected_revision: string;
    p_payload: RewardMetadata;
  };
  redeem_affairs_reward: {
    p_request_id: string;
    p_reward_id: string;
    p_expected_revision: string;
    p_confirmed_price: number;
  };
  record_affairs_penalty: {
    p_request_id: string;
    p_task_id: string | null;
    p_reason: string;
    p_occurred_at: string;
  };
  reverse_affairs_penalty: {
    p_request_id: string;
    p_penalty_id: string;
    p_expected_revision: string;
    p_reason: string;
  };
  use_affairs_redemption: {
    p_request_id: string;
    p_redemption_id: string;
    p_expected_revision: string;
  };
  cancel_affairs_redemption: {
    p_request_id: string;
    p_redemption_id: string;
    p_expected_revision: string;
  };
}
export type AffairsOperation = keyof AffairsRpcArgsMap;
export type AffairsCommand = {
  [K in AffairsOperation]: { operation: K; args: AffairsRpcArgsMap[K] };
}[AffairsOperation];
export type RewardOperation =
  | "complete_affairs_task"
  | "reopen_affairs_task"
  | "undo_affairs_task_completion"
  | "create_affairs_reward"
  | "update_affairs_reward"
  | "redeem_affairs_reward"
  | "record_affairs_penalty"
  | "reverse_affairs_penalty"
  | "use_affairs_redemption"
  | "cancel_affairs_redemption";
export type FoundationCommand = Exclude<
  AffairsCommand,
  { operation: RewardOperation }
>;
export type RewardCommand = Extract<
  AffairsCommand,
  { operation: RewardOperation }
>;
export type ValidationResult<T> = {
  input: T | null;
  errors: Record<string, string>;
};
