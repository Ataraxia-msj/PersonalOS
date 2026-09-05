import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import FinanceLayout from "./layout";

vi.mock("next/navigation", () => ({
  usePathname: () => "/finance",
}));

describe("FinanceLayout", () => {
  it("renders the finance navigation without a global month selector", async () => {
    render(await FinanceLayout({ children: <div>内容</div> }));

    expect(screen.getByRole("heading", { name: "财务总览" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "选择月份" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /新增交易/ })).toHaveAttribute(
      "href",
      "/finance/transactions/new",
    );
  });
});
