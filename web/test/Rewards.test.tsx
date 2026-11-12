import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Household, RewardsCatalogResult } from "../src/api/client";
import { Rewards } from "../src/components/Rewards";

const household: Household = { sin: "1234567890", masked_address: "••• City A", meter_type: "traditional" };

const mockCatalog: RewardsCatalogResult = {
  sin: household.sin,
  balance: 600,
  tag: "sample rewards",
  disclaimer: "Partner-funded sample rewards. Hindi ito bawas o diskwento sa Meralco bill.",
  catalog: [
    {
      id: "reward-load-50",
      name: "₱50 Mobile Load",
      category: "load",
      partnerName: "Partner Telco",
      pointsCost: 500,
      description: "₱50 prepaid load para sa anumang network.",
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
      description: "₱100 credit sa partner e-wallet account.",
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
    expect(screen.getByText(/Hindi ito bawas o diskwento sa Meralco bill/)).toBeTruthy();

    // Check items
    expect(screen.getByText("₱50 Mobile Load")).toBeTruthy();
    expect(screen.getByText("₱100 E-Wallet Credit")).toBeTruthy();
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
    expect(progressBox.textContent).toContain("60% naipon");
    expect(progressBox.textContent).toContain("Kailangan pa ng 400 pts");

    const disabledBtn = within(unaffordableCard).getByRole("button", { name: /Kulang ang Points/ }) as HTMLButtonElement;
    expect(disabledBtn.disabled).toBe(true);
  });

  it("handles redemption confirmation and successful deduct flow", async () => {
    mount();

    await screen.findByText("₱50 Mobile Load");
    const affordableCard = screen.getByTestId("reward-card-reward-load-50");
    const redeemBtn = within(affordableCard).getByRole("button", { name: "I-redeem" });

    // Click redeem -> shows confirmation
    fireEvent.click(redeemBtn);
    expect(screen.getByText("Kumpirmahin ang pag-redeem")).toBeTruthy();
    expect(screen.getByText(/Sigurado ka bang nais mong i-redeem/)).toBeTruthy();

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
          description: "Na-redeem ang ₱50 Mobile Load (-500 pts) [sample rewards]",
          createdAt: "2026-11-12T08:00:00.000Z",
        },
      ],
    };

    fetchMock.mockImplementation(async (url, init) => {
      if (url.includes("/rewards/redeem") && init?.method === "POST") {
        return response({
          success: true,
          message: "Matagumpay na na-redeem ang ₱50 Mobile Load!",
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
    const confirmBtn = screen.getByRole("button", { name: "Oo, I-redeem" });
    fireEvent.click(confirmBtn);

    // Wait for success notice
    await screen.findByText(/Matagumpay na na-redeem ang ₱50 Mobile Load/);
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
    expect(await screen.findByText(/100 Points/)).toBeTruthy();
    expect(screen.getByTestId("locked-points").textContent).toMatch(/100 Welcome Points ay naka-lock hanggang sa unang Verified Savings/);
  });
});
