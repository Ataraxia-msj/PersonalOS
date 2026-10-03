# 事务与金币第一阶段验收记录

日期：2026-10-03，分支 `develop`，起点 `274a19411c331cbed97006bc8a9673b9a04559ad`。

## 已有证据

- Tasks 1–10 已逐项 red/green 验证并本地提交；代码只读取真实事务表/View，写入只调用指定、幂等、原子 RPC。
- `node supabase/tests/affairs_foundation.mjs <本地 PGlite 模块路径>`：exit 0。空 schema、Auth FK、owner RLS、客户端不能直接写、私有 helper 隔离、项目进度比例、跨 owner 引用、请求重放/冲突、revision、Finance 前后不变。
- `node supabase/tests/affairs_rewards.mjs <同路径>`：exit 0。完成/重开/重完/误完成冲销、兑换历史快照、退款一次、使用后不能退款、固定奖罚、负余额、全历史累计余额、四处写点故障回滚。
- 现有 `account_management`、`category_management`、`balance_reconciliation`、`income_transactions`、`income_transfer_editing`、`transfer_transactions`、`financial_analysis_views`、`financial_insights` 共 8 个 SQL runner：全部 exit 0。仅隔离内存 PostgreSQL，不连接正式库。
- `affairs_concurrency_guard.mjs`：exit 0，三个双会话脚本在非指定数据库立即拒绝，未创建测试 fixture。
- 首轮完整 Vitest：74 文件 / 383 测试通过；类型检查 exit 0。
- 首轮 lint 发现 6 个 prefer-const，已机械修正；随后完整 lint exit 0。
- 浏览器发现 CSS Modules 非纯 progress 选择器；新增使用 Next 实际 PostCSS 插件的回归测试，先因该选择器失败，再限定 `.page progress`，测试通过。
- 本地浏览器真实 session 进入 `/affairs`，服务端查询返回 **PGRST205：public.affairs_mainlines 未在 schema cache 中找到**。错误页明确提示两个 migration 尚未执行，不伪装零数据。未读取 cookie/token/password。

最终审查和修复证据见下文。

## 最终审查前验收

- 75 文件 / **384 测试**全部通过（2026-10-03 23:14，完整 Vitest）；`npm run typecheck`、`npm run lint` 均 exit 0。
- `npm run build` exit 0；Next.js 15.5.25 编译新增全部 `/affairs` 路由。开发服务器已停止，未部署或推送。
- `git diff --check` exit 0。
- 新业务文件统一格式化，不改变接口；应用 package.json / lockfile 没有新增 PGlite、Prettier 等运行时依赖。

## 未验证 / 阻塞

- 真正多连接并发 **未执行**：本机找不到 psql / Docker。PGlite 为单会话隔离执行，不能作为锁等待或多设备竞态的实测证明。
- 正式库 migration **尚未执行**；真实事务 View 字段/数据、写入权限、兑换链路正式联调 **尚未通过**。不能宣称生产功能已可用。
- 390/768/1440 的真实截图只覆盖导航和未部署错误页；工作台、项目详情、商店和惩罚确认的完整响应式/视觉比对 **待部署**，详见根目录 `design-qa.md`。
- 未登录时的真实浏览器跳转未单独执行，未清除用户现有 session；现有 middleware 单元测试已覆盖验证/保护。
- 页面级测试使用 Testing Library 的测试 fixture，只用于断言，不进入应用运行时和生产数据。不存在运行时 mock fallback。

## 全分支审查与最终修复验收

独立审查覆盖 `274a194..a30ba4e`：没有 Critical，5 项 Important，没有延期 Minor。作者在一轮修复中逐项观察回归测试 RED→GREEN；没有派发第二轮审查。

1. Supabase SDK 返回 status 0 / 5xx 或未知错误码时，不再误判为确定失败，保留原幂等请求，避免重复扣费或兑换。
2. 未知结果的重试再次遇到认证或其他错误时，仍锁定原请求和参数，不能自动换 UUID。
3. 内联表单成功后等待真实新 revision，再允许下一次操作；旧 revision 和未知结果不会被刷新解锁。
4. 双会话脚本必须观察真实锁等待、当前 B 会话 PID 和本次事务时间，拒绝顺序执行或旧证据的假通过。guard runner 验证拒绝逻辑，不冒充多连接测试。
5. 任务取消、恢复等历史直接读取已有 owner 隔离的 `affairs_commands`，提供“查看历史”入口，不新建事件表、不伪造历史。

