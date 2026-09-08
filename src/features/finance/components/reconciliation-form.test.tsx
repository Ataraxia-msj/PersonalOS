import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReconciliationForm } from "./reconciliation-form";
import { AccountList } from "./account-list";
import type { ReconciliationActionState, ReconciliationPageData } from "@/lib/finance/reconciliation-types";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const accountId = "81000000-0000-0000-0000-000000000001";
const requestId = "83000000-0000-0000-0000-000000000001";
const data: ReconciliationPageData = {
  account: { account_id: accountId, account_name: "微信", account_class: "asset", account_type: "ewallet", currency: "CNY",
    institution: null, include_in_net_worth: true, is_active: true, sort_order: 0, latest_snapshot_at: null, latest_snapshot_balance: null,
    ledger_change_after_snapshot: 424.9, estimated_balance: 424.9, balance_source: "ledger_only" },
  defaultSnapshotAt: "2025-01-02T08:00:00",
  snapshots: [{ id: "old", account_id: accountId, snapshot_at: "2025-01-01T00:00:00Z", balance: 500, note: "此前核对",
    source: "manual", created_at: "2025-01-01T00:00:00Z", updated_at: "2025-01-01T00:00:00Z" }],
};
const previewState: ReconciliationActionState = { status: "preview", errors: {}, message: null, result: null, preview: {
  requestId, input: { accountId, snapshotAt: "2025-01-02T00:00:00.000Z", balance: 423.5, note: null },
  row: { account_id: accountId, snapshot_at: "2025-01-02T00:00:00Z", estimated_balance: 424.9, latest_snapshot_id: null,
    has_later_snapshot: false, account_class: "asset", currency: "CNY" },
} };
const previewAction = vi.fn(); const saveAction = vi.fn();
function mount(pageData = data) { render(<ReconciliationForm data={pageData} previewAction={previewAction} saveAction={saveAction} />); }
async function preview() {
  fireEvent.change(screen.getByLabelText("实际余额"), { target: { value: "423.50" } });
  await userEvent.click(screen.getByRole("button", { name: "查看校准差额" }));
  await screen.findByRole("button", { name: "确认校准" });
}
describe("balance reconciliation UI", () => {
  beforeEach(() => {
    vi.resetAllMocks(); previewAction.mockResolvedValue(previewState);
    saveAction.mockResolvedValue({ status: "success", errors: {}, message: "余额快照已保存", preview: null,
      result: { snapshot_id: requestId, account_id: accountId, snapshot_at: "2025-01-02T00:00:00Z", balance: 423.5, replayed: false } });
  });
  it("links each account to its real calibration and history page", () => {
    render(<AccountList accounts={[{ id: accountId, name: "微信", institution: "", type: "cash", balance: 424.9 }]} />);
    expect(screen.getByRole("link", { name: "校准微信余额" })).toHaveAttribute("href", `/finance/accounts/${accountId}/reconcile`);
  });
  it("requires read-only preview then confirms and shows only real snapshot history", async () => {
    mount();
    expect(screen.queryByRole("button", { name: "确认校准" })).not.toBeInTheDocument();
    expect(screen.getByText("此前核对")).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /差额/ })).not.toBeInTheDocument();
    await preview(); expect(saveAction).not.toHaveBeenCalled();
    expect(screen.getByTestId("reconciliation-difference")).toHaveTextContent("-¥1.40");
    await userEvent.click(screen.getByRole("button", { name: "确认校准" }));
    await screen.findByText("余额快照已保存");
    expect(saveAction).toHaveBeenCalledTimes(1); expect(refresh).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "确认校准" })).not.toBeInTheDocument();
  });
  it("returning to edit invalidates the preview", async () => {
    mount(); await preview(); await userEvent.click(screen.getByRole("button", { name: "返回修改" }));
    expect(screen.queryByRole("button", { name: "确认校准" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看校准差额" })).toBeInTheDocument();
  });
  it("retries an uncertain save with identical request and payload", async () => {
    saveAction.mockResolvedValueOnce({ status: "uncertain", errors: {}, message: "结果未确认", preview: null, result: null });
    mount(); await preview(); await userEvent.click(screen.getByRole("button", { name: "确认校准" }));
    await screen.findByText("结果未确认");
    expect(screen.queryByRole("button", { name: "返回修改" })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "重试同一次校准" }));
    await waitFor(() => expect(saveAction).toHaveBeenCalledTimes(2));
    const first = saveAction.mock.calls[0][1] as FormData, second = saveAction.mock.calls[1][1] as FormData;
    expect(first.get("requestId")).toBe(requestId); expect([...first]).toEqual([...second]);
  });
  it("preserves unresolved save across a failed retry until successful replay", async () => {
    saveAction.mockResolvedValueOnce({ status: "uncertain", errors: {}, message: "结果未确认", preview: null, result: null });
    saveAction.mockResolvedValueOnce({ status: "error", errors: {}, message: "登录已失效", preview: null, result: null });
    mount(); await preview(); await userEvent.click(screen.getByRole("button", { name: "确认校准" }));
    await userEvent.click(await screen.findByRole("button", { name: "重试同一次校准" }));
    await screen.findByText(/登录已失效/);
    expect(screen.queryByRole("button", { name: "返回修改" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "重试同一次校准" }));
    await screen.findByText("余额快照已保存");
    expect(saveAction).toHaveBeenCalledTimes(3);
    const payloads = saveAction.mock.calls.map((call) => [...(call[1] as FormData)]);
    expect(payloads[1]).toEqual(payloads[0]); expect(payloads[2]).toEqual(payloads[0]);
  });
  it("labels liability as actual debt and permits zero", () => {
    mount({ ...data, account: { ...data.account, account_class: "liability", account_type: "credit_card", account_name: "信用卡" } });
    expect(screen.getByLabelText("实际欠款")).toHaveAttribute("min", "0");
    expect(screen.getByText(/正数填写欠款/)).toBeInTheDocument();
  });
  it("keeps disabled account history accessible without a save form", () => {
    mount({ ...data, account: { ...data.account, is_active: false } });
    expect(screen.getByText("此前核对")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "查看校准差额" })).not.toBeInTheDocument();
  });
});
