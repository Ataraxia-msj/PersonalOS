# Affairs and Coin Rewards Phase One Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. 推荐本会话 Native 执行，执行方法与本计划需用户确认；未获授权不派子代理。

**Goal:** 在已有 Personal OS 中交付真实主线/项目/行动与金币商店闭环，让用户接续核心工作，并安全领取、兑换和追溯虚拟奖励。

**Architecture:** 新事务表与 Finance 完全隔离；所有写入通过受控、幂等的 PostgreSQL RPC，金币流水不可变追加。页面经 Server Component/Server Action → affairs service → typed queries/mutations → 同一请求的 Supabase SSR client，数据库确认后刷新 UI。

**Tech Stack:** 当前锁定 Next.js 15.5.25、React 19、TypeScript、Supabase SSR/Postgres、CSS Modules、Tabler Icons、Vitest/Testing Library；SQL 回归沿用独立 PGlite，不加入应用运行时依赖。

**Spec:** `docs/affairs-phase-one-design.md`；该书面设计优先于旧事务提案与讨论草案。

## Global Constraints

- 使用 `develop`，按用户指示不新建工作树，不自动推送、合并或发布。
- 一个核心任务完成奖励固定 **1 金币**；普通杂事 **0 金币**。
- 每次用户确认的惩罚固定扣 **1 金币**。
- 商店商品和正整数金币价格均由用户创建，没有默认商品。
- 初始金币为 0；惩罚及误奖励冲销允许虚拟余额为负；余额不足时禁止兑换商品。
- 每累计 **30 分钟**有效核心投入奖励 **1 金币**，不足部分保留；计时属于第二阶段。
- 不做计时发币、Agent 事务写入、自动惩罚、XP/等级或 GitHub/Codex 用量同步。
- 金币是虚拟激励单位，不是人民币；兑换不创建 Finance 交易或改变资产/预算。
- 当前首页 Agent 与 Finance 业务不改；不修改现有财务表、RPC、grants 或 RLS。
- publishable key + Auth cookie；保留 Next.js 15 middleware，不依赖未经验证的 getSession()，不使用 service_role、secret、连接串或数据库密码。
- 新事务表 owner RLS + authenticated SELECT + 指定 RPC execute；不授予客户端直接写表权限；DEFINER 入口显式验证归属、`search_path = ''`，不按 current_user 判断调用者身份。
- 所有日期以 Asia/Shanghai 展示；移动响应式、键盘与 reduced-motion；数据缺失不回退 mock。
- 正式库不注入测试用户/金币/商品；实际部署 SQL 仍交给用户执行，结构检查只读。

## Review Focus

1. **浏览器超时后更改表单重试**：同 request 不同 payload 报冲突，原请求仍可重放；历史回执余额不替换当前余额（任务 2、3、6、9）。
2. **普通重开后再次完成再撤销误完成**：找到最初保留的有效奖励/贡献，而不是仅查最后一次点击；净奖励至多 1（任务 3、8）。
3. **领取过奖励后改变项目归属或归档**：历史金币/贡献不迁移或重复；跨用户引用拒绝，归档不删除接续历史（任务 2、3、7）。
4. **账本跨页、回填旧日期和数值字符串**：余额按全历史 sequence 累计后分页，使用上海业务日期，unsafe integer 拒绝而不四舍五入（任务 3、4、5、10）。
5. **不同设备同时使用/取消/兑换商品**：数据库串行化同钱包，价格版本冲突要求重新确认，兑换不透支、退款只一次（任务 3、9、11）。

---

## 结构与接口合同

领域文件按职责分开：`src/lib/affairs/types.ts`（数据库行/命令）、`validation.ts`（纯输入校验）、`queries.ts`（唯一读取入口）、`adapters.ts`（View→UI）、`service.ts`（读取聚合）、`foundation-mutations.ts`（基础 RPC）、`reward-mutations.ts`（金币 RPC）、`action-state.ts`（Action 回执）。组件位于 `src/features/affairs/components/`，页面位于 `src/app/affairs/`；SQL/测试位于 `supabase/`。

### 统一 RPC 回执与命令规则

所有公共写 RPC 返回一行：`object_id uuid, object_revision bigint nullable, command_id uuid, coin_delta integer, balance_coins bigint, replayed boolean`。TS adapter 将 revision 和 sequence 规范成十进制字符串；字符串来源先按十进制格式校验，数字来源必须先验证 safe integer，不能将已经不精确的数字转字符串后宣称无损。金币金额/余额也须为 safe integer，异常报错，不截断。回执中的余额属于该命令生效时；当前余额另读 View。

所有 RPC 第一个参数 `p_request_id uuid`；更新含 `p_expected_revision bigint`。幂等键 `(user_id, request_id)`，payload 规范化后严格比较，**重放判断在 revision/状态检查之前**，否则成功后重试会被误报 stale。coin_delta 重放仍是原回执值，UI 通过 replayed 不重复播放到账动画。