修复后最终完整验收（2026-10-03）：

- `npm run test`：75 文件 / **392 测试通过**，exit 0。
- `npm run typecheck`、`npm run lint`、`npm run build`：全部 exit 0。
- 全部 **11 个隔离 SQL runner**：exit 0，包含修改后的 concurrency guard。
- `git diff --check`：exit 0。
- 没有连接正式库执行 SQL，没有 merge / push / deploy；用户已有未跟踪设计稿保留。

以上通过不解除前述部署、完整视觉/Auth 和真实并发测试阻塞。

## 执行裁定记录

以下为计划执行中的全部裁定，保留原因和可能代价：

1. 使用现有 develop：遵循用户指定；代价是没有 worktree 隔离，必须保留无关文件。
2. 使用原生 ledger/brief：Bash helper 因路径及 sandbox mkdir 重试失败；代价是手动维护过程记录。
3. Task 2 从计划精确章节读取原生 brief：helper 不可用；代价同上，不能依赖 helper 自动提取。
4. 元数据更新为完整快照：与表单契约一致，省略 nullable/bool 分别归一为 null/false；代价是调用者不能当作部分 patch。
5. 共享 mutation-result.ts：统一两套 typed switch 的回执/错误判断；代价是共享缺陷会影响全部 RPC。
6. 共享 ActionForm：统一不可变提交、未知结果重试和关闭保护；代价是共享表单回归影响多个入口。
7. 贡献图展示所有主线：现有 View 只按 owner/date 聚合；代价是暂不支持单主线筛选。
8. 显式回看原金币记录时增加可选 lookup：支持跨分页审计；代价是该次导航多一次读取。
9. 交付隔离双会话脚本，不安装数据库或连接正式库：本机无 psql/Docker；代价是真实竞态仍须后续验证。
10. 视觉验收保留 blocked：migration 未部署，不能比对真实业务状态；代价是完整视觉回归尚未排除。
11. 计时、Agent、自动惩罚和扩展 Finance 不进入一期：遵循批准范围；代价是这些功能暂不可用。
12. 正式 Auth/PostgREST 兼容性不宣称通过：等待用户执行 migration；代价是部署后仍可能发现 API/SQL 差异。
13. 完整视觉/键盘业务验收仍阻塞：当前只能展示未部署状态；代价是单元测试不能排除实际交互缺陷。
14. 真正锁等待尚未实测：无多连接 PostgreSQL 环境；代价是竞态/死锁仍未由实测排除。
15. 优先 wallet 串行化：单用户场景和批准的锁顺序；代价是未来高并发需要性能调优。
16. 任务历史复用已有 commands：保存的真实命令足够展示取消/恢复事实；代价是暂不提供完整前后字段快照对照。

## 双会话测试的操作说明（以后有独立本地 PostgreSQL 时）

**不要在唯一的正式 Supabase 库运行这三个文件。** 只支持新建且名称严格为 `personal_os_affairs_isolated_test` 的本地隔离数据库。文件开头都检查数据库名。

1. 本地 psql 在该空库执行 `supabase/tests/affairs_concurrency.sql`，载入假的 Auth fixture 和两份实际 migration，并通过真实公共 RPC 准备测试数据。
2. 两个独立 psql 会话用同一个 `scenario` 参数执行 A、B 文件。分别测试 `complete` / `redeem` / `settle`。每个场景仅运行一次。
3. 先启动 A，再立即启动 B。A 最多等 10 秒，观察 `pg_blocking_pids(B)` 是否包含 A；只在真实阻塞时记录 B 的 PID/观察时间，再提交释放锁。15 秒 timeout 防止无限等待。
4. 预期：完成仅 +1 且一个有效贡献；余额 4 的两笔价格 3 兑换仅一笔成功、余额 1；使用/取消竞态只保留已使用、不能退款；流水余额和全历史累计一致。
5. B 检查观察证据属于本会话、且发生在本次事务开始之后。B 先执行成功、完全顺序执行或复用旧证据都会失败；用新的空隔离库重测，不把顺序执行当并发通过。guard runner 只实测了隔离拒绝和“错误 PID/旧观察时间必须拒绝”的判断，不是实际锁等待测试。

本交接不包含正式库连接串、密码或 psql 生产执行命令。
