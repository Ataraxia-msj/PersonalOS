# Agent Finance Conversation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 首页财务 Agent 可以记住待处理交易、自动建议真实分类、逐轮追问必要信息，并在同一处预览确认保存。

**Architecture:** 浏览器维护一份不可信但有稳定标识的草稿状态，Server Action 每轮验证身份、字段和真实候选，千问只提供受约束的增量意图。确定性状态更新及追问与模型和组件隔离；写入继续复用现有 Finance 确认层/RPC，不增加数据库会话表或使用 Vercel 进程内存存储会话。

**Tech Stack:** 现有 Next.js 15 App Router、React 19、TypeScript、CSS Modules、Supabase SSR、千问严格 JSON Schema、Vitest 和 Testing Library；不升级或新增依赖。

**Spec:** [Agent 财务交互式录入设计](./agent-finance-conversation-design.md)，已由用户于 2026-10-11 确认。

## Global Constraints

- 在现有 `develop` 中实施；不创建新 worktree，不混入 `docs/affairs-rewards-design.md` 等用户文件。
- 本期不改数据库 Schema、RPC 参数、账务/预算口径，不推送生产端。
- 保留千问服务端配置，API key 不进入客户端或日志；Supabase 使用 publishable key + Auth cookie + RLS，不读取密码或 secret/service_role。
- 每个解释及确认 Action 使用 `getClaims()` 验证用户，复用一个 server client；不信任 getSession() 或客户端状态。
- 候选账户、分类、预算来自现有真实 service，禁止 mock fallback；组件不直接查数据库。
- `Asia/Shanghai`；默认时间首次创建时固定；明确过去日期缺时刻使用该日 00:00 并展示“未指定时刻”。未来已发生交易不能提交。
- 每批次累计最多 20 笔（包括已保存和已取消）；单条输入最多 4000 字符，会话输入 JSON 最多 40000 字符；描述/备注最多 1000 字符。
- 模型上下文只保留最近最多 6 条用户文本，合计最多 6000 字符，不发送余额、已保存交易详情或无限历史。
- 支出 RPC 无请求幂等标识；不承诺 exactly-once，不自动重试未知写入结果。普通确认逐笔执行，不引入批量原子性承诺。
- 保留暗色视觉、事务现有录入与保存保护；没有用户另行授权，不使用真实消费做模型/数据库写入测试。
- 本文只交付计划；用户审核计划并选择执行方式后，才进入实施。

## Review Focus

1. 中文输入法组合输入时按 Enter 不能误发送，键盘选项选择和窄屏不影响正常补充（Task 6）。
2. 回答追问前，候选账户被停用或分类默认预算改变：使用新鲜候选，不写旧字段、不清空用户已确定信息（Task 2 / 4）。
3. 同一页面身份切换或旧请求迟到：不显示/提交上一用户草稿，旧回合不能覆盖新状态（Task 4 / 5）。
4. 取消“不计预算”后、或用户已明确预算又修改分类：恢复默认或保留显式预算，不意外冲掉归属（Task 2）。
5. 表情/中文长度边界、重复响应和取消后编号：按 code points 计数，追加不重复，序号不重排（Task 1 / 3 / 5）。

## 文件与接口约定

以下路径均相对仓库根目录。新增 `src/lib/agent/conversation/` 放不依赖 React 的会话契约、校验、状态、问题与编排；新增客户端控制 hook，避免把全部逻辑继续堆在工作区里。测试按仓库现有相邻 `.test.ts/.test.tsx` 模式组织，服务端测试标 `// @vitest-environment node`。

核心类型由 Task 1 定义，后续任务使用同名类型，不能各自发明协议：

