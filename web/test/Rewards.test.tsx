import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Household, RewardsCatalogResult } from "../src/api/client";
import { Rewards } from "../src/components/Rewards";

const household: Household = { sin: "1234567890", masked_address: "••• City A", meter_type: "traditional" };

const mockCatalog: RewardsCatalogResult = {
  sin: household.sin,
  balance: 600,
  tag: "sample rewards",
  disclaimer: "Partner-funded sample rewards. Not a deduction or discount on your Meralco bill.",
  catalog: [
    {
      id: "reward-load-50",
      name: "₱50 Mobile Load",
      category: "load",
      partnerName: "Partner Telco",
      pointsCost: 500,
      description: "₱50 prepaid load for any network.",
      tag: "sample rewards",
      isSampleReward: true,
      affordable: true,
      progressPercent: 100,
      pointsNeeded: 0,
    },
    {
      id: "reward-ewallet-100",
      name: "₱100 E-Wallet Credit",
      category: "e-wallet",
      partnerName: "Partner E-Wallet",
      pointsCost: 1000,
      description: "₱100 credit in a partner e-wallet.",
      tag: "sample rewards",
      isSampleReward: true,
      affordable: false,
      progressPercent: 60,
      pointsNeeded: 400,
    },
  ],
  redemptions: [],
};

const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
const expired = vi.fn();
const pointsChanged = vi.fn();

const mount = () =>
  render(
    <Rewards
      token="test-token"
      household={household}
      onExpired={expired}
      onPointsChanged={pointsChanged}
    />,
  );

beforeEach(() => {
  fetchMock.mockReset();
  expired.mockReset();
  pointsChanged.mockReset();
  fetchMock.mockResolvedValue(response(mockCatalog));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Rewards component", () => {
  it("renders catalog with points balance and items labelled 'sample rewards'", async () => {
    mount();

    // Check header and balance
    await screen.findByRole("heading", { name: "Rewards" });
    expect(screen.getByTestId("rewards-balance").textContent).toContain("600 Points");

    // Acceptance criterion: Items labelled "sample rewards"
    const sampleBadges = screen.getAllByText("sample rewards");
    expect(sampleBadges.length).toBeGreaterThanOrEqual(2);

    // Disclaimer
    expect(screen.getByText(/Not a Meralco bill discount/)).toBeTruthy();

    // Check items
    expect(screen.getByText("₱50 Mobile Load")).toBeTruthy();
    expect(within(screen.getByTestId("reward-card-reward-ewallet-100")).getByText("₱100 E-Wallet Credit")).toBeTruthy();
    // The closest locked reward is shown as the next goal
    expect(screen.getByTestId("rewards-balance").textContent).toContain("1 ready to redeem");
    expect(screen.getByRole("complementary", { name: "Next reward" }).textContent).toContain("400 pts to go");
  });

  it("shows progress toward unaffordable items and enables button for affordable ones", async () => {
    mount();

    await screen.findByText("₱50 Mobile Load");

    // ₱50 load is affordable (600 balance >= 500 cost)
    const affordableCard = screen.getByTestId("reward-card-reward-load-50");
    const redeemBtn = within(affordableCard).getByRole("button", { name: "I-redeem" }) as HTMLButtonElement;
    expect(redeemBtn.disabled).toBe(false);

    // ₱100 credit is unaffordable (600 balance < 1000 cost)
    const unaffordableCard = screen.getByTestId("reward-card-reward-ewallet-100");
    const progressBox = within(unaffordableCard).getByTestId("progress-reward-ewallet-100");
    expect(progressBox.textContent).toContain("60%");
    expect(progressBox.textContent).toContain("400 pts to go");

    // A locked reward shows its progress instead of a redeem button
    expect(within(unaffordableCard).queryByRole("button")).toBeNull();
  });

  it("handles redemption confirmation and successful deduct flow", async () => {
    mount();

    await screen.findByText("₱50 Mobile Load");
    const affordableCard = screen.getByTestId("reward-card-reward-load-50");
    const redeemBtn = within(affordableCard).getByRole("button", { name: "I-redeem" });

    // Click redeem -> shows confirmation
    fireEvent.click(redeemBtn);
    expect(screen.getByText("Confirm redemption")).toBeTruthy();
    expect(screen.getByRole("dialog").textContent).toMatch(/Redeem .* for/);

    // Setup mock for POST /api/households/1234567890/rewards/redeem
    const updatedCatalog: RewardsCatalogResult = {
      ...mockCatalog,
      balance: 100,
      catalog: [
        { ...mockCatalog.catalog[0]!, affordable: false, progressPercent: 20, pointsNeeded: 400 },
        { ...mockCatalog.catalog[1]!, affordable: false, progressPercent: 10, pointsNeeded: 900 },
      ],
      redemptions: [
        {
          id: "redemption-1",
          sin: household.sin,
          period: "",
          points: -500,
          savedPesos: 0,
          savedKwh: 0,
          baselineKwh: 0,
          actualKwh: 0,
          source: "redemption",
          hasOutage: false,
          description: "Redeemed ₱50 Mobile Load (-500 pts) [sample rewards]",
          createdAt: "2026-11-12T08:00:00.000Z",
        },
      ],
    };

    fetchMock.mockImplementation(async (url, init) => {
      if (url.includes("/rewards/redeem") && init?.method === "POST") {
        return response({
          success: true,
          message: "₱50 Mobile Load redeemed!",
          reward: { id: "reward-load-50", name: "₱50 Mobile Load", pointsCost: 500, tag: "sample rewards" },
          redeemedPoints: 500,
          balance: 100,
          disclaimer: "Partner-funded sample reward.",
          redemption: updatedCatalog.redemptions[0],
        });
      }
      return response(updatedCatalog);
    });

    // Confirm redeem
    const confirmBtn = screen.getByRole("button", { name: "Yes, redeem" });
    fireEvent.click(confirmBtn);

    // Wait for success notice
    await screen.findByText(/₱50 Mobile Load redeemed!/);
    expect(pointsChanged).toHaveBeenCalledTimes(1);
  });

  it("calls onExpired when server returns 401", async () => {
    fetchMock.mockResolvedValueOnce(response({ error: "Unauthorized" }, 401));
    mount();

    await waitFor(() => {
      expect(expired).toHaveBeenCalledTimes(1);
    });
  });
});

