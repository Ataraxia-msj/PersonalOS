# Affairs 工作台与收集箱 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 用户指定继续使用当前 develop；本计划推荐当前代理原生顺序执行，不自行启用子代理。

**Goal:** 在真实事务数据上实现统一收集入口、独立收集箱、完整主线/项目层级和默认未完成行动，保持一期金币及 Finance 业务不变。

**Architecture:** Server Component / Server Action → affairs service → typed queries / mutations → Supabase SSR。收集箱新增 owner 隔离表与五个原子、revision/幂等 RPC；工作台、项目和行动仍使用既有对象，复用确认与写入机制。先交付可验证增量 SQL，再接数据和交互，不自动执行正式库 SQL 或发布。

**Tech Stack:** 已有 Next.js 15.5.25 / React 19 / TypeScript / CSS Modules / Tabler / Supabase SSR / Vitest / Testing Library；独立 SQL 测试复用现有 `.affairs-test-runtime` PGlite，无新产品依赖。

**Spec:** [affairs-workbench-inbox-design.md](affairs-workbench-inbox-design.md)，已选图位于 `docs/assets/affairs/`。

## 执行状态（2026-10-04）

Tasks 1–8 的主要代码、增量 migration 和对应回归已在 develop 实施。Task 9 的隔离 SQL 回归、构建及代码审查已运行；真实收集写入、独立 PostgreSQL 双会话并发与完整三断点视觉验收尚未通过。详细步骤是原始计划，最终证据与缺口以 `affairs-workbench-inbox-verification.md` 为准，不将计划中的预期断言当作实际验收结果。

独立审查的五项 Important 进入一次 RED→GREEN 修复：未知完成请求跨刷新保留、浏览器历史保护、统一入口选项刷新、当前项目预填、手机来源抽屉保持同一表单。普通事务/细分状态筛选与分组、总览点击快捷入口和逐项解释列为后续小项；目前所有未完成行动仍可访问。

## Global Constraints

- 分支 develop；保留未跟踪 `docs/affairs-rewards-design.md`，不创建 worktree、不修改已有已部署 migration。
- 最终导航为“工作台 / 收集箱 / 项目 / 奖励商店 / 金币记录”。保留 `/affairs/tasks` 旧路由及创建、编辑、历史链接。
- 首页顺序：四项总览 → 推进轨迹 → 主线与项目 → 行动清单；无内容区大标题“事务”，收集箱无重复大标题。
- 暖黑 `#181715`、米白 `#ece7df`、橙 `#d97757`；无新 UI 包，不重做 Finance / Agent / Notes。
- 默认 TODO 为 todo / in_progress / waiting，包含核心、普通、项目、独立、需恢复项目的行动；不把 project_id=null 当收集箱。
- 收集、编辑、整理、丢弃、恢复均 coin_delta=0，不写贡献、不重算项目阶段进度；核心完成仍通过原一期 RPC +1。
- publishable key + Auth cookie + owner RLS；Server Actions 使用 getClaims；不读密码/token，不用 service_role，不要求数据库密码。
- 查询只在 data 层；每个 service 一个 client，独立读取 Promise.all，无 N+1、无跨请求数据缓存、无 mock fallback。
- 收集文本首尾空白规范化后 1–4000 Unicode 字符，保留内部换行；行动标题/项目名 1–200，成果 1–2000，说明最大10000；不静默裁切。
- unknown/pending 冻结 UUID、对象、revision、payload；只有确认成功才能重置表单。用户明确确认未保存内容放弃，不借切换条目绕过保护。
- 测试 fixture 只进入测试运行时；正式库只交付用户执行的 SQL。真正并发仅独立本地测试库，不把 PGlite 顺序测试当并发证明。

## Review Focus

1. 长原文、emoji、内部换行和超过200字的标题：保留原文，显式要求缩短标题，不静默截断。Tasks 1/2/3/7。
2. 新表未部署或查询失败：导航显示不可用标识、收集页短错误，原项目/商店/账本仍能打开，绝不伪装0。Tasks 3/6/7。
3. 用户切换条目/目标/页面或响应丢失后重试：原命令冻结，确认成功前不能产生第二个目标。Tasks 2/4/7。
4. 归档或无主线项目、waiting/普通/独立行动：仍有清晰访问路径，不能因默认筛选或当前关注而漏掉。Tasks 5/8。
5. 上海零点及完成后重开、重复完成：近7天按真实 completed_at 和当前 done 计任务，未来时间不计；进度/金币口径不混用。Task 5。

