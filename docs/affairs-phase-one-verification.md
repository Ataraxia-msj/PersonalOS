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

最终审查证据将在本记录末尾追加。

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

## 双会话测试的操作说明（以后有独立本地 PostgreSQL 时）

**不要在唯一的正式 Supabase 库运行这三个文件。** 只支持新建且名称严格为 `personal_os_affairs_isolated_test` 的本地隔离数据库。文件开头都检查数据库名。

1. 本地 psql 在该空库执行 `supabase/tests/affairs_concurrency.sql`，载入假的 Auth fixture 和两份实际 migration，并通过真实公共 RPC 准备测试数据。
2. 两个独立 psql 会话用同一个 `scenario` 参数执行 A、B 文件。分别测试 `complete` / `redeem` / `settle`。每个场景仅运行一次。
3. 先启动 A；在 A 完成 RPC 后 5 秒持锁休眠期间启动 B。B 应等待锁；15 秒 timeout 确保不能无限等待。
4. 预期：完成仅 +1 且一个有效贡献；余额 4 的两笔价格 3 兑换仅一笔成功、余额 1；使用/取消竞态只保留已使用、不能退款；流水余额和全历史累计一致。
5. B 如果先执行成功会明确报启动顺序错误；此时用新的空隔离库重测，不把顺序执行当并发通过。

本交接不包含正式库连接串、密码或 psql 生产执行命令。
