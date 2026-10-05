# Affairs Month Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. 推荐当前代理在本会话原生顺序执行；用户已指定直接在 develop 开发，不创建 worktree。未经执行方式确认，不启用逐任务子代理。

**Goal:** 按选定第一张参考图，在真实事务工作台增加融合项目跨度、TODO 和零散事件的纯月历。

**Architecture:** 扩展现有项目/行动排期字段与原子 RPC；复用工作台 service 的真实读取，以纯日期函数产生月网格和跨周片段。日历完成操作复用现有确认、幂等回执及金币机制；清单、收集箱和 Agent 共用同一批记录。

**Tech Stack:** 仓库现有 Next.js 15、React 19、TypeScript、CSS Modules、Tabler、Supabase SSR、Vitest、Testing Library；隔离 SQL 使用已有 PGlite，不增加产品依赖。

**Spec:** [affairs-month-calendar-design.md](affairs-month-calendar-design.md)，2026-10-05 用户确认。视觉参考：[month-calendar-selected.png](assets/affairs/month-calendar-selected.png)。

## Global Constraints

- 直接在 develop 开发，保留用户未跟踪 `docs/affairs-rewards-design.md`，不创建 worktree，不自动推送/合并/发布。
- 工作台只保留「清单｜日历」；日历仅有月视图，不提供周视图或独立甘特入口。
- 日历不展示主线标题、主线侧栏、主线层级或主线筛选；不删除实际主线关联。
- 无「推进轨迹」「近半年 · 全部主线」「如何阅读」、巨型事务标题、永久图例、类型筛选或额外业务功能。
- 实际数据来自现有 service/queries/adapters；组件不查询数据库，无 mock fallback、无乐观假完成、无新缓存。
- `planned_start_date` 为 nullable date；`planned_time` 为 nullable time without time zone，固定 Asia/Shanghai、分钟精度，附属于 `due_date`。
- 不使用创建时间、子任务跨度、自由文本或已流逝日期推算排期、时长或完成率。
- 起止范围含首尾当天；开始不得晚于结束；00:00/23:59 合法，24:00/非零秒/无日期钟点非法。
- 保持 RPC 签名、owner/RLS/grants、钱包锁顺序、revision、历史 payload replay 与金币口径；不修改 Finance。
- 不修改已部署 migration；正式库只读核对、不自动执行 SQL、不写测试记录、不读取密码或 secret/service_role。
- 正式库 migration 必须由用户执行并确认；新前端不可先发布依赖尚不存在的字段。

## Review Focus

1. 升级前的未知 Agent/表单请求用旧 DTO、原 UUID 重试，必须返回原回执而非 payload 冲突或重复创建（Tasks 1–3）。
2. 同 UUID 的项目和行动、输入顺序变化及相邻跨周范围，不能产生 React key 冲突、记录漏失或轨道重叠（Task 4）。
3. 完成请求途中刷新导致真实记录完成/消失，确认表单仍须保留原快照、UUID、回执和未明状态；不能重复奖励（Tasks 5–6）。
4. 手机、键盘、浏览器后退及切月在 dirty/pending/unknown 状态不能让操作被隐藏或错误归日；上海日期不受设备时区/DST影响（Tasks 4–6）。
5. 日历是空数据、字段错误、查询错误还是单端点排期必须明确；旧描述中的时间不能被当成可靠钟点；多事项不能溢出/丢失（Tasks 2、4–7）。

## 文件边界和任务顺序

1. 数据库兼容扩展与隔离回归。
2. typed row/metadata、字段校验及 adapters。
3. 手动/收集箱/Agent 全录入链路。
4. 纯月网格及片段投影。
5. 月历组件、详情与真实完成入口。
6. 工作台、URL、导航保护与热力图接入。
7. 全量回归、视觉检查和用户部署说明。

以下每个任务须执行 RED → GREEN → 全部 Vitest 回归，再只提交该任务实际修改文件。图内示例横条端点不作为日期算法依据。