## 文件与接口边界

| 单元 | 文件 / 职责 |
| --- | --- |
| 增量数据库 | `supabase/migrations/202610040001_affairs_inbox.sql`：表、五RPC、私有 helpers；`supabase/checks/affairs_inbox_postflight.sql`：只读结构验收 |
| SQL 测试 | `supabase/tests/affairs_inbox.mjs`、`affairs_inbox.sql`、`affairs_inbox_resolve.sql`：隔离执行；`affairs_inbox_concurrency*.sql`、`affairs_inbox_concurrency_guard.mjs`：隔离双会话与拒绝保护 |
| Inbox 领域 | `src/lib/affairs/inbox-types.ts`、`inbox-validation.ts`、`inbox-queries.ts`、`inbox-mutations.ts`：新行/命令、输入、唯一读取、唯一RPC写入 |
| 领域集成 | 现有 `types.ts` / `validation.ts` / `queries.ts` / `adapters.ts` / `service.ts` / `mutation-result.ts` / `action-state.ts`、`src/lib/supabase/database.types.ts`：接类型、来源历史、回执和service |
| 请求边界 | `src/lib/affairs/server-client.ts`：React cache 仅请求内复用 SSR client，不缓存查询或 Auth 判定；`src/app/affairs/actions.ts`：验证claims、dispatch和刷新 |
| 表单复用 | `action-form.tsx`、`confirmation-panel.tsx`、新增 `guarded-panel.tsx` / `entity-fields.tsx`：提交生命周期、可访问关闭保护、创建字段；既有表单路由继续可用 |
| 工作台 | 新增 `src/lib/affairs/workbench.ts`（纯总览/层级派生）、`workbench-summary.tsx` / `mainline-outline.tsx` / `action-row.tsx`；改 `progress-dashboard.tsx` / `task-list.tsx` |
| 统一入口 | 新增 `affairs-shell.tsx` / `quick-add.tsx` / `capture-form.tsx`；改 layout、tabs、新建任务/项目页面、共享 CSS |
| 收集箱 | 新增 `/affairs/inbox/page.tsx` / `error.tsx`、`inbox-workspace.tsx` / `inbox-list.tsx` / `inbox-resolve-panel.tsx`：列表、整理、历史、手机抽屉 |
| 项目与交接 | 改 project-list / projects 页面 / project-detail / task-form 来源入口；新 usage / verification 文档；仅相关已列文件本地提交 |

测试文件与上述 TS/TSX 同目录、同名 `.test.ts(x)`；新增测试 fixture 工厂放 `src/test/affairs-fixtures.ts`，明确只供测试导入，不进入页面。

### 固定跨任务契约

