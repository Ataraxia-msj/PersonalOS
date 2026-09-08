# 交易独立预算归属与月度预算自动归集：第三版实施说明

日期：2026-09-08。状态：前端已实现；用户已执行正式数据库迁移并确认功能可用。前端发布按 develop 预览验证后再合入 main 的顺序进行。

## 最终用户流程

**记账时选择预算分类；做预算时选月份、填额度、保存。没有草稿、启用、历史消费预览或勾选步骤。**

- 日期决定月份，交易自身保存的预算分类决定归属，与月度预算的创建时间无关。
- 该月尚无预算时，照常记账并保存预算分类；以后保存该月预算，自动归集适用交易。
- 勾选“不计入预算”时不参与预算，但仍计入月度总支出、账户余额和净资产。
- 保存即 active。active 可调整额度，closed 只读；旧 draft 不自动转换，单独报告处理。
- 自动归集不产生第二笔消费、不修改交易金额、不重复插入已有 impacts。

## 数据库调整

正式迁移：[202609080001_budget_attribution_and_monthly_save.sql](../supabase/migrations/202609080001_budget_attribution_and_monthly_save.sql)。当前数据库已由用户执行，不要重复运行。旧审核稿和未采用的回滚演练仅保留在本地，不纳入发布。

### 1. 独立保存分类

新增 `journal_lines.budget_bucket_id uuid nullable`，外键引用 budget_buckets，ON DELETE RESTRICT。分类存在明细行上，与现有 category_id、account_id 同层；不需要 period 才能保存。

- 预算分类：保存 bucket UUID；“自动”在记账当时解析默认值并保存实际 UUID，不保留动态指针。
- 不计入预算：沿用 journal_entries.exclude_from_budget=true，同时普通未关闭交易的 line bucket 清空。
- 未排除但 bucket 为 null：表示没有确定归属，不等同“不计入预算”。
- 现有旧交易只从明确且唯一的 budget_impacts 还原 bucket；不同 bucket 的歧义记录不猜测。line_id=null 的旧 impact 只映射唯一单 line 且 sort_order=0 的交易。
- 不从当前 category 默认值猜测历史归属；已排除交易不回填；历史 impacts 不改动。
- 数据回填会触发原 updated_at 更新，但不改金额、账户、分类或日期。

### 2. 同步替换新增、编辑 RPC

原名称、参数签名与返回结构保留，通过 CREATE OR REPLACE 更新函数体，不删掉现有函数。

新增：校验账户和分类 → 解析/校验 bucket → 查所属月份 → 无论是否有 period 都保存 line bucket → 有适用 period 时正常写 impact；无 period 返回 no_budget_period，但 bucket 已存。

币种保护：账户与预算币种不一致时，交易及分类照常保存，但不写 impact，返回 budget_currency_mismatch；月度自动归集同样不做隐式汇率转换。旧 closed impact 继续保持原记录。

编辑：更新金额/描述/日期/归属时同步保存 line bucket，并按原规则重建未关闭预算 impact。移到未建预算的月份时，保存归属、移除旧的开放月份 impact，等待对应月份预算保存自动归集。

**避免默认值漂移：** 编辑时 p_budget_bucket_id 非空优先；为空且 category 未变，则优先保留 line 的已存 bucket；没有可保留值或 category 改变时才解析当前默认值。前端如果显式选择“自动”，应提交当下默认 bucket 的实际 UUID；不能依靠 null 表示强制重置。

原 closed-impact 保护保持：事实可按现有规则编辑，但原 closed impact、排除状态与已存归属冻结，不把新选择写进去造成两套归属。

### 3. 保存月度预算并自动归集

`save_monthly_budget(p_month, p_planned_income, p_allocations, p_period_id?, p_expected_updated_at?)`

无 status、确认交易列表、preview_token。p_month 为上海业务月的 YYYY-MM-01；月底由数据库推导。

一次事务完成：

1. 验证月首、CNY、非负两位小数金额、分类完整集合、月份不重叠；closed/旧 draft 拒绝修改。
2. 新建 active period 或修改额度，保留 allocation ID/note。
3. 归集该上海月份内 confirmed、manual、单 line、无关联 entry 的普通 expense：未明确排除、有已存 bucket、有对应 allocation、CNY、金额符号正确、尚无任何已有 impact。
4. 新增 impact 使用已存 line bucket、正的绝对金额、source=auto；从不重新查询分类默认值决定历史归属。
5. 返回 period ID/版本、计划合计/未分配、backfilled_count、pending_transaction_count、warning_codes。

任一步失败全部回滚。已经有 impact 的 entry 不再次归集，即使记录在其他月份也不擅自迁移。无归属/配置不匹配/复杂多 line 等旧记录保留并返回待处理数；这是结果提醒，不是新的确认流程。

### 4. 查询 View

保留 vw_transaction_details 已有 budget_bucket_id/name、budget_period_id 等字段的实际执行归属语义，在末尾追加：

- saved_budget_bucket_id
- saved_budget_bucket_name

无 impact 时仍能读取“已选择的预算分类”，显示为“变动必要开销 · 未计入预算”，不把所有未计入情况都归因于月份未建立。普通支出 saved 字段为空且未排除时显示“预算归属待补充”；其他交易无预算时显示“—”。不要拿类别默认值当历史真值。

## 安全与并发

