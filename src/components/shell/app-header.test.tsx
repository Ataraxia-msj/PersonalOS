import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppHeader } from "./app-header";

const pathnameState = vi.hoisted(() => ({ value: "/finance" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameState.value,
}));

describe("AppHeader", () => {
  beforeEach(() => {
    pathnameState.value = "/finance";
  });

  it("links the three top-level destinations and identifies the active one", () => {
    render(<AppHeader />);

    expect(screen.getByRole("link", { name: "首页" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "财务" })).toHaveAttribute("href", "/finance");
    expect(screen.getByRole("link", { name: "设置" })).toHaveAttribute("href", "/settings");
    expect(screen.getByRole("link", { name: "财务" })).toHaveAttribute("aria-current", "page");
  });

  it("opens and closes the keyboard command menu", async () => {
    const user = userEvent.setup();
    render(<AppHeader />);

    await user.click(screen.getByRole("button", { name: "打开命令菜单" }));
    expect(screen.getByRole("dialog", { name: "快速导航" })).toBeVisible();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "快速导航" })).not.toBeInTheDocument();
  });
});
