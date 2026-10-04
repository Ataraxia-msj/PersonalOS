# 千问事务录入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. User requests direct execution without further approval prompts; implementation is native in this session on develop, not delegated or in a new worktree.

**Goal:** 首页用同一千问入口识别一段话中的多条事务，编辑预览后通过现有幂等 RPC 保存真实记录。

**Architecture:** 先分类再进入独立财务或事务解释器；事务 service 提供真实候选，模型只输出结构化提议。服务端校验后提供预览，客户端按冻结的依赖顺序逐项请求单项 Server Action，保存与重试使用既有 RPC 回执。

**Tech Stack:** Next.js 15 App Router、TypeScript、React 19、Supabase SSR、千问兼容 API、Vitest / Testing Library。

**Spec:** [agent-affairs-phase-one-design.md](./agent-affairs-phase-one-design.md)

## Global Constraints

- 当前 develop 内开发，保留无关的 `docs/affairs-rewards-design.md`；不创建 worktree、不合并、不推送、不发布。
- 输入最多 4000 个 Unicode 字符，模型事务结果最多 20 项；不可静默截断。
- 固定 Asia/Shanghai；计划允许未来日期，具体时间保留到说明，不新增提醒/预约字段。
- publishable key + Auth cookie + RLS；服务端 getClaims 验证；不使用 secret/service_role、不读取或记录用户密码及 key。
- 不新增数据库表、字段、RPC、migration，不改变 RLS/grants、Finance 口径和奖励规则。
- 事务确认白名单仅 `create_affairs_mainline`、`create_affairs_project`、`create_affairs_task`、`create_affairs_inbox_entry`。
- 模型不写数据库；财务/事务混合输入明确提示分开发送，不默认当作财务。
- 独立单项 RPC 原子，整批不是原子事务；结果未知暂停，重试保持同 requestId/payload。
- 不自动创造项目、成果、完成条件、核心资格；复用建议可见且语义匹配必须确认。
- 正式库写入仅在用户于产品预览明确确认后执行，不由开发验收偷偷创建测试数据。

## Review Focus

1. 供应商已返回 headers 但响应体一直不结束：超时应覆盖 body 读取，而不只覆盖 fetch（Task 1）。
2. 本批父级被跳过或改成复用：子项不能引用失效临时 ID 或默默变为独立行动（Task 3 / 5）。
3. 已提交的父级随后归档：未知提交仍可按原请求幂等核对，不能在应用层提前拒绝重试（Task 4）。
4. 改标题后旧重复检查晚到：不得把旧标题的重复结果应用到新预览（Task 5）。
5. 切屏、路由刷新或新消息：不得重建未知提交标识或允许绕过保存锁（Task 5 / 6）。

## File Structure / Shared Interfaces

- `lib/agent/qwen-client.ts`：provider transport；`intent.ts`：四类领域分类；现有 `qwen.ts` 保留财务解释器。
- `lib/agent/affairs/types.ts`：模型契约、候选、可编辑草案、已规范化的单项确认 DTO；schema 与纯 preview 校验共用同一契约。
- `lib/agent/affairs/{schema,orchestrator,confirm}.ts`：严格解析、真实候选与草案、创建白名单。
- `lib/agent/affairs/preview.ts`：纯校验、日期说明、父级依赖和拓扑排序；不访问数据库。
- `lib/affairs/{queries,service}.ts`：最小候选与精确标题重复读取；页面不调用 `.from()`。
- `app/agent-affairs-actions.ts`：单项确认及候选重查；现有 `agent-actions.ts`：域分类入口，财务确认不变。
- `features/agent/{affairs-preview,affairs-preview-card}.tsx`：队列控制与字段展示分离；`affairs-queue.ts`：纯执行状态机及测试。
- 首页 workspace、样式、建议命令及测试：选择带 domain 的预览，接入未保存/未知结果保护。

共享契约必须由 owning task 导出，不依赖实施者猜名字：