### Task 1: 兼容现有事务命令的排期 migration

**Files:**
- Create: `supabase/migrations/202610050001_affairs_schedule.sql`
- Create: `supabase/checks/affairs_schedule_preflight.sql`
- Create: `supabase/checks/affairs_schedule_postflight.sql`
- Create: `supabase/tests/affairs_schedule.mjs`
- Create: `supabase/tests/affairs_schedule.sql`
- Read only: `supabase/migrations/202610030005_affairs_foundation.sql`、`202610030006_affairs_rewards.sql`、`202610040001_affairs_inbox.sql`。

**Interfaces:**
- Consumes: `affairs_private.metadata(text,jsonb)`、`foundation(text,uuid,jsonb)`、`resolve_inbox(uuid,jsonb)` 及现有公共 RPC，不改变签名。
- Produces: 两张表的 `planned_start_date date null`、`planned_time time without time zone null`；项目 View 尾部新增同名两列，原列顺序/类型不变。

- [x] **Step 1: 写隔离 SQL 失败测试。** 复用现有 fixtures 和 PGlite，加载 foundation/rewards/inbox；升级前创建项目、行动、收集整理命令并保存 UUID/payload/回执。断言升级后旧命令 replay 保持相同对象/结果且无额外奖励，新创建/编辑/整理保存时间，两端日期与钟点约束拒绝非法写入。断言旧更新保留新字段、清空 due_date 同时清空时间、旧更新制造反向范围必须失败。记录升级前后 View 列顺序、权限、Finance 数据/定义和命令总数。
- [x] **Step 2: 运行 RED。** `node supabase/tests/affairs_schedule.mjs .affairs-test-runtime/node_modules/@electric-sql/pglite/dist/index.js --red`。预期明确因新字段不存在失败；脚本 RED 模式不读取尚不存在 migration，不应以模块路径错误失败。
- [x] **Step 3: 编写单事务增量 SQL。** 追加 nullable 列和有效状态约束；按实际现有定义替换三个私有函数的相关分支，保留不相关分支与锁/replay 顺序。metadata 只有输入实际存在新键时才输出新键。旧更新缺省保留新列，新 null 清空；对更新最终状态校验。View 显式列出旧字段和原三个进度字段，最后追加新列；不 drop/recreate 依赖 View。preflight 输出相关字段/约束/函数定义/列顺序/权限供只读核对，migration 的结构检查发现冲突就中止，不吞异常或强制覆盖。
- [x] **Step 4: 运行 GREEN 与旧 SQL 回归。** 去掉 `--red` 运行上面脚本，预期所有断言通过；分别运行现有 `affairs_foundation.mjs`、`affairs_rewards.mjs`、`affairs_inbox.mjs`。新脚本额外以升级后的环境核验相同老入口行为、cross-owner/anon 拒绝、无直接表写入、失败原子回滚、旧命令对象后来改变仍能 replay。PGlite 不代表双会话并发验收，报告中明确这一限制。
- [x] **Step 5: 运行 `npm run test`，只提交新增 SQL/测试。** 提交信息 `feat: add compatible affairs schedule fields`。不连接正式库。

### Task 2: Typed 排期、校验与真实字段映射

**Files:**
- Modify: `src/lib/affairs/types.ts`、`validation.ts`、`inbox-validation.ts`、`adapters.ts`
- Modify: `src/lib/supabase/database.types.ts`、`src/features/affairs/types.ts`
- Create: `src/lib/affairs/schedule-validation.ts`、`schedule-validation.test.ts`
- Modify/Test: `src/lib/affairs/validation.test.ts`、`inbox-validation.test.ts`、`adapters.test.ts`、`service.test.ts` 和依赖 row 的测试 fixtures。

