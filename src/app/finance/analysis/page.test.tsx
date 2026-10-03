import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAnalysisPageData } from "@/lib/finance/service";
import AnalysisPage from "./page";

vi.mock("@/lib/finance/service", () => ({ getAnalysisPageData: vi.fn() }));

const empty = { availableMonths: [], budgetSections: [], categories: [], currency: null,
  insights: [], selectedMonth: null, summary: null, trend: [] };

describe("AnalysisPage", () => {
  beforeEach(() => vi.mocked(getAnalysisPageData).mockResolvedValue(empty));

  it.each([
    [undefined, undefined],
    ["2026-09", "2026-09"],
    ["2026-13", undefined],
    ["September", undefined],
  ])("normalizes month parameter %s before calling the service", async (month, expected) => {
    render(await AnalysisPage({ searchParams: Promise.resolve({ month }) }));
    expect(getAnalysisPageData).toHaveBeenCalledWith(expected);
    expect(screen.getByText("暂无可分析的月度财务数据")).toBeVisible();
  });
});
