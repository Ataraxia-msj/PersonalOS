# Personal OS：主线事务与金币激励第一阶段设计

日期：2026-10-03；业务时区：Asia/Shanghai。

状态：三页视觉稿、金币数值与本书面设计已由用户确认；进入详细实施计划阶段。没有生成 migration、修改业务代码或操作正式数据库。

## 1. 目标与已经确认的要求

目标不是安排满每天，而是让用户在时间不可预测时仍能找到长期主线、接续上次工作，并看见真实投入和成果的积累。论文、求职、备考、建设 Personal OS 都是可由用户创建的内容，不是硬编码分类。

已确认：

- 一级导航新增“事务”，与首页 Agent、财务并列。
- 主线 → 有明确结果的项目 → 可执行行动；同时保留普通零散事务。
- 保留主线工作台、贡献图、阶段进度、接续点、奖励商店和金币记录的暗色视觉。
- 一个核心任务完成奖励固定 **1 金币**；普通杂事 **0 金币**。
- 每累计 **30 分钟**有效核心投入奖励 **1 金币**，不足部分保留；计时属于第二阶段。
- 每次用户确认的惩罚固定扣 **1 金币**。
- 商店商品和正整数金币价格均由用户创建，没有默认商品。
- 不要求固定作息、预留时间块、连续打卡或使用番茄钟。
- 金币是虚拟激励单位，不是人民币。兑换不自动购买商品、不创建 Finance 交易、不改变真实资产或预算。

成功标准：用户能接续一个核心行动，确认完成后真实领取一次奖励，再兑换自己设置的现实奖励；每笔金币都可追溯，重复提交不会重复记账。

## 2. 本次提出、需要随本文件一起审核的处理策略

这些不是对前面数值确认的扩张解释：

1. 初始金币为 0，不赠送示例余额；示例图中的 7 金币不是初始数据。
2. 惩罚只由用户主动记录和确认。普通逾期、临时中断、无贡献日均不自动扣币。
3. 惩罚及误奖励冲销允许虚拟余额为负；不产生利息、不追加处罚。余额不足时禁止兑换商品。
4. 尚未使用的兑换可以取消并退一次金币；已使用奖励不允许普通取消退款。
5. 核心任务由用户指定并填写完成条件。独立核心任务可不关联项目，但必须说明推进的目标；项目归属不自动赋予金币资格。
6. 已经完成过的任务不能改变核心资格；普通任务完成后不能补发核心奖励。未完成且从未完成过的任务可以调整资格。
7. 普通“重新打开”保留已经获得的完成奖励，再次完成不重复奖励；“撤销误完成”单独冲销奖励并撤销对应贡献，之后真实完成只能恢复原有的一份奖励。
8. 不物理删除项目、任务、奖励或金币历史。采用归档、取消和有理由的冲销。

## 3. 范围和实现路线选择

本阶段完整闭环：主线、项目、里程碑、核心/普通任务、接续进展、贡献图、核心完成奖励、商品管理、兑换/使用/取消、手动惩罚/撤销及金币账本。

不做：计时器、计时发币、Agent 事务写入、日历同步、重复任务、自动惩罚、经验等级、排行榜、装备数值、GitHub/Codex 用量自动同步。当前首页 Agent 与 Finance 业务不改。

三种技术路线比较：

- **推荐：现有 Supabase + 独立事务表 + 原子 RPC + 金币流水。** 延续现有登录和部署，能正确处理跨设备与重复提交。
- 本地存储原型：界面上线快，但跨设备、持久化和并发兑换无法作为正式业务验收，不采用。
- 所有业务全量事件溯源：审计能力强，但会给主线/项目编辑增加不必要复杂度，不采用。仅金币流水采用不可变追加，普通业务对象保留版本化当前状态。

设计文件放在 `docs/`，沿用仓库现有事务文档位置；`.gitignore` 当前将 `docs/superpowers/` 作为本地设计/QA 目录排除。本文件是自包含的新依据，取代 `docs/affairs-module-design.md` 中任务优先级、强制日期分组和“完成任务数 = 项目成果进度”的旧提案。`docs/affairs-rewards-design.md` 保留为规则讨论历史，不作为实施中冲突规则的来源。

