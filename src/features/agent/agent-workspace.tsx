"use client";

import {
  IconChartLine,
  IconChevronDown,
  IconPaperclip,
  IconReceipt,
  IconSearch,
  IconSend2,
} from "@tabler/icons-react";
import Link from "next/link";
import { type FormEvent, type KeyboardEvent, useState } from "react";

import { agentCommands, getMockAgentReply } from "./data";
import styles from "./agent-workspace.module.css";

interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  actionHref?: string;
  actionLabel?: string;
}

const commandIcons = {
  search: IconSearch,
  trend: IconChartLine,
  receipt: IconReceipt,
} as const;

export function AgentWorkspace() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const hasConversation = messages.length > 0;

  const submitMessage = (rawMessage: string) => {
    const message = rawMessage.trim();
    if (!message) return;

    const reply = getMockAgentReply(message);
    setMessages((current) => {
      const index = current.length;
      return [
        ...current,
        { id: `user-${index}`, role: "user", text: message },
        {
          id: `assistant-${index}`,
          role: "assistant",
          text: reply.text,
          actionHref: reply.actionHref,
          actionLabel: reply.actionLabel,
        },
      ];
    });
    setInput("");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitMessage(input);
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitMessage(input);
    }
  };

  return (
    <main className={hasConversation ? styles.workspaceConversation : styles.workspace}>
      {hasConversation ? (
        <section aria-live="polite" className={styles.conversation} role="log">
          <div className={styles.conversationHeader}>
            <span className={styles.statusDot} />
            <div>
              <p>当前对话</p>
              <small>Agent 使用本地 mock 数据响应</small>
            </div>
          </div>

          <div className={styles.messages}>
            {messages.map((message) => (
              <article
                className={message.role === "user" ? styles.userMessage : styles.agentMessage}
                key={message.id}
              >
                <span>{message.role === "user" ? "你" : "Agent"}</span>
                <div>
                  <p>{message.text}</p>
                  {message.actionHref && message.actionLabel ? (
                    <Link className={styles.replyAction} href={message.actionHref}>
                      {message.actionLabel}
                      <span aria-hidden="true">→</span>
                    </Link>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <section className={styles.hero}>
          <div className={styles.status}>
            <span className={styles.statusDot} />
            Agent 已就绪
          </div>
          <h1>今天想处理什么？</h1>
        </section>
      )}

      <div className={hasConversation ? styles.composerDock : styles.composerRegion}>
        <form className={styles.composer} onSubmit={handleSubmit}>
          <button aria-label="添加附件" className={styles.iconButton} type="button">
            <IconPaperclip aria-hidden="true" size={22} stroke={1.6} />
          </button>
          <textarea
            aria-label="给 Agent 发消息"
            data-agent-input
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="问我任何问题，或让我执行操作…"
            rows={1}
            value={input}
          />
          <button aria-label="选择模型" className={styles.modelButton} type="button">
            智能模型
            <IconChevronDown aria-hidden="true" size={16} stroke={1.6} />
          </button>
          <span aria-hidden="true" className={styles.composerDivider} />
          <button aria-label="发送消息" className={styles.sendButton} type="submit">
            <IconSend2 aria-hidden="true" size={23} stroke={1.7} />
          </button>
        </form>

        {hasConversation ? null : (
          <div aria-label="建议命令" className={styles.commands}>
            {agentCommands.map((command) => {
              const CommandIcon = commandIcons[command.icon];
              return (
                <button
                  className={styles.command}
                  key={command.id}
                  onClick={() => submitMessage(command.prompt)}
                  type="button"
                >
                  <CommandIcon aria-hidden="true" size={18} stroke={1.6} />
                  <kbd>{command.shortcut}</kbd>
                  <span>{command.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {hasConversation ? null : (
          <p className={styles.commandHint}>
            输入 <kbd>/</kbd> 查看全部命令
          </p>
        )}
      </div>
    </main>
  );
}
