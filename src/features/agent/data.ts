export interface AgentCommand {
  id: string;
  shortcut: string;
  label: string;
  prompt: string;
  icon: "search" | "trend" | "receipt";
}

export const agentCommands: AgentCommand[] = [
  {
    id: "record-expense",
    shortcut: "⌘ 1",
    label: "记录一笔支出",
    prompt: "今天微信午餐28元，记入变动必要开销",
    icon: "receipt",
  },
  {
    id: "record-income-transfer",
    shortcut: "⌘ 2",
    label: "记录收入和转账",
    prompt: "今天建设银行收到工资8000元，再转2000元到存钱小荷包",
    icon: "trend",
  },
  {
    id: "record-affairs",
    shortcut: "⌘ 3",
    label: "整理待办与主线",
    prompt: "明天上午10点面试。我的主线是准备国考、找工作和写大论文。",
    icon: "search",
  },
];