## 4. 页面与体验

### /affairs：推进工作台

次级导航：推进 / 项目 / 零散事务 / 奖励商店 / 金币记录。

展示真实贡献图、当前主线及项目的阶段成果、上次进展、下一步、一个可接续的核心任务。主线卡可切换当前关注项目，不依据逾期或任务字数自动判断重要性。提供新建主线、项目、行动和“提交进展”入口；初次进入引导创建自己的内容。

“提交进展”记录实际做了什么及下次从哪里继续，不宣告任务完成、不发金币。“确认完成”单独展示完成条件和固定奖励，数据库成功后才展示到账回执。普通任务完成显示完成结果，不显示金币到账。

贡献图采用周一到周日七行，展示截至今天的最近 26 周；不显示未来贡献。强度表示有效推进记录数，不表示金币收入。点击日期回看真实记录；单日多次真实进展可以有多条记录，但同一次提交的重试只能有一条。

### /affairs/projects 与项目详情

项目列表和 `/affairs/projects/[projectId]` 展示目标结果、阶段里程碑、接续点及核心任务。项目创建、编辑、暂停、恢复、完成、归档使用真实数据。

进度采用“已确认里程碑数 / 项目里程碑总数”。没有里程碑时显示“尚未设置阶段成果”，不显示假的 0% 或推断完成率。任务完成不会自动完成里程碑。里程碑名称可编辑，已完成里程碑不允许直接删除，只能明确撤销完成后移除。调整里程碑会改变分母，保存前提示；项目完成需要全部已设置里程碑完成，且没有未完成、未取消的核心任务，再由用户确认成果达成。零里程碑项目仍可由用户确认完成。

项目可不归主线。主线是长期方向，无“人生完成百分比”；主线完成进度不能由金币或任务总数推导。暂停不删除任务或日期；归档后默认从推进页面隐藏，但历史可读；恢复后可继续。

### /affairs/tasks：零散事务与行动

普通独立任务默认进入“零散事务”，无需创建项目。核心行动主要在工作台和项目详情接续；同一任务对象不复制成另一条待办。任务可用 todo / in_progress / waiting / done / cancelled 状态，并可查看完成/取消历史。

任务字段：标题、说明、可选项目、核心资格、核心目标说明、完成条件、可选截止日期。第一阶段不提供优先级评分或执行时间块；截止日期不等于执行安排或惩罚承诺。waiting 可填写等待说明。

### /affairs/shop：奖励商店

自行添加、编辑、上架/下架商品；商品名 1–200 字，说明最多 2000 字，价格为 1–1000000 的整数金币。每次兑换一份，不提供购物车或库存系统。

确认面板展示商品、当前价格、余额和预计兑换后余额。确认时数据库再校验商品版本、上架状态和余额；价格或版本变化要求重新确认，不悄悄以新价成交。成功后显示一份“待使用”奖励。标记使用不再次扣币；未使用取消只退款一次。商品改名、调价、下架不改变成交快照。下架商品不可兑换，历史兑换仍可使用或按规则取消。

### /affairs/coins：金币记录

按数据库生效顺序展示来源、发生日期、增减、操作后余额，支持分页和来源回看。排序使用钱包内连续序号，不用用户回填的日期重排余额。现实事件时间与入账时间分别保留。

“记录惩罚”填写原因、可选任务、实际发生时间，固定扣 1 金币，确认前预览余额。错误惩罚可填写撤销原因，生成一次 +1 冲销；原记录保留。负余额说明为虚拟欠额，仅限制兑换，不锁住任务系统。

所有日期以 Asia/Shanghai 展示。桌面确认采用侧面板；移动端采用完整可滚动面板/页面，按钮不能遮挡金额预览。支持键盘、焦点回收、Esc 关闭及 reduced-motion。动画只在真实成功后出现。颜色复用 `src/app/globals.css` 的暖黑、米白、橙色变量，不另建冲突主题。

## 5. 数据模型

以下是拟新增对象，不是已经存在的远程 DDL。最终 SQL 前先做同名对象、Postgres 版本、grants 和 RLS 的只读检查，发现冲突先报告，不覆盖现有对象。