- `InboxStatus = 'pending' | 'resolved' | 'discarded'`；`InboxTarget = 'task' | 'project'`。
- `InboxEntryRow extends MutableRow`：content:string、status:InboxStatus 非空，resolved_task_id / resolved_project_id / resolved_at / discarded_at 为 string|null；resolved 必须且只能有一个目标，其他状态无目标。UI `AffairsInboxEntry` camelCase，revision 十进制字符串。
- create RPC `(p_request_id uuid, p_content text)`；update `(p_request_id uuid, p_inbox_id uuid, p_expected_revision bigint, p_content text)`；discard/restore `(p_request_id uuid, p_inbox_id uuid, p_expected_revision bigint)`。
- resolve RPC `(p_request_id uuid, p_inbox_id uuid, p_expected_revision bigint, p_target text, p_payload jsonb)`。target=task 使用既有 TaskMetadata，target=project 使用 ProjectMetadata；不接受客户端 user_id/status/reward字段。
- 四个非resolve RPC 返回一期六列回执。resolve 返回同六列外加 `resolved_resource`、`resolved_object_id`、`resolved_object_revision`：object_id/revision 是 inbox，额外三字段是新正式对象，供来源与历史准确映射。
- `InboxCommand` 新命令联合；`InboxResolveReceipt extends AffairsReceipt` 增加 resolvedResource / resolvedObjectId / resolvedObjectRevision。`AffairsActionState.receipt` 扩展为 base/resolve union，旧调用仍只依赖基础字段。
- `getAffairsInboxEntries(c, status): Promise<InboxEntryRow[]>`：status精确过滤、created_at DESC/id ASC、500行稳定分段；`getAffairsInboxPendingCount(c): Promise<number>`：pending exact HEAD count，null结果不是0。
- `getAffairsInboxData(status='pending'): Promise<AffairsInboxData>`：entries、mainlines、projects、tasks 一次client并发读取，用稳定ID映射真实目标名称，目标改名/归档后仍可访问。
- `getAffairsNavigationData(): Promise<{ pendingCount: number|null; unavailable: boolean }>`：单独导航容错，不在dashboard串入新表；查询失败pendingCount=null。
- `getAffairsQuickAddData(): Promise<AffairsQuickAddData>`：mainlines/projects/tasks/serverNowISO 一次client并发，只在选择直接创建或记录进展时调用。
- `AffairsInboxData = {entries: AffairsInboxEntry[]; mainlines: AffairsMainline[]; projects: AffairsProject[]; tasks: AffairsTask[]; serverNowISO:string}`；`AffairsQuickAddData` 同结构去掉 entries；`QuickAddLoadState = {status:'ready';data:AffairsQuickAddData}|{status:'error';message:string}`。这些 UI types 放在 `src/features/affairs/types.ts`，服务统一输出 adapter 后对象。
- `getAffairsResourceInboxSource(c, resource, objectId): Promise<InboxEntryRow|null>`：先查commands中resolve目标；无来源则不读新表，有来源再按owner读取真实inbox。用于项目详情/行动编辑来源链接。
- `buildAffairsWorkbenchSummary(tasks: AffairsTask[], projects: AffairsProject[], balance: number, nowISO: string): AffairsWorkbenchSummary` 输出 pendingTaskCount / activeProjectCount / completedLastSevenDays / balance。
- `AffairsWorkbenchSummary = {pendingTaskCount:number;activeProjectCount:number;completedLastSevenDays:number;balance:number}`；`AffairsProjectNode = {project:AffairsProject;tasks:AffairsTask[]}`；`AffairsOutline = {mainlines:{mainline:AffairsMainline;projects:AffairsProjectNode[]}[];independentProjects:AffairsProjectNode[]}`。
- `buildAffairsOutline(mainlines:AffairsMainline[], projects:AffairsProject[], tasks:AffairsTask[]): AffairsOutline` 输出 mainline节点及其全部project/task、independentProjects；不删减源对象、不写focus。
- `TaskList` 支持 `variant:'workbench'|'full'`、`scope: {kind:'all'}|{kind:'mainline';id:string}|{kind:'project';id:string}|{kind:'independent'}`；默认未完成。`ActionRow({task,project,balance,action})` 的 task 为 AffairsTask、project 为 AffairsProject|null、balance 为 number、action 为既有 AffairsAction，复用一期完成确认、状态和历史操作。

---

### Task 1: 收集箱表与捕获/编辑/丢弃/恢复

**Files:** Create migration、`affairs_inbox.mjs` / `affairs_inbox.sql`、postflight；不改202610030005/6。

**Interfaces:** Consumes 已有 require_user / lock_wallet / replay / receipt / clean_text helpers；Produces InboxEntryRow 表、四非resolve公共RPC及私有 `affairs_private.inbox_command(op text, request uuid, args jsonb) returns jsonb`。runner 定义 `one(sql:string):Promise<Record<string,unknown>>` 单行读取、`financeSnapshot():Promise<unknown>` 稳定结构/权限/数据快照；供本任务和Task2断言复用。

- [ ] **Step 1 写失败测试。** 新runner加载既有 Finance/Auth fixture 和两份一期migration，记录 Finance DDL/grants/policies/View/行数及已有RPC签名，再运行新断言。SQL断言覆盖owner A/B、anon、直接DML、复合FK、state约束、文本空白/emoji/换行/4000边界、无seed、revision+1、request重放/异payload冲突。核心断言：

```js
assert.equal(created.coin_delta, 0);
assert.equal(replay.object_id, created.object_id);
assert.equal(Number((await one('select count(*) n from affairs_inbox_entries')).n), 1);
assert.equal(restored.status, 'pending');
assert.equal(restored.discarded_at, null);
assert.deepEqual(await financeSnapshot(), before);
```

