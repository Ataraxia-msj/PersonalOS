# 月度预算验收清单

日期：2026-09-08。用户已执行正式迁移并确认功能可用。以下是回归验收方案，不表示每项真实数据库测试已经执行。

正式迁移：[migration](../supabase/migrations/202609080001_budget_attribution_and_monthly_save.sql)。当前数据库不要重复执行。
数据库冒烟脚本：[SQL tests](../supabase/tests/budget_attribution_and_monthly_save.sql)。只在隔离测试库执行，脚本最终回滚；未在当前正式库执行自动测试、故障注入或并发演练。

## 迁移与权限

- 只从明确且唯一的已有 impact 回填分类；line_id 为空仅匹配唯一且 sort_order=0 的 line。
- 不猜测无归属或歧义记录，不回填明确排除记录，不改变既有 impact。
- 迁移前后账户余额、净资产、交易金额/日期和月度总支出不变，updated_at 可因触发器变化。
- 外键拒绝非法 bucket；三个 RPC 均为 invoker，PUBLIC/anon 不可执行，authenticated 使用原 RLS。
- 现有 authenticated 全表访问策略未改动；不宣称多用户数据隔离。

## 新增与编辑支出

- 无 period 时仍保存显式或当时默认 bucket，返回 no_budget_period，不生成 impact。
- 默认值后来改变不影响历史保存分类；无默认且无选择时标记归属待补充。
- 明确排除仍计入总支出与余额，不写预算 impact。
- 有 period 时正常写 impact；非法或停用的显式 bucket 整笔回滚。
- 修改金额/描述且 category 未变、bucket 参数为空时保留已存归属；显式选择覆盖归属。
- “自动”由前端提交当前默认 UUID；category 改变且参数为空时使用新分类默认。
- 日期移到未建预算月份时移除开放 impact，保留已存分类，等待以后归集。
- 排除切换、closed impact 的冻结保护符合原规则；不扩展多 line、非普通手工 expense 的编辑范围。
- 账户与预算币种不同时保留交易事实，返回 budget_currency_mismatch，不隐式换汇计入预算。

## 月度预算保存

- 保存直接 active，无草稿、启用、预览或勾选旧消费步骤。
- 六类来自真实数据，active 分类完整提交，0 金额有效，停用旧 allocation 只能原值保留。
- 同月或重叠月份拒绝；编辑验证版本，月份不可改变，closed/旧 draft 只读。
- 上海月份内适用的 confirmed/manual/单 line expense 按保存分类自动归集，不读当前默认值猜历史。
- 已有任何 impact 的 entry 不重复归集；无新增适用交易时再次保存 backfilled_count=0。
- 排除、跨月、复杂 line、关联 entry、币种或符号异常不错误归集；待处理记录明确返回。
- 自动 impact 使用正金额、source=auto，关联 entry/line/period/bucket 正确。
- 调整额度不改既有 impact 或交易事实；真实超支允许显示。
- 在隔离库注入 allocation/impact 写入错误，确认预算操作全部回滚，没有半份配置。

## 并发（需两个隔离数据库连接）

- 新交易与预算保存任一先完成，最终适用 entry 恰好有一条 impact。
- 编辑与预算保存不按旧金额/日期归集；三个 RPC 使用相同的先 advisory lock 后行锁顺序。
- 同月并发创建只能一个成功，旧版本并发编辑只能一个成功。
- 锁超时或直接表写入竞争失败时完整回滚；直接表写入不受应用 RPC 协议全面保障。
- 核对三个新函数全部部署；监测锁等待，5 秒 lock_timeout 不等于整个函数总耗时上限。

## 前端与发布

- 无月度预算仍可选启用分类，换日期保留选择，编辑回显 saved_budget_bucket_id。
- 列表区分实际计入、已选但未计入、明确排除、归属待补充。
- 本月/下月均 active 时概览仍显示上海本月；历史预算不受趋势 7 行上限影响。
- 保存结果只显示数据库返回的归集/待处理数量，不使用 mock fallback 或假乐观数据。
- npm test、typecheck、lint、build 通过后推送 develop，验证预览再发布 main。
- 预览不自动隔离正式库，不自动写测试交易；验证登录、创建/调整入口与桌面/移动端布局。
- 发布后刷新旧页面；当前已应用的迁移不重复执行。