**Interfaces:**
- Produces: row 的 `planned_start_date: string|null`、`planned_time: string|null`；UI camel 对应 `plannedStartDate`、`plannedTime`，时间值为 `HH:mm|null`。
- Produces: metadata 的新键 `planned_start_date?: string|null`、`planned_time?: string|null`，optional 仅用于旧 DTO 兼容；新表单必须显式提交。
- Produces: `validateScheduleMetadata(input: {due_date:string|null; planned_start_date?:string|null; planned_time?:string|null}): Record<string,string>`；`normalizeScheduleTime(value:unknown):string|null`。独立纯模块，不导入 mutations/service，不引入 validation/inbox 的循环依赖。
- Consumes: Task 1 新字段和 SQL 接受规则；现有 `ValidationResult<T>`、adapter revision/cycle 映射。

- [x] **Step 1: 写失败测试。** `normalizeScheduleTime('10:30:00')` 得到 `'10:30'`，`null` 保留，`'10:30:01'`/undefined/非法值报错。validate 对开始晚于结束、无日期时间、24:00/秒字符串返回字段错误，00:00/23:59、单端点和未来排期通过。旧 FormData 没有新键时 output payload 也不能有新键；显式空值输出 null。
- [x] **Step 2: 运行 RED。** `npm run test -- src/lib/affairs/schedule-validation.test.ts src/lib/affairs/validation.test.ts src/lib/affairs/inbox-validation.test.ts src/lib/affairs/adapters.test.ts`。预期新能力缺失导致失败。
- [x] **Step 3: 实现类型和校验。** FormData 以 `has()` 保留 omission 与 null 的区别，规范 metadata 只附加实际提供的键；四个录入调用共用校验。adapter 要求部署后的 row 提供新字段并校验，不将缺列错误伪装为 null。UI camel 类型与 Database View 列同步。只为测试 fixture 添加真实语义 null，不改业务结果断言。
- [x] **Step 4: 运行上述 GREEN、`npm run typecheck` 和 `npm run test`。** service 回归须证明字段正确输出，查询仍并发/分页，没有为了月历再读一次项目或行动。
- [x] **Step 5: 提交相关文件。** `feat: map and validate affairs schedule metadata`。

### Task 3: 所有录入入口保存结构化排期

**Files:**
- Modify/Test: `src/features/affairs/components/entity-fields.tsx`、`forms.test.tsx`、`quick-add.test.tsx`、`inbox-workspace.test.tsx`（现有整理表单回归在 workspace 测试中）。
- Modify: `src/lib/agent/affairs/types.ts`、`schema.ts`、`orchestrator.ts`、`preview.ts`、`confirm.ts`、`test-fixtures.ts`
- Modify/Test: 对应 `schema.test.ts`、`orchestrator.test.ts`、`preview.test.ts`、`confirm.test.ts`，`src/features/agent/affairs-preview-card.tsx` 与对应测试。
- Modify/Test: `src/app/agent-affairs-actions.test.ts`、`src/features/agent/affairs-queue.test.ts`。

**Interfaces:**
- Consumes: Task 2 metadata 和纯校验；现有 TaskFields/ProjectFields 共用创建、编辑、收集整理表单。
- Produces: 新创建/编辑 FormData 显式包含 `planned_start_date`、`due_date`、`planned_time`；UI label 为“开始日期（可选）”“截止日期（可选）”“时间（可选）”。
- Produces: 新 model/draft 的 `plannedStartDate:string|null`；旧 model/draft 缺省新字段仍接受为未设置，新确认 payload 显式提供新字段。旧确认 DTO 保持 omission，不以默认值改造 frozen 请求。