基础元数据 RPC 采用白名单 jsonb；以下字段之外的键一律拒绝，不合并到任意数据库行：

- MainlineMetadata：`name, description, sort_order`；ProjectMetadata：`mainline_id, name, outcome, description, due_date`。
- TaskMetadata：`project_id, title, description, is_core, core_reason, completion_criteria, due_date`。
- MilestoneMetadata：`id(uuid/null), expected_revision(bigint/null), title, completion_criteria, sort_order`；新增 id=null，已有记录必须携带 revision。
- RewardMetadata：`name, description, price_coins, is_active`。

创建 mainline/project/task 的初始状态与 revision 由服务端设定。元数据 RPC 不允许 status、user_id、reward_state、ever_completed、completed_at、coin amount 或 sequence。日期 null 保持 null，不强制设今天。

公共 RPC 签名（每项都返回上述统一回执）：

| RPC | p_request_id 之后的参数 |
| --- | --- |
| create_affairs_mainline / create_affairs_project / create_affairs_task | p_payload jsonb |
| update_affairs_mainline | p_mainline_id uuid, p_expected_revision bigint, p_payload jsonb |
| update_affairs_project | p_project_id uuid, p_expected_revision bigint, p_payload jsonb |
| update_affairs_task | p_task_id uuid, p_expected_revision bigint, p_payload jsonb |
| set_affairs_mainline_status | p_mainline_id uuid, p_expected_revision bigint, p_status text(active/paused/archived) |
| set_affairs_mainline_focus | p_mainline_id uuid, p_expected_revision bigint, p_project_id uuid nullable |
| set_affairs_project_status | p_project_id uuid, p_expected_revision bigint, p_status text(active/paused/completed/archived), p_outcome_confirmed boolean |
| set_affairs_task_status | p_task_id uuid, p_expected_revision bigint, p_status text(todo/in_progress/waiting/cancelled), p_waiting_reason text nullable |
| save_affairs_milestones | p_project_id uuid, p_expected_revision bigint, p_milestones jsonb(array of MilestoneMetadata) |
| set_affairs_milestone_completed | p_milestone_id uuid, p_expected_revision bigint, p_completed boolean |
| record_affairs_progress | p_project_id uuid nullable, p_task_id uuid nullable, p_content text, p_next_step text nullable, p_occurred_at timestamptz |
| complete_affairs_task | p_task_id uuid, p_expected_revision bigint, p_completion_confirmed boolean |
| reopen_affairs_task | p_task_id uuid, p_expected_revision bigint |
| undo_affairs_task_completion | p_task_id uuid, p_expected_revision bigint, p_reason text |
| create_affairs_reward | p_payload jsonb |
| update_affairs_reward | p_reward_id uuid, p_expected_revision bigint, p_payload jsonb |
| redeem_affairs_reward | p_reward_id uuid, p_expected_revision bigint, p_confirmed_price integer |
| use_affairs_redemption / cancel_affairs_redemption | p_redemption_id uuid, p_expected_revision bigint |
| record_affairs_penalty | p_task_id uuid nullable, p_reason text, p_occurred_at timestamptz |
| reverse_affairs_penalty | p_penalty_id uuid, p_expected_revision bigint, p_reason text |

### 状态与数据含义

- 主线/项目 active、paused、archived 可互相转换；completed 项目先恢复 active 才可继续编辑/添加行动。归档或 completed 项目不开放任务/里程碑修改，界面提示先恢复。paused 可手动推进，暂停动作本身不产生贡献或金币。
- 项目 completed 需要 p_outcome_confirmed=true、所有已设置里程碑完成及全部核心行动 done/cancelled；零里程碑不阻止成果确认。项目完成不发金币。
- task 从未完成过时可修改核心资格；ever_completed=true 后不再改变。done 必须通过 complete RPC；从 done 重新开始必须 reopen，不能借 set_status 绕过。cancelled 可通过 todo 恢复。waiting_reason 仅 waiting 有值。
- 首次完成（包括普通事务）记录一份有效完成贡献；普通重开保留它，再完成不新增；误完成撤销那份贡献并按需要 -1，后来真实完成建立下一 cycle 的一份贡献。归属改变保留进展的历史 project_id，不改写历史归属。
- record_progress 至少一个归属，两个都提供时 task 必须属于该 project；保存时从 task 推导当时 project_id，禁止客户端指定不匹配归属。独立任务允许 project_id=null。
- milestone 元数据保存原子校验每个已有 revision，不能改其 completed 状态；不能直接移除 completed milestone，必须先显式撤销完成。project revision 同步变化；里程碑总数为 0 → rate=null，否则 **数据库 progress_rate 为 0–1 比例**，UI formatter 转百分数一次。
- 账本 posted_at 用数据库时间；penalty/progress occurred_at 是实际时间且不允许未来。每用户 wallet_sequence 连续递增，按 sequence 排序而不按回填日期重排。
- 公共错误标识：authentication_required、invalid_payload、invalid_request_id、not_found、ownership_mismatch、stale_revision、request_payload_conflict、invalid_state_transition、core_eligibility_locked、project_requires_completion、reward_price_changed、reward_unavailable、insufficient_coins、redemption_already_used、already_reversed。错误抛出回滚全操作。