- [ ] **Step 2 RED。** `node supabase/tests/affairs_inbox.mjs .affairs-test-runtime/node_modules/@electric-sql/pglite/dist/index.js --red`。runner故意不加载新增migration，具体失败必须为缺少inbox表，非运行时错误。
- [ ] **Step 3 实现。** PostgreSQL15前置检查、一期对象依赖检查、新对象冲突拒绝；owner Auth FK与两条目标复合FK；pending/resolved/discarded含对应时间的一致check；owner SELECT RLS、禁止客户端DML、auth-only RPC、私有helper空search_path。pending允许编辑/丢弃，discarded仅允许restore；每次metadata/state变化revision+1。规范化完整payload后wallet锁下重放检查，非文本/非法字段拒绝。不写金币/贡献。
- [ ] **Step 4 GREEN。** 同runner去掉`--red`，schema/四RPC/Finance不变断言PASS；postflight仅SELECT权限/函数配置/列与约束，不改正式数据。
- [ ] **Step 5 Commit。** 仅本任务文件，`feat: add owner-scoped affairs inbox capture RPCs`。

### Task 2: 原子整理、来源与故障回滚

**Files:** Modify新migration / runner；Create `affairs_inbox_resolve.sql`、`affairs_inbox_concurrency_setup.sql` / `affairs_inbox_concurrency_sessions.sql` / `affairs_inbox_concurrency_cleanup.sql` 及 `affairs_inbox_concurrency_guard.mjs`。

**Interfaces:** Consumes Task1表/测试helpers、既有metadata/assert_reference/replay/receipt；Produces私有 `affairs_private.resolve_inbox(request uuid,args jsonb) returns jsonb`、resolve公共RPC和完整target回执字段，来源保存在原inbox及commands，不改旧RPC返回签名。

- [ ] **Step 1 写失败测试。** task/project各一个目标，普通独立默认无日期；核心缺原因/完成条件拒绝；cross-owner、不存在/不可写project、错误target/revision/多目标payload拒绝。长原文保留，超长标题明确拒绝。相同request重试和不同request二次整理不重复目标；resolved不允许编辑/丢弃/restore。断言：

```js
assert.equal(result.object_id, inbox.id);
assert.equal(String(result.object_revision), '2');
assert.equal(result.resolved_resource, 'task');
assert.equal(String(result.resolved_object_revision), '1');
assert.equal(task.status, 'todo');
assert.equal(task.ever_completed, false);
assert.equal(task.project_id, null);
assert.equal(result.coin_delta, 0);
assert.ok(task.description.includes(inbox.content));
assert.equal(Number((await one('select count(*) n from affairs_coin_events')).n), coinsBefore);
assert.equal(Number((await one('select count(*) n from affairs_progress_entries')).n), progressBefore);
```

- [ ] **Step 2 RED。** resolve helper/public RPC/revoke/grant 位于 migration 末尾 `-- AFFAIRS_INBOX_RESOLVE_START` 标记后、最终 COMMIT 前。runner `--red-resolve` 截去该段但保留 COMMIT，基础捕获仍成功，失败为缺少resolve RPC。
- [ ] **Step 3 实现。** 验证Auth/白名单/规范化目标metadata → wallet锁 → replay → owner项目ID顺序锁 → inbox锁 →revision/pending/reference检查 →直接插入正式task/project →更新inbox resolved及target →持久化一次commands回执。复用helper，不嵌套公共create RPC，不生成第二request。说明保留用户说明加原收集文，合并后超过10000明确拒绝；新对象revision=1，无focus/阶段自动创建。回执JSON额外字段写入同条commands，不能先记receipt后失去目标关联。
- [ ] **Step 4 GREEN及回滚。** runner逐个使用隔离fixture触发器在目标insert后、inbox更新后、command持久化前抛错，断言目标/inbox/command/wallet金币与前值一致。双会话脚本硬性检查数据库名 `personal_os_affairs_isolated_test`，实测锁等待/本次PID/时刻后验证两设备仅一目标；本机无独立Postgres则明确未运行。guard runner仅验证拒绝保护，不替代并发实测。
- [ ] **Step 5 Commit。** `feat: resolve affairs inbox entries atomically`，不连接正式库。

### Task 3: Typed数据层、命令校验、来源历史和服务端集成

**Files:** Create inbox四领域文件及对应tests、server-client.ts / test；Modify types/validation/queries/adapters/service/mutation-result/action-state/database.types、actions及既有tests。

**Interfaces:** Consumes Tasks1/2 RPC契约；Produces所有固定query/service/命令/回执接口及 `executeInboxCommand(c, command): Promise<AffairsReceipt|InboxResolveReceipt>`、`validateInboxCommand(data: FormData): ValidationResult<InboxCommand>`。

