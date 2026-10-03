import { it, expect } from "vitest";
import { buildContributionGrid, contributionIntensity } from "./contributions";
import { formatProgressRate } from "./format";
it("builds 26 Monday-first weeks ending in current week with no future contribution", () => {
  const grid = buildContributionGrid(
    [
      { user_id: "u", business_date: "2026-10-03", contribution_count: 2 },
      { user_id: "u", business_date: "2026-10-04", contribution_count: 100 },
    ],
    "2026-10-03",
  );
  expect(grid).toHaveLength(26);
  expect(grid.every((w) => w.days.length === 7)).toBe(true);
  expect(grid.at(-1)?.startDate).toBe("2026-09-28");
  expect(grid.at(-1)?.days[5]).toMatchObject({
    weekday: 5,
    isToday: true,
    count: 2,
  });
  expect(grid.at(-1)?.days[6]).toMatchObject({ isFuture: true, count: 0 });
});
it("crosses year boundaries and treats counts independently from coins", () => {
  expect(buildContributionGrid([], "2026-01-01").at(-1)?.startDate).toBe(
    "2025-12-29",
  );
  expect([0, 1, 2, 3, 4, 6, 7, 100].map(contributionIntensity)).toEqual([
    0, 1, 2, 2, 3, 3, 4, 4,
  ]);
  expect(formatProgressRate(0.4)).toBe("40%");
  expect(formatProgressRate(null)).toBe("尚未设置阶段成果");
});