- 继续 publishable key + Auth cookie + RLS、SECURITY INVOKER、空 search_path；PUBLIC/anon 不可执行，authenticated 且 auth.uid 非空才可调用。
- 不修改表级 grants / RLS，不使用高权限密钥；新增字段遵循原表权限。
- 已核对的现有策略允许 authenticated 访问全部相关记录，适用于当前单用户系统，不代表存在多用户之间的数据隔离；本次不改变此策略。
- 三个写 RPC 在读取/加行锁前统一取事务 advisory lock (1782,1)。这样“先交易后预算”会被自动归集，“先预算后交易”由交易 RPC 当场写 impact，避免应用入口之间错过归集或重复。
- 第一版单用户财务写入串行，普通读取不取该锁；锁随事务结束释放，不跨用户交互。月度保存另以短时表锁保护完整集合和去重检查。
- 5 秒 lock_timeout 是单次锁等待上限，非总请求超时。原 expense statement_timeout 设置保留，但不能把函数内配置当成所有环境下的总请求时限保证。
- 直接表写入仍可绕开 advisory lock；不宣称数据库层强制所有写入只能经 RPC。与直接写表、关闭月份的并发需隔离库测试，冲突则回滚并明确返回。
- 三个函数必须一起升级；不能只部署预算保存而保留旧版交易函数，否则并发协议不完整。

## 前端实施清单（本地已实现）

| 文件 | 改动 |
| --- | --- |
| src/lib/finance/types.ts | 新 bucket 基础表类型、saved View 字段、预算保存 RPC 类型 |
| src/lib/finance/queries.ts | getBudgetBuckets 直接读取所有启用真实分类，不依赖某月 execution；预算配置/历史读取 |
| src/lib/finance/service.ts、adapters.ts | 表单分类独立于 period；编辑读取 saved bucket；交易列表区分已选归属与实际执行 |
| src/features/finance/types.ts | 独立 buckets 列表、月份状态与保存结果 |
| src/features/finance/components/expense-transaction-form.tsx | 保留原选择框；不再因无 period 而禁用，不再换到无预算月份就清空归属；保留明确排除和 closed 保护 |
| src/app/finance/transactions/actions.ts 及编辑 action | 传递真实归属，兼容编辑 null 保留语义；改写无预算月份提示为“已保存归属，建预算后自动计入” |
| src/features/finance/components/transaction-list.tsx | 显示 saved 归属，无 impact 不误称无预算分类 |
| src/lib/finance/budget-validation.ts、budget-mutations.ts（新增） | 校验及唯一 RPC 写入口，不分表 insert |
| src/app/finance/budget/actions.ts、new/page.tsx、[periodId]/edit/page.tsx（新增） | Auth、预算保存/调整、成功刷新 |
| src/features/finance/components/budget-form.tsx（新增） | 月份、计划收入、完整六类额度，唯一保存按钮 |
| budget-list.tsx、finance.module.css | 创建/调整入口，原暗色与移动端布局 |
| 对应测试 | 无月份仍可选择/回显，保存/排除/编辑、自动归集、日期边界与并发 |

六类由真实 budget_buckets 读取，按消费预算/资金安排展示，不硬编码数据。active 分类完整提交，停用的原 allocation 只能原值保留。允许预算超过收入但提醒动用结余。

概览本月查询改为上海当前日期范围，不取“最新 active”；预算历史独立分页，不受趋势 7 行上限。执行率仍读 View，不在 UI 重新定义。

## 发布与验证顺序

1. 真实 DDL 已根据用户提供的只读快照核对；用户已执行正式迁移并确认功能可用。本次仅发布前端，不重跑迁移或写入测试交易。
2. 运行前端测试、类型检查、代码检查和生产构建，提交到 develop 并验证预览部署。
3. 预览部署通过后再发布 main。预览使用其环境变量所指向的数据库，并非自动隔离的测试库；不得自动创建虚假交易。
4. 发布后刷新旧页面。旧记录无归属者单独报告，不用默认分类自动修复。

用户的人工功能确认不等同于完整数据库验收。本地自动化测试不能替代真实 SQL、RLS、故障注入、多会话并发或桌面/移动端验收；尚未独立执行的项目见验收清单。

## 当前交付与使用

- 正式数据库冒烟测试在 `supabase/tests/budget_attribution_and_monthly_save.sql`，仅用于隔离库，数据最终回滚。更完整的边界和多会话并发用例见 [验收清单](monthly-budget-tests.md)，尚未独立执行。
- 当前数据库迁移已完成。迁移文件保留用于版本追踪或新环境安装，不用于重复升级当前数据库。
- 前端读取分类、提交新增/编辑支出前检查 saved View 字段是否可用。数据库未升级则阻止提交，避免旧 RPC 接收选择却未独立保存。
- 部署并验证后：财务 → 预算 → 创建预算 → 选月份、填写计划收入及各分类额度 → 保存预算。已建月份点击“调整预算”。没有草稿、启用、历史勾选步骤。
- 保存成功显示数据库返回的自动归集笔数和待处理笔数，刷新 Finance 数据。旧交易没有可确定归属时，进入交易编辑补选预算分类；不从当前分类默认值猜测历史。
- 未增加运行时 mock fallback。用户已确认功能可用；独立的预览部署及完整桌面/移动端验收仍需完成，组件测试不能替代此项。

依照 Supabase 技能保留 RLS 与调用者权限，并让写入协议共享短事务锁。参考：[Supabase 函数权限](https://supabase.com/docs/guides/database/functions)、[PostgreSQL 事务锁](https://www.postgresql.org/docs/current/explicit-locking.html)。
