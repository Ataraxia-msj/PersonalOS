import { render, screen } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import Layout from "./layout";
import {AffairsTabs} from '@/features/affairs/components/affairs-tabs';
vi.mock('@/features/affairs/components/affairs-navigation',()=>({AffairsNavigation:()=> <AffairsTabs pendingCount={null}/>}));
vi.mock('@/app/affairs/actions',()=>({submitAffairsAction:vi.fn(),loadAffairsQuickAddAction:vi.fn()}));
vi.mock("next/navigation", () => ({ usePathname: () => "/affairs",useRouter:()=>({refresh:vi.fn()}) }));
it("keeps old pages and the capture entry usable when inbox count is unavailable", () => {
  render(
    <Layout>
      <p>Content</p>
    </Layout>,
  );
  expect(screen.getByRole("link", { name: "奖励商店" })).toHaveAttribute(
    "href",
    "/affairs/shop",
  );
  expect(screen.getByText("Content")).toBeVisible();
  expect(screen.getByRole('link',{name:/收集箱/})).toHaveTextContent('—');
  expect(screen.getByRole('button',{name:'新增'})).toBeVisible();
});