## Task 1：基础 DDL、只读前置检查与隔离测试底座

**Files:** Create `supabase/checks/affairs_phase_one_preflight.sql`, `supabase/migrations/202610030005_affairs_foundation.sql`, `supabase/tests/fixtures/affairs_base.sql`, `supabase/tests/affairs_foundation.sql`, `supabase/tests/affairs_foundation.mjs`; Modify `.gitignore`（仅增加 `/.affairs-test-runtime/`）。

**Interfaces:** Consumes spec 第 5–6 节；Produces 6 张基础表 mainlines/projects/milestones/tasks/progress_entries/commands、wallet 同步表及 owner SELECT 策略；为 Task 2 提供 private helper `affairs_private.lock_wallet() returns uuid`、`affairs_private.require_user() returns uuid` 和 `affairs_private.coin_balance() returns bigint`，私有 schema/helper 不授予客户端 execute。coin_balance 在尚无金币表的基础迁移中返回 0；Task 3 必须替换为当前 owner 全流水 SUM，SQL 错误不能 fallback 为 0。

- [x] **Step 1: 写失败测试。** 断言基础表/复合 FK/索引存在、auth.users FK 有效、owner A 能 SELECT 自己但看不到 B、anon 无权限、authenticated 不能直接 INSERT/UPDATE/DELETE，空库没有业务数据；记录 Finance fixture 的 DDL/policies/grants/View 与行数用于迁移后相等检查。SQL fixture 仅隔离使用，补真实语义的 auth.uid()/auth.role() 和 auth.users，不修改生产 Auth。
- [x] **Step 2: 跑红测试。** 优先复用已有 PGlite；若不可用，仅将测试包装到 `.affairs-test-runtime`：`npm install --prefix .affairs-test-runtime --no-save --no-package-lock @electric-sql/pglite`。Run `node supabase/tests/affairs_foundation.mjs .affairs-test-runtime/node_modules/@electric-sql/pglite/dist/index.js --red`，预期具体失败为缺少 affairs_mainlines，而不是运行时导入错误；runner 用 resolve() 接受相对或绝对运行时路径，不接受数据库 URL。
- [x] **Step 3: 实现 DDL/preflight。** 空 search_path helpers 检查 auth.role() 和 uid，wallet 以 user_id 唯一并 FOR UPDATE 锁定。FK/index/文本长度/状态/revision/核心条件采用 spec 精确值；private schema 使用最小权限。preflight 只 SELECT 版本、同名对象、财务对象 grants/policies，不创建对象；migration 碰到意外同名表中止，不 CREATE OR REPLACE 覆盖未知对象。
- [x] **Step 4: 跑绿测试。** 上述命令去掉 `--red`，预期所有断言通过；迁移后 Finance 快照与迁移前完全一致。基础 migration 自带事务，失败不残留半套表。
- [x] **Step 5: 单独提交。** 只 stage 本任务列出的文件，commit `feat: add isolated affairs foundation schema`；不 push。正式库 preflight 留给用户只读执行，不使用密钥绕过。

## Task 2：基础事务 RPC 与项目成果 View

**Files:** Modify foundation migration, foundation SQL/mjs tests；不改 Finance migration。

**Interfaces:** Consumes Task 1 helpers；Produces 上表基础 RPC（从 create_mainline 至 record_progress，不含 complete/reopen/undo）和 `vw_affairs_project_progress`, `vw_affairs_daily_contributions`；统一回执此阶段 coin_delta=0、余额按已有流水或 0。

- [x] **Step 1: 写失败测试。** 建项目与独立任务 null 日期保留；5 个里程碑完成 2 个 → rate=0.4，0 个 → null；同请求同 payload 重放不增 revision，不同 payload 报 conflict；旧 revision 不覆盖。测试未知 JSON 键、跨 owner/focus 关联、任务换项目的历史进展保留、归档不删除记录、done 元数据绕过被拒绝、完成项目未达条件失败、暂停本身不生贡献。
- [x] **Step 2: 跑 foundation runner，确认缺少 RPC/View 的具体红断言。** Run `node supabase/tests/affairs_foundation.mjs .affairs-test-runtime/node_modules/@electric-sql/pglite/dist/index.js --red-rpcs`；runner 用 migration 内 `-- AFFAIRS_PUBLIC_RPCS_START` 标记分段，应用前面的 DDL/helpers、跳过后面的公共 RPC/View；标记尚未出现时应用整个基础 DDL。不把已有基础 DDL 缺失当本任务红证据。
- [x] **Step 3: 实现 RPC。** 对应元数据白名单与完整签名、规范化空值/Unicode 字符长度。锁顺序统一 wallet→project（按 id）→task/milestone→command；每个操作更新 revision、同事务存 command result。set_status 不允许直接 done 或改 reward_state；View security_invoker 及 owner 过滤，热力图只读真实有效进展。
- [x] **Step 4: 跑绿 foundation runner。** 测试不同账号/anon 调用及直接写表失败；查询 grants 确认只有指定公共入口可 EXECUTE，private helper 不可直接调用。
- [x] **Step 5: 单独提交。** commit `feat: add atomic affairs project and progress RPCs`；无远程操作。

