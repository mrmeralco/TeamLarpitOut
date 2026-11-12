import { describe, expect, it } from "vitest";
import type { Bill } from "../src/domain/bill.js";
import { bill, harness, schedule } from "./utils/test-harness.js";

const SIN = "1234567890"; // owner-a
const FOREIGN_SIN = "5555555555"; // owner-b

const baseHistory = (): Bill[] => [bill("2026-09", 210, 30), bill("2026-10", 240, 30)];

const survey = {
  appliances: [
    {
      type: "aircon",
      answers: { mount: "split", inverter: "yes", room: "medium" },
      timeRanges: [{ start: "22:00", end: "06:00", days: "everyday" }],
    },
    { type: "refrigerator" },
  ],
};

const schedules = [
  schedule("2026-09", 10),
  schedule("2026-10", 11),
  schedule("2026-11", 11),
];

describe("19 · Rewards catalog and redemption", () => {
  it("shows points balance and sample rewards catalog with items labelled 'sample rewards'", async () => {
    // 131 points from savings (240 kWh down to 210 kWh; see points.e2e-spec for the steps)
    const weather = { "2026-09": 8, "2026-10": 10, "2026-11": 10 };
    const bills = { [SIN]: [...baseHistory(), bill("2026-11", 210, 30)] };

    const api = await harness({ bills, weather, schedules });
    const token = await api.login();
    await api.put(`/api/households/${SIN}/appliances`, survey, token);

    const { status, body } = await api.get(`/api/households/${SIN}/rewards`, token);

    expect(status).toBe(200);
    expect(body.balance).toBe(131);
    expect(body.tag).toBe("sample rewards");
    expect(body.disclaimer).toContain("Partner-funded");
    expect(body.disclaimer).toContain("Not a deduction or discount on your Meralco bill");
    expect(body.catalog).toBeInstanceOf(Array);
    expect(body.catalog.length).toBeGreaterThanOrEqual(3);

    // Acceptance criterion: Items labelled "sample rewards"
    for (const item of body.catalog) {
      expect(item.tag).toBe("sample rewards");
      expect(item.isSampleReward).toBe(true);
      expect(item.pointsCost).toBeGreaterThan(0);
      expect(item).toHaveProperty("affordable");
      expect(item).toHaveProperty("progressPercent");
      expect(item).toHaveProperty("pointsNeeded");
    }

    // ₱50 load = 250 pts (₱500 of savings at 1 pt per ₱2)
    const loadReward = body.catalog.find((i: any) => i.id === "reward-load-50");
    expect(loadReward).toBeDefined();
    expect(loadReward.pointsCost).toBe(250);
    // With 131 points, 250 pts is unaffordable:
    expect(loadReward.affordable).toBe(false);
    expect(loadReward.progressPercent).toBe(52); // floor(131 / 250 * 100) = 52%
    expect(loadReward.pointsNeeded).toBe(119); // 250 - 131 = 119 pts
  });

  it("API test: cannot redeem beyond the balance", async () => {
    // Household has 131 points.
    const weather = { "2026-09": 8, "2026-10": 10, "2026-11": 10 };
    const bills = { [SIN]: [...baseHistory(), bill("2026-11", 210, 30)] };

    const api = await harness({ bills, weather, schedules });
    const token = await api.login();
    await api.put(`/api/households/${SIN}/appliances`, survey, token);

    // Try to redeem ₱50 load (cost: 500 pts > balance 330 pts)
    const { status, body } = await api.post(
      `/api/households/${SIN}/rewards/redeem`,
      { rewardId: "reward-load-50" },
      token,
    );

    expect(status).toBe(400);
    expect(body.error).toContain("is not enough for");
    expect(body.balance).toBe(131);
    expect(body.pointsCost).toBe(250);
    expect(body.pointsNeeded).toBe(119);

    // Verify balance remains 131
    const pointsRes = await api.get(`/api/households/${SIN}/points`, token);
    expect(pointsRes.body.balance).toBe(131);
  });

  it("rejects unknown rewardId", async () => {
    const api = await harness({ bills: { [SIN]: baseHistory() } });
    const token = await api.login();

    const { status, body } = await api.post(
      `/api/households/${SIN}/rewards/redeem`,
      { rewardId: "nonexistent-reward" },
      token,
    );

    expect(status).toBe(400);
    expect(body.error).toContain("Unknown reward");
  });

  it("redemption deducts Points and is recorded per Household", async () => {
    // A bigger home: 640 kWh down to 540 kWh (₱1,100 off a ₱7,090 Baseline). ₱70.90 noise band; ₱354.50
    // goal in full + ₱354.50 at half (cap) = ₱531.75 → 265.9 pts → ×1.3 (very strong El Niño) = 345 points.
    const weather = { "2026-09": 8, "2026-10": 10, "2026-11": 10 };
    const bills = { [SIN]: [bill("2026-09", 560, 30), bill("2026-10", 640, 30), bill("2026-11", 540, 30)] };

    const api = await harness({ bills, weather, schedules });
    const token = await api.login();
    await api.put(`/api/households/${SIN}/appliances`, survey, token);

    // Verify initial balance is 345
    const initRes = await api.get(`/api/households/${SIN}/rewards`, token);
    expect(initRes.body.balance).toBe(345);

    // Redeem ₱50 load (250 pts)
    const redeemRes = await api.post(
      `/api/households/${SIN}/rewards/redeem`,
      { rewardId: "reward-load-50" },
      token,
    );

    expect(redeemRes.status).toBe(201);
    expect(redeemRes.body.success).toBe(true);
    expect(redeemRes.body.redeemedPoints).toBe(250);
    expect(redeemRes.body.balance).toBe(95); // 345 - 250 = 95
    expect(redeemRes.body.reward).toMatchObject({
      id: "reward-load-50",
      pointsCost: 250,
      tag: "sample rewards",
    });
    expect(redeemRes.body.disclaimer).toContain("Partner-funded");

    // Verify updated catalog and balance via GET
    const rewardsAfter = await api.get(`/api/households/${SIN}/rewards`, token);
    expect(rewardsAfter.body.balance).toBe(95);
    expect(rewardsAfter.body.redemptions).toHaveLength(1);
    expect(rewardsAfter.body.redemptions[0]).toMatchObject({
      points: -250,
      source: "redemption",
      rewardId: "reward-load-50",
      sin: SIN,
    });
    expect(rewardsAfter.body.redemptions[0].description).toContain("sample rewards");

    // Also verify points endpoint reflects the deduction
    const pointsAfter = await api.get(`/api/households/${SIN}/points`, token);
    expect(pointsAfter.body.balance).toBe(95);

    // Now with 95 points left, attempting another 250 pt redemption must fail
    const secondRedeem = await api.post(
      `/api/households/${SIN}/rewards/redeem`,
      { rewardId: "reward-load-50" },
      token,
    );
    expect(secondRedeem.status).toBe(400);
    expect(secondRedeem.body.error).toContain("is not enough");
  });

  it("requires authentication and household access", async () => {
    const api = await harness({ bills: { [SIN]: baseHistory() } });
    const token = await api.login();

    // 401 without token
    expect((await api.get(`/api/households/${SIN}/rewards`)).status).toBe(401);
    expect((await api.post(`/api/households/${SIN}/rewards/redeem`, { rewardId: "reward-load-50" })).status).toBe(401);

    // 404 for foreign household
    expect((await api.get(`/api/households/${FOREIGN_SIN}/rewards`, token)).status).toBe(404);
    expect((await api.post(`/api/households/${FOREIGN_SIN}/rewards/redeem`, { rewardId: "reward-load-50" }, token)).status).toBe(404);
  });
});
