import type { ModelInterpretation, ModelTransactionDraft } from "./types";
import {moneyToCents} from '@/lib/finance/budget-validation';
import {reconciliationUuid} from '@/lib/finance/reconciliation-validation';
import {financeFields,type ModelFinanceTurn} from './conversation/types';
import {exact,parseFieldChanges,invalidConversation} from './conversation/validation';

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
    && moneyToCents(String(value.amount)) !== null))) return null;
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

const changeSchema={type:'object',additionalProperties:false,properties:{field:{type:'string',enum:financeFields},value:{type:['string','number','boolean','null']},origin:{type:'string',enum:['explicit','suggested','default']}},required:['field','value','origin']} as const;
const changesSchema={type:'array',maxItems:12,items:changeSchema} as const;
export const financeConversationJsonSchema={type:'object',additionalProperties:false,properties:{
 kind:{type:'string',enum:['patch','append','clarify','route']},
 updates:{type:'array',maxItems:20,items:{type:'object',additionalProperties:false,properties:{draftId:{type:'string'},changes:changesSchema},required:['draftId','changes']}},
 additions:financeInterpretationJsonSchema.properties.transactions,
 ambiguity:{anyOf:[{type:'null'},{type:'object',additionalProperties:false,properties:{kind:{type:'string',enum:['field','target','direction']},field:{anyOf:[{type:'null'},{type:'string',enum:financeFields}]},targetIds:{type:'array',maxItems:20,items:{type:'string'}},proposedChanges:changesSchema},required:['kind','field','targetIds','proposedChanges']}]},
 routeDomain:{anyOf:[{type:'null'},{type:'string',enum:['affairs','mixed','unsupported']}]},unresolvedSegments:financeInterpretationJsonSchema.properties.unresolvedSegments,
},required:['kind','updates','additions','ambiguity','routeDomain','unresolvedSegments']} as const;

export function parseModelFinanceTurn(value:unknown):ModelFinanceTurn {
 exact(value,['kind','updates','additions','ambiguity','routeDomain','unresolvedSegments']);
 if(!['patch','append','clarify','route'].includes(String(value.kind))||!Array.isArray(value.updates)||value.updates.length>20||![null,'affairs','mixed','unsupported'].includes(value.routeDomain as string|null))invalidConversation();
 const targets=new Set<string>();
 for(const update of value.updates){exact(update,['draftId','changes']);if(typeof update.draftId!=='string'||!reconciliationUuid.test(update.draftId)||targets.has(update.draftId))invalidConversation();targets.add(update.draftId);parseFieldChanges(update.changes);}
 const parsed=parseModelInterpretation({message:'',transactions:value.additions,unresolvedSegments:value.unresolvedSegments});
 for(const draft of parsed.transactions)parseFieldChanges(financeFields.map(field=>({field,value:draft[field],origin:'explicit'})));
 if(value.ambiguity!==null){exact(value.ambiguity,['kind','field','targetIds','proposedChanges']);const a=value.ambiguity;
  if(!['field','target','direction'].includes(String(a.kind))||(a.field!==null&&!financeFields.includes(a.field as typeof financeFields[number]))||!Array.isArray(a.targetIds)||a.targetIds.length>20||a.targetIds.some(x=>typeof x!=='string'||!reconciliationUuid.test(x)))invalidConversation();parseFieldChanges(a.proposedChanges);
 }
 if((value.kind==='append'&&value.updates.length)||(value.kind==='clarify'||value.kind==='route')&&(value.updates.length||parsed.transactions.length))invalidConversation();
 if((value.kind==='route')!==(value.routeDomain!==null)||value.kind==='route'&&value.ambiguity!==null)invalidConversation();
 return value as unknown as ModelFinanceTurn;
}