## Task 3：金币账本、完成奖励、商店与惩罚 RPC

**Files:** Create `supabase/migrations/202610030006_affairs_rewards.sql`, `supabase/tests/affairs_rewards.sql`, `supabase/tests/affairs_rewards.mjs`; Modify foundation tests 的最终整套验证。

**Interfaces:** Consumes Task 1–2 tables/helpers/receipt；Produces coin_events/reward_items/redemptions/penalties、上表其余 RPC、`vw_affairs_coin_balance` 和 `vw_affairs_coin_ledger`。查询余额 SUM 全量事件，ledger balance_after 先窗口累计再分页。

- [x] **Step 1: 写失败测试。** 普通完成 coin_delta=0，核心 +1，不同 request 再完成不增币；reopen→complete→undo 能找到旧奖励，净 0 且有效贡献 0；再真实 complete 净 1、贡献 1。固定惩罚 -1，撤销 +1 仅一次；0 余额惩罚变 -1，兑换被拒绝。商品价格 3，余额 4 兑换后 1，取消恢复 4，使用无扣款，已使用禁止退款；调价/下架旧预览失败。分页第二页 balance_after 与全量结果一致；故障注入在各写点抛错，状态/coin/command 全部回滚。
- [x] **Step 2: Run** `node supabase/tests/affairs_rewards.mjs .affairs-test-runtime/node_modules/@electric-sql/pglite/dist/index.js --red`；基础迁移应用，跳过 rewards migration，预期缺少 complete RPC 的具体失败。
- [x] **Step 3: 实现 rewards migration。** 每次先 wallet 锁再业务对象；同 request 优先重放。替换 coin_balance helper 为真实 SUM。使用预分配 UUID、DEFERRED FK 解决扣费双向关联，部分唯一索引保证一个有效完成贡献/单事件冲销；任务 reward_state 与净奖励一致。私有 append_coin_event helper 只接受服务端计算金额，固定奖罚不由 JSON 传入。未使用 cancel 原价退币，original charge 必须对应同订单；View 继承 owner RLS。
- [x] **Step 4: 跑绿 rewards runner + foundation runner。** 断言 Finance 对象与行数未变化；replay 返回原 object id/余额但不增加 event/sequence；Unicode、同 request 不同 payload、非法事件类型、跨用户来源均拒绝。PGlite 顺序执行不作为多会话并发已通过的证据。
- [x] **Step 5: 单独提交。** commit `feat: add atomic task coins and reward redemption`；SQL 文件只供用户执行，尚未部署。

## Task 4：统一 Database 类型与纯校验合同

**Files:** Create `src/lib/supabase/database.types.ts`, `src/lib/affairs/types.ts`, `src/lib/affairs/validation.ts`, `src/lib/affairs/validation.test.ts`, `src/lib/affairs/action-state.ts`; Modify `src/lib/finance/types.ts`, `src/lib/supabase/server.ts`。

**Interfaces:** Produces `AffairsRowMap`（11 张表以去除 affairs_ 前缀的表名为键）、`AffairsRpcReceiptRow`、`AffairsReceipt`、`AffairsCommand`（上表 RPC 全名作为 operation 的 discriminated union）、`ValidationResult<T>={input:T|null,errors:Record<string,string>}`、`AffairsActionState={status:'idle'|'success'|'error'|'uncertain',fieldErrors:Record<string,string>,message:string|null,receipt:AffairsReceipt|null}`。四个 View 行类型为 `CoinBalanceRow`, `ProjectProgressRow`, `DailyContributionRow`, `CoinLedgerRow`，字段对应 spec 第 5 节。

`AffairsReceipt={objectId:string,revision:string|null,commandId:string,coinDelta:number,balanceAtCommand:number,replayed:boolean}`。`validateAffairsCommand(data:FormData, now:Date):ValidationResult<AffairsCommand>` 是唯一 Action 输入边界；union 每个成员拥有其 RPC 的明确参数，不包含 arbitrary userId 或金额。

