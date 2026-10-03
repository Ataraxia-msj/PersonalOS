# Finance 第一阶段收尾设计

日期：2026-10-03  
状态：已完成对话评审，等待书面规格确认

## 1. 目标

完成 Finance 第一阶段的最后三项能力，然后冻结本阶段的财务范围并转入 Agent 模块：

1. 支持修改收入和新版转账交易。
2. 由数据库提供总体预算执行率，前端只展示统一口径。
3. 将分析页扩展为包含核心指标、环比/同比、趋势、结构和可解释财务预警的真实数据页面。

成功标准：用户可以安全修改收入、普通转账、储蓄、投资和还款；预算页显示数据库计算的总体执行率；分析页能够解释当前财务状态以及预警触发原因；所有数据均来自 Supabase 真实表、RPC 或 View，不使用 mock fallback。

## 2. 范围

### 2.1 本阶段包含

- `update_income_transaction` PostgreSQL RPC。
- `update_transfer_transaction` PostgreSQL RPC。
- 收入和新版转账编辑页面。
- 扩展 `vw_monthly_financial_summary` 的总体预算和月度结余字段。
- 新增 `vw_monthly_financial_analysis`。
- 新增 `vw_monthly_category_spending`。
- 新增 `vw_financial_insights`。
- 重构 Analysis 页面以使用上述 View。
- 预算页接入总体预算执行率。
- 数据层、adapter、Server Action、组件及 SQL 测试。

### 2.2 本阶段不包含

- 退款、调整、作废、删除交易。
- 支出编辑行为重构。
- 将收入转换为其他交易类型，或将转账转换为其他交易类型。
- Agent 对话和 Agent 执行操作。
- 历史净资产曲线；在缺少可靠月末净资产口径时不从账户当前余额反推历史。
- 可配置预警阈值。
- service role、secret key、绕过 RLS 或客户端直接更新账本表。

## 3. 总体架构

采用分层 View 和专用原子 RPC：

```text
Supabase tables
├── update_income_transaction RPC
├── update_transfer_transaction RPC
├── vw_monthly_financial_summary（扩展）
├── vw_monthly_financial_analysis
├── vw_monthly_category_spending
└── vw_financial_insights
        ↓
typed queries / mutations
        ↓
finance service
        ↓
adapters / UI models
        ↓
Server Components + Client forms
```

页面组件不得直接散落 `.from()`、`.rpc()` 或业务聚合。数据库负责账本原子性与财务口径；service 负责并发读取和页面数据组合；adapter 负责数据库字段到 UI model 的稳定映射；组件仅负责展示与交互。

## 4. 收入修改

### 4.1 RPC

新增 `public.update_income_transaction`。输入至少包括：

```text
p_entry_id
p_occurred_at
p_description
p_account_id
p_amount
p_category_id
p_raw_text nullable
p_memo nullable
```

返回至少包括：

```text
entry_id
line_id
```

### 4.2 验证

- 调用者必须为已认证用户。
- entry 必须存在，且为 `manual + confirmed + income`。
- entry 必须只有一条符合现有收入结构的 line，且没有 budget impact。
- 金额必须大于零、最多两位小数，并在系统允许范围内。
- 时间不得为空或位于未来。
- 账户必须存在、启用且 `account_class = asset`。
- 分类必须存在、启用且 `category_type = income`。
- 描述、备注和 raw text 使用与新增收入一致的长度及空白规范。
- 不允许改变 `entry_type`、source 或 status。

### 4.3 原子更新

RPC 使用现有应用 advisory lock，并在同一事务内更新 `journal_entries` 和唯一 `journal_lines`。任一验证或写入失败均回滚。收入始终不产生 `budget_impacts`。

## 5. 转账修改

### 5.1 RPC

新增 `public.update_transfer_transaction`。输入至少包括：

```text
p_entry_id
p_occurred_at
p_description
p_from_account_id
p_to_account_id
p_amount
p_purpose
p_budget_bucket_id nullable
p_memo nullable
```

返回至少包括：

```text
entry_id
from_line_id
to_line_id
budget_impact_created
budget_period_id nullable
budget_bucket_id nullable
warning_code nullable
```

### 5.2 可编辑结构

只允许修改符合当前新版约定的转账：

- entry 为 `manual + confirmed + transfer`。
- `transfer_purpose` 为 `general | saving | investment | debt`。
- 恰好两条 line，sort order 为 0 和 1。
- 转出账户为 asset。
- 普通、储蓄和投资的转入账户为 asset；还款的转入账户为 liability。
- 两个账户不同且币种一致。
- line 符号与当前新增转账约定完全一致。
- 分类为空，budget bucket 仅可保存在转出 line。
- 历史格式、结构不完整或无法安全判断方向的转账保持只读。

### 5.3 预算处理

