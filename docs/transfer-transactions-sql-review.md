# 转账 SQL 审核与测试说明

2026-09-08；状态：SQL 审核包已通过隔离测试，转账前端已本地实现；用户已确认正式库迁移执行成功，并批准发布前端。开发过程中没有自动执行正式库迁移或写入正式测试交易。不要把测试 fixture 运行在正式库。

前端操作及边界见 `docs/transfer-transactions-usage.md`。

## 一、审核文件与依赖

唯一拟执行的生产迁移文件：`supabase/migrations/202609080003_transfer_transactions.sql`。

依赖：当前库已完成 `202609080001_budget_attribution_and_monthly_save.sql`，包括 journal_lines.budget_bucket_id、exclude_from_budget 和既有 save_monthly_budget。基础表/约束参考用户 2026-09-08 提供的只读报告；此处没有再次连接正式库检查漂移。余额校准功能不被此迁移替换。

迁移一次事务完成下列变更：

1. 新增 journal_entries.transfer_purpose 可空 text 字段及 CHECK；旧交易保持 NULL，无历史用途推断。
2. 新增 create_transfer_transaction RPC。
3. CREATE OR REPLACE save_monthly_budget，保留原签名和 expense 归集分支，新增规范双行 transfer 归集，扩展归集/待处理计数。
4. CREATE OR REPLACE vw_transaction_details，仅在现有字段末尾追加 transfer_purpose。
5. 设置新 RPC 的执行权限，并通知 PostgREST 刷新 Schema。

不改 create/update expense RPC、不改其他 View、不回填历史交易、不更改表 grants/RLS。新字段/新函数使用一次性创建，重复执行会报已存在并回滚；不要重复执行旧迁移或去掉报错片段继续运行。若正式库函数/字段已另行修改，应先核对差异，不能直接覆盖。

## 二、RPC 参数

```sql
create_transfer_transaction(
  p_request_id uuid,
  p_occurred_at timestamptz,
  p_description text,
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount numeric,
  p_purpose text,
  p_budget_bucket_id uuid default null,
  p_memo text default null
)
```

| 参数 | 规则 |
| --- | --- |
| p_request_id | 必填；同一次请求重试始终复用该 UUID，作为 entry_id |
| p_occurred_at | 必填、有限且不晚于数据库当前时间；预算月份使用 Asia/Shanghai 日期 |
| p_description | 去首尾空白后非空，最多 1000 字符 |
| p_from_account_id / p_to_account_id | 存在、启用、不同账户、相同币种；转出必须为 asset |
| p_amount | 正数、有限、最多两位小数、不超过 999999999999.99；不隐式四舍五入 |
| p_purpose | general / saving / investment / debt；前三种目标必须为 asset，debt 目标必须为 liability |
| p_budget_bucket_id | general 禁止携带；其他用途可空；显式值须存在、启用、bucket_kind 与用途一致 |
| p_memo | 可空，首尾空白清理后空字符串转 NULL，最多 1000 字符 |

不做汇率转换、不因估算余额不足阻止真实记账。还款仅含本金，费用另记支出。省略 bucket 不会在服务器按名称或当前配置猜测分类；前端负责把用户实际选择的真实 ID 传入。

## 三、写入和返回值

| 用途 | 转出行 sort_order=0 | 转入行 sort_order=1 | 预算 |
| --- | --- | --- | --- |
| general | -金额 | +金额 | 无 impact |
| saving / investment | -金额 | +金额 | 对应用途一次正金额 impact |
| debt | -金额 | -金额（欠款减少） | debt 一次正金额 impact |

两条 line 的 category_id 均 NULL。预算分类仅存在转出 line；impact 同时填 entry_id、转出 line_id、budget_period_id、budget_bucket_id、amount、source=manual。entry 为 confirmed/manual/transfer，普通转账 exclude_from_budget=true，其余为 false。

返回字段：entry_id、from_line_id、to_line_id、budget_impact_created、budget_period_id、budget_bucket_id、warning_code、replayed。

- budget_bucket_id 返回交易保存的选择；budget_period_id 仅在存在实际 impact 时返回。
- 同 UUID、相同标准化内容再次调用不新增记录，返回 replayed=true。
- 同 UUID 改了金额、账户、日期、描述、用途、bucket 或备注，返回 request_payload_conflict。
- 重试先检查已保存记录，不因账户/bucket 后来停用而拒绝读取原成功结果。返回的是当前实际预算状态，晚建预算归集后重试可见已创建的 impact。
- 重试不补写预算。无 impact 且已有 bucket 的重试返回 budget_not_applied，提示检查归集状态；原账户和交易已经存在，不应当作失败重新记一笔。

## 四、预算警告与错误

以下 warning 表示**交易成功**，不是整笔保存失败：

| warning_code | 含义 |
| --- | --- |
| no_budget_bucket | 未指定预算分类；保存用途，但不能自动推断归属 |
| no_budget_period | 当日未建预算；已保存分类，后续保存相应月份预算自动归集 |
| budget_period_closed | 当日预算已关闭；保留交易/分类，不改关闭预算 |
| budget_currency_mismatch | 账户币种与预算不同；不隐式换汇、不写 impact |
| no_budget_allocation | 此月份没有所选分类的 allocation；保留交易/分类等待配置 |
| budget_not_applied | 同一请求重试时记录存在但尚无 impact；需要核对当前归集状态 |

新建请求的警告优先级：无 bucket → 无月份 → 已关闭 → 币种不匹配 → 无 allocation。重叠月份检查在警告之前，普通转账也会报 overlapping_budget_periods 并回滚。显式错误/inactive/kind不匹配 bucket 在月份检查之前拒绝，不能被缺失预算掩盖。

