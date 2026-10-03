import type { ModelInterpretation, ModelTransactionDraft } from "./types";

const transactionKeys = new Set([
  "accountId",
  "amount",
  "budgetBucketId",
  "categoryId",
  "description",
  "excludeFromBudget",
  "fromAccountId",
  "memo",
  "occurredAt",
  "purpose",
  "sourceText",
  "toAccountId",
  "type",
]);
const responseKeys = new Set(["message", "transactions", "unresolvedSegments"]);
const transactionTypes = new Set(["expense", "income", "transfer"]);
const transferPurposes = new Set(["general", "saving", "investment", "debt"]);

const nullableStringSchema = { type: ["string", "null"] } as const;

export const financeInterpretationJsonSchema = {
  additionalProperties: false,
  properties: {
    message: { maxLength: 500, type: "string" },
    transactions: {
      items: {
        additionalProperties: false,
        properties: {
          accountId: nullableStringSchema,
          amount: { anyOf: [{ exclusiveMinimum: 0, type: "number" }, { type: "null" }] },
          budgetBucketId: nullableStringSchema,
          categoryId: nullableStringSchema,
          description: nullableStringSchema,
          excludeFromBudget: { type: "boolean" },
          fromAccountId: nullableStringSchema,
          memo: nullableStringSchema,
          occurredAt: nullableStringSchema,
          purpose: { anyOf: [{ enum: ["general", "saving", "investment", "debt"], type: "string" }, { type: "null" }] },
          sourceText: { maxLength: 1000, minLength: 1, type: "string" },
          toAccountId: nullableStringSchema,
          type: { enum: ["expense", "income", "transfer"], type: "string" },
        },
        required: [...transactionKeys],
        type: "object",
      },
      maxItems: 20,
      type: "array",
    },
    unresolvedSegments: {
      items: { maxLength: 1000, minLength: 1, type: "string" },
      maxItems: 20,
      type: "array",
    },
  },
  required: [...responseKeys],
  type: "object",
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: Set<string>) {
  const actual = Object.keys(value);
  return actual.length === keys.size && actual.every((key) => keys.has(key));
}

function nullableString(value: unknown, maxLength = 1000): value is string | null {
  return value === null || (typeof value === "string" && [...value].length <= maxLength);
}

function parseTransaction(value: unknown): ModelTransactionDraft | null {
  if (!isRecord(value) || !exactKeys(value, transactionKeys)) return null;
  if (typeof value.type !== "string" || !transactionTypes.has(value.type)) return null;
  if (typeof value.sourceText !== "string" || !value.sourceText.trim() || [...value.sourceText].length > 1000) return null;
  if (!nullableString(value.occurredAt, 32) || !nullableString(value.description)
    || !nullableString(value.memo) || !nullableString(value.accountId, 100)
    || !nullableString(value.categoryId, 100) || !nullableString(value.budgetBucketId, 100)
    || !nullableString(value.fromAccountId, 100) || !nullableString(value.toAccountId, 100)) return null;
  if (typeof value.excludeFromBudget !== "boolean") return null;
  if (!(value.purpose === null || (typeof value.purpose === "string" && transferPurposes.has(value.purpose)))) return null;
  if (!(value.amount === null || (typeof value.amount === "number" && Number.isFinite(value.amount)
    && value.amount > 0 && value.amount <= 999999999999.99
    && Math.round(value.amount * 100) === value.amount * 100))) return null;
  return value as unknown as ModelTransactionDraft;
}

export function parseModelInterpretation(value: unknown): ModelInterpretation {
  if (!isRecord(value) || !exactKeys(value, responseKeys)
    || typeof value.message !== "string" || [...value.message].length > 500
    || !Array.isArray(value.transactions) || value.transactions.length > 20
    || !Array.isArray(value.unresolvedSegments) || value.unresolvedSegments.length > 20) {
    throw new Error("Invalid Qwen structured response");
  }
  const transactions = value.transactions.map(parseTransaction);
  if (transactions.some((item) => item === null)
    || value.unresolvedSegments.some((item) => typeof item !== "string" || !item.trim() || [...item].length > 1000)) {
    throw new Error("Invalid Qwen structured response");
  }
  return {
    message: value.message,
    transactions: transactions as ModelTransactionDraft[],
    unresolvedSegments: value.unresolvedSegments as string[],
  };
}