业务表统一 `id uuid`、`user_id uuid`、`created_at timestamptz`；可修改对象另有 `updated_at timestamptz` 和 `revision bigint`。`user_id` 只能由 RPC 从 `auth.uid()` 设置，不接受客户端指定。

主线/项目名称、任务/里程碑标题均为去除首尾空白后的 1–200 字；项目 outcome、核心目标说明和完成条件为 1–2000 字；可选说明最多 10000 字。进展 content 为 1–4000 字，next_step 最多 2000 字，惩罚/撤销原因为 1–2000 字。可选空字符串统一成 null；核心必填项不允许 null。排序为非负整数，任务新建为 todo，主线/项目新建为 active，里程碑为 pending，商品默认上架。

| 新表 | 职责与专用字段 |
| --- | --- |
| affairs_mainlines | 长期方向：name、description、status(active/paused/archived)、sort_order、focus_project_id 可空 |
| affairs_projects | 有限结果：mainline_id 可空、name、outcome、description、status(active/paused/completed/archived)、due_date 可空、completed_at 可空 |
| affairs_milestones | 阶段成果：project_id、title、completion_criteria、sort_order、status(pending/completed)、completed_at 可空 |
| affairs_tasks | 行动：project_id 可空、title、description、is_core、core_reason、completion_criteria、status、waiting_reason 可空、due_date 可空、completed_at 可空、ever_completed、completion_cycle、reward_state(never/awarded/reversed/ineligible) |
| affairs_progress_entries | 推进事实：project_id/task_id 至少一个非空、kind(manual/task_completion)、content、next_step 可空、occurred_at、completion_cycle 可空、voided_at/reason 可空 |
| affairs_wallets | 每用户一个钱包同步点：user_id 唯一、last_sequence 默认 0；不保存可手工修改的余额 |
| affairs_coin_events | 不可变账本：wallet_sequence、kind(task_reward/task_reward_reversal/redemption/redemption_refund/penalty/penalty_reversal)、amount 整数、task_id/redemption_id/penalty_id 按来源关联、reverses_event_id 可空、command_id、description_snapshot、posted_at |
| affairs_reward_items | 用户商品：name、description、price_coins、is_active、revision |
| affairs_redemptions | 兑换事实：reward_item_id、name_snapshot、price_snapshot、status(available/used/cancelled)、used_at/cancelled_at 可空、charge_event_id、refund_event_id 可空 |
| affairs_penalties | 手动违约：task_id 可空、reason、occurred_at、charge_event_id、reversed_at/reason 可空、reversal_event_id 可空 |
| affairs_commands | 幂等回执：request_id、operation、规范化 payload、result、applied_at；同一 user_id + request_id 唯一 |

不预建专注会话和 XP 表。第二阶段再设计专注状态、有效秒数池及每 1800 秒一份奖励，并保留任务奖励与计时奖励不同来源。

### 关联、约束与索引

- 所有业务对象有 `(user_id, id)` 唯一键；项目、任务、进展、兑换、冲销通过带 user_id 的复合外键关联，禁止跨用户引用。
- focus_project_id 必须属于同一主线，归属变更时在同一 RPC 中清空失效的关注关系。
- 核心任务必须有非空 core_reason 和 completion_criteria。普通任务 completed_at 与金币资格独立。
- 任务 done 才有 completed_at；项目/里程碑同理。revision 从 1 起，每次真实修改递增，重放不递增。
- 进展提交时间不能在未来；截止日期可以在未来。每份完成贡献由 task_id + completion_cycle 唯一关联，重试不复制。纯元数据编辑不生成进展。
- 同一任务至多一条未撤销的 task_completion 贡献，普通重开不生成新的完成贡献。completion_cycle 只在重新建立已撤销的完成事实时用于区分来源；ever_completed 一旦为 true 不再清空，误完成撤销也不能借机改变历史奖励资格。
- coin_events 的 `(user_id, wallet_sequence)` 唯一；amount 不得为 0；核心发币/退币固定 +1，惩罚/误完成冲销固定 -1，兑换及退款金额取成交快照。
- 惩罚与误完成冲销不得被当作“兑换不允许负余额”而拒绝；只有兑换检查余额足够。
- 每份兑换最多一个扣费、一个退款；每份惩罚最多一个扣费、一个冲销；每个任务的净完成奖励只能是 0 或 1。约束、唯一索引和 RPC 状态转换共同保证。
- 单个原事件最多被冲销一次，冲销事件本身不能通用再冲销。任务误完成后重获奖励通过任务状态 RPC，不开放任意金币金额入口。
- 扣费事件与兑换/惩罚之间的互相引用使用预先生成的 UUID 和可延迟外键，在事务提交前保证完整关联；不为了分步插入而永久允许缺失 charge_event_id。
- user_id、各归属外键、task_id + completion_cycle、user_id + posted_at/sequence、user_id + occurred_at 建对应索引；不要假定 PostgreSQL 自动为外键建立索引。