describe("locked Welcome Points", () => {
  it("shows Welcome Points in the balance marked locked", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...mockCatalog, balance: 100, lockedPoints: 100, spendable: 0 }), { status: 200 })));
    render(<Rewards token="t" household={household} onExpired={() => {}} />);
    expect((await screen.findByTestId("rewards-balance")).textContent).toContain("100 Points");
    expect(screen.getByTestId("locked-points").textContent).toMatch(/100 Welcome Points unlock after your first savings/);
  });
});

describe("smart meter daily Points (ADR-0008)", () => {
  const smart: Household = { sin: "9876543210", masked_address: "••• City B", meter_type: "smart" };
  const day = (date: string, points: number, extra: Partial<RewardsCatalogResult["redemptions"][number]> = {}) => ({
    id: `day-${smart.sin}-${date}`, period: date.slice(0, 7), day: date, points, savedPesos: points * 100, savedKwh: 0.9,
    baselineKwh: 11, actualKwh: 10.1, source: "meter_verified", hasOutage: false, excludedReason: null,
    description: `Verified Savings on ${date}`, createdAt: `${date}T16:00:00.000Z`, ...extra,
  });

  it("lists each day's Points and says they are verified daily", async () => {
    const earned = [
      day("2026-11-13", 10),
      day("2026-11-12", 0, { hasOutage: true, excludedReason: "An outage/brownout was recorded on this day, so it does not qualify for Points.", description: "A brownout/outage was recorded on November 12, 2026" }),
    ];
    vi.stubGlobal("fetch", vi.fn(async () => response({ ...mockCatalog, sin: smart.sin, earned })));
    render(<Rewards token="t" household={smart} onExpired={() => {}} />);
    const list = await screen.findByTestId("earned-history");
    expect(within(list).getByText("+10 pts")).toBeTruthy();
    expect(within(list).getByText(/does not qualify for Points/)).toBeTruthy();
    expect(screen.getByTestId("rewards-balance").textContent).toMatch(/1 pt per ₱2 saved daily/);
  });
});