- [x] **Step 1: 写 failing Vitest。** 标题 200 字合法、201 字拒绝，空白/null 正确；核心必须目标/完成条件；日期 2026-02-30 拒绝，未来截止允许；上海日期时间往返一致且未来进展/惩罚拒绝；价格 1/1000000 合法、0/1.1/1000001 拒绝；未知 operation 和身份/金额注入拒绝；revision/sequence 字符串保真。
- [x] **Step 2: Run** `npm run test -- src/lib/affairs/validation.test.ts`，预期缺少模块/函数。
- [x] **Step 3: 实现类型与校验。** 将 Database 组合定义迁到中立目录，Finance 行/参数定义保留并兼容 re-export Database，避免循环运行时 import。不拆改现有财务业务；大小写 UUID 规范化、字数按 Unicode code point，枚举/JSON 拒绝额外字段。
- [x] **Step 4: Run** 同一测试 + `npm run typecheck` + `npm run test -- src/lib/finance`，预期全部通过，现有 RPC 类型不退化为 any。
- [x] **Step 5: 单独提交。** commit `feat: define typed affairs commands and validation`。

## Task 5：真实读取、adapter 与 service

**Files:** Create `src/lib/affairs/{queries,adapters,service}.ts` 和各同名 `.test.ts`；Create `src/features/affairs/types.ts`。

**Interfaces:** query client 为 `SupabaseClient<Database>`；queries 输出 typed rows：`getAffairsMainlines(client)`, `getAffairsProjects(client)`, `getAffairsTasks(client,projectId?:string)`, `getAffairsMilestones(client,projectId)`, `getAffairsProgress(client,{projectId?,taskId?,fromDate?,toDate?})`, `getAffairsCoinBalance(client)`, `getAffairsContributions(client,fromDate,toDate)`, `getAffairsRewards(client)`, `getAffairsRedemptions(client)`, `getAffairsCoinLedger(client,beforeSequence?:string,pageSize=30)`, `getAffairsPenalties(client)`；每项 Promise 对应 row[]，balance 为 row|null。单对象 form/detail service 从 owner 结果返回 null→404。

Produces `getAffairsDashboardData(now=new Date()):Promise<AffairsDashboardData>`, `getAffairsProjectsData():Promise<AffairsProject[]>`, `getAffairsProjectDetailData(projectId):Promise<AffairsProjectDetailData|null>`, `getAffairsTaskListData():Promise<AffairsTaskListData>`, `getAffairsShopData():Promise<AffairsShopData>`, `getAffairsCoinsData(beforeSequence?):Promise<AffairsCoinsData>`, `getAffairsFormData(resource:'mainline'|'project'|'task'|'reward',id?:string):Promise<AffairsFormData|null>`。

UI types 统一在 features/affairs/types.ts：`AffairsTask`/`AffairsProject` 保留对应数据库字段并转 camelCase、revision 为 string；`AffairsReward` 含 id/revision/name/description/priceCoins/isActive。`AffairsFormData` 为 resource discriminated union，包含该对象 initialValues（新增为 null）、本人 mainlines/projects/tasks 选项与 serverNowISO，不命名为 FormData，避免覆盖浏览器类型。DashboardData 含 mainlines/projects/tasks/progress/contributions/balance；ProjectDetailData 含 project/milestones/tasks/progress/balance；TaskListData 含 tasks/projects/balance；ShopData 含 rewards/redemptions/balance；CoinsData 含 ledger/penalties/tasks/balance/nextBeforeSequence。以上 Data 类型名实际均带 `Affairs` 前缀。阶段比例来自 View，不在组件构造业务口径。

- [x] **Step 1: 写 failing query/service/adapter tests。** 所有查询来源为新真实表/View，错误抛出而非空数组；无 wallet 的合法空结果才映射 balance=0。ledger cursor 用 sequence < before、降序、limit 30；SQL View 先累计。service clientFactory 每次只调用一次；独立 dashboard queries Promise.all 并发，每 View 一次。unsafe integer 抛错；rate=0.4 只映射一次；未知 DB 字段先报告，不自行 ALTER。
- [x] **Step 2: Run** `npm run test -- src/lib/affairs/queries.test.ts src/lib/affairs/adapters.test.ts src/lib/affairs/service.test.ts`，确认红。
- [x] **Step 3: 实现 queries/adapters/service。** Dashboard 关注项目优先来自用户 focus，否则提示选择，不按时间长短推断重要性；接续信息来自该项目最新真实进展，没有则引导写下一步。project/task 改归属不改历史进展；无主线项目和独立核心行动也有可访问列表入口，不隐藏。
- [x] **Step 4: 同命令跑绿。** 追加 deferred Promise 测试证明独立请求同时启动，并测试 PGRST205/42703/网络失败区分空状态；404 不暴露异主数据。
- [x] **Step 5: 单独提交。** commit `feat: connect affairs read models without mock fallback`。

## Task 6：typed mutations 与 Server Actions

**Files:** Create `src/lib/affairs/{foundation-mutations,reward-mutations}.ts` 和 `.test.ts`; Create `src/app/affairs/actions.ts`, `actions.test.ts`。

**Interfaces:** `executeFoundationCommand(client, command:FoundationCommand):Promise<AffairsReceipt>`、`executeRewardCommand(client, command:RewardCommand):Promise<AffairsReceipt>`；这两种类型为 Task 4 AffairsCommand 按 operation 分出的 union。`submitAffairsAction(previous:AffairsActionState,data:FormData):Promise<AffairsActionState>` 只通过明确 switch 调用这些接口；receipt adapter 在 mutations 统一处理。

