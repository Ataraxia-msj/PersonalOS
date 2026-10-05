# 事务月历验证记录

2026-10-05，基线 547deb0。以下测试为本地隔离证据，不等于生产功能验收；用户已执行正式库迁移并发回部署前后检查，详见下方。

| 检查 | 实际结果 |
| --- | --- |
| `npm run test` | 最终 110 个文件，539/539 通过 |
| `npm run typecheck` | 通过 |
| `npm run lint` | 通过，无警告 |
| `npm run build` | Next.js 15.5.25 生产构建通过 |
| 本地 `affairs_schedule.mjs` | 新字段、View 列顺序/类型、旧请求重放、omission/null、各 RPC、约束、原子失败、RLS/anon 拒绝、零金币、Finance 不变，全部通过 |
| 本地 foundation / rewards / inbox SQL runners | 全部通过 |
| preflight / postflight | 隔离库验证单个可导出的 report JSON、6 个新列、无非法行 |
| `TZ=America/New_York` 下 schedule/location | 9/9 通过，日期不受设备时区/DST影响 |

SQL runner 参数为 `.affairs-test-runtime/node_modules/@electric-sql/pglite/dist/index.js`，不是数据库 URL。PGlite 不代表正式库或双会话并发验收。

TDD 覆盖新列缺失、结构化日期/钟点、旧 DTO、纯网格/范围/点位/未安排、完成无自动提交、未知刷新保留原 UUID、URL/前后退保护、日期预填、布局及周轨道回收。一次大 DOM 测试查询超过 5 秒，改为定位对应 toolbar 后全套通过；未提高全局超时或改变业务。最终修复后，测试与构建同时运行的一轮出现 5 项 5s 超时及 2 项后续失败（532/539）；等待构建结束后单独重跑相同默认测试命令，539/539 全通过，没有再修改代码或提高超时。最终类型检查、lint、build 均通过。

## 浏览器

Codex in-app browser 在隔离 Vite harness 中渲染实际产品组件。只有 harness 使用本地 fixture；产品没有 mock fallback、认证绕过或正式库写入，没有增加依赖。

源图与实现截图放在同一个比较输入中打开，调整后再次比较；详细报告见 [design QA](affairs-month-calendar-design-qa.md)。

- 桌面 1488×1058、平板 768×1024、手机 390×844。截图 full-page，密度 1；桌面/平板实际宽度扣除 15px 滚动条，没有缩放。
- 三个尺寸无整页横向溢出。手机热力图自身滚动；七列月历和完整当日清单保留。
- next/today/back/forward、项目完整日期详情、Escape、完成确认、未知时阻止 Back、原请求重放回执、`+N`、未安排、空日预填 2026-10-22 且未保存，实际检查通过。
- 单元测试覆盖 dirty/pending/unknown 控件与历史导航保护。
- 干净标签页控制台 error/warn 为 0；早期 harness 热更新出现 3 条重复 createRoot 警告，重新加载不复现，非产品组件错误。

![桌面](assets/affairs/month-calendar-desktop.jpg)

[平板](assets/affairs/month-calendar-tablet.jpg) · [手机](assets/affairs/month-calendar-mobile.jpg) · [完成回执](assets/affairs/month-calendar-confirmation.jpg)

## 实施调整

- Windows helper 无法创建盘符路径，使用等价 PowerShell 记录任务/日志；风险仅在过程记录。
- 先尝试跨月固定轨道，视觉检查发现结束项目遗留空轨道，恢复计划中的每周首个空轨道；记录颜色/标识稳定，但跨周条可能换垂直轨道。
- 既有确认面板增加可选初始打开/隐藏触发/关闭回调，保留刷新后消失对象的冻结请求；默认入口不变，风险是可选接口增量。

## 正式库结构核对与发布授权

用户提供的 preflight 中，三个私有函数体经与迁移冲突保护相同的空白归一化比较，全部匹配；View 的 15 个原字段及汇总逻辑一致。用户执行迁移后提供的 postflight 中，项目表/行动表/View 的 6 个新字段类型、可空性及列位置正确，2 个排期约束存在，非法记录均为 0。前后函数 ACL/search_path/security_definer 和关系 ACL/RLS/security_invoker 一致。这是用户返回的结构检查证据，不是代理直接连接正式库执行查询。

用户随后授权推送生产端。真实登录、实际录入/修改/完成回执和多会话并发尚未线上验收；本次发布不创建或完成用户的真实事务，不以 fixture 替代这些检查。不要重复执行迁移。操作文件保留在 [使用说明](affairs-month-calendar-usage.md)。

## 独立整分支审查

审查范围 `547deb0..1dfcc3e`，独立 reviewer 未发现 Critical，发现两项 Important，保留原评级并在一次修复中处理：

- 详情内打开完成确认产生嵌套弹窗，Escape 后留下滚动锁：改为切换同一选择对象的面板模式。回归先复现双弹窗失败，再验证单弹窗、Escape、拒绝放弃脏内容、成功回执后关闭及恢复滚动。未知提交冻结与原 UUID 重试仍复用既有面板。
- 跨天行动的截止钟点在覆盖的每一天显示：按当日是否为截止日期决定显示与排序；截止所在周的最后一段条显示钟点。回归先复现提前日期错误钟点，再验证提前日期、截止日期、跨周条、详情完整钟点和无重复。

浏览器复查实际组件：详情 → 完成确认只有 1 个 dialog；Escape 后 0 个 dialog、body overflow 为空、焦点返回原行动；控制台 error/warn 为 0。

两项 Important 均先看到真实 RED，再得到 GREEN；定向回归 10/10，全套最终 539/539。未再次派发 reviewer。

### Deferred minors

- 同一当前月份内，先选择其他日期再点“今天”不会重选今天；切换其他月份后返回当前月份正常。此轮不改动，可直接点击今天日期，未影响保存或数据口径。

### Rulings I made（按发生顺序）

1. Windows helper 无法处理盘符路径，使用等价 PowerShell 过程记录。判断有误的代价：过程记录可靠性，不影响产品数据。
2. 曾采用整月固定轨道以保留跨周位置。判断有误的代价：空轨道浪费空间；已由第 4 项取代。
3. 为既有完成面板增加可选 initialMode/hideTrigger/onClose，使刷新后对象消失仍可保留冻结请求。判断有误的代价：组件可选接口增量，默认行为不变。
4. 浏览器发现固定轨道造成无效空行，恢复计划的每周首个空轨道。判断有误的代价：跨周延续条可能更换垂直轨道，颜色/标识保持稳定。
5. reviewer 未判断正式库实际 Schema、真实登录/RLS及多会话并发；维持用户执行 preflight/迁移/postflight和真实验收的上线门槛，不把 PGlite 当作线上证明。判断有误的代价：线上兼容性/权限/并发问题尚未被隔离测试发现，核对前不发布。