- [ ] **Step 1 写失败测试。** 输入校验：捕获1–4000、重复字段/文件/额外字段/UUID/revision拒绝；resolve按target严格解析既有metadata，默认普通不发币。查询/适配：真实表、exactcount、500以上分页、稳定排序、大revision字符串、错误不变空数组；history中resolve object_id为inbox时必须映射目标ID/targetrevision=1为“从收集箱创建”。service工厂一次、独立读取同时启动。

```ts
expect(factory).toHaveBeenCalledTimes(1);
expect(started).toEqual(expect.arrayContaining(['affairs_inbox_entries', 'affairs_mainlines', 'vw_affairs_project_progress', 'affairs_tasks']));
expect(adapted.resolvedObjectRevision).toBe('1');
expect(history.taskId).toBe(targetId);
expect(history.revision).toBe('1');
await expect(getAffairsInboxPendingCount(nullCountClient)).rejects.toThrow(); // mocked HEAD response count=null
```

- [ ] **Step 2 RED。** `npm run test -- src/lib/affairs src/app/affairs/actions.test.ts`；新增接口断言失败，不把旧fixture缺字段当feature红证据。
- [ ] **Step 3 实现。** 扩展AffairsRowMap/ArgsMap，Database对resolve用专属返回行，FoundationCommand显式排除InboxOperation，避免旧switch吞掉新命令。validateAffairsCommand在旧create/update分类前dispatch inbox校验。抽取 `readAffairsRpcRow<T>(result:PromiseLike<{data:T[]|null;error:{code:string;message:string}|null;status?:number}>):Promise<T>` 复用错误分类与单行检查，旧readAffairsReceipt行为不变；新adapter验证额外目标字段，缺回执为uncertain。Actions先getClaims再typed RPC，业务reject为error、transport/5xx/未知回执为uncertain；成功revalidatePath('/affairs','layout')，不刷新Finance。
- [ ] **Step 4 实现并验证service。** 默认clientFactory替换为请求内React cache包装的SSR client（工厂仍可注入测试）；只复用client，不缓存data/claim、不跨请求/用户。导航count是独立Suspense服务，count失败=null；原dashboard/service不依赖inbox新表。来源lookup先commands，无resolve来源则不读inbox。新history使用安全UUID验证后OR匹配旧object_id或resolve目标字段，限定operation/resource、稳定排序。Run上列tests及`npm run typecheck`，全部PASS；已有mutation/动作拒绝测试不退化。
- [ ] **Step 5 Commit。** `feat: add typed affairs inbox services and actions`。

### Task 4: 安全可复用表单与连续提交

**Files:** Modify action-form / confirmation-panel / task-form / project-form；Create guarded-panel / entity-fields / capture-form及tests；测试fixture工厂随本任务添加。

**Interfaces:** Consumes Actions和typedreceipt；Produces `CaptureForm({action,onSaved})`、`TaskFields({initialValues,projects})` / `ProjectFields({initialValues,mainlines})`，以及 `GuardedPanel({open,title,onClose,children})`。ActionForm增加默认不重置的 `resetOnSuccess?:boolean` 与 `receiptDisplay?:'full'|'changes'|'none'`，现有默认行为不变。

- [ ] **Step 1 写失败测试。** 捕获成功可连续收集第二条、新UUID；未知或retry auth-error后字段锁定、每次UUID及entries完全一致。dirty关闭/Esc/遮罩/切换目标确认后才能丢弃；busy/unknown禁止关闭。字段普通时不要求核心原因，核心时必填；项目成果必填，长原文不丢。

```ts
expect(second.get('requestId')).not.toBe(first.get('requestId'));
expect([...uncertainRetry.entries()]).toEqual([...first.entries()]);
expect(screen.getByLabelText('收集内容')).toBeDisabled();
expect(close).not.toHaveBeenCalled(); // unresolved or dirty-unconfirmed
expect(screen.getByLabelText('完成条件')).toBeRequired();
```