- [x] **Step 1: 写失败测试。** 手动、统一新增、收集整理、Agent 四入口都能送出 `2026-10-08`/`10:30` 和开始日期；清空 dueDate 同时清空时间，非法范围不能提交。Agent 首次生成的新内容含结构化时间，主线/收集类型拒绝排期；原始旧 frozen payload 重试保持 byte-equivalent 键集合和同一个 requestId。旧说明不被解析为新时间。
- [x] **Step 2: 运行这些测试的 RED。** `npm run test -- src/features/affairs/components/forms.test.tsx src/features/affairs/components/quick-add.test.tsx src/features/affairs/components/inbox-workspace.test.tsx src/lib/agent/affairs src/features/agent/affairs-queue.test.ts src/features/agent/affairs-preview-card.test.tsx src/app/agent-affairs-actions.test.ts`。
- [x] **Step 3: 实现共用日期字段和 Agent 字段链路。** 时间输入 `type=time`、`step=60`；只针对计划日期允许未来，不改实际进展 occurred_at 规则。字段空值由 Task 2 校验处理。新字段从 AI schema→draft→预览编辑→confirmation→RPC，同步 strict key 白名单允许新旧 DTO；旧模式只补 UI 展示，不覆盖 frozen serialized request。未明确年份的开始/截止日期需要确认，不能凭空推算日期。
- [x] **Step 4: 上述 GREEN、`npm run typecheck`、`npm run test`。** 明确验证新时间是 column 数据，不仅写进 description；旧 unknown 重试未改变键集合。
- [x] **Step 5: 提交相关文件。** `feat: save schedule fields across affairs entry flows`。

### Task 4: 纯月份网格与范围片段

**Files:**
- Create: `src/features/affairs/schedule.ts`、`schedule.test.ts`
- Create: `src/features/affairs/calendar-location.ts`、`calendar-location.test.ts`

**Interfaces:**
- Produces `CalendarItem`: `key:string`（resource:id）、`id:string`、`resource:'project'|'task'`、`title:string`、`projectName:string|null`、`startDate:string|null`、`endDate:string|null`、`time:string|null`、`status:string`、`href:string`；不得含 mainline 字段。
- Produces `MonthCalendarModel`: `month:string`、`weeks:CalendarWeek[]`、`unscheduled:CalendarItem[]`；`CalendarWeek` 含 `startDate`、`days:{date,inMonth,isToday,items:CalendarItem[]}[]`、`segments:{item:CalendarItem,startColumn:number,span:number,lane:number,continuesBefore:boolean,continuesAfter:boolean}[]`。列从 0 到 6，span 为包含两端的天数。
- `days.items` 仅放单端点点位；当日详情/移动端清单把它与覆盖该列的 segments 合并并按 resource:id 去重，不能重复渲染跨日任务或漏掉当天有效项目。
- Produces `buildMonthCalendar(projects:AffairsProject[],tasks:AffairsTask[],month:string,today:string):MonthCalendarModel`。
- Produces `CalendarLocation = {view:'list'|'calendar';month:string}`；`parseCalendarLocation(params:URLSearchParams,today:string):CalendarLocation`、`shiftCalendarMonth(month:string,delta:-1|1):string`。仅日期运算，不访问 window、Supabase 或系统当前时间。

- [x] **Step 1: 写失败测试。** 2026-10 有 5 周，首日 2026-09-28、末日 2026-11-01；2021-02 有 4 周；2026-03 有 6 周。Oct1–12 项目切为 4/7/1 天，最后片段只能占 Oct12 一格；同日范围一格、跨年闰日正确。单端点点位、全空未安排、父子日期不相互补全；done/cancelled/archived 隐藏、paused/waiting 可见。无日期则不给 time 默认值。
- [x] **Step 2: 运行 RED。** `npm run test -- src/features/affairs/schedule.test.ts src/features/affairs/calendar-location.test.ts`。
- [x] **Step 3: 实现 UTC date-only 运算与稳定轨道。** 日期使用固定日历值，today 由 service 的上海值传入。按开始、结束、resource、ID 稳定排序，每周选择第一个无冲突轨道；跨月裁剪仍保留真实完整范围。point items 含钟点者按时间排序，然后类型/名称/ID。未知 location 值回 list/上海当月；导航限制 1000–9999 年，对超出支持范围月份拒绝导航，不能溢出成非法 URL。
- [x] **Step 4: 运行 GREEN 与全量回归。** 增加同 UUID 不同 resource、倒序输入、碰邻范围、三个长条及大量同日事项的轨道断言；模拟非上海 TZ 结果不变，月份边界、畸形/重复 URL 参数安全降级。
- [x] **Step 5: 提交新纯函数与测试。** `feat: project affairs data into a month calendar`。

