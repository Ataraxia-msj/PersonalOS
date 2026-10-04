import type {
  MainlineRow,
  TaskRow,
  ProjectProgressRow,
  MilestoneRow,
  ProgressRow,
  RewardRow,
  RedemptionRow,
  PenaltyRow,
  CoinLedgerRow,
  DailyContributionRow,
  CommandRow,
} from "@/lib/affairs/types";
import type {InboxEntryRow} from '@/lib/affairs/inbox-types';
export type AffairsInboxEntry=MutableUi<InboxEntryRow>;
export interface AffairsQuickAddData {mainlines:AffairsMainline[];projects:AffairsProject[];tasks:AffairsTask[];serverNowISO:string;}
export interface AffairsInboxData extends AffairsQuickAddData {entries:AffairsInboxEntry[];}
export type QuickAddLoadState={status:'ready';data:AffairsQuickAddData}|{status:'error';message:string};
export interface AffairsTaskHistory {
  id: string;
  taskId: string;
  operation: CommandRow["operation"];
  appliedAt: string;
  revision: string;
  status: TaskRow["status"] | null;
  reason: string | null;
  coinDelta: number;
}
type CamelKey<S extends string> = S extends `${infer A}_${infer B}`
  ? `${A}${Capitalize<CamelKey<B>>}`
  : S;
type Camel<T> = { [K in keyof T as K extends string ? CamelKey<K> : K]: T[K] };
type MutableUi<T> = Omit<Camel<T>, "revision"> & { revision: string };
export type AffairsMainline = MutableUi<MainlineRow>;
export type AffairsTask = Omit<MutableUi<TaskRow>, "completionCycle"> & {
  completionCycle: string;
};
export type AffairsProject = MutableUi<ProjectProgressRow>;
export type AffairsMilestone = MutableUi<MilestoneRow>;
export type AffairsProgress = Omit<Camel<ProgressRow>, "completionCycle"> & {
  completionCycle: string | null;
};
export type AffairsReward = MutableUi<RewardRow>;
export type AffairsRedemption = MutableUi<RedemptionRow>;
export type AffairsPenalty = MutableUi<PenaltyRow>;
export type AffairsCoinEntry = Omit<
  Camel<CoinLedgerRow>,
  "walletSequence" | "balanceAfter"
> & { walletSequence: string; balanceAfter: number };
export interface AffairsDashboardData {
  mainlines: AffairsMainline[];
  projects: AffairsProject[];
  tasks: AffairsTask[];
  progress: AffairsProgress[];
  contributions: DailyContributionRow[];
  balance: number;
  today: string;
  serverNowISO: string;
}
export interface AffairsWorkbenchSummary {pendingTaskCount:number;activeProjectCount:number;completedLastSevenDays:number;balance:number;}
export interface AffairsProjectNode {project:AffairsProject;tasks:AffairsTask[];}
export interface AffairsOutline {mainlines:{mainline:AffairsMainline;projects:AffairsProjectNode[]}[];independentProjects:AffairsProjectNode[];}
export type AffairsTaskScope={kind:'all'}|{kind:'mainline';id:string}|{kind:'project';id:string}|{kind:'independent'};
export interface AffairsProjectsData {projects:AffairsProject[];mainlines:AffairsMainline[];}
export interface AffairsProjectDetailData {
  inboxSourceId?:string|null;
  project: AffairsProject;
  milestones: AffairsMilestone[];
  tasks: AffairsTask[];
  progress: AffairsProgress[];
  balance: number;
  serverNowISO: string;
}
export interface AffairsTaskListData {
  tasks: AffairsTask[];
  projects: AffairsProject[];
  balance: number;
}
export interface AffairsShopData {
  rewards: AffairsReward[];
  redemptions: AffairsRedemption[];
  balance: number;
}
export interface AffairsCoinsData {
  ledger: AffairsCoinEntry[];
  penalties: AffairsPenalty[];
  tasks: AffairsTask[];
  balance: number;
  nextBeforeSequence: string | null;
  serverNowISO: string;
  linkedEntry?: AffairsCoinEntry | null;
}
interface FormOptions {
  mainlines: AffairsMainline[];
  projects: AffairsProject[];
  tasks: AffairsTask[];
  serverNowISO: string;
}
export type AffairsFormData = FormOptions &
  (
    | { resource: "mainline"; initialValues: AffairsMainline | null }
    | { resource: "project"; initialValues: AffairsProject | null }
    | {
        resource: "task";
        initialValues: AffairsTask | null;
        taskHistory: AffairsTaskHistory[];
        inboxSourceId?:string|null;
      }
    | { resource: "reward"; initialValues: AffairsReward | null }
  );