- [ ] **Step 2 RED。** `npm run test -- src/features/affairs/components/forms.test.tsx src/features/affairs/components/capture-form.test.tsx src/features/affairs/components/guarded-panel.test.tsx`。
- [ ] **Step 3 实现。** ActionForm只有receipt confirmed-success才清saved并增epoch/reset；旧revision与uncertain不重置。CaptureForm只有文本+提交，Ctrl/Cmd+Enter仅textarea已聚焦且非IME组合输入时提交，普通Enter换行。普通捕获不显示零金币/历史余额回执；真实币变化确认保留。GuardedPanel复用现有dialog焦点/关闭逻辑，增加dirty检查，重试不可变；字段组件供独立路由与嵌入式resolve共用，不复制业务校验。
- [ ] **Step 4 GREEN。** 上列tests加全部已有完成/兑换/惩罚表单tests PASS，确认旧默认回执和锁定行为不变。
- [ ] **Step 5 Commit。** `feat: support guarded capture and reusable affairs forms`。

### Task 5: 工作台总览、完整层级与共用行动清单

**Files:** Create workbench.ts/test、workbench-summary、mainline-outline、action-row及tests；Modify service/types、progress-dashboard、task-list、tasks/page、contribution-heatmap及tests/CSS。

**Interfaces:** Consumes Task3完整真实读取和一期TaskCompletionPanel；Produces固定summary/outline/TaskList接口，dashboard同一状态scope联动outline与TODO，不持久化focus。

- [ ] **Step 1 写失败测试。** 总览排除done/cancelled、active项目才计、包括waiting普通独立/需恢复项目、balance负值保持。上海窗口今+前6天，零点/窗口外/未来/done重开/重复完成按当前状态计一次；原数据库rate原样展示。层级覆盖非关注项目、独立项目、归档历史；默认TODO所有未完成，不含done/cancelled。

```ts
expect(summary.pendingTaskCount).toBe(4); // todo core + ordinary + waiting + blocked
expect(summary.activeProjectCount).toBe(1); // paused/completed/archived excluded
expect(summary.completedLastSevenDays).toBe(2); // Shanghai boundary fixture
expect(summary.balance).toBe(-1);
expect(outline.independentProjects.map(p => p.project.id)).toContain(independentProjectId);
expect(screen.queryByRole('heading', {name:'事务', exact:true})).toBeNull();
expect(screen.getByRole('link', {name:'查看全部'})).toHaveAttribute('href','/affairs/tasks');
```

- [ ] **Step 2 RED。** `npm run test -- src/lib/affairs/workbench.test.ts src/features/affairs/components/progress-dashboard.test.tsx src/features/affairs/components/task-list.test.tsx src/features/affairs/components/mainline-outline.test.tsx`。
- [ ] **Step 3 实现数据派生。** service使用全部已分页读取的UI对象和服务端now生成summary，不按显示slice/filter计总量。outline用ID Map按现有关系组织，保持返回排序；scope切换只改变TODO显示不影响指标或focus。项目归档/完成任务仍在TODO“所属项目需恢复”组可见。
- [ ] **Step 4 实现UI并GREEN。** 删除巨型事务标题/副标题/常驻规则/未上线计时文案；四数字、compact7行日历、主线与项目、唯一全局行动清单按序。项目链接与disclosure分开；焦点标识保留，关注变更藏次级操作但继续显式RPC。独立项目仅存在时显示。ActionRow主完成可见、编辑/历史/状态次级菜单；保留取消/重开/撤销确认，不用颜色代替状态。heatmap解释移help、保留真实日期/明细/未来禁用，未知progressRate为“—”不造百分比。上列tests与CSS纯模式test PASS。
- [ ] **Step 5 Commit。** `feat: build complete affairs workbench and action list`。

### Task 6: 统一导航和新增入口，兼容数据库尚未部署

**Files:** Create affairs-shell / quick-add及tests；Modify layout/tests、tabs/tests、actions/tests、mainline-form.tsx / progress-entry-form.tsx及tests、任务/项目new页面及CSS。

**Interfaces:** Consumes CaptureForm/字段、getAffairsNavigationData/QuickAddData；Produces所有事务页统一 ＋新增，项目上下文可传 `?projectId=<uuid>` / `?mainlineId=<uuid>`。

- [ ] **Step 1 写失败测试。** 五项导航，无行动tab；工作台、收集箱、项目active明确，完整行动页返回工作台；pendingcount失败“—”非0，旧商店照常渲染。打开默认快速收集、不因options加载先阻塞；切直接新建/进展真实加载options，一次读完，无默认关注项目强绑。

```ts
expect(screen.queryByRole('link',{name:'行动',exact:true})).toBeNull();
expect(screen.getByRole('link',{name:/收集箱/})).toHaveTextContent('—');
expect(screen.getByText('Shop content')).toBeVisible();
expect(screen.getByLabelText('收集内容')).toBeVisible();
expect(optionsAction).not.toHaveBeenCalled(); // capture opens without options
```