- `FieldOrigin = 'explicit' | 'suggested' | 'default'`。
- `FinanceField`：只允许 `ModelTransactionDraft` 的交易字段，排除 sourceText；另用白名单处理 sourceText/rawText，不允许更新身份、ID、生命周期或保存结果。
- `ConversationItem`：`draft: AgentTransactionDraft`、`ordinal: number`、`lifecycle: 'editing'|'ready'|'saving'|'saved'|'uncertain'|'discarded'`、`origins: Partial<Record<FinanceField,FieldOrigin>>`、`timeAssumption:'recorded_now'|'date_only'|null`、`attempted: boolean`、`confirmation: AgentConfirmationResult|null`。
- `FinanceQuestion`：`id: string`、`kind: 'field'|'target'|'direction'`、`field: FinanceField|null`、`targetIds: string[]`、`text: string`、`choices: Array<{id:string;label:string}>`。问题和候选由服务器生成，不信任客户端 choices。
- `FinanceConversation`：`ownerId,conversationId,batchId` 字符串、`revision` 非负整数、`items: ConversationItem[]`、`intentSeed: {rawText:string;accountId:string}|null`、`pendingQuestion: FinanceQuestion|null`、`pendingTargetChanges: FieldChange[]|null`、`recentUserTexts: string[]`、`appliedTurnIds: string[]`（最多 32 个）。
- `FinanceTurn`：`text {rawText:string}` / `selection {questionId:string;choiceId:string}` / `edit {draftId:string;changes: FieldChange[]}` / `discard {draftId:string}`，各带 `kind`。
- `FieldChange`：`{field:FinanceField;value:string|number|boolean|null;origin:FieldOrigin}`，运行时校验每个字段的具体值类型，不能随意改来源。
- `FinanceTurnInput`：`{ownerId:string;state:FinanceConversation|null;turnId:string;baseRevision:number;turn:FinanceTurn}`。
- `ModelFinanceTurn`：`{kind:'patch'|'append'|'clarify'|'route';updates:Array<{draftId:string;changes:FieldChange[]}>;additions:ModelTransactionDraft[];ambiguity:{kind:'field'|'target'|'direction';field:FinanceField|null;targetIds:string[];proposedChanges:FieldChange[]}|null;routeDomain:'affairs'|'mixed'|'unsupported'|null;unresolvedSegments:string[]}`。patch 可包含明确新增的 additions；append 不修改已有条目；clarify/route 不得携带实际更新。target歧义可暂存未应用的proposedChanges，经用户点击确定目标后才应用，不丢掉“改成20”等待定位值。
- `AgentTurnResult`：success-finance 返回 `state,options,message,turnId,baseRevision,ownerId`；success-affairs 返回现有 `AffairsInterpretation` 和上述回合标识；error 返回安全 message 与回合标识，不要求客户端丢掉 state。使用 `status` 和 `domain` 作判别字段。

模型不能改变 rawText、sourceText、requestId、draftId、序号或提交状态。原文来源必须在当前输入中有依据；新增时服务器分配标识并记录首次 rawText。直接 UI 编辑来源固定 explicit；模型建议分类标 suggested；默认日期/预算来源由应用决定，不直接采用模型自报 origin。

## Task 1: 不可信输入契约与确定性草稿更新

**Files:** Create `src/lib/agent/conversation/types.ts`, `validation.ts`, `state.ts`, `test-fixtures.ts`；Test `validation.test.ts`, `state.test.ts`。

**Interfaces:**

- `parseFinanceTurnInput(value:unknown): FinanceTurnInput`，校验大小、精确字段、类型、UUID、数量、正金额/两位精度、唯一 ID/序号；options 字段不能混入输入。
- `createFinanceConversation(ownerId:string,uuid:()=>string): FinanceConversation`。
- `applyFinanceChanges(state:FinanceConversation,turnId:string,changes:ModelFinanceTurn,uuid:()=>string): FinanceConversation`，纯更新；不负责读取真实候选或财务就绪验证。
- `setFinanceSubmission(state:FinanceConversation,draftId:string,event:{kind:'start'}|{kind:'result';result:AgentConfirmationResult}): FinanceConversation`，纯生命周期转换。
- 夹具导出 `financeOptions`, `expenseItem(overrides?:Partial<ConversationItem>)`, `conversation(overrides?:Partial<FinanceConversation>)`, `textInput(rawText:string,state?:FinanceConversation|null):FinanceTurnInput`，使用有效 UUID，不沿用旧测试的 wechat 等假 ID 作为协议 UUID。

- [ ] **1. 写失败测试。** `rejects_unicode_over_limit`: `expect(() => parseFinanceTurnInput(textInput('😀'.repeat(4001)))).toThrow()`；4000 不因 UTF-16 长度变成超限。`updates_one_item_without_replacing_identity`: patch 后 `draftId/ordinal/rawText` 不变；`second_item_budget_exclusion` 只改第二项。覆盖金额0/NaN/三位小数、未知字段、重复ID/序号、20/21笔、40000/40001会话字符、冻结条目更新、丢弃后不重排、重复turnId不重复追加。
- [ ] **2. 运行 RED。** `npm run test -- src/lib/agent/conversation/validation.test.ts src/lib/agent/conversation/state.test.ts`；先看到新增模块缺失或行为断言失败，不把已有环境失败当成功的 RED。
- [ ] **3. 实现上述类型与函数。** 全量响应校验通过才应用；失败不修改原对象。revision 每次有效更新递增；重复 turnId 返回不变状态；saving/uncertain 全局阻断解释修改，saved/discarded 不再编辑。提交成功/警告映射 saved，明确 error 回到 editing/ready 但保留结果；uncertain 保持保护。
- [ ] **4. 运行 GREEN。** 同一命令全通过；`npm run typecheck` 无新增错误。TDD 代码不引用数据库或模型，类型不能用 `as never` 绕过协议验证。
- [ ] **5. 提交。** 仅暂存本任务列出的文件，`git diff --cached --check` 后 `git commit -m "feat: add finance conversation state and validation"`。