- `QwenClientOptions` 及 `QwenProviderError` 移到 qwen-client，并从旧 qwen.ts 重导出以保持调用者兼容。
- `requestQwenJson<T>(request: {name:string; schema:object; systemPrompt:string; context:unknown; parse:(value:unknown)=>T; maxTokens?:number}, options?:QwenClientOptions):Promise<T>`。
- `AgentDomain = 'finance' | 'affairs' | 'mixed' | 'unsupported'`；`classifyAgentMessage(rawText:string, options?:QwenClientOptions):Promise<AgentDomain>`。
- `AffairsKind = 'mainline' | 'project' | 'task' | 'capture'`；模型项固定字段：`type, sourceText, name, description, outcome, dueDate, plannedTime, yearInferred, isCore, coreReason, completionCriteria, parentId, parentIndex, existingId`。不适用值为 null/false，parentIndex 为本批数组索引；禁止额外字段。
- `AffairsAgentOptions` 包含最小 mainlines/projects 与 `serverNowISO`；同名任务候选为 `id/title/status/projectId`，不发给模型。
- `AffairsDraft` 附服务端 draftId/requestId、原文、用户选择的 create/reuse/skip、确认标志、引用和 issues；`AffairsInterpretation` 包含 `domain:'affairs'`、message、items、options、unresolvedSegments。
- `PersonalOSInterpretation = ({domain:'finance'} & AgentInterpretation) | AffairsInterpretation`；保留直接财务 orchestrator 的 `AgentInterpretation` 原接口，Action 结果使用新的 discriminated union。
- `AffairsConfirmation` 只含允许的 create/reuse 类型、UUID requestId、符合既有 typed metadata 的 payload 或复用 ID；结果 `{status:'success'|'error'|'uncertain';message:string;receipt:AffairsReceipt|null;objectId:string|null;reused:boolean}`。

## Task 1: 共享千问 transport 与严格领域分类

**Files:** Create `src/lib/agent/qwen-client.ts`, `qwen-client.test.ts`, `intent.ts`, `intent.test.ts`; Modify `src/lib/agent/qwen.ts`。

**Interfaces:** Consumes 原 `QwenClientOptions`、finance schema/parser；Produces `requestQwenJson`、`classifyAgentMessage`、`AgentDomain` 和兼容重导出的 provider error。

- [x] 写失败测试 `classifies_four_domains_without_database_context`：严格 schema 的四类输出全部解析成功，额外字段/未知枚举被拒绝，请求只有原文、不含账户或事务选项；`body_read_timeout_is_safe`：悬挂 json() 受超时保护。
- [x] Run `npm run test -- src/lib/agent/intent.test.ts src/lib/agent/qwen-client.test.ts`，确认行为测试因缺少功能失败，不把启动权限错误当作 red。
- [x] 提取旧 provider transport，保留配置名、默认模型、non-thinking、strict JSON、单 choice/stop 校验及安全错误映射；分类 maxTokens=128，财务默认 4096；timeout 包含读取 response.json()。
- [x] Run 新测试和 `src/lib/agent/qwen.test.ts src/lib/agent/schema.test.ts`，所有通过；财务 payload/schema 不变。
- [x] 仅提交本任务文件，commit `refactor: share Qwen transport and add domain classification`。

## Task 2: 事务 schema 与最小真实候选服务

**Files:** Create `src/lib/agent/affairs/types.ts`, `schema.ts`, `schema.test.ts`; Modify `src/lib/affairs/queries.ts`, `service.ts` 及对应 tests。

**Interfaces:** Produces `parseAffairsInterpretation(value:unknown):ModelAffairsInterpretation`、`affairsInterpretationJsonSchema`、`getAgentAffairsOptions(client:AffairsQueryClient, now?:Date):Promise<AffairsAgentOptions>`、`getAgentTaskDuplicates(client, titles:string[]):Promise<AffairsTaskDuplicate[]>`。

- [x] 写 `rejects_arbitrary_operations_extra_fields_and_more_than_20_items`、`reads_only_mainlines_and_projects_in_parallel`、`duplicate_read_is_owner_scoped_and_exact_title_only`，断言没有金币、钱包、账户或全量任务查询。
- [x] Run 新测试确认 red。
- [x] 实现契约/strict schema；校验 sourceText 不空、布尔/nullable 字段类型、数组索引整数、文本上限和日期格式。service 复用已有主线/项目 queries，定向任务查 `.in('title', titles)`，最多 20 个标题，分页保持确定顺序。
- [x] Run 新测试及旧 affairs service/queries 测试全绿。
- [x] Commit `feat: add typed affairs interpretation and real candidate reads`。

