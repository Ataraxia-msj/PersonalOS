import { render, screen } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import Layout from "./layout";
vi.mock("next/navigation", () => ({ usePathname: () => "/affairs" }));
it("renders all affairs sections without database calls in layout", () => {
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
});