## Task 2: 字段归一化、来源和下一问题

**Files:** Create `src/lib/agent/conversation/drafts.ts`, `questions.ts`；Modify `src/lib/agent/orchestrator.ts`；Test `drafts.test.ts`, `questions.test.ts` 及现有 `orchestrator.test.ts`。

**Interfaces:**

- `normalizeConversationItem(item:ConversationItem,options:AgentFinanceOptions,now:Date,uuid:()=>string): ConversationItem`。
- `buildFinanceQuestion(state:FinanceConversation,options:AgentFinanceOptions,ambiguity:ModelFinanceTurn['ambiguity']): FinanceQuestion|null`。
- `resolveFinanceSelection(state:FinanceConversation,selection:Extract<FinanceTurn,{kind:'selection'}>,options:AgentFinanceOptions): ModelFinanceTurn`，依据重建问题验证候选；不接受输入中自带选择列表。
- 提取 `deriveAgentDraft(model:ModelTransactionDraft,rawText:string,options:AgentFinanceOptions,now:Date,ids:{draftId:string;requestId:string|null}): AgentTransactionDraft` 供原单轮及会话复用，不复制两套候选映射。

- [ ] **1. 写失败测试。** `meal_requires_only_payment_account`: 金额20、默认时间与 suggested 分类已有时只返回一个账户问题。`default_date_does_not_shift_at_midnight`: 再次归一化不改创建时日期。`past_date_without_time` 期待00:00与来源提示。分别断言 inactive候选不能选、类别默认预算变化更新默认、显式预算不变、取消exclude恢复默认、分类不唯一返回分类问题、不凭余额猜账户、收入负债账户不ready、转账异币种/同账户/错误用途不ready。
- [ ] **2. 运行 RED。** `npm run test -- src/lib/agent/conversation/drafts.test.ts src/lib/agent/conversation/questions.test.ts`。
- [ ] **3. 实现函数。** 引用现有金额/上海时间校验；模型/编辑可提供date-only yyyy-MM-dd，在进入确认快照前转00:00并置timeAssumption=date_only；未提供时间首次用now并置recorded_now；明确完整时间置null。用户提供非法日期保留问题而不替换今天。按设计顺序每次一个问题；同账户批量补充必须有明确作用范围。target选择验证真实draftId后应用pendingTargetChanges并清除；direction选择将intentSeed转换为指定类型、其余事实待补的条目。中性描述只在交易方向确定后生成。requestId 与首次提交快照绑定；明确回滚后的编辑生成新标识，未知状态不允许更新。旧单轮逻辑继续使用同一底层映射且维持原 API。
- [ ] **4. 运行 GREEN/回归。** 上述命令加 `src/lib/agent/orchestrator.test.ts src/lib/agent/confirm.test.ts`；确认未改变现有交易口径。
- [ ] **5. 提交。** 仅暂存本任务文件，检查 diff 后 `git commit -m "feat: derive finance draft defaults and focused questions"`。

## Task 3: 千问受约束的回合解析

**Files:** Modify `src/lib/agent/qwen.ts`, `schema.ts`；Create `src/lib/agent/conversation/model-context.ts`；Test `conversation/schema.test.ts`, `conversation/model-context.test.ts`，Modify `src/lib/agent/qwen.test.ts`。

**Interfaces:**

- `financeConversationJsonSchema`、`parseModelFinanceTurn(value:unknown): ModelFinanceTurn` 在 schema.ts 导出。
- `FinanceConversationContext` 在 conversation/types.ts 补充：`rawText,nowShanghai,items,pendingQuestion,intentSeed,recentUserTexts` 与 `AgentFinanceOptions`；items 仅模型必要交易字段、稳定ID和序号，不含保存回执/已保存条目。
- `buildFinanceModelContext(input:FinanceTurnInput,state:FinanceConversation,options:AgentFinanceOptions,now:Date): FinanceConversationContext`。
- `interpretFinanceTurn(context:FinanceConversationContext,options?:QwenClientOptions): Promise<ModelFinanceTurn>`，复用 requestQwenJson，不改变已有供应商环境变量。

