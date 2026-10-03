import { render, screen } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import { ProgressDashboard } from "./progress-dashboard";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
it("zero state has real creation entries and zero coins, no example content", () => {
  render(
    <ProgressDashboard
      data={{
        mainlines: [],
        projects: [],
        tasks: [],
        progress: [],
        contributions: [],
        balance: 0,
        today: "2026-10-03",
        serverNowISO: "2026-10-03T00:00Z",
      }}
      action={vi.fn()}
    />,
  );
  expect(screen.getByRole("link", { name: "新建主线" })).toHaveAttribute(
    "href",
    "/affairs/mainlines/new",
  );
  expect(screen.getByRole("link", { name: "新建项目" })).toHaveAttribute(
    "href",
    "/affairs/projects/new",
  );
  expect(screen.getByText("0 金币")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "2026-10-03 · 0 次推进" }),
  ).toBeVisible();
  expect(screen.queryByText("番茄钟")).not.toBeInTheDocument();
});