- [ ] **Step 2 RED。** `npm run test -- src/app/affairs/layout.test.tsx src/features/affairs/components/quick-add.test.tsx src/features/affairs/components/affairs-shell.test.tsx`。
- [ ] **Step 3 实现。** Server layout独立Suspense导航badge服务，SSR client请求内共享；失败捕获只作用于徽标，不能throw至整layout。QuickAdd统一快速收集/行动/项目/主线/进展，默认capture立即可用；只选实体创建时由新增只读 `loadAffairsQuickAddAction(): Promise<QuickAddLoadState>` 验证claims后读options，业务数据不从客户端造，错误短提示可重试。任务/项目使用共用fields；主线/进展沿用既有表单并增加默认 false 的 `embedded?:boolean`，仅嵌入模式收掉独立页标题，验证和RPC不变。保留旧表单routes。项目ID/主线ID在service真实列表验证后预填，无效归属提示重新选择，不默默套focus；直接new路由同样解析并校验queryparams。
- [ ] **Step 4 GREEN。** 上列tests+actions tests，失效Auth时不读options、不调用RPC；一次保存后revalidation刷新真实pendingcount，不使用回执余额伪装当前balance。手机nav横向容器滚动，新增入口不被挤出屏幕。
- [ ] **Step 5 Commit。** `feat: unify affairs navigation and quick add entry`。

### Task 7: 收集箱列表、右侧整理、历史与手机抽屉

**Files:** Create inbox页面/error/tests、inbox-workspace/list/resolve-panel及tests；Modify types/adapters/service/CSS、task-form/project-detail来源显示及tests。

**Interfaces:** Consumes InboxData/commands/GuardedPanel/共用fields；Produces已选第二版交互，desktop>=1024px列表与整理pane，窄屏用同表单dialog抽屉，选中对象稳定ID、未保存/未知保护。

- [ ] **Step 1 写失败测试。** pending/resolved/discarded filters、编辑原文/丢弃/恢复、resolved只有真实目标链接不可再次整理。无选中不常驻表单；切目标/条目dirty需确认、uncertain不可切换；响应props更新不得卸载unknown表单。task默认普通/无项目/无日期；title>200提交明确fielderror、原文4000完整保留。目标改名/归档/完成后真实链接仍在。

```ts
expect(screen.queryByLabelText('标题')).toBeNull(); // no chosen entry
expect(screen.queryByRole('checkbox',{name:/完成/})).toBeNull();
expect(submitted.get('is_core')).toBe('false');
expect(submitted.get('project_id')).toBe('');
expect([...retry.entries()]).toEqual([...submitted.entries()]);
expect(screen.getByRole('link',{name:renamedTarget})).toHaveAttribute('href',targetHref);
expect(screen.queryByRole('button',{name:'再次整理'})).toBeNull();
```

- [ ] **Step 2 RED。** `npm run test -- src/features/affairs/components/inbox-workspace.test.tsx src/features/affairs/components/inbox-resolve-panel.test.tsx src/app/affairs/inbox/page.test.tsx`。
- [ ] **Step 3 实现。** 顶部capture，三状态列表，pending仅整理+明确次级菜单，无TODO checkbox。pending成功只有真实refresh后数量/list变化，成功当前表单关闭，不自动提交下一条；failed/uncertain保留输入和原payload。已整理目标链接，丢弃可恢复，原文编辑只pending。short error不带RPC/schema教程，技术详情按需；migration未部署不是清空。项目详情/行动编辑“查看收集来源”链接至 `/affairs/inbox?status=resolved&entryId=<uuid>`，按真实owner对象校验，不伪造来源。
- [ ] **Step 4 GREEN及可访问性。** 桌面右栏仅整理选择出现；窄屏同表单不重复mount导致独立request；移动抽屉支持focus trap、Esc/遮罩guard、内部scroll、focus恢复。核心字段只在明确选择时出现。上列tests加forms/源history tests/CSS测试 PASS；已取消/未完成历史规则不退化。
- [ ] **Step 5 Commit。** `feat: add real inbox processing workspace`。

### Task 8: 项目管理页职责与页面降噪

**Files:** Modify project-list及projects/page/service/types；Create project-list.test.tsx；Modify相关error页面/CSS与usage文案，不重做项目详情业务。