- [ ] **1. 写失败测试。** `sends_previous_draft_and_question_with_account_answer`: 最新文本为“情侣小荷包”，context 包含待补草稿金额20与账户问题。`excludes_saved_details_and_balances`: `expect(JSON.stringify(context)).not.toContain(savedDescription)`。覆盖最近6条/6000字边界、缺字段/额外字段/错误value类型、最多20 additions、clarify/route携带更新拒绝、model返回saved/requestId拒绝、同一答复不得隐式append、注入文本仍在user数据而不改system规则。
- [ ] **2. 运行 RED。** `npm run test -- src/lib/agent/conversation/schema.test.ts src/lib/agent/conversation/model-context.test.ts src/lib/agent/qwen.test.ts`。
- [ ] **3. 实现契约、上下文与 prompt。** 只输出字段增量、明确新增、歧义或分流；只有建议分类可语义推导，关键事实不猜。第三方 prompt 内容不能触发工具或写入。日期未说时标缺省，由 Task 2 处理。不要让模型回复声称已写入；展示消息由应用的草稿/问题状态生成。
- [ ] **4. 运行 GREEN。** 同一命令及 `src/lib/agent/qwen-client.test.ts`；使用注入 fetcher 的固定响应，禁止真实供应商网络调用。
- [ ] **5. 提交。** 仅暂存本任务文件并检查 diff，`git commit -m "feat: parse incremental finance turns with Qwen"`。

## Task 4: 会话编排、Auth 与原有事务兼容

**Files:** Create `src/lib/agent/conversation/orchestrator.ts`；Modify `src/app/agent-actions.ts`, `src/app/page.tsx`；Test `conversation/orchestrator.test.ts`, `src/app/agent-conversation-actions.test.ts`, `src/app/page.test.tsx`，保留现有 Action/事务测试。

**Interfaces:**

- `handleFinanceTurn(input:FinanceTurnInput,options:AgentFinanceOptions,dependencies:{now:Date;uuid:()=>string;interpret:typeof interpretFinanceTurn}): Promise<{state:FinanceConversation;message:string;routeDomain:ModelFinanceTurn['routeDomain']}>`。
- `interpretAgentTurnAction(input:unknown): Promise<AgentTurnResult>`，验证 ownerId 等于当前 claims.sub。
- `getAgentIdentityAction(): Promise<{status:'success';ownerId:string}|{status:'error';message:string}>`：客户端确认写入前验证主体，不能依赖旧页面 prop。已有 `confirmAgentTransactionAction(draft)` 增加可选 `expectedOwnerId?:string`，传入时在调用任何 mutation 前检查 claims.sub 一致；老调用保持兼容。
- 首页提供必填 `ownerId:string` 给工作区；缺失有效 claims 跳转 `/login?next=%2F`；不预加载全部候选、不信任浏览器 Auth 缓存。

- [ ] **1. 写失败测试。** “午饭20”再“情侣小荷包”同一draftId且一笔ready；“都是微信”“第二笔不计预算”patch目标准确；“这笔改20”多目标先问，点击第二笔后其金额20且selection不调模型。只有真实账户名建立intentSeed然后问方向，点击支出后不丢该账户。断言 active回合不调用 classifyAgentMessage、selection不调用千问、一个client且一次候选service调用、expired/mismatched identity前不调模型/RPC、候选停用时原草稿保留但不可confirm、非法update全部拒绝、route事务不传finance正文、mixed不写入。首页未验证用户redirect，传工作区仅ownerId。增加真实unknown转账错误分类与确定性未写入差别回归，不把网络异常降级error。
- [ ] **2. 运行 RED。** `npm run test -- src/lib/agent/conversation/orchestrator.test.ts src/app/agent-conversation-actions.test.ts src/app/page.test.tsx`。
- [ ] **3. 实现编排和 Actions。** 新回合先验证完整输入及主体；读取一次options；精确单账户名先确定性intentSeed，其余新消息保留领域分流；活跃财务回合用Task3，按钮用Task2，均校验后原子应用再重新归一化和生成问题。route事务调用已有 interpretAffairsMessage 并传同一个client；明确不支持/混合只返回提示且保留草稿。旧 interpretAgentMessageAction 作为兼容入口保留，抽私有共用处理而非从新Action再次调用旧Action重复认证。
- [ ] **4. 运行 GREEN/回归。** 上述命令加 `src/app/agent-actions.test.ts src/app/agent-affairs-actions.test.ts src/lib/agent/intent.test.ts src/lib/agent/confirm.test.ts`；`npm run typecheck`。
- [ ] **5. 提交。** 仅暂存本任务文件并检查 diff，`git commit -m "feat: add authenticated finance conversation actions"`。