### 读取模型

- `vw_affairs_coin_balance`：user_id、balance_coins、last_sequence；余额来自该用户全部金币事件之和。没有钱包/事件是合法的 0 余额，不生成赠币记录。
- `vw_affairs_project_progress`：项目字段、milestone_total、milestone_completed、progress_rate 可空；没有里程碑则 rate 为 null。
- `vw_affairs_daily_contributions`：user_id、business_date、contribution_count；只统计未撤销的真实进展。任务完成与重开不产生多份净完成贡献，手动进展没有金币。
- `vw_affairs_coin_ledger`：事件、来源快照、sequence 和按 sequence 累积的 balance_after；先计算完整历史 running balance，再分页，不在分页后的数据上重新累计。
- 主线、项目详情、任务、商品、兑换历史读取对应真实表，由独立 queries 封装，service 聚合、adapter 映射 UI。

## 6. 原子写入与安全

页面 → Server Component / Server Action → affairs service → typed queries / mutations → 当前请求的 Supabase SSR client。组件不直接 `.from()`，浏览器不分别 insert 任务和金币流水。

继续使用 publishable key + Auth cookie。Next.js 15 保留现有 middleware，不改成 Next.js 16 proxy；各事务路由纳入现有全站认证，写操作验证 getClaims()。不索要密码、不引入 service_role、secret 或数据库连接串。

**新事务表的写入口拟采用严格 RPC 权限**：authenticated 只允许 owner RLS 下的 SELECT 和指定 RPC execute，不直接 INSERT/UPDATE/DELETE；anon/public 无业务读写或 execute。受控 RPC 使用 SECURITY DEFINER、`search_path = ''` 和完整 schema 引用；每个入口显式验证 `auth.uid()` 非空、JWT 角色 authenticated、全部关联对象归属，并限制操作种类和字段。不能照搬现有 INVOKER RPC 的 `current_user = 'authenticated'` 检查，因为 DEFINER 执行用户是函数所有者。内部发币函数不开放客户端 execute。所有事务表仍启用 owner RLS；DEFINER 写入不能宣称由 RLS 自动替代归属校验。

这是针对**新金币系统**的设计选择，不修改现有财务表、RPC、grants 或 RLS。采用该权限边界是为了防止绕过 RPC 直接改任务 done 或插入金币。按对象撤销默认权限，不做全 public schema 的广泛 revoke。读取 View 采用 security_invoker，迁移前验证 PostgreSQL >= 15。

