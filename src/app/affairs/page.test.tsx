import { render, screen } from "@testing-library/react";
import { it, expect, vi } from "vitest";
vi.mock("@/lib/affairs/service", () => ({
  getAffairsDashboardData: vi.fn(async () => ({
    mainlines: [],
    projects: [],
    tasks: [],
    progress: [],
    contributions: [],
    balance: 0,
    today: "2026-10-03",
    serverNowISO: "2026-10-03T00:00Z",
  })),
}));
vi.mock("./actions", () => ({ submitAffairsAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import Page from "./page";
import {getAffairsDashboardData} from '@/lib/affairs/service';
it('passes validated calendar location from URL after one dashboard read',async()=>{
 vi.mocked(getAffairsDashboardData).mockClear();
 render(await Page({searchParams:Promise.resolve({view:'calendar',month:'2027-02'})}));
 expect(screen.getByText('2027年2月')).toBeVisible();
 expect(screen.queryByText('主线与项目')).toBeNull();
 expect(getAffairsDashboardData).toHaveBeenCalledTimes(1);
});
it("page delegates to service, never embeds query or fake examples", async () => {
  render(await Page({}));
  expect(screen.getByRole("region", { name: "事务数据总览" })).toBeVisible();
  expect(screen.queryByRole('heading',{name:'事务'})).toBeNull();
});
