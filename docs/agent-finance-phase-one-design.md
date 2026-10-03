# Agent Finance Phase One Design

## Scope

The first Agent milestone replaces the homepage mock responder with a server-side Qwen interpreter for natural-language finance entry. It supports one or many proposed `expense`, `income`, and `transfer` transactions in a single message. Read-only finance questions, attachments, edits, refunds, voiding, Tasks, Notes, Items, and OKR remain out of scope for this milestone.

## Safety boundary

Qwen never receives database credentials and never calls Supabase. The server sends only the user's text, the current Shanghai time, and the names/identifiers of active accounts, categories, and budget buckets. Qwen returns a strict JSON document. The application validates that document and resolves every identifier against the current authenticated user's real options before rendering it.

No model response writes data. Every proposed transaction is shown as a separate preview card. A card with missing or invalid fields cannot be confirmed. The user confirms each ready card individually; the server then revalidates the draft and calls the existing Finance mutation layer. This avoids presenting a non-atomic multi-RPC batch as an all-or-nothing operation.

## Model configuration

- Provider: Alibaba Cloud Model Studio
- Model: `qwen3.7-flash-2026-07-15`
- Mode: non-thinking
- Output: strict JSON Schema
- Server-only variables: `DASHSCOPE_API_KEY`, `QWEN_BASE_URL`, `QWEN_MODEL`
- No `NEXT_PUBLIC_` variable may contain the API key.

## Interpretation contract

The response contains:

- `message`: a short Chinese explanation for the user.
- `transactions`: an ordered array of transaction drafts.
- `unresolvedSegments`: source fragments that were not safely mapped.

Each draft contains a server-generated `draftId` and, for idempotent income/transfer RPCs, a server-generated `requestId`. The model emits transaction type, source fragment, Shanghai local date/time, amount, description, memo, account/category/budget identifiers, transfer purpose, and an optional missing-field list. Fields that are not applicable are explicitly `null`.

The server derives readiness. It does not trust model confidence or a model-provided readiness flag. Unknown identifiers, impossible account direction, missing required fields, future/invalid dates, invalid amounts, mismatched transfer currencies, and incompatible budget buckets all keep the card in `needs_input` state.

## User experience

The current dark homepage remains. After submission, the user's text appears immediately and the composer enters a pending state. The assistant then displays the number of recognized transactions, any unresolved text, and one preview card per transaction.

Each card shows type, amount, time, account path, category, budget treatment, and description. Ready cards expose a confirm button. Incomplete cards explain what is missing and link to the existing manual Finance form for correction in this milestone. Confirmation shows an in-card pending state followed by the real RPC result. A failed card does not alter sibling cards.

## Failure handling

- Missing server configuration produces a clear setup message without exposing configuration values.
- Provider timeout, non-2xx response, truncated content, invalid JSON, or schema mismatch produces a retryable Agent error and no preview.
- Authentication is checked before provider calls and again before mutations.
- The raw user message is stored as `rawText` for expense/income mutations where supported.
- The UI never creates optimistic finance data. Finance screens are revalidated only after a confirmed RPC result.

## Acceptance examples

`今天微信早餐12，地铁3块` produces two expense previews and does not merge the amounts.

`昨天建行收工资8000，然后转2000到存钱小荷包` produces one income preview and one transfer preview in source order.

`论文投稿618，不计预算` produces an expense preview with `excludeFromBudget = true` and no budget bucket.

Ambiguous text such as `晚饭几十块` remains unconfirmable and explicitly reports the missing exact amount/account/category instead of guessing.
