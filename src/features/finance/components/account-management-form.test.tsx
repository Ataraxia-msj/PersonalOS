import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AccountManagementActionState } from "@/lib/finance/account-management-action-state";
import type { AccountEditData, ManagedAccount } from "@/lib/finance/account-management-types";

import { AccountList } from "./account-list";
import { AccountManagementForm } from "./account-management-form";

const id = "a2000000-0000-0000-0000-000000000001";
const managed: ManagedAccount = {
  accountClass: "asset", accountType: "bank", balanceSource: "snapshot",
  createdAt: "2026-01-01T00:00:00Z", currency: "CNY", estimatedBalance: 123.45,
  id, includeInNetWorth: true, institution: "建设银行", isActive: true,
  latestSnapshotAt: "2026-01-01T00:00:00Z", name: "工资卡", note: null,
  sortOrder: 0, updatedAt: "2026-01-01T00:00:00Z",
};

describe("account management UI", () => {
  it("shows active accounts by default and reveals inactive real rows client-side", async () => {
    render(<AccountList accounts={[
      managed,
      { ...managed, id: "inactive", name: "旧账户", isActive: false, estimatedBalance: null },
    ]} />);
    expect(screen.getByText("工资卡")).toBeInTheDocument();
    expect(screen.queryByText("旧账户")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "新增账户" })).toHaveAttribute("href", "/finance/accounts/new");
    expect(screen.getByRole("link", { name: "编辑工资卡" })).toHaveAttribute("href", `/finance/accounts/${id}/edit`);
    expect(screen.getByRole("link", { name: "校准工资卡余额" })).toHaveAttribute("href", `/finance/accounts/${id}/reconcile`);

    await userEvent.click(screen.getByRole("button", { name: "显示已停用账户" }));
    expect(screen.getByText("旧账户")).toBeInTheDocument();
    expect(screen.getByText("暂无余额数据")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "校准旧账户余额" })).toBeInTheDocument();
  });

  it("renders labeled create controls and filters types when class changes", async () => {
    render(<AccountManagementForm mode="create" defaultBalanceAt="2026-10-02T09:30:00" action={vi.fn()} />);
    expect(screen.getByLabelText("账户名称")).toBeInTheDocument();
    expect(screen.getByLabelText("当前余额")).toBeInTheDocument();
    expect(screen.getByLabelText("余额时间（北京时间）")).toBeInTheDocument();
    const type = screen.getByLabelText("账户类型");
    expect(within(type).getByRole("option", { name: "银行账户" })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("资产 / 负债"), "liability");
    expect(within(type).queryByRole("option", { name: "银行账户" })).not.toBeInTheDocument();
    expect(within(type).getByRole("option", { name: "贷款" })).toBeInTheDocument();
  });

  it("keeps the create UUID stable across an uncertain retry and disables duplicate submit", async () => {
    const gate = Promise.withResolvers<AccountManagementActionState>();
    const action = vi.fn()
      .mockImplementationOnce(() => gate.promise)
      .mockResolvedValueOnce({ status: "success", message: "账户和初始余额已保存。", fieldErrors: {}, accountId: id });
    render(<AccountManagementForm mode="create" defaultBalanceAt="2026-10-02T09:30:00" action={action} />);
    await userEvent.type(screen.getByLabelText("账户名称"), "微信");
    await userEvent.type(screen.getByLabelText("当前余额"), "1.23");
    const submit = screen.getByRole("button", { name: "保存账户" });
    await userEvent.click(submit);
    expect(submit).toBeDisabled();
    gate.resolve({ status: "uncertain", message: "结果未确认", fieldErrors: {} });
    await screen.findByText("结果未确认");
    const first = action.mock.calls[0][1] as FormData;
    await userEvent.click(screen.getByRole("button", { name: "重试同一次创建" }));
    await screen.findByText("账户和初始余额已保存。");
    const second = action.mock.calls[1][1] as FormData;
    expect(second.get("requestId")).toBe(first.get("requestId"));
    expect(screen.getByRole("button", { name: "保存账户" })).toBeDisabled();
  });

  it("locks structural fields on edit, omits balance inputs, and explicitly changes activation", async () => {
    const edit: AccountEditData = { ...managed, hasLines: true, hasSnapshots: true, structureLocked: true };
    const action = vi.fn().mockResolvedValue({ status: "success", message: "账户信息已更新。", fieldErrors: {}, accountId: id });
    const activationAction = vi.fn().mockResolvedValue({ status: "success", message: "账户已停用。", fieldErrors: {}, accountId: id, isActive: false });
    render(<AccountManagementForm mode="edit" initialValues={edit} action={action} activationAction={activationAction} />);
    expect(screen.getByLabelText("资产 / 负债")).toBeDisabled();
    expect(screen.getByLabelText("账户类型")).toBeDisabled();
    expect(screen.getByLabelText("币种")).toBeDisabled();
    expect(screen.queryByLabelText("当前余额")).not.toBeInTheDocument();
    expect(screen.getByText(/已有余额或交易/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "停用账户" }));
    await waitFor(() => expect(activationAction).toHaveBeenCalledOnce());
    const payload = activationAction.mock.calls[0][1] as FormData;
    expect(payload.get("accountId")).toBe(id);
    expect(payload.get("isActive")).toBe("false");
  });
});
