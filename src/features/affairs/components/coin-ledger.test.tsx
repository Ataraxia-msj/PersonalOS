import { render, screen } from "@testing-library/react";
import { it, expect, vi } from "vitest";
import { CoinLedger } from "./coin-ledger";
import type { AffairsCoinEntry } from "../types";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
it("renders database historical balance rather than summing the current page", () => {
  const entry = {
    id: "e",
    walletSequence: "50",
    kind: "penalty",
    amount: -1,
    balanceAfter: 12,
    descriptionSnapshot: "Old actual event",
    occurredAt: "2026-09-01T00:00Z",
    postedAt: "2026-10-03T00:00Z",
    taskId: null,
    redemptionId: null,
    penaltyId: "p",
    reversesEventId: null,
  } as AffairsCoinEntry;
  render(
    <CoinLedger
      data={{
        balance: 20,
        ledger: [entry],
        penalties: [],
        tasks: [],
        nextBeforeSequence: "50",
        serverNowISO: "2026-10-03T00:00Z",
      }}
      action={vi.fn()}
    />,
  );
  expect(screen.getByText("12")).toBeVisible();
  expect(screen.getByText("20 金币")).toBeVisible();
  expect(screen.getByRole("link", { name: "更早记录" })).toHaveAttribute(
    "href",
    "/affairs/coins?before=50",
  );
  expect(screen.getByText(/2026\/09\/01/)).toBeVisible();
  expect(screen.getByText(/2026\/10\/03/)).toBeVisible();
});
