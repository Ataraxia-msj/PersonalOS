"use client";

import {
  IconChartLine,
  IconChevronDown,
  IconPaperclip,
  IconReceipt,
  IconSearch,
  IconSend2,
} from "@tabler/icons-react";
import { type FormEvent, type KeyboardEvent, useState, useTransition } from "react";

import { interpretAgentMessageAction } from "@/app/agent-actions";
import type { AgentActionResult, PersonalOSInterpretation } from "@/lib/agent/types";

import { agentCommands } from "./data";
import styles from "./agent-workspace.module.css";
import { TransactionPreview } from "./transaction-preview";
import {AffairsPreview} from './affairs-preview';
import type {AffairsConfirmAction} from './affairs-queue';
import type {checkAgentAffairsDuplicatesAction} from '@/app/agent-affairs-actions';

interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  interpretation?: PersonalOSInterpretation;
  error?: boolean;
}

interface AgentWorkspaceProps {
  action?: (rawText: string) => Promise<AgentActionResult>;
  affairsConfirmAction?:AffairsConfirmAction;
  affairsDuplicateAction?:typeof checkAgentAffairsDuplicatesAction;
}

const commandIcons = {
  search: IconSearch,
  trend: IconChartLine,
  receipt: IconReceipt,
} as const;

export function AgentWorkspace({ action = interpretAgentMessageAction,affairsConfirmAction,affairsDuplicateAction }: AgentWorkspaceProps) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isPending, startTransition] = useTransition();
  const [protectedPreviews,setProtectedPreviews]=useState<string[]>([]);
  const inputLocked=isPending||protectedPreviews.length>0;
  function updateProtection(id:string,protectedPreview:boolean){setProtectedPreviews(current=>protectedPreview?(current.includes(id)?current:[...current,id]):current.includes(id)?current.filter(x=>x!==id):current);}
  const hasConversation = messages.length > 0;

  const submitMessage = (rawMessage: string) => {
    const message = rawMessage.trim();
    if (!message || inputLocked) return;

    const messageId = crypto.randomUUID();
    setMessages((current) => [
      ...current,
      { id: `user-${messageId}`, role: "user", text: message },
    ]);
    setInput("");

    startTransition(async () => {
      try {
        const result = await action(message);
        setMessages((current) => [
          ...current,
          {
            id: `assistant-${messageId}`,
            role: "assistant",
            text: result.message,
            interpretation: result.status === "success" ? result.interpretation : undefined,
            error: result.status === "error",
          },
        ]);
      } catch {
        setMessages((current) => [
          ...current,
          {
            id: `assistant-${messageId}`,
            role: "assistant",
            text: "Agent 服务暂时不可用，请稍后重试。",
            error: true,
          },
        ]);
      }
    });
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
              <small>Qwen 3.7 Flash · 写入前需要确认</small>
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
                  {message.error ? <p role="alert">{message.text}</p> : <p>{message.text}</p>}
                  {message.interpretation ? (
                    <div className={styles.interpretation}>
                      {message.interpretation.domain==='affairs'?<AffairsPreview interpretation={message.interpretation} confirmAction={affairsConfirmAction} duplicateAction={affairsDuplicateAction} externalBlocked={protectedPreviews.some(id=>id!==message.id)} onProtectionChange={value=>updateProtection(message.id,value)}/>:null}
                      <fieldset disabled={protectedPreviews.length>0} className={styles.previewFieldset}>
                      <div className={styles.previewList}>
                        {message.interpretation.domain==='finance'?message.interpretation.transactions.map((draft, index) => (
                          <TransactionPreview draft={draft} index={index} key={draft.draftId} />
                        )):null}
                      </div>
                      </fieldset>
                      {message.interpretation.unresolvedSegments.length > 0 ? (
                        <p className={styles.unresolved}>
                          未能安全识别：{message.interpretation.unresolvedSegments.join("；")}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
            {isPending ? (
              <article className={styles.agentMessage}>
                <span>Agent</span>
                <div className={styles.pendingReply}>正在整理内容…</div>
              </article>
            ) : null}
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
          <button aria-label="附件暂未开放" className={styles.iconButton} disabled type="button">
            <IconPaperclip aria-hidden="true" size={22} stroke={1.6} />
          </button>
          <textarea
            aria-label="给 Agent 发消息"
            data-agent-input
            disabled={inputLocked}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="记录支出、收入、转账，或告诉我待办和主线…"
            rows={1}
            value={input}
          />
          <button aria-label="当前模型" className={styles.modelButton} disabled type="button">
            Qwen 3.7 Flash
            <IconChevronDown aria-hidden="true" size={16} stroke={1.6} />
          </button>
          <span aria-hidden="true" className={styles.composerDivider} />
          <button
            aria-label={isPending ? "正在识别" : "发送消息"}
            className={styles.sendButton}
            disabled={inputLocked}
            type="submit"
          >
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
            一段话可记录多笔交易或多件事务，预览确认后才保存
          </p>
        )}
      </div>
    </main>
  );
}