- [x] **Step 1: 写 failing tests。** 每个 operation 对应正确 RPC 与 snake_case 参数，不传 user_id/coin amount；getClaims 无 sub 不调用 RPC；校验失败保留字段错误；余额不足/价格改变/revision conflict 映射具体中文提示；RPC 空行是错误；未知结果 status=uncertain。数据库已成功但 revalidate 抛错仍 success，并提示“已保存，请刷新查看”。
- [x] **Step 2: Run** `npm run test -- src/lib/affairs/foundation-mutations.test.ts src/lib/affairs/reward-mutations.test.ts src/app/affairs/actions.test.ts`，确认红。
- [x] **Step 3: 实现。** 每个 Action 创建一个 SSR client、一次 getClaims，再校验再调用 RPC；所有 mutations 不另创建 client。success 仅 revalidatePath('/affairs','layout')，不 Finance 写入或 fake optimistic。missing RPC 明确“事务模块数据库功能尚未部署”；错误日志不打印 cookie、JWT 或秘密值。
- [x] **Step 4: 同命令跑绿。** 重放旧回执保留 replayed=true，server 不能将原 balance 当当前 live balance；表单能保留同 request/payload，再提交不能后台换 UUID。
- [x] **Step 5: 单独提交。** commit `feat: add authenticated affairs server actions`。

## Task 7：主导航、基础表单、项目与事务页面

**Files:** Modify `src/components/shell/{app-header,command-menu}.tsx` 和 header test；Create `src/features/affairs/components/{affairs-tabs,mainline-form,project-form,milestone-editor,task-form,task-list,project-list,project-detail,confirmation-panel}.tsx`, `affairs.module.css`；Create `src/app/affairs/layout.tsx`, `error.tsx`, `projects/page.tsx`, `tasks/page.tsx`, `projects/[projectId]/page.tsx`, `mainlines/new/page.tsx`, `mainlines/[mainlineId]/edit/page.tsx`, `projects/new/page.tsx`, `projects/[projectId]/edit/page.tsx`, `tasks/new/page.tsx`, `tasks/[taskId]/edit/page.tsx`；Test `forms.test.tsx`, `project-detail.test.tsx`, `task-list.test.tsx`, `src/app/affairs/layout.test.tsx`。

**Interfaces:** 基础表单接收 Task 5 AffairsFormData + mode + `action:typeof submitAffairsAction`；TaskList/ProjectList/ProjectDetail 接收对应 UI model，不获取数据库。ConfirmationPanel 使用 open/title/onClose/children，dialog 焦点管理；业务确认内容由各用途组件提供。

- [x] **Step 1: 写 failing rendered tests。** 导航/命令菜单能进入 affairs，login 仍不显示 header；普通事务可无项目/无日期保存，核心任务必须完成条件；不出现 priority/time block；提交失败保留输入、uncertain 重试保留原 request+payload；项目 paused/archived/completed 提示与恢复入口正确；无主线项目/独立核心任务在 tasks 页“全部行动”切换可找到。
- [x] **Step 2: Run** `npm run test -- src/features/affairs/components/forms.test.tsx src/features/affairs/components/project-detail.test.tsx src/features/affairs/components/task-list.test.tsx src/app/affairs/layout.test.tsx src/components/shell/app-header.test.tsx`，确认红。
- [x] **Step 3: 实现 routes/components。** 暖黑/米白/橙色复用 global tokens，桌面/手机布局；里程碑数组原子保存，completed milestone 先撤销再移除，变更分母预览。默认零散事务 ordinary + no project，提供“全部行动”切换及项目入口。Next15 params 使用 Promise 形式，详情不存在 notFound，查询异常交给错误页，不伪造零数据。
- [x] **Step 4: 同命令跑绿 + typecheck。** ConfirmationPanel 检查焦点/Tab/Esc/关闭后回收；表单 UUID 只在新的业务提交生成，不在 render 或 uncertain retry 重新生成。
- [x] **Step 5: 单独提交。** commit `feat: build affairs projects and actionable tasks`。

## Task 8：推进工作台、贡献图与完成反馈

**Files:** Create `src/features/affairs/components/{progress-dashboard,contribution-heatmap,progress-entry-form,task-completion-panel,coin-balance}.tsx`, `src/features/affairs/{contributions,format}.ts`, `src/features/affairs/contributions.test.ts`, `components/progress-dashboard.test.tsx`, `components/task-completion-panel.test.tsx`, `src/app/affairs/page.tsx`, `page.test.tsx`；Modify CSS/project-detail。

**Interfaces:** `buildContributionGrid(rows:DailyContributionRow[],today:string):ContributionWeek[]` 输出周×七日；同文件定义 `ContributionWeek={startDate:string,days:ContributionDay[]}`，`ContributionDay={date:string,weekday:number,count:number,isFuture:boolean,isToday:boolean}`，weekday 周一=0 至周日=6。`formatProgressRate(rate:number|null):string` 为 rate=0.4→40%、null→“尚未设置阶段成果”。Dashboard 接收 AffairsDashboardData；任务完成面板接收 AffairsTask、currentBalance 和 submitAffairsAction。