**Interfaces:** Consumes已有项目View和mainline表；`getAffairsProjectsData(): Promise<AffairsProjectsData>` 修改为 `{projects,mainlines}`，同步所有调用者；ProjectList props匹配，项目仍同ID。

- [ ] **Step 1 写失败测试。** 平铺显示所有非归档项目、按active/paused/completed/archived/全部切换；独立项目有标识，归档与已完成可访问；stage rate=null不是0%，不把任务数/金币当阶段进度。无无关方法段落/重复新建按钮，详情href保留。

```ts
expect(screen.getByRole('link',{name:/Project A/})).toHaveAttribute('href','/affairs/projects/'+projectId);
expect(screen.getByText('独立项目')).toBeVisible();
expect(screen.getByText('—')).toBeVisible(); // missing stage progress
expect(screen.queryByText('用阶段成果看见成长，不用任务数量代替成果。')).toBeNull();
```

- [ ] **Step 2 RED。** `npm run test -- src/features/affairs/components/project-list.test.tsx src/lib/affairs/service.test.ts`。
- [ ] **Step 3 实现。** 同client并发projects/mainlines，不按项目逐次读；列表显示名称/主线或独立/真实状态/阶段进度，description/outcome长文在详情；按真实状态筛选和历史进入，原编辑/归档/成果管理沿用既有详情。帮助规则置shop/账本显式help入口，不常驻首页、不展示未上线计时。错误页仅短错误和重试，技术诊断details保留，不把查询失败当空列表。
- [ ] **Step 4 GREEN。** 上列tests+project-detail全部tests PASS；确认一期阶段/关注/状态权限不改变。
- [ ] **Step 5 Commit。** `feat: clarify affairs project management and reduce page noise`。

### Task 9: 完整回归、真实视觉与SQL交接

**Files:** Create `docs/affairs-workbench-inbox-usage.md` / `affairs-workbench-inbox-verification.md`；只修改本轮验证发现的相关代码/test，不扩大范围。

**Interfaces:** Consumes Tasks1–8；Produces独立可执行新增migration、只读验收SQL、真实验证记录与部署顺序；无自动merge/push/正式库执行。

- [ ] **Step 1 跑完整代码验证。** `npm run test` / `npm run typecheck` / `npm run lint` / `npm run build` / `git diff --check`；每个exit0并记录实际数量/输出，不能沿用旧392通过作为本次证据。
- [ ] **Step 2 跑隔离SQL回归。** 新inbox runner、resolve全链路、guard以及现有11个runners使用已存在本地PGlite模块；检查新migration未改一期RPC签名或Finance。运行时找不到则报告具体阻塞，不安装产品依赖或用正式库代替。双会话无环境标未执行。
- [ ] **Step 3 用户执行SQL后真实联调。** 先提供新增migration与postflight，只读核对真实字段/函数权限；用户执行并确认后，使用其现有登录页，无读cookie/token/password。默认只读查看真实界面；任何试写/整理/兑换先使用用户明确放入测试范围的条目，不主动污染正式数据。SQL未部署仍验旧页面/明确错误，不能把完整收集链路标通过。
- [ ] **Step 4 浏览器验收。** 使用已启用IAB，390/768/1440分别查看工作台、项目、完整行动、收集箱；键盘新增/展开/筛选/整理/关闭guard/focus恢复。检查长标题、换行、多项目、无日期、waiting、归档、空与错误、横向溢出；以选定图片+最新文字规则比对，实际业务截图只能真实数据，记录差异/未验证项。必要修复先加回归RED再GREEN，不用fixture页面冒充真实联调。
- [ ] **Step 5 交接与本地提交。** usage说明一条收集→一个正式目标/丢弃恢复；验证记录逐项标pass/blocked、query实际字段差异、schema发布顺序和未跑并发。`test: verify affairs workbench and inbox redesign`；保留用户草稿，只有用户另行指示才合并或推送生产。

## 自审与执行交接

覆盖：spec 1–3 → Tasks5/6/8；spec4 → Tasks4/6；spec5–6 → Tasks1/2/3/7；spec7–8 → Tasks3/4/6/7/8；spec9全部18项 → 对应单元/SQL断言与Task9真实验收；spec10 → 本计划执行顺序。五项Review Focus均有所属任务的明确输入/结果断言。

用户“开始实施”已作为整体设计批准，当前代理在 develop 顺序执行并提交。新增 migration 已生成但未在正式库执行；不存在自动 merge/push/deploy。真实验收与发布仍是独立步骤。