现有旧 draft period 按既有 expense 行为可接收适用 impact，不创建或自动激活 draft。预算保存仍拒绝修改旧 draft。正常页面创建预算依旧直接 active。

晚建预算只归集符合约定的 confirmed/manual、无关联 entry、两个不同账户、正确符号/相等移动金额、源行真实 bucket、同币种、未排除且尚无任何 impact 的 transfer。缺失分类或异常明细不猜测、不修复，计入相关用途待处理数。旧用途为 NULL 的 transfer 不纳入新规则。已存在 allocation 的停用分类可保留既有历史归属；不把归集口径改成“今天启用的分类”。

储蓄/投资采用**累计投入**：投入 1000、general 转回 200，执行仍 1000；再次以 saving/investment 投入 200 后为 1200。内部调拨不想再次计预算则选择 general。本金还款不算消费，转回不算收入。

## 五、安全与失败数据流

- Authenticated session → 服务端 getClaims（前端实施阶段）→ publishable client RPC → SECURITY INVOKER + 非空 auth.uid + 既有 RLS。
- PUBLIC/anon 无新 RPC EXECUTE 权限；不引入高权限密钥，不改表级写权限。
- RPC 使用现有 pg_advisory_xact_lock(1782,1)，配合账户/预算配置行锁；参数、第二条 line、impact 等任何一步抛异常，整次写入回滚。
- 锁等待上限 5 秒不等于总请求超时。网络断开不能证明事务失败；前端需保留同一 UUID/内容重试，沿用余额校准的不确定结果保护。
- 当前是合作 RPC 的并发协议。直接表写入可能绕过 advisory lock，尤其范围内新增预算月份、手动调整金额/分类；本阶段不宣称数据库只允许 RPC 写入。
- 快照及此前补录行为不变，不新增禁止旧交易的锁。交易发生时间早于账户最新快照时，当前余额可能不再累计该条 line。

## 六、已执行测试

本地测试文件：

- `supabase/tests/transfer_transactions.mjs`：可执行 Node + PGlite 测试，不接受数据库 URL。
- `supabase/tests/fixtures/transfer_base.sql`：由用户提供的结构报告与现有已提交 migration 整理的隔离 fixture，无真实账户数据。这里只模拟认证身份；不是 Supabase 登录联调。

运行：

```text
node supabase/tests/transfer_transactions.mjs <本地 @electric-sql/pglite/dist/index.js 的绝对路径>
```

PGlite 只使用先前临时安装的本地测试依赖，没有加入应用 package.json。`--red` 跳过新 migration，可复现“缺少转账 RPC”的失败断言。

18 组隔离 PostgreSQL 场景全部通过：

1. 普通转账双行金额与净资产不变。
2. 储蓄、投资、还款本金符号与单次 impact；真实月度 View 收入/消费不变。
3. 转回不冲减、再次投入累加。
4. 晚建预算同时归集旧 expense 和新 transfer，重复保存不重复归集。
5. 同一请求重试与晚建预算后的真实返回状态。
6. 无效金额/时间/账户/币种/用途/bucket 参数回滚。
7. 缺 bucket、closed、缺 allocation 的非致命警告。
8. 重叠月份回滚。
9. 第二条 line 和 impact 的故障注入，整笔回滚。
10. anon 和空身份拒绝执行。
11. 停用账户/分类禁止新写入，不阻断原成功请求重试。
12. 同币种外币转账不误计入人民币预算。
13. 0 元额度仍可有真实执行金额。
14. 上海月份边界在晚建与已建两种路径中一致。
15. 缺分类、错误明细、旧用途不自动猜测归属。
16. 停用但已保留 allocation 的历史分类不丢失归集。
17. 新用途 CHECK 拒绝错误 entry_type 和用途值。
18. 修改请求内容/占用已有其他 entry_id 拒绝。

另外比对执行前后：表 grants、RLS policy 内容、其他 View 定义完全相同；transaction View 的原有列前缀保持不变。独立 SQL 审查也复跑了上述 18 组，未发现需修复项。

现有应用回归测试 `npm test` 128/128 通过，`npm run lint` 通过。本轮没有修改前端源码，未重复运行生产构建，不声称已完成新的 UI 联调。

## 七、尚未执行的验收

没有在正式库执行本迁移或新增测试交易，没有验证 Supabase Auth/PostgREST 实际调用；新前端尚未实现，不能声称线上可录入转账。

PGlite 单连接不能证明多连接并发。后续隔离 PostgreSQL 双会话测试如下（勿在正式库执行）：

| 场景 | 会话 A | 会话 B | 验收 |
| --- | --- | --- | --- |
| 先预算后转账 | BEGIN，保存预算，先不 COMMIT | 相同月份提交带 bucket 转账 | B 等待；A 提交后 B 创建一次 impact |
| 先转账后预算 | BEGIN，无预算时写转账，先不 COMMIT | 保存该月预算 | B 等待；A 提交后 B 自动归集一次 |
| 同请求并发 | BEGIN，提交固定 UUID 转账 | 提交相同 UUID 和内容 | A 提交后 B replayed=true，仅 1 entry、2 lines、最多 1 impact |
| 锁超时 | BEGIN，持有 advisory lock 超过 5 秒 | 提交转账 | B 报锁超时，无半笔数据；A 释放后原 UUID 可安全重试 |
| 直接写表冲突 | 直接事务更新相关配置或写入范围内月份 | 调用新 RPC | 记录等待/报错/范围竞争实际行为，不宣称全部被 advisory lock 保护 |

已批准业务设计不等于批准 SQL 已执行。先审核本文件与 migration，再由用户决定正式库执行；SQL 成功后进入前端实施和本地联调，最后单独确认 develop/main 推送发布。
