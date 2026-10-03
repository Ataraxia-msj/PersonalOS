# 事务模块第一阶段：部署与使用

代码在本地 `develop`；没有自动合并、推送或修改正式库。金币是虚拟激励，与 Finance 的人民币资产、预算和交易完全分开。

## 你现在需要做什么

在 Supabase SQL Editor 中依次打开并运行完整文件，**不要运行 tests 目录的文件**：

1. `supabase/checks/affairs_phase_one_preflight.sql`：只读检查。
2. `supabase/migrations/202610030005_affairs_foundation.sql`：基础事务表、RPC、项目进度和贡献 View。
3. `supabase/migrations/202610030006_affairs_rewards.sql`：金币流水、奖励商店、兑换和惩罚。

两个 migration 各自有事务。发现同名对象会中止，不覆盖已有对象；失败时请发完整错误文字，不能删除旧表或反复局部执行。第一份成功、第二份失败时，只在错误解决后运行第二份，不重跑第一份。

无需新环境变量，不提供密码、secret key 或数据库连接串。沿用现有 publishable key、Auth session 和 owner RLS。正式库没有测试项目、默认商品或初始金币赠送。

执行后可用以下只读查询核对对象数量（应为 11 张表、4 个 View、23 个公共 RPC）：

```sql
select table_name from information_schema.tables
where table_schema='public' and table_type='BASE TABLE' and table_name like 'affairs_%'
order by table_name;
select viewname from pg_views
where schemaname='public' and viewname like 'vw_affairs_%' order by viewname;
select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname like '%\_affairs\_%' escape '\'
order by p.proname;
```

告诉我“两份 SQL 已执行”，然后继续正式联调；当前尚不算生产可用。等待你的明确发布指示后，才合并/推送。

## 第一轮真实使用

1. 顶部“事务”→创建主线，例如你自己的长期方向；项目也可以不属于主线。
2. 创建项目，写清预期成果；阶段成果由你定义，完成比例由数据库 View 返回。没有里程碑不展示虚构百分比。
3. 添加行动。普通事务可没有项目和日期；核心行动必须写明核心原因和完成条件。完整完成后确认领取 **1 金币**，普通事务 **0 金币**。
4. 推进工作台选择当前关注项目，写一条实际进展和下一步。贡献图记录真实推进次数，不代表金币。手动进展不发币。
5. 奖励商店→添加你自己的奖励名称、说明和正整数金币价格。余额足够才能兑换；确认成功后才扣币。兑换不会自动创建财务交易。
6. 兑换后标记“已使用”；未使用可取消，按兑换时的价格退币。后来商品改名、调价、下架，不改历史快照。
7. 金币记录→手动记录惩罚，每次固定 **−1**，没有自动逾期扣币。错误惩罚可写原因撤销一次，追加 **+1**，原记录保留。

## 避免重复记账

- “重新打开”任务：继续做，保留原奖励；再次完成不额外发币。
- “撤销误完成”：撤销对应贡献和奖励；允许虚拟余额变负。以后真正完成才恢复一次奖励。
- 商品价格变化：重新查看并明确确认新价，不自动用新价格兑换。
- 超时或结果不明确：保持原页面，用“重试同一次提交”。请求和内容锁定，不要新建另一笔。刷新/离开后请先核对真实记录；浏览器会对未确认请求提示离开风险。
- 金币记录按生效序号排列；实际发生时间和入账时间分别展示。翻页的历史余额由数据库全流水累计，不用当前页加总。
- 已归档/已完成项目保留历史；先恢复项目才能继续编辑和推进。领取过奖励的任务不再更改“核心/普通”资格。
- 行动列表“查看历史”可回看创建、编辑、完成、取消、恢复和误完成撤销，恢复待开始不会抹掉原取消记录。
- 负余额不限制行动、不产生利息，只阻止余额不足的兑换。

## 暂未开发

有效投入计时、每累计 30 分钟奖励 1 金币、暂停/中断的计时结算，是第二阶段；第一阶段没有假计时按钮或发币。事务 Agent 写入、自动惩罚、等级/XP、外部用量同步也未实现。