- 普通转账强制不计预算，并且不能携带 bucket。
- 储蓄、投资和还款的 bucket 必须存在、启用且 kind 与 purpose 一致。
- 预算业务日期固定使用 `Asia/Shanghai`。
- 原预算和新预算均未关闭时，删除旧 impact，再依据修改后的日期、用途、bucket 和 allocation 创建新 impact。
- 新日期没有 period、没有 bucket、没有 allocation 或币种不符时，交易仍修改成功，不创建新 impact，并返回明确 warning。
- 原 impact 属于 closed period 时，保留该 closed impact 的原金额、period 和 bucket；交易事实可以更新，返回 `budget_period_closed_preserved`，且不得再创建第二条 impact。
- 匹配到重叠 period、非法 bucket、账户结构错误或币种不一致时整笔回滚。
- 储蓄或投资转回继续记录为普通转账，不冲减历史累计投入。

## 6. 交易编辑 UI

- 新增交易页仍保留“支出 / 收入 / 转账”三个入口。
- 收入和转账表单增加 `mode="edit"`，复用新增表单的布局、验证提示和真实选项。
- 编辑数据由独立 service 读取并验证；组件不得自行推断 line 方向或预算归属。
- 交易列表仅对普通可编辑支出、可编辑收入和新版可编辑转账显示编辑按钮。
- 保存成功后 revalidate Finance 概览、交易、预算、账户和分析路由。
- 非致命预算情况返回成功警告，明确交易已经修改，避免用户重复提交。
- 网络结果不确定时保留原输入并要求刷新核对，不用 optimistic fake data。

## 7. 总体预算执行率

扩展 `vw_monthly_financial_summary`，新增：

```text
actual_total_allocated
overall_execution_rate
monthly_balance
```

定义：

```text
actual_total_allocated =
  actual_expense + actual_saving + actual_investment + actual_debt

overall_execution_rate =
  actual_total_allocated / planned_total_allocated

monthly_balance =
  actual_income - actual_total_expense
```

- `planned_total_allocated = 0` 时，`overall_execution_rate` 返回 `null`。
- 执行率允许超过 100%。
- 勾选“不计入预算”的支出仍计入 `actual_total_expense`，但不进入 `actual_expense` 或 `actual_total_allocated`。
- 预算页面不得在组件中重新计算总体执行率。

## 8. 月度分析 View

### 8.1 `vw_monthly_financial_analysis`

该 View 基于月度汇总输出：

- 月份、币种和 budget period 标识。
- 收入、支出、月度结余、储蓄率、总体预算执行率。
- 计划与实际的支出、储蓄、投资、还款。
- 净资产月初、月末及变化（仅在已有汇总口径可靠时展示）。
- 上一个自然月的对比值、金额差和百分比差。
- 去年同月的对比值、金额差和百分比差。

比较必须按自然月份 self join，而不是简单使用上一行或第十二行。对比月份不存在或基数为零时，百分比字段返回 `null`。

### 8.2 `vw_monthly_category_spending`

统计 `entry_type = expense` 且 `status = confirmed` 的真实支出，包含：

```text
month
currency
category_id
category_name
actual_amount
transaction_count
month_share
month_rank
```

“不计入预算”的支出仍进入分类消费分析。该 View 不将转账、储蓄、投资或还款混入消费分类。

## 9. 财务预警 View

新增 `vw_financial_insights`，统一输出：

```text
insight_key
month
type
severity
title
description
metric_value nullable
comparison_value nullable
threshold_value nullable
related_entry_id nullable
related_category_id nullable
related_budget_bucket_id nullable
```

`insight_key` 必须对同一事实稳定，便于未来 Agent 引用。description 必须说明触发数据，不使用“消费不起”等不可解释结论。

### 9.1 固定规则

1. bucket 执行率在 80% 到 100%（含）之间：提醒。
2. bucket 执行率超过 100%：警告，且不截断为 100%。
3. 当月已有支出但没有预算 period：提醒。
4. 预算分配总额超过计划收入：提醒。
5. 当月实际支出超过实际收入：负现金流警告。
6. 连续两个自然月负结余：趋势警告；缺月不能误判为连续。
7. 单笔异常消费同时满足：
   - 占交易发生月之前最近三个完整月份的平均实际收入至少 10%；
   - 高于该分类此前 12 个月单笔支出中位数的 2.5 倍；
   - 该分类此前 12 个月至少有 5 笔有效样本。
8. 最新月份的活跃流动资产账户估算余额总和低于一个月固定必要预算：流动性提醒。流动账户包括 cash、bank、ewallet、wallet_pocket 和 money_market；固定必要预算取唯一的活跃 expense bucket“固定必要开销”（兼容现有别名“固定必要”）。migration preflight 若发现零个或多个匹配 bucket，则停止部署该规则，不猜测其他 bucket。