## Task 3: 事务解释、匹配与依赖计划

**Files:** Create `src/lib/agent/affairs/preview.ts`, `preview.test.ts`, `orchestrator.ts`, `orchestrator.test.ts`。

**Interfaces:** Consumes Task 1 transport、Task 2 候选/schema；Produces `interpretAffairsMessage(rawText:string, client:AffairsQueryClient, now?:Date):Promise<AffairsInterpretation>`；导出可注入测试依赖；`validateAffairsDrafts(items:AffairsDraft[], options:AffairsAgentOptions):{items:AffairsDraft[];order:string[]}`；`toAffairsConfirmation(draft, resolvedParentId:string|null):AffairsConfirmation`。

- [x] 固定上海 now=2026-10-04，六项 fixture 测试断言两任务日期/时间无损、四条主线、系统语义建议未确认、无自动项目/核心资格；assert no rpc。
- [x] 测试未知 UUID、无效日期、无年份提示、未来计划、缺成果、父级类型错误、循环、跳过父级、复用父级后的真实引用、计划日期清空/修改时旧时间不残留。
- [x] Run red 后实现严格源片段对应、草案生成、就绪判断及稳定拓扑排序；明确不把孤立的主线 ID 塞进 task.project_id。结构化 plannedTime 必须确定性追加到说明。
- [x] Run 所有新 unit tests green。
- [x] Commit `feat: interpret affairs drafts with verified references and dates`。

## Task 4: 单项确认与首页 Server Action 路由

**Files:** Create `src/lib/agent/affairs/confirm.ts`, `confirm.test.ts`, `src/app/agent-affairs-actions.ts`, `agent-affairs-actions.test.ts`; Modify `src/lib/agent/types.ts`, `src/app/agent-actions.ts`, `agent-actions.test.ts`。

**Interfaces:** Produces `confirmAgentAffairsAction(command:AffairsConfirmation):Promise<AffairsConfirmationResult>`、`checkAgentAffairsDuplicatesAction(titles:string[]):Promise<{status:'success';items:AffairsTaskDuplicate[]}|{status:'error';message:string}>`；interpret action 返回 `PersonalOSInterpretation`，原 financial confirm API 不变。

- [x] 测试 claims 失效、格式非法、非法 create/complete/penalty/delete、不允许跨 owner 关联；`unknown_result_retries_same_request_after_parent_archived` 不在 RPC 前因当前父状态挡住重放；复用须真实读取且不写。
- [x] 路由测试证明 finance 只载财务选项、affairs 只载事务候选、mixed/unsupported 不调用解析/写入，classification failure 不走 fallback；同已验证 SSR client 传入两领域 options service。
- [x] Run red；实现 strict DTO → 既有 validation → foundation/inbox mutation，只支持四种创建。未知错误安全返回 uncertain，明确数据库拒绝返回 error，刷新失败保留 success/receipt。
- [x] Run 新 actions/confirm + 旧 Agent financial tests green。
- [x] Commit `feat: route Agent affairs previews and confirm allowed creates`。

## Task 5: 可编辑卡片与冻结的逐项执行队列

**Files:** Create `src/features/agent/affairs-preview.tsx`, `affairs-preview-card.tsx`, `affairs-queue.ts` 及 tests；Modify agent workspace CSS。

**Interfaces:** `AffairsPreview({interpretation,onProtectionChange,confirmAction?,duplicateAction?})`；`AffairsPreviewCard` 只编辑 props/回调，无数据库调用；queue consumes frozen confirmations/receipts，outputs row states/parent resolution，并逐项 await confirmAction。

- [x] 测试姓名/成果/归属/日期时间编辑、核心字段条件展示、复用选择、skip 缺字段项、用户显式添加项目卡片、不完整依赖禁止保存；标题变化时旧重复查询结果失效。
- [x] 测试成功 A、未知 B、未执行 C；重试 B 同一 requestId/payload；父回执 ID传给子；重复点击不重入；success skip；错误需要结束原批次才能改内容；unknown 不允许该入口。
- [x] Run red 后实现 editable → frozen queue；锁定情况下隐藏可改变关联的控件，保存结果真实链接，不替未提交项渲染成功。添加项目按钮仅在用户点击时创建草案，不自动生成项目成果。
- [x] 接入 data-affairs-dirty/pending/unresolved 标记、beforeunload 与内部导航拦截；明确未知结果须保留页面。不往 localStorage/sessionStorage 写认证信息或个人批次。
- [x] Run card/queue/preview tests green，补 resize/refresh props rerender 不重建原请求的 regression。
- [x] Commit `feat: add editable affairs previews and safe sequential confirmation`。