## Task 5: 客户端会话控制与提交保护

**Files:** Create `src/features/agent/submission-protection.ts`, `use-finance-conversation.ts`；Test `submission-protection.test.ts`, `use-finance-conversation.test.tsx`。

**Interfaces:**

- `SubmissionMarker` 仅含 `ownerId,batchId,draftId,requestId,submittedAt,type,status:'saving'|'uncertain'`。
- `readSubmissionProtection(storage:Storage,ownerId:string): SubmissionMarker|null`、`writeSubmissionProtection(storage:Storage,marker:SubmissionMarker):void`、`clearSubmissionProtection(storage:Storage,ownerId:string):void`，失败抛安全错误；key `personal-os:agent:finance-submission:<ownerId>`。
- `useFinanceConversation({ownerId,turnAction,identityAction,confirmAction,onProtectionChange})`，action类型分别引用Task4；返回 `{state,options,messages,pending,blocked,restoredMarker,sendTurn,confirm,acknowledgeCheckedResult}`。sendTurn 输入FinanceTurn，confirm输入draftId；更新保护同步向工作区反馈。身份与结果变化是hook状态，不隐藏在卡片里。

- [ ] **1. 写失败测试。** `rejects_stale_response`: 基础revision不同返回不覆盖；重复response/turnId不append。`blocks_double_click_and_shared_input`: 快速两次confirm只能一次RPC。`writes_marker_before_rpc`: storage抛错时expect(confirmAction).not.toHaveBeenCalled()。检查保存前identity改变不写入、expectedOwnerId传给confirmAction、success/warning后只读、error保留可修复、promise抛错置uncertain不允许重发、刷新恢复saving为待核对、不存任何金额/账户/正文/token、其他用户marker不加载、beforeunload未保存提示。
- [ ] **2. 运行 RED。** `npm run test -- src/features/agent/submission-protection.test.ts src/features/agent/use-finance-conversation.test.tsx`。
- [ ] **3. 实现hook与存储。** ref同步互斥避免setState前双击；验证身份后写保护标记才调用confirm，服务器再校验expectedOwnerId。发现身份改变时立即移除旧用户草稿/消息，不迁移标记，不显示迟到响应。恢复标记先阻断输入，不恢复聊天正文。网络结果未知冻结且不提供retry；核对按钮须用户勾选“我已核对交易记录”，只结束待核对条目、不重新提交或声称自动验证。写入成功但清标记失败展示已保存并仍保护，允许仅清理标记，不再调用RPC。卸载时不以清理函数假定请求失败，保留标记。
- [ ] **4. 运行 GREEN。** 同一命令；验证hook不导入server-only模块/密钥，不在浏览器自行验证session。
- [ ] **5. 提交。** 仅暂存本任务文件并检查 diff，`git commit -m "feat: protect finance draft submissions and stale replies"`。

## Task 6: 单处预览、问题按钮和保存前编辑

**Files:** Create `src/features/agent/finance-conversation-preview.tsx`, `clarification-question.tsx`；Modify `agent-workspace.tsx`, `transaction-preview.tsx`, `agent-workspace.module.css`；Test 新增组件 `.test.tsx` 及现有 `agent-workspace.test.tsx`, `transaction-preview.test.tsx`。

**Interfaces:**

- `ClarificationQuestion({question,disabled,onSelect})`：onSelect接收 selection FinanceTurn；不调用模型或数据库。
- `FinanceConversationPreview({state,options,disabled,onTurn,onConfirm})`：onTurn接收FinanceTurn，onConfirm接收draftId；一处列表和各单笔按钮。
- TransactionPreview 增加受控会话item/编辑/确认props；如果保留旧非会话调用，使用单独legacy wrapper，不能同一张会话卡片同时有局部和外部保存结果。
- AgentWorkspace 接收ownerId和可注入turn/identity/confirmActions，使用Task5；继续接受既有affairsConfirmAction/affairsDuplicateAction。现有测试注入接口同步适配，不能通过绕过Auth props把生产默认变成假owner。

