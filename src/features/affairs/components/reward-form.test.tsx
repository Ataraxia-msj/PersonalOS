import { render, screen } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import { RewardForm } from "./reward-form";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
it("uses user-specified integer prices with no seed", () => {
  render(
    <RewardForm
      data={{
        resource: "reward",
        initialValues: null,
        mainlines: [],
        projects: [],
        tasks: [],
        serverNowISO: "2026-10-03T00:00Z",
      }}
      mode="create"
      action={vi.fn()}
    />,
  );
  expect(screen.getByLabelText("金币价格")).toHaveAttribute("min", "1");
  expect(screen.getByLabelText("金币价格")).toHaveAttribute("step", "1");
  expect(screen.getByLabelText("奖励名称")).toHaveValue("");
});