## Task 6: 首页集成、完整回归与使用说明

**Files:** Modify `src/features/agent/agent-workspace.tsx`, `agent-workspace.test.tsx`, `data.ts`；Create `docs/agent-affairs-phase-one-usage.md`；必要修正前五任务相关文件，不扩大范围。

**Interfaces:** workspace discriminates interpretation.domain；事务 preview 通过 onProtectionChange 阻止新消息绕过 pending/unknown 锁。原 TransactionPreview 及财务确认 props 保持可用。

- [x] 写首次事务消息显示多卡片、财务消息显示原交易卡片、无法支持无预览、pending 文案“正在整理内容…”、全局输入受事务锁、锁解除后继续对话测试。
- [x] Run red；完成首页接线及建议命令。只修改相关文案/预览，不重新设计首页。
- [x] Run `npm run test`、`npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check`；全部 exit=0 才报告通过。
- [x] 用浏览器插件验证实际 `/`：用户示例仅生成预览、不点击保存；desktop/mobile 下可编辑且时间可见，console 无新错误；连接不可用就明确记录 blocked，不用 mock 截图冒充实测。
- [x] 新增使用说明：输入、确认、失败/未知重试、时间/提醒限制、不需要 SQL、生产环境配置复用、上线需要另外授权。
- [x] 提交完成代码，commit `feat: integrate affairs entry into the Personal OS Agent`。完整 review 在用户许可/适用技能要求范围内进行；保留 findings 和测试证据。

## Execution Status

- 设计规格：已进入实施（用户明确要求无需再问）。
- 实施计划：已自检，Task 1–6 覆盖规格各段，Review Focus 五项分别落在 owning task 测试。
- Task 1–6 已完成，含一次独立审查及单轮测试驱动修正。最终 505/505 tests、typecheck、lint、build、diff check 全部通过。
- 浏览器：localhost:4180 首页真实千问识别六项；桌面与 390px CSS 手机断点无横向溢出、无框架报错、控制台无新增错误；完成年份/复用/标题编辑验收，仅预览未保存。手机截图采集超时已注明，不用虚构截图补证据。
- 不修改数据库，不执行正式库测试写入，不合并、不推送、不发布。只保留 develop。

## 实施裁决与独立审查记录

日期：2026-10-04。审查范围：2e13af9..bc1c597；独立 gpt-6-astra 只读审查，无 Critical、Minor 或放弃判断项，五项 Important 已单轮修正，逐项测试 RED→GREEN，最终全量 505/505。

修正：部分保存后真实新父级选项保留、相对跨年日期不改错年份、切换类型清理隐藏日期、初次重复检查与保存统一去空格、已归档主线新请求校验但保留已提交请求重放。补充非法原型键白名单回归。未保存数据不伪装为成功。

裁决（按做出顺序，含代价）：

1. 按用户要求直接在 develop，不另建 worktree；代价：与当前本地工作区共享修改。
2. Windows 无 Bash，使用 PowerShell 和临时 scoped ledger 做任务记录；代价：手工维护进度。
3. 将最小真实同名行动候选加入 AffairsInterpretation，不发给模型；代价：预览 DTO 含必要候选元数据。
4. Task 4 提前接入最小 domain 分支和财务测试 fixture；代价：首页集成分布在 Task 4/6。
5. 保留明确相对日期的模型提议，裸月日仍推断当前年份并要求确认；代价：相对日期仍需用户核对。
6. 项目新请求先查命令、再校验主线，而不改已部署 RPC；代价：检查与写入之间主线被其他设备归档的竞态仍可能存在，不能声称数据库原子保证。
7. 不展示合并/发布选择菜单，保留 develop；代价：生产发布仍需后续明确授权。

未执行真实写入验收：这是有意的正式库安全边界，保存单项通过现有 RPC 契约与模拟回执的测试验证。用户在产品中明确确认后才会写入。