### Task 5: 可读月历、详情与真实完成入口

**Files:**
- Create: `src/features/affairs/components/month-calendar.tsx`、`month-calendar.test.tsx`
- Create: `src/features/affairs/components/month-calendar.module.css`
- Create: `src/features/affairs/components/calendar-item-details.tsx`、`calendar-item-details.test.tsx`
- Modify/Test: `src/features/affairs/components/task-completion-panel.tsx`、`task-completion-panel.test.tsx`、`guarded-panel.test.tsx`

**Interfaces:**
- Consumes: Task 4 `MonthCalendarModel`，Task 2 UI rows，以及现有 `AffairsAction`、`TaskCompletionPanel`、`GuardedPanel`。
- Produces `MonthCalendar({model,tasks,projects,balance,action,onCreateTask}: {model:MonthCalendarModel;tasks:AffairsTask[];projects:AffairsProject[];balance:number;action:AffairsAction;onCreateTask:(date:string)=>void})`。
- Produces `CalendarItemDetails({item,task,project,balance,action,onClose}: {item:CalendarItem;task:AffairsTask|null;project:AffairsProject|null;balance:number;action:AffairsAction;onClose:()=>void})`。
- 可给 TaskCompletionPanel 增加 `triggerVariant?:'default'|'checkbox'`，缺省保持现有按钮；不能更换完成 RPC、自动提交或产生 checked 乐观状态。

- [x] **Step 1: 写失败测试。** 月历无主线/周/甘特元素，range CSS grid 的列/span 对应 pure model；点位显示真实 `10:30`，无 time 不显示午夜。复选入口先打开现有完成确认，未确认不调 action；成功只用 receipt 后 refresh，未知时原 UUID 重试。详情有项目链接无主线，不修改事务类型。溢出 `+N` 可读全量当天列表，未安排可进入编辑。
- [x] **Step 2: 运行 RED。** `npm run test -- src/features/affairs/components/month-calendar.test.tsx src/features/affairs/components/calendar-item-details.test.tsx src/features/affairs/components/task-completion-panel.test.tsx`。
- [x] **Step 3: 实现月历与受保护详情。** 以单个 CSS grid 叠放项目轨道和 day cells，非嵌套卡片；范围条对齐完整周、色彩按项目/资源稳定选择，不按主线组织。无 checkbox 嵌套 button。详情选择时保存对象快照并持续挂载完成面板，不能在刷新后从已过滤的月历模型找不到对象就卸载。TaskCompletionPanel 的关闭使用现有 guard，busy/uncertain 不可关闭；显示真实 receipt 后用户可正常关闭。
- [x] **Step 4: 运行 GREEN 与 `npm run test`。** 模拟执行中 props 刷新使记录消失、revision 改变、网络未知后再成功，不丢冻结请求；重复点击不重复提交。移动端七列日期选择与所选日列表、全部片段键盘可达，当前选择离开月份后安全清除或保持受保护面板，不显示错误日期的详情。
- [x] **Step 5: 提交组件/样式/测试。** `feat: add actionable affairs month calendar`。

### Task 6: 工作台视图、URL、空日新增及热力图

**Files:**
- Modify/Test: `src/features/affairs/components/progress-dashboard.tsx`、`progress-dashboard.test.tsx`
- Modify: `src/features/affairs/components/contribution-heatmap.tsx`、`affairs.module.css`
- Create: `src/features/affairs/components/contribution-heatmap.test.tsx`
- Modify/Test: `src/app/affairs/page.tsx`、`page.test.tsx`
- Modify/Test: `src/lib/affairs/context.ts`、`context.test.ts`、`src/app/affairs/tasks/new/page.tsx`、`src/features/affairs/components/task-form.tsx`、`forms.test.tsx`
- Read/reuse: `navigation-guard.tsx`、`navigation-guard.test.tsx`（按回归发现需要时定向修复，不重写守卫）。