缺少规则所需数据时不产生猜测性预警。

## 10. Analysis 页面

页面默认选择数据库中最新有数据的月份，趋势展示截至该月最近 12 个自然月。

布局包含：

1. 月份选择器。
2. 核心指标：收入、支出、结余、储蓄率、预算执行率、净资产。
3. 环比与同比：同时显示金额变化和百分比；缺少数据时显示 `—`。
4. 12 个月收入、支出和结余趋势。
5. 六个 bucket 的计划、实际、剩余和执行率。
6. 消费分类排行、金额、笔数和占比。
7. 按严重程度排列的财务预警，显示触发依据及关联交易或分类。
8. 资产、负债和当前净资产的真实快照；不伪造历史净资产曲线。

页面延续现有暖黑、Linear 风格的数据密度和响应式布局。移动端将指标卡、图表、排行和预警改为单列，不依赖横向滚动才能理解核心信息。

## 11. 查询与性能

- typed queries 分别封装三个新 View，不允许页面直接查询数据库。
- 页面 service 只创建一个 Supabase server client。
- 选定月份的指标、分类和预警查询相互独立，使用 `Promise.all()` 并发。
- 同一个 View 在一次请求中不得重复查询。
- 趋势查询限制为选定月份及之前的 12 个月，不下载全量历史交易。
- 分类排行和预警由数据库聚合，前端不为分析页拉取全部交易后计算。
- 第一阶段不增加应用缓存，不改变实时性口径。

## 12. 安全

- RPC 采用 `SECURITY INVOKER`。
- `public` 和 `anon` 无执行权限，`authenticated` 可执行。
- View 使用 `security_invoker = true`。
- 保持现有表级 grants 和 RLS，不使用 service role、secret key、数据库密码或连接字符串。
- 客户端永远不能分别更新 journal entry、lines 和 budget impacts。

## 13. 错误处理

- 参数错误、账户/分类/bucket 非法、结构异常和 period 重叠：RPC 回滚，前端显示明确错误。
- 缺少预算、allocation 或遇到 closed period：按已确认规则返回成功 warning。
- 查询错误不得降级为 mock 或伪造空数据；交由页面错误边界处理。
- 数据库字段或 View 实际结果与 TypeScript 类型不一致时，先报告差异，修正应用映射，不自行猜测字段。

## 14. Migration 顺序

建议拆分为可独立审核的 migration：

1. 收入和转账编辑 RPC，以及 transaction details View 为编辑所需字段的兼容扩展。
2. 月度汇总扩展、月度分析和分类消费 View。
3. 财务预警 View。

每个 migration 均使用事务、合理的 lock/statement timeout、明确 grants，并在完成后通知 PostgREST reload schema。migration 不改写历史交易。

## 15. 测试与验收

### 15.1 SQL / RPC

- 收入修改成功及所有输入验证。
- 转账四种 purpose 修改成功。
- 两条 line 与 budget impact 的原子性。
- open period 重归属、缺 period/bucket/allocation warning、closed impact 保留。
- 历史异常结构拒绝编辑。
- 非 authenticated 调用被拒绝。
- 任一步故障后 entry、lines、impact 均无部分写入。

### 15.2 View

- 总体执行率、零预算、超过 100%、不计预算支出的口径。
- 自然月环比、跨年同比、缺月和零基数。
- 分类支出包含不计预算支出，但排除收入和转账。
- 中位数样本不足不预警。
- 异常消费、负现金流、连续负结余、预算和流动性预警。
- RLS 下只能读取当前用户可见数据。

### 15.3 TypeScript / UI

- query、mutation、service、adapter 和 validation 单元测试。
- 收入和转账编辑表单测试。
- 交易列表 editability 测试。
- 预算总体执行率展示测试。
- 分析月份切换、同比/环比空状态、图表、排行和预警测试。
- 无 mock fallback 断言。

### 15.4 发布前验证

```text
npm test
npm run typecheck
npm run build
```

随后在已登录的真实环境进行只读页面验证。用户执行 migration 后，再使用可识别的小额数据完成收入修改、转账修改和各页面同步更新的正式库冒烟测试。

## 16. 阶段完成条件

以下条件全部满足后，Finance 第一阶段标记完成：

- 收入和新版转账可安全修改。
- 总体预算执行率来自数据库并在预算及分析页面一致展示。
- 分析页包含核心指标、环比/同比、12 个月趋势、预算结构、消费分类和可解释预警。
- 没有 mock fallback，没有客户端账本写入，没有已知字段映射错误。
- 自动化测试、类型检查和生产构建通过。
- migrations 已由用户在正式库执行，生产环境冒烟测试通过。

完成后下一阶段进入 Agent 模块，Agent 复用本阶段的 typed service 与 insight 数据，提供对话式填写和操作预览/确认。