- [ ] **1. 写失败交互测试。** 午饭20→账户短答只显示一个预览，金额和ID保持；点击真实账户choice传ID且不重新生成；“第二笔”只改指定条目；点击分类/预算/日期可编辑，金额/描述也可在确认前纠正；常规缺项只有当前问题而无警告墙。覆盖已记录回执不重挂载成可confirm、取消后编号稳定、finance保护锁事务且反向亦然、未认证主页无工作区、普通服务器错误保留现有草稿。
- [ ] **2. 运行 RED。** `npm run test -- src/features/agent/clarification-question.test.tsx src/features/agent/finance-conversation-preview.test.tsx src/features/agent/agent-workspace.test.tsx src/features/agent/transaction-preview.test.tsx`。
- [ ] **3. 实现紧凑UI。** 表单传structured edit由Action复验；日期按来源显示“默认记录时间/未指定时刻”，category建议标识清晰；不要再次要求必填备注。composer Enter提交/Shift+Enter换行，在event.isComposing/nativeEvent.isComposing时不发送。问题按钮可Tab/Enter选择，响应式保持320px宽内无水平溢出；现有AffairsPreview不重写，只接共享保护。
- [ ] **4. 运行 GREEN/可访问回归。** 上述命令加 `src/features/agent/affairs-preview.test.tsx src/features/agent/affairs-queue.test.ts`。新增 `does_not_submit_during_ime_composition` 断言action未调用，正常Enter调用一次；`keyboard_selects_real_account` 使用user.tab/keyboard，焦点与传递ID正确。运行 `npm run typecheck`。
- [ ] **5. 提交。** 仅暂存本任务文件并检查 diff，`git commit -m "feat: make finance entry conversational and editable"`。

## Task 7: 全链路回归与交付

**Files:** Modify 本计划（勾选已完成步骤）、`docs/agent-finance-conversation-design.md`（更新实施状态与证据）；如回归发现缺陷，只修改对应Task已列文件并补回归测试。

**Interfaces:** 使用上述所有接口；不引入新功能、写入测试账户或生产发布步骤。

- [ ] **1. 运行最终检查。** 分别执行 `npm run typecheck`、`npm run lint`、`npm run test`、`npm run build`、`git diff --check`；读取每项退出码与完整结果。记录新增/原有测试结果，不引用过去539条通过记录作为本次证据；Next dev编译时间不计模型/数据库性能。
- [ ] **2. 浏览器验证。** 执行前读取 frontend-testing-debugging 技能，优先可用Browser工具。可注入Action的真实组件测试夹具只用于测试，不接入生产页面或mock fallback。验证“午饭20→情侣小荷包”、多笔修正、真实候选点击、保存前字段编辑、保存中/未知保护、320/390/1440px、中文输入法和键盘；记录实际测试方式。真实登录由用户自行完成，不读取密码。没有真实写入授权时只验证预览或受控测试Action，不点会写真实账本的确认。
- [ ] **3. 审查范围。** `git diff afa85ce --name-only` 与任务范围对比；`git diff afa85ce -- supabase package.json package-lock.json` 应无数据库/依赖变更；不能因代码已逐项提交就只检查空的工作区diff。检查所有Agent组件没有`.from()`或密钥、没有新增默认假候选。结合Task1–6逐条对照设计验收12项，报告未能完成的真实环境验证。
- [ ] **4. 更新交付记录并提交。** 记录命令、日期、通过/失败及已知限制，不能以占位通过记录替代证据。只提交本功能文件，保留用户未跟踪文件；提交前再次`git diff --cached --check`。提交信息 `docs: record interactive finance agent verification`。
- [ ] **5. 停在本地交付。** 汇报文件、测试和可用交互；明确无migration、未发布、刷新不恢复全文、支出无数据库级幂等保证。等待用户生产发布授权。

## 执行顺序与审核

Task 1 → 2 → 3 → 4 → 5 → 6 → 7。TDD每次先看到预期RED再做最小实现，失败时定位原因，不跳过测试或删断言。每项完成才勾选并提交，不以计划中的示例断言代替实际可运行测试。

推荐当前会话内由主代理逐项执行：接口依赖紧密，沿用本次代码核查上下文，避免多份协议实现互相漂移。用户也可选择分任务子代理执行；两种方式都须先审核本计划。实现及最终评审使用对应技能，受当前工具/模型授权约束；本阶段不启动子代理或产品实现。