**Interfaces:**
- Consumes: Task 4 parse/build/shift、Task 5 `MonthCalendar`。
- Produces: `ProgressDashboard` 增加 `initialLocation?:CalendarLocation`，缺省 list + data.today 月份；保留原清单 scope/history 状态，calendar 不应用隐藏主线 scope。
- Produces: `creationDate(value:string|undefined):{date:string|null;error:string|null}` 在 `context.ts`；TaskForm 可选 `defaultDueDate?:string|null`。空日 `onCreateTask(date)` 跳到 `/affairs/tasks/new?dueDate=YYYY-MM-DD`，校验后预填，绝不自动保存。

- [x] **Step 1: 写失败测试。** 删除三个热力图文案但按钮 accessible label/当天点击保留；默认清单、calendar URL、月切换/今天/前后退正确；calendar 不含 mainline 名称及清单范围控制。invalid query 安全默认。点击空日只导航预填 dueDate，未提交前无 action。既有 projectId 预填与日期预填同时保留。
- [x] **Step 2: 运行 RED。** `npm run test -- src/features/affairs/components/progress-dashboard.test.tsx src/features/affairs/components/contribution-heatmap.test.tsx src/features/affairs/components/navigation-guard.test.tsx src/app/affairs/page.test.tsx src/lib/affairs/context.test.ts src/features/affairs/components/forms.test.tsx`。
- [x] **Step 3: 接入现有页面。** Server Page 接受 App Router Promise searchParams，原 service 只调用一次并传上海 today/已校验 location。客户端基于已有 data 投影；月份及 view 用同页 URL 状态同步，不为切月重新读 View，可使用 Next 支持的同页 history integration 并保留原 history state。复用 layout 中既有 AffairsNavigationGuard，任何新按钮操作先执行 `canLeaveAffairsForm(root)`，对 pending/unknown 禁止切换，dirty 拒绝时保持原 URL。
- [x] **Step 4: 运行 GREEN、`npm run typecheck`、`npm run test`。** 特别测试清单表单与日历表单的前/后退守卫、快速多次月份切换、成功 refresh 后详情保留；确认月份变更不增加 service/query calls。热力图压缩但点击目标与移动横向容器可用，不让整页溢出。
- [x] **Step 5: 提交集成改动。** `feat: integrate month calendar into affairs workbench`。

### Task 7: 完整验证与正式库交接

**Files:**
- Create: `docs/affairs-month-calendar-usage.md`
- Create: `docs/affairs-month-calendar-verification.md`
- Update: 本计划执行勾选和实际证据（预期断言不能写成通过结果）。

**Interfaces:**
- Consumes: Tasks 1–6 的 migration、checks、测试及真实 UI；不产生额外产品接口。
- Produces: 用户操作顺序、实际测试/构建/视觉证据、尚未完成的正式库核对清单。

- [x] **Step 1: 完整验证。** `npm run test`、`npm run typecheck`、`npm run lint`、`npm run build`。记录命令、结果及现有失败，不只跑新测试。隔离 SQL 重跑 Task 1 四个脚本。不能将 PGlite 标记为正式库测试或并发 session 测试。
- [x] **Step 2: 浏览器视觉与交互检查。** 使用可用 Browser 工具；对照选定图在约 1440×1024、768、390 宽度验证月网格/条/字体/溢出/未安排/详情/键盘。浏览器写入只能作用于本地 fixture；若仅能连接正式库，则只读检查并明确新字段未部署的限制，不用 mock 服务掩盖。不登录/读取用户密码，缺 session 让用户自行登录。
- [ ] **Step 3: 单次完整代码审查和修复。** 执行流程允许时由独立 reviewer 检查整体 diff，重点按 Review Focus；Important/Critical 一次 TDD 修复，所有未修复项准确记录，不能在最终报告隐去。审查不授权数据库、远程推送或新增功能。
- [x] **Step 4: 写操作说明。** 用户先运行只读 preflight，提交实际字段/函数/View/权限结果；差异先报告。确认无冲突后由用户执行 migration，再运行只读 postflight。解释旧备注钟点须编辑一次，如何设置开始/截止/时间、如何完成 TODO、未安排入口以及默认隐藏完成事项。不得在 SQL Editor 混放自动测试写入。
- [ ] **Step 5: 提交说明和验证记录，交付后停止。** 未经后续授权不合并 main、不推送、不发布 Vercel。若数据库尚未部署，明确“本地实现及测试完成，正式库接入待确认”，不能宣称生产可用。

