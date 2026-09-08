import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TransferTransactionForm } from "./transfer-transaction-form";
import { TransactionList } from "./transaction-list";
import type { TransferActionState, TransferFormData } from "@/lib/finance/transfer-types";
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const ids = [1, 2, 3, 4].map((n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`);
const data: TransferFormData = {
  accounts: [
    { id: ids[0], name: "日常银行", institution: null, accountClass: "asset", currency: "CNY", balance: 1000 },
    { id: ids[1], name: "我的储蓄", institution: null, accountClass: "asset", currency: "CNY", balance: 200 },
    { id: ids[2], name: "贷款本金", institution: null, accountClass: "liability", currency: "CNY", balance: 500 },
    { id: ids[3], name: "美元账户", institution: null, accountClass: "asset", currency: "USD", balance: 100 },
  ],
  budgetBuckets: [{ id: "saving-real", kind: "saving", name: "我的储蓄预算" }, { id: "debt-real", kind: "debt", name: "本金预算" }],
};
const success: TransferActionState = { status: "success", message: "转账已记录", errors: {}, result: {
  entry_id: ids[0], from_line_id: ids[1], to_line_id: ids[2], budget_impact_created: false,
  budget_period_id: null, budget_bucket_id: null, warning_code: null, replayed: false,
} };
beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); });
function setup(action = vi.fn().mockResolvedValue(success), formData = data) {
  render(<TransferTransactionForm action={action} data={formData} defaultOccurredAt="2026-09-07T08:00:00" />);
  return action;
}
async function fill() {
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText("转出账户"), ids[0]);
  await user.selectOptions(screen.getByLabelText("转入账户"), ids[1]);
  await user.type(screen.getByLabelText("金额"), "10.25");
  await user.type(screen.getByLabelText("描述"), "资金调拨");
  return user;
}
describe("transfer form", () => {
  it("a late response from an old unmounted request cannot discard a newer pending request", async () => {
    let finishOld!: (state: TransferActionState) => void;
    let finishNew!: (state: TransferActionState) => void;
    const oldAction = vi.fn().mockReturnValue(new Promise<TransferActionState>((resolve) => { finishOld = resolve; }));
    const first = render(<TransferTransactionForm action={oldAction} data={data} defaultOccurredAt="2026-09-07T08:00:00" />);
    const user = await fill();
    await user.click(screen.getByRole("button", { name: "记录转账" }));
    first.unmount();
    const replay = render(<TransferTransactionForm action={vi.fn().mockResolvedValue(success)} data={data} defaultOccurredAt="2026-09-07T08:00:00" />);
    await user.click(screen.getByRole("button", { name: "重试同一次转账" }));
    await screen.findByText("转账已记录");
    replay.unmount();
    const newAction = vi.fn().mockReturnValue(new Promise<TransferActionState>((resolve) => { finishNew = resolve; }));
    const newer = render(<TransferTransactionForm action={newAction} data={data} defaultOccurredAt="2026-09-07T08:00:00" />);
    await fill();
    await user.click(screen.getByRole("button", { name: "记录转账" }));
    const newPayload = Array.from((newAction.mock.calls[0][0] as FormData).entries());
    await act(async () => finishOld(success));
    newer.unmount();
    const recover = vi.fn().mockResolvedValue(success);
    setup(recover);
    await user.click(screen.getByRole("button", { name: "重试同一次转账" }));
    await screen.findByText("转账已记录");
    expect(Array.from((recover.mock.calls[0][0] as FormData).entries())).toEqual(newPayload);
    await act(async () => finishNew(success));
  });
  it("restores the immutable unresolved request after navigating away and remounting", async () => {
    const action = vi.fn().mockRejectedValueOnce(new Error("lost response")).mockResolvedValueOnce(success);
    const first = render(<TransferTransactionForm action={action} data={data} defaultOccurredAt="2026-09-07T08:00:00" />);
    const user = await fill();
    await user.click(screen.getByRole("button", { name: "记录转账" }));
    await screen.findByRole("button", { name: "重试同一次转账" });
    const original = Array.from((action.mock.calls[0][0] as FormData).entries());
    first.unmount();
    setup(action);
    expect(screen.getByLabelText("金额")).toHaveValue(10.25);
    expect(screen.getByLabelText("金额")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "重试同一次转账" }));
    await screen.findByText("转账已记录");
    expect(Array.from((action.mock.calls[1][0] as FormData).entries())).toEqual(original);
  });
  it("does not send a write if the browser cannot preserve its retry identity", async () => {
    const action = setup(); const user = await fill();
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("disabled"); });
    try {
      await user.click(screen.getByRole("button", { name: "记录转账" }));
      expect(await screen.findByText(/无法保留重试信息/)).toBeInTheDocument();
      expect(action).not.toHaveBeenCalled();
    } finally { spy.mockRestore(); }
  });
  it("filters real accounts by purpose/currency and real buckets by kind", async () => {
    setup(); const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("转出账户"), ids[0]);
    const destination = screen.getByLabelText("转入账户");
    expect(destination).not.toHaveTextContent("美元账户");
    expect(destination).not.toHaveTextContent("贷款本金");
    expect(destination).not.toHaveTextContent("日常银行");
    expect(screen.queryByLabelText("预算分类")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("用途"), "debt");
    expect(destination).toHaveTextContent("贷款本金");
    expect(destination).not.toHaveTextContent("我的储蓄");
    expect(screen.getByLabelText("预算分类")).toHaveValue("debt-real");
    expect(screen.getByText(/利息、手续费/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("用途"), "saving");
    expect(screen.getByLabelText("预算分类")).toHaveValue("saving-real");
    expect(screen.getByText(/转回不冲减/)).toBeInTheDocument();
  });
  it("submits one fixed UUID and refreshes only on confirmed success", async () => {
    const action = setup(); const user = await fill();
    await user.click(screen.getByRole("button", { name: "记录转账" }));
    await screen.findByText("转账已记录");
    const sent = action.mock.calls[0][0] as FormData;
    expect(sent.get("requestId")).toMatch(/^[0-9a-f-]{36}$/);
    expect(sent.get("budgetBucketId")).toBeNull();
    expect(action).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "记录转账" })).not.toBeInTheDocument();
  });
  it("retains original payload after unknown result and even a failed authenticated retry", async () => {
    const action = vi.fn().mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ status: "error", message: "登录已失效", errors: {}, result: null })
      .mockResolvedValueOnce(success);
    setup(action); const user = await fill();
    await user.click(screen.getByRole("button", { name: "记录转账" }));
    await screen.findByRole("button", { name: "重试同一次转账" });
    expect(screen.getByLabelText("金额")).toBeDisabled();
    expect(refresh).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "重试同一次转账" }));
    await screen.findByText(/登录已失效/);
    expect(screen.getByLabelText("金额")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "重试同一次转账" }));
    await screen.findByText("转账已记录");
    const original = Array.from((action.mock.calls[0][0] as FormData).entries());
    for (const [payload] of action.mock.calls) expect(Array.from((payload as FormData).entries())).toEqual(original);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  it("blocks duplicate submits while the first request is pending", async () => {
    let finish!: (state: TransferActionState) => void;
    const action = setup(vi.fn().mockReturnValue(new Promise((resolve) => { finish = resolve; })));
    await fill();
    const form = screen.getByRole("form", { name: "转账表单" });
    fireEvent.submit(form); fireEvent.submit(form);
    expect(action).toHaveBeenCalledTimes(1);
    finish(success); await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
  it("shows genuine empty accounts without mock fallback", () => {
    setup(undefined, { accounts: [], budgetBuckets: [] });
    expect(screen.getByText(/没有可用的转出资产账户/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "记录转账" })).toBeDisabled();
  });
});
it("finds one complete transfer under either account and renders a neutral amount", async () => {
  render(<TransactionList transactions={[{ id: "entry", date: "2026-09-08", merchant: "测试调拨", category: "普通转账", accountId: ids[0],
    accountName: "日常银行 → 我的储蓄", accounts: [{ id: ids[0], name: "日常银行" }, { id: ids[1], name: "我的储蓄" }],
    amount: 10.25, transfer: { purpose: "general", legacy: false, currency: "CNY" }, icon: "bank", editable: false, excludedFromBudget: true, budgetLabel: "不计入预算" }]} />);
  const user = userEvent.setup();
  for (const id of [ids[0], ids[1]]) {
    await user.selectOptions(screen.getByLabelText("交易账户"), id);
    expect(screen.getByText("日常银行 → 我的储蓄")).toBeInTheDocument();
    expect(screen.getByText("¥10.25")).toBeInTheDocument();
    expect(screen.queryByText("+¥10.25")).not.toBeInTheDocument();
  }
});

it("exposes truthful legacy line amounts and memos without guessing an aggregate", async () => {
  render(<TransactionList transactions={[{ id: "legacy", date: "2026-09-08", merchant: "旧转账", category: "转账 · 历史格式", accountId: ids[0], accountName: "旧账户",
    amount: null, transfer: { purpose: null, legacy: true, lines: [{ id: "raw-line", accountName: "旧账户", amount: -19.28, currency: "USD", memo: "历史备注" }] },
    icon: "bank", editable: false, excludedFromBudget: false, budgetLabel: "—" }]} />);
  await userEvent.click(screen.getByText("原始明细"));
  expect(screen.getByText(/旧账户 · -19.28 USD · 历史备注/)).toBeVisible();
  expect(screen.queryByRole("link", { name: "修改旧转账" })).not.toBeInTheDocument();
});
