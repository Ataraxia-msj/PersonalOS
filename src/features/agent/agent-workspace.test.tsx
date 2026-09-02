import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { AgentWorkspace } from "./agent-workspace";

describe("AgentWorkspace", () => {
  it("submits a message and renders the deterministic Agent response", async () => {
    const user = userEvent.setup();
    render(<AgentWorkspace />);

    await user.type(screen.getByRole("textbox", { name: "给 Agent 发消息" }), "分析消费趋势");
    await user.click(screen.getByRole("button", { name: "发送消息" }));

    expect(screen.getByText("分析消费趋势")).toBeVisible();
    expect(screen.getByText(/本月支出为 ¥9,680/)).toBeVisible();
    expect(screen.getByRole("link", { name: "打开财务分析" })).toHaveAttribute(
      "href",
      "/finance/analysis",
    );
  });

  it("runs a suggested command without duplicating mock data inside the component", async () => {
    const user = userEvent.setup();
    render(<AgentWorkspace />);

    await user.click(screen.getByRole("button", { name: /查询本月支出/ }));

    expect(screen.getByText("查询本月支出")).toBeVisible();
    expect(screen.getByText(/本月累计支出 ¥9,680/)).toBeVisible();
  });

  it("keeps the initial state when the submitted input is empty", async () => {
    const user = userEvent.setup();
    render(<AgentWorkspace />);

    await user.click(screen.getByRole("button", { name: "发送消息" }));

    expect(screen.getByRole("heading", { name: "今天想处理什么？" })).toBeVisible();
    expect(screen.queryByRole("log")).not.toBeInTheDocument();
  });
});