- [x] **Step 1: 写 failing tests。** 锚定 2026-10-03 周六，最近 26 个含当前周的周列、七行，未来格不计数；上海零点/跨年日期正确。count 强度阈值 0/1/2–3/4–6/7+ 不等于金币；选日期读取内容。进度 2/5→40%，无里程碑不假装 0%；核心完成成功 +1，普通 0，replay 无重复到账动画，failed/uncertain 无到账；reopen 与 undo 入口和说明分开。
- [x] **Step 2: Run** `npm run test -- src/features/affairs/contributions.test.ts src/features/affairs/components/progress-dashboard.test.tsx src/features/affairs/components/task-completion-panel.test.tsx src/app/affairs/page.test.tsx`，确认红。
- [x] **Step 3: 实现工作台。** 支持 focus project 切换、真实最近进展和接续点，没有明确下一步时引导选择行动，不自动建议优先级。完成与手动进展分别操作；receipt 余额标为当次结算，header 余额由最新 service 读入。贡献回看支持撤销标记；第二阶段计时只显示说明，不提供假计时按钮。
- [x] **Step 4: 同命令跑绿。** 验证 zero-data 创建入口、archived 默认隐藏仍可从历史访问、reduced-motion 不影响成功提示；日期格具备完整日期及计数 aria-label，可键盘选中。
- [x] **Step 5: 单独提交。** commit `feat: visualize mainline progress and confirmed task rewards`。

## Task 9：自定义商店与兑换闭环

**Files:** Create `src/features/affairs/components/{reward-shop,reward-form,redemption-confirmation,redemption-list}.tsx`, `components/reward-shop.test.tsx`, `components/reward-form.test.tsx`, `src/app/affairs/shop/page.tsx`, `rewards/new/page.tsx`, `rewards/[rewardId]/edit/page.tsx`；Modify CSS。

**Interfaces:** RewardShop 接收 AffairsShopData；RewardForm 接收 resource='reward' 的 AffairsFormData；RedemptionConfirmation 接收 AffairsReward、balance、action；RedemptionList 接收历史快照与 action。兑换确认提交固定 requestId、商品 revision 与当时 price，禁止自动采纳错误后的新价。

- [x] **Step 1: 写 failing tests。** 空商店只显示“添加奖励”，没有预设咖啡/电影；余额 7、价格 3 的预览 4，但确认成功前当前余额仍 7；余额不足阻止确认。调价失败保留原请求，刷新商品后用户重新确认才新 request；uncertain 同次重试不能换价。历史名称/价格快照不被商品编辑影响；使用不扣币、已使用不可取消。
- [x] **Step 2: Run** `npm run test -- src/features/affairs/components/reward-shop.test.tsx src/features/affairs/components/reward-form.test.tsx`，确认红。
- [x] **Step 3: 实现商店与历史。** 商品可上/下架，单份兑换，待使用可确认取消退币；金币和人民币说明常驻轻量文案，不自动创建 Finance 交易。表单接收真实 active/inactive 商品，历史按真实 available/used/cancelled 展示。
- [x] **Step 4: 同命令跑绿 + typecheck。** 取消只在数据库成功后改变状态；error 不清输入；移动确认金额与两个操作按钮完整可见。
- [x] **Step 5: 单独提交。** commit `feat: add personal reward shop and redemption history`。

## Task 10：金币账本、手动惩罚与撤销

**Files:** Create `src/features/affairs/components/{coin-ledger,penalty-form}.tsx`, `components/coin-ledger.test.tsx`, `components/penalty-form.test.tsx`, `src/app/affairs/coins/page.tsx`, `coins/page.test.tsx`；Modify CSS。

**Interfaces:** CoinLedger 接收 AffairsCoinsData 及 beforeSequence 翻页链接；PenaltyForm 接收 currentBalance、本人任务选项、action，无金额参数；撤销确认接收 penaltyId/revision/reason。

- [x] **Step 1: 写 failing tests。** 当前 7、固定扣 1→预览 6；0→预览 -1，仍可确认；没有金额输入或自动逾期扣费。error/uncertain 当前余额不变，success 刷新真实 -1。序号排序、旧 occurred_at 与 posted_at 分别展示，分页余额来源 View 不用当前页 sum 计算；原扣费+冲销都可追溯，只允许一次撤销。
- [x] **Step 2: Run** `npm run test -- src/features/affairs/components/coin-ledger.test.tsx src/features/affairs/components/penalty-form.test.tsx src/app/affairs/coins/page.test.tsx`，确认红。
- [x] **Step 3: 实现。** Ledger 来源回看正确任务/兑换/惩罚；reversal 链接原记录，不提供通用余额编辑。负余额只说明兑换限制，无利息或追加惩罚；普通待办逾期不出现扣费。价格/余额规范化由 adapter 处理，组件只格式化。
- [x] **Step 4: 同命令跑绿 + typecheck。** 覆盖 aria-live 保存反馈、未知结果同请求重试、错误原因保留；来源被归档仍可读历史说明，不导致整页报错。
- [x] **Step 5: 单独提交。** commit `feat: add auditable coin ledger and manual penalties`。

