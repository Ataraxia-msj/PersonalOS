export type AgentTransactionType = "expense" | "income" | "transfer";
export type AgentTransferPurpose = "general" | "saving" | "investment" | "debt";

export interface ModelTransactionDraft {
  type: AgentTransactionType;
  sourceText: string;
  occurredAt: string | null;
  amount: number | null;
  description: string | null;
  memo: string | null;
  accountId: string | null;
  categoryId: string | null;
  budgetBucketId: string | null;
  excludeFromBudget: boolean;
  fromAccountId: string | null;
  toAccountId: string | null;
  purpose: AgentTransferPurpose | null;
}

export interface ModelInterpretation {
  message: string;
  transactions: ModelTransactionDraft[];
  unresolvedSegments: string[];
}

export interface AgentInterpretationContext {
  rawText: string;
  nowShanghai: string;
  accounts: Array<{
    id: string;
    name: string;
    accountClass: "asset" | "liability";
    currency: string;
  }>;
  expenseCategories: Array<{
    id: string;
    name: string;
    defaultBudgetBucketId: string | null;
  }>;
  incomeCategories: Array<{ id: string; name: string }>;
  budgetBuckets: Array<{
    id: string;
    name: string;
    kind: "expense" | "saving" | "investment" | "debt" | "other";
  }>;
}

export type AgentFinanceOptions = Omit<AgentInterpretationContext, "nowShanghai" | "rawText">;

export type AgentDraftStatus = "ready" | "needs_input";

export interface AgentTransactionDraft extends ModelTransactionDraft {
  draftId: string;
  requestId: string | null;
  rawText: string;
  status: AgentDraftStatus;
  issues: string[];
  accountName: string | null;
  categoryName: string | null;
  budgetBucketName: string | null;
  fromAccountName: string | null;
  toAccountName: string | null;
}

export interface AgentInterpretation {
  message: string;
  transactions: AgentTransactionDraft[];
  unresolvedSegments: string[];
}
