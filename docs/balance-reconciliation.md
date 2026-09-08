# 账户余额校准

## 上线步骤

1. 在 Supabase SQL Editor 打开新查询，复制并执行整个 `supabase/migrations/202609080002_balance_reconciliation.sql`。
2. 该文件只创建两个 RPC 并设置其执行权限，不增加表字段、不改 View、不改现有表级 grants/RLS、不修改历史数据。不要只执行部分片段。
3. SQL 成功后发布对应前端代码。仅执行 SQL 不会更新 Vercel 上的前端入口。
4. 登录后进入「财务 → 账户 → 校准余额 / 历史」，填写核对时间、实际余额及可选备注，查看差额，再确认校准。
5. 第一次请选择一个真实账户，使用你实际核对的金额。不要在正式库写入虚构测试金额。保存后核对该账户余额、快照历史、资产/负债/净资产；收支和预算数值应保持不变。

本次实现没有自动执行正式库 migration，也没有自动提交、推送或部署。

## 数据口径

- 当前账户数据读取 `vw_account_balances`；历史读取对应账户的 `balance_snapshots`，不使用 mock fallback。
- 核对时间固定按北京时间输入，传输为带时区时间。实际余额应已包含该时刻及之前发生的收支。未来时间不可保存。
- 预览通过 `preview_balance_reconciliation` 计算所选时刻的估算值，不拿当前余额冒充过去余额。
- 确认通过 `reconcile_account_balance` 原子插入一条 `source = manual` 快照，绝不生成 journal entries、journal lines 或 budget impacts。
- 最新快照余额 + 快照之后的 confirmed 交易 = 估算余额。与快照时间相等的交易不会重复累加。
- 负债账户填写正数欠款，还清填 0；金额最多两位小数。停用账户仅能看历史。
- 允许历史快照。存在更晚快照时，当前余额仍以更晚快照为准；历史净资产可能变化。校准不是收入或支出。
- 不保存校准前估算值或历史差额。历史表只显示时间、实际金额、来源及备注。按用户约定，不新增禁止修改/补录旧交易的规则。

## 安全与失败处理

- 两个 RPC 均为 `SECURITY INVOKER`、空 `search_path`，要求 authenticated + 非空 `auth.uid()`；PUBLIC/anon 无执行权限。
- 页面使用现有 SSR session；Server Action 再用 `getClaims()` 验证身份；只有 publishable key + Auth cookie + 现有 RLS。
- 保存与现有 Finance 写 RPC 使用同一事务 advisory lock，重新核对预览金额与最新快照 ID。过期预览要求重新确认；同账户同时间快照不覆盖。
- 快照 UUID 作为请求 ID。相同 ID、相同内容可安全重试，不会重复写入；同 ID 不同内容拒绝。
- 网络结果未知时保留原请求重试；即使后续重试又失败，也不将第一次请求误判成未写入。若离开页面或登录失效，重新登录后先查历史，确认原记录再操作。
- 保持现有表级写权限不变，因此直接 SQL/直接表写入可绕过 advisory lock；当前是合作 RPC 之间的并发保护，不是强制唯一数据库写入口。

## 验证范围（2026-09-08）

- Vitest：128/128 通过，覆盖输入校验、查询、权限检查、保存动作、刷新、确认 UI、断网及连续重试等。
- `npm run build` 与 `npm run lint` 通过，生产构建包含新的账户校准路由。
- 独立本地 PostgreSQL（PGlite）测试通过：真实执行 migration；校验时间边界、资产/负债/零余额、非法输入、停用账户、权限、幂等、过期预览、时间冲突、历史快照、故障注入回滚及无账本/预算写入。
- 本地浏览器使用真实登录 session，验证账户入口和真实快照历史读取；桌面截图已检查，窄屏 DOM 测得 520px 无横向溢出，控制台未见 warning/error。移动视口截图工具超时，未完成 390px 截图验证。
- 未执行正式库保存测试，未执行多会话并发压测。PGlite 使用按报告构建的隔离 fixture，不代表完整正式库 View/RLS 联调已完成。

本地 SQL 测试不接受数据库连接串，执行方式：

```text
node supabase/tests/balance_reconciliation.mjs <本地安装的 @electric-sql/pglite/dist/index.js 的绝对路径>
```

PGlite 仅为临时测试依赖，未加入应用依赖。