官方依据：[Supabase Database Functions](https://supabase.com/docs/guides/database/functions) 说明 DEFINER/search_path 及 execute 授权；[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) 说明 View 的 security_invoker 和 owner 隔离。这里的 RPC-only 写边界是本项目设计，不是官方要求所有 RPC 改为 DEFINER。

### 金币相关写操作

所有金币写操作先创建/锁定当前用户 wallet 行，再锁目标业务行；统一锁顺序，余额汇总在获得锁后查询。相关商品编辑也采用同一顺序，以避免兑换时版本竞态。若幂等命令已存在，规范化 payload 相同就返回原回执，不同则返回 request_payload_conflict。请求回执、状态、贡献、金币任一写入失败全部回滚。

- `complete_affairs_task`：验证 revision 与完成条件确认；任务 done + 首次或恢复后的有效完成进展 + 应得的 +1 事件 + 回执同事务提交。普通重开后的再次完成保留原有效完成贡献，普通任务不发币。
- `reopen_affairs_task`：普通重开清除完成状态，保留奖励权益与首次有效完成贡献；再次完成不追加奖励/完成贡献，可另记真实手动进展。
- `undo_affairs_task_completion`：确认是误完成；撤销当前任务完成和当前唯一有效的完成贡献，若有有效完成奖励则关联原奖励事件做 -1 冲销；任务回到 todo，净奖励回到 0。不能只按最后一次点击的 cycle 查找，以免漏掉普通重开时保留的原奖励/贡献。以后真实完成发 +1 并恢复一份有效完成贡献，不堆叠净奖励。普通任务的误完成也可撤销贡献，但不产生金币事件。
- `redeem_affairs_reward`：校验商品 revision/价格确认、上架状态和可用余额；创建 available 兑换 + 负价金币事件 + 回执。
- `use_affairs_redemption`：available → used，不增加金币事件。已取消不可使用。
- `cancel_affairs_redemption`：available → cancelled + 原成交价退款；已使用不可取消。使用/取消并发时只有一个转换能成功。
- `record_affairs_penalty`：原因和实际时间有效，关联任务必须属于本人；创建惩罚 + 固定 -1 事件 + 回执。
- `reverse_affairs_penalty`：必须提供撤销原因，原惩罚未撤销；记录一次 +1 冲销，保留原扣费。

普通主线/项目/里程碑/任务元数据、商品及进展也通过受控 RPC 创建和更新；修改携带 expected_revision，防止其他页面的新内容被覆盖。元数据 RPC 不接受 completed_at、reward_state、coin amount 或 wallet sequence。状态转换使用专门操作，不能通过编辑表单绕过奖励逻辑。

所有写操作携带稳定 request_id。同一请求结果不明确时保留 request_id 与原 payload 重试，不生成新标识。回执包含业务对象 id、新 revision、command id、当次 coin delta、事务完成时余额以及 replayed。重放中的余额标注为原回执余额，当前余额另读 View，不把历史值覆盖当前余额。

## 7. 接入文件与类型边界

预计新增：

```text
src/lib/supabase/database.types.ts
src/lib/affairs/types.ts
src/lib/affairs/queries.ts
src/lib/affairs/adapters.ts
src/lib/affairs/service.ts
src/lib/affairs/validation.ts
src/lib/affairs/mutations.ts
src/lib/affairs/action-state.ts
src/features/affairs/types.ts
src/features/affairs/components/{affairs-tabs,progress-dashboard,contribution-heatmap}.tsx
src/features/affairs/components/{mainline-form,project-form,project-detail,milestone-editor}.tsx
src/features/affairs/components/{task-list,task-form,task-completion-panel,progress-entry-form}.tsx
src/features/affairs/components/{coin-balance,reward-shop,reward-form,redemption-confirmation,redemption-list}.tsx
src/features/affairs/components/{coin-ledger,penalty-form,confirmation-panel}.tsx
src/features/affairs/components/affairs.module.css
src/app/affairs/layout.tsx
src/app/affairs/page.tsx
src/app/affairs/actions.ts
src/app/affairs/{projects,tasks,shop,coins}/page.tsx
src/app/affairs/projects/[projectId]/page.tsx
src/app/affairs/{mainlines,projects,tasks,rewards}/new/page.tsx
src/app/affairs/mainlines/[mainlineId]/edit/page.tsx
src/app/affairs/projects/[projectId]/edit/page.tsx
src/app/affairs/tasks/[taskId]/edit/page.tsx
src/app/affairs/rewards/[rewardId]/edit/page.tsx
supabase/checks/affairs_phase_one_preflight.sql
supabase/migrations/202610030005_affairs_foundation.sql
supabase/migrations/202610030006_affairs_rewards.sql
supabase/tests/affairs_foundation.sql
supabase/tests/affairs_rewards.sql
```

对应领域校验、query、adapter、service、Server Action、组件均补充邻近 `.test.ts(x)`。上述路径是边界设计，不要求一个组件塞入全部业务；商品操作可拆独立 actions，实施计划再分配到具体文件。

修改：主导航与命令菜单及其测试；SSR client 的 Database 类型 import；现有 finance/types.ts 对统一 Database 的兼容导出。

目前 SSR client 的 Database 定义位于 finance/types.ts。接入时将组合 Database 结构移入中立的 supabase/database.types.ts，保留现有财务行类型与兼容导出，事务不导入财务 UI model。不改变现有财务字段和金额；后续可统一替换为自动生成类型。

## 8. 成功、失败及未知结果

成功：数据库原子返回 → Server Action 回执 → revalidate `/affairs` layout → 展示真实到账/兑换反馈 → 重新读取项目、贡献、余额、账本。计时阶段未上线时只显示说明，不提供假启动按钮。事务写入不触发 Finance 金额变动。

失败：参数错误对应字段提示；余额不足提示所缺金币；revision 冲突要求加载最新数据；未授权返回登录失效提示或 404，不泄露其他用户内容。保留表单与确认上下文，不显示成功动画。

未知结果：提示先核对或重试同一次提交，保留 request_id；数据库重放回执不会再次发币/扣币。数据库成功但刷新失败应告知“已保存，请刷新查看”，不能当作写入失败。

空结果：0 金币、无贡献、无主线/项目、无商品分别有真实创建入口。数据库未部署或 View/字段缺失显示配置错误，不冒充空结果、不回退 mock。

## 9. 验收与数据库测试边界

必测：

1. 初始无数据，0 金币，无示例商品/任务/贡献。
2. 普通任务完成 0，核心任务完成 +1；双击、同 request 重试、不同 request 并发完成只能净得 1。
3. 普通任务完成后改核心失败；核心资格变化不改历史；waiting/暂停不发币、不自动扣币。
4. 普通重开再完成不重复奖励；误完成撤销后净 0，再真实完成净 1；已花掉金币的误奖励冲销可负余额。
5. 同时兑换余额只够一次的商品，仅一次成功；余额、订单、扣费原子一致。
6. 兑换时商品变价/下架要求重新确认；历史成交名称和价格不受编辑影响。
7. 未使用取消只退款一次；使用与取消并发只有一个成功；已使用不退款。
8. 惩罚固定 -1，客户端任意金额无效；错误撤销只 +1 一次；逾期和无贡献不会触发惩罚。
9. 任务完成/误完成撤销的贡献一致；重复保存、购物、惩罚和纯编辑不产生贡献。
10. 七行贡献图、跨月/跨年和上海零点边界正确；没有未来贡献。
11. 没有里程碑时进度为 null；设置 5 个并确认 2 个时显示 2/5、40%，不是任务完成比率。
12. 分页后的金币余额连续，回填事件时间不重排入账余额；重放旧回执不覆盖当前余额。
13. 不同用户不能读取、关联或写入对方记录；anon 不能调用；authenticated 不能直接插入金币、修改任务状态或篡改回执。
14. 同 request 不同 payload 报冲突，旧 revision 不覆盖新状态；失败不残留半笔奖励。
15. 手机、桌面、键盘、焦点、减少动效可用；Finance 和现有 Agent 回归不受影响。

本地验证沿用 `npm run test`、`npm run typecheck`、`npm run lint`、`npm run build`。数据库并发测试与 owner 权限测试使用已登录 publishable client 或隔离测试数据库，不索要数据库密码。

正式库不会注入测试金币、测试用户或真实商品。结构检查为只读；单事务 SQL 测试创建自己的 fixture、断言后 ROLLBACK，仅撤销本次测试写入，不回滚用户历史。需要跨连接并发或真实 Auth 调用而无法隔离时，只在本地/临时环境运行；只有正式库的限制不作为偷偷写生产测试数据的理由。

## 10. 分阶段顺序与下一个审核点

1. 本书面设计审核后，写详细实施计划和精确 RPC 接口、测试步骤。
2. 基础数据 migration、RLS、类型和原子奖励 migration；先做本地/隔离验证，再向用户提供 SQL 文件。默认仍由用户在 Supabase 执行，未经授权不操作正式库。
3. 接入事务数据层，再实现推进/项目/任务，接着商店/账本/惩罚，保证每块独立可测。
4. 完整回归、响应式视觉验收后，再按用户指示提交/合并/推送生产。
5. 第一阶段使用稳定后，另行设计计时奖励；最后接入 Agent 事务交互。

这份文件是设计，不是已执行的实施计划或功能完成声明。