## Task 11：整套验证、并发证据与部署交接

**Files:** Create `supabase/tests/affairs_concurrency.sql`, `supabase/tests/affairs_concurrency_session_a.sql`, `supabase/tests/affairs_concurrency_session_b.sql`, `docs/affairs-phase-one-verification.md`, `docs/affairs-phase-one-usage.md`；Update 本计划已执行步骤与 evidence 状态。

**Interfaces:** Consumes全部前述功能；Produces逐项验收证据和用户需要执行的两个 migration 文件，明确已测/未测/阻塞，不把隔离测试当正式库联调成功。

- [x] **Step 1: 写集成断言与隔离双会话脚本。** 核心完成→余额 +1→用户商品兑换→使用或取消→惩罚/撤销→账本/View 一致；两次完成只能净 +1；余额 4 两次价格3兑换仅一笔；use/cancel 仅一转换；固定锁顺序无反向等待。脚本仅支持独立数据库 fixture，开头校验 `personal_os_affairs_isolated_test` 数据库名，不接受生产连接；不把 PGlite 单会话 Promise.all 当多连接证据。
- [x] **Step 2: 执行新旧隔离 SQL runners。** 在已确认本地运行时下运行 foundation/rewards，随后现有 account/category/income/transfer/analysis runners；全部 assertions PASS。系统没有 psql/Docker 时，双会话脚本保留为未执行并报告，不临时连接正式库，也不宣称并发测试通过。
- [x] **Step 3: 执行完整静态/单元/构建验收。** `npm run test`、`npm run typecheck`、`npm run lint`、`npm run build` 每条记录 exit code 与完整失败信息；不把首次 Next dev compilation 混入接口耗时；修复必须经过对应 red/green 回归，不能删测试凑通过。
- [ ] **Step 4: 浏览器视觉与 Auth 联调。** 390px/768px/1440px 检查工作台、项目详情、商店确认、惩罚确认及登录重定向；比对已确认三张图，清楚区分业务数据与生成图示例。若正式库 migration 尚未由用户执行，记录配置错误/真实空状态的验证，等待部署后再核对真实 View，不用 mock 伪造联调。
- [ ] **Step 5: 交接，不自动发布。** 本地 commit `test: verify affairs rewards phase one`；报告新表/View/RPC、测试证据、未执行的并发/Auth 检查及 SQL 执行顺序。用户执行 foundation 后 rewards；执行前 migration 自检对象冲突，执行后只读验收。仅用户明确指示后才合并/推送生产。

## 计划自检与执行方法

### 本次执行证据（2026-10-03）

Tasks 1–10 已逐项测试和本地提交。Task 11 的隔离脚本、完整回归、类型检查、lint、生产构建与部署说明已完成；审查修复后 75 文件 / 392 测试通过，所有 11 个隔离 SQL runner exit 0（其中 concurrency_guard 验证隔离保护及观察证据拒绝逻辑，不验证实际竞态）。生产构建 exit 0。

Task 11 双会话 **未执行**（无本地 psql/Docker）；真实业务界面及完整 Auth 浏览器验收 **待 SQL 部署**。本地现有有效 session 进入事务页面后，真实查询 PGRST205，被错误边界明确展示，无 mock fallback。390/768/1440 截图仅为导航/未部署状态。详细证据见 `docs/affairs-phase-one-verification.md`；`design-qa.md` final result 为 blocked。没有修改正式库或远程发布。独立全分支审查的 5 项 Important 已在一次 RED→GREEN 修复中处理；无 Critical、无延期 Minor，不能将待验收项目标作通过。

覆盖：spec 1–4 → Tasks 7–10；spec 5–6 → Tasks 1–6；spec 7 → Tasks 4–10；spec 8 → Tasks 5–10；spec 9 → 各任务红绿测试与 Task 11；spec 10 → 本执行顺序与用户 SQL 交接。Review Focus 五项都在对应任务中有具体断言。

界面设计图是视觉参考，图上的示例项目、余额与商品不得进入数据库 seed 或 UI fallback。任何执行中发现真实字段/对象冲突、不能满足 owner 隔离或必须修改 Finance Schema 的情况，停止相关修改并报告，不扩大权限或改口径。

本计划完成后先让用户审核并确认执行方式。推荐 Native：由当前代理在 develop 顺序实施，各任务独立红/绿验证；子代理方案需要用户选择后才启用，不为写计划派代理。计划批准前不生成 migration、不安装产品/测试依赖、不写业务代码；正式库 SQL 执行需单独获得实际执行授权。
