import type {MainlineRow,TaskRow,ProjectProgressRow,MilestoneRow,ProgressRow,RewardRow,RedemptionRow,PenaltyRow,CoinLedgerRow,DailyContributionRow} from '@/lib/affairs/types';
type CamelKey<S extends string>=S extends `${infer A}_${infer B}`?`${A}${Capitalize<CamelKey<B>>}`:S;
type Camel<T>={[K in keyof T as K extends string?CamelKey<K>:K]:T[K]};
type MutableUi<T>=Omit<Camel<T>,'revision'>&{revision:string};
export type AffairsMainline=MutableUi<MainlineRow>;
export type AffairsTask=Omit<MutableUi<TaskRow>,'completionCycle'>&{completionCycle:string};
export type AffairsProject=MutableUi<ProjectProgressRow>;
export type AffairsMilestone=MutableUi<MilestoneRow>;
export type AffairsProgress=Omit<Camel<ProgressRow>,'completionCycle'>&{completionCycle:string|null};
export type AffairsReward=MutableUi<RewardRow>;
export type AffairsRedemption=MutableUi<RedemptionRow>;
export type AffairsPenalty=MutableUi<PenaltyRow>;
export type AffairsCoinEntry=Omit<Camel<CoinLedgerRow>,'walletSequence'|'balanceAfter'>&{walletSequence:string;balanceAfter:number};
export interface AffairsDashboardData {mainlines:AffairsMainline[];projects:AffairsProject[];tasks:AffairsTask[];progress:AffairsProgress[];contributions:DailyContributionRow[];balance:number;today:string;serverNowISO:string}
export interface AffairsProjectDetailData {project:AffairsProject;milestones:AffairsMilestone[];tasks:AffairsTask[];progress:AffairsProgress[];balance:number;serverNowISO:string}
export interface AffairsTaskListData {tasks:AffairsTask[];projects:AffairsProject[];balance:number}
export interface AffairsShopData {rewards:AffairsReward[];redemptions:AffairsRedemption[];balance:number}
export interface AffairsCoinsData {ledger:AffairsCoinEntry[];penalties:AffairsPenalty[];tasks:AffairsTask[];balance:number;nextBeforeSequence:string|null}
interface FormOptions {mainlines:AffairsMainline[];projects:AffairsProject[];tasks:AffairsTask[];serverNowISO:string}
export type AffairsFormData=FormOptions & ({resource:'mainline';initialValues:AffairsMainline|null}|{resource:'project';initialValues:AffairsProject|null}|{resource:'task';initialValues:AffairsTask|null}|{resource:'reward';initialValues:AffairsReward|null});

