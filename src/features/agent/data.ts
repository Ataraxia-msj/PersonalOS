export interface AgentCommand {
  id: string;
  shortcut: string;
  label: string;
  prompt: string;
  icon: "search" | "trend" | "receipt";
}

export interface AgentReply {
  text: string;
  actionLabel: string;
  actionHref: string;
}

export const agentCommands: AgentCommand[] = [
  {
    id: "monthly-spending",
    shortcut: "⌘ 1",
    label: "查询本月支出",
    prompt: "查询本月支出",
    icon: "search",
  },
  {
    id: "spending-trend",
    shortcut: "⌘ 2",
    label: "分析消费趋势",
    prompt: "分析消费趋势",
    icon: "trend",
  },
  {
    id: "record-expense",
    shortcut: "⌘ 3",
    label: "记录一笔支出",
    prompt: "记录一笔支出",
    icon: "receipt",
  },
];

export function getMockAgentReply(message: string): AgentReply {
  if (message.includes("趋势") || message.includes("分析")) {
    return {
      text: "本月支出为 ¥9,680，较上月下降 6%。居住仍是最大支出项，餐饮支出最近两周趋于平稳。",
      actionLabel: "打开财务分析",
      actionHref: "/finance/analysis",
    };
  }

  if (message.includes("记录") || message.includes("新增")) {
    return {
      text: "可以。告诉我金额、类别和账户，我会先生成交易预览，确认后再记录。当前版本使用本地 mock 数据。",
      actionLabel: "查看交易记录",
      actionHref: "/finance/transactions",
    };
  }

  return {
    text: "本月累计支出 ¥9,680，其中居住 ¥3,800。与 8 月相比减少 ¥620，预算执行率为 73%。",
    actionLabel: "查看财务总览",
    actionHref: "/finance",
  };
}