## 计划自查与执行交接

### RED 测试的最小断言锚点

实现时使用现有测试 helpers 构造完整 row/draft/props；以下断言固定业务值，不是提前编写实现代码：

```js
// Task 1: 新 SQL runner，在 db/rows 为现有 PGlite helper 的条件下。
assert.equal((await rows("select column_name from information_schema.columns where table_schema='public' and table_name='affairs_tasks' and column_name='planned_time'")).length, 1);
assert.deepEqual(afterFinanceSnapshot, beforeFinanceSnapshot);
assert.equal(replayed.object_id, originalReceipt.object_id);
assert.equal(replayed.replayed, true);
```

```ts
// Task 2
expect(normalizeScheduleTime('10:30:00')).toBe('10:30');
expect(() => normalizeScheduleTime('10:30:01')).toThrow();
expect(validateScheduleMetadata({due_date:null,planned_time:'10:30'})).toHaveProperty('planned_time');
// Task 3: confirmation 是 toAffairsConfirmation(newDraft, null) 的结果。
expect(confirmation).toMatchObject({payload:{due_date:'2026-10-08',planned_time:'10:30',planned_start_date:null}});
expect(retriedOldConfirmation).toEqual(frozenOldConfirmation);
// Task 4: projects/tasks 是本地 fixture，onlyRange 为 Oct1–12 项目。
const model=buildMonthCalendar([onlyRange],[],'2026-10','2026-10-05');
expect(model.weeks).toHaveLength(5);
expect(model.weeks[0].days[0].date).toBe('2026-09-28');
expect(model.weeks.flatMap(w=>w.segments).map(s=>s.span)).toEqual([4,7,1]);
```

```ts
// Task 5: 完成入口仅打开确认，最终保存复用原 action。
await user.click(screen.getByRole('button',{name:'完成：准备面试材料'}));
expect(screen.getByRole('dialog',{name:'确认行动完成'})).toBeVisible();
expect(action).not.toHaveBeenCalled();
// Task 6: 工作台取 calendar 初始状态后，只有月历，没有主线或周入口。
expect(screen.queryByText('主线与项目')).not.toBeInTheDocument();
expect(screen.queryByRole('button',{name:'周'})).not.toBeInTheDocument();
expect(screen.queryByText('推进轨迹')).not.toBeInTheDocument();
expect(screen.getByLabelText('2026-10-05 · 0 次推进')).toBeInTheDocument();
```

上述 Task 5 约定触发按钮 accessible name 为 `完成：{title}`。Task 6 的贡献 fixture 对当天次数设为 0，断言针对真实可访问行为；不把 CSS 字符串或 mock 调用次数当作唯一业务验证。

已逐段覆盖设计中的真实数据、所有入口、旧请求兼容、纯月历、完成保护、响应式和上线顺序。Tasks 1–6 每项有 RED/GREEN 和全套回归；Task 7 是交付验证，不在末尾补写未经 RED 的产品代码。

推荐当前会话原生顺序实施，直接使用 develop；最终独立审查按执行技能处理，不为每个任务另开代理。计划审核和执行方式确认后才进入 Task 1，当前不执行正式库 SQL。
