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

  it("labels account class, net-worth inclusion, and non-CNY balances truthfully", () => {
    render(<AccountList accounts={[{
      ...managed, accountClass: "liability", accountType: "loan", currency: "USD",
      estimatedBalance: 100, includeInNetWorth: false, name: "美元贷款",
    }]} />);
    expect(screen.getByText(/建设银行 · 负债 · 贷款 · USD · 不计入净资产/)).toBeInTheDocument();
    expect(screen.getByText("$100.00")).toBeInTheDocument();
    expect(screen.queryByText("¥100.00")).not.toBeInTheDocument();
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
    await userEvent.click(await screen.findByRole("button", { name: "重试同一次创建" }));
    await screen.findByText("账户和初始余额已保存。");
    const second = action.mock.calls[1][1] as FormData;
    expect(second.get("requestId")).toBe(first.get("requestId"));
    expect(screen.getByRole("button", { name: "保存账户" })).toBeDisabled();
  });

  it("catches a rejected create transport and replays the frozen first payload", async () => {
    const action = vi.fn()
      .mockRejectedValueOnce(new Error("network lost"))
      .mockResolvedValueOnce({ status: "success", message: "账户和初始余额已保存。", fieldErrors: {}, accountId: id });
    render(<AccountManagementForm mode="create" defaultBalanceAt="2026-10-02T09:30:00" action={action} />);
    const name = screen.getByLabelText("账户名称");
    await userEvent.type(name, "首次名称");
    await userEvent.type(screen.getByLabelText("当前余额"), "1.23");
    await userEvent.click(screen.getByRole("button", { name: "保存账户" }));
    await screen.findByText(/未能确认/);
    const first = action.mock.calls[0][1] as FormData;
    await userEvent.clear(name);
    await userEvent.type(name, "后来修改");
    await userEvent.click(screen.getByRole("button", { name: "重试同一次创建" }));
    await screen.findByText("账户和初始余额已保存。");
    const second = action.mock.calls[1][1] as FormData;
    expect([...second]).toEqual([...first]);
  });

  it("locks structural fields on edit, omits balance inputs, and explicitly changes activation", async () => {
    const edit: AccountEditData = { ...managed, hasLines: true, hasSnapshots: true, structureLocked: true };
    const action = vi.fn().mockResolvedValue({ status: "success", message: "账户信息已更新。", fieldErrors: {}, accountId: id, updatedAt: "v2" });
    const activationAction = vi.fn().mockResolvedValue({ status: "success", message: "账户已停用。", fieldErrors: {}, accountId: id, isActive: false, updatedAt: "v3" });
    render(<AccountManagementForm mode="edit" initialValues={edit} action={action} activationAction={activationAction} />);
    expect(screen.getByLabelText("资产 / 负债")).toBeDisabled();
    expect(screen.getByLabelText("账户类型")).toBeDisabled();
    expect(screen.getByLabelText("币种")).toBeDisabled();
    expect(screen.queryByLabelText("当前余额")).not.toBeInTheDocument();
    expect(screen.getByText(/已有余额或交易/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "保存修改" }));
    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    await userEvent.click(screen.getByRole("button", { name: "停用账户" }));
    await waitFor(() => expect(activationAction).toHaveBeenCalledOnce());
    const payload = activationAction.mock.calls[0][1] as FormData;
    expect(payload.get("accountId")).toBe(id);
    expect(payload.get("expectedUpdatedAt")).toBe("v2");
    expect(payload.get("isActive")).toBe("false");
  });

  it("uses the newest version across alternating activation and metadata edits", async () => {
    const edit: AccountEditData = { ...managed, hasLines: false, hasSnapshots: false, structureLocked: false };
    const action = vi.fn().mockResolvedValue({
      status: "success", message: "账户信息已更新。", fieldErrors: {}, accountId: id, updatedAt: "v3",
    });
    const activationAction = vi.fn()
      .mockResolvedValueOnce({
        status: "success", message: "账户已停用。", fieldErrors: {}, accountId: id, isActive: false, updatedAt: "v2",
      })
      .mockResolvedValueOnce({
        status: "success", message: "账户已启用。", fieldErrors: {}, accountId: id, isActive: true, updatedAt: "v4",
      });
    render(<AccountManagementForm mode="edit" initialValues={edit} action={action} activationAction={activationAction} />);

    await userEvent.click(screen.getByRole("button", { name: "停用账户" }));
    await waitFor(() => expect(activationAction).toHaveBeenCalledTimes(1));
    expect((activationAction.mock.calls[0][1] as FormData).get("expectedUpdatedAt")).toBe(managed.updatedAt);

    await userEvent.click(screen.getByRole("button", { name: "保存修改" }));
    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect((action.mock.calls[0][1] as FormData).get("expectedUpdatedAt")).toBe("v2");

    await userEvent.click(screen.getByRole("button", { name: "重新启用账户" }));
    await waitFor(() => expect(activationAction).toHaveBeenCalledTimes(2));
    expect((activationAction.mock.calls[1][1] as FormData).get("expectedUpdatedAt")).toBe("v3");
  });
});
