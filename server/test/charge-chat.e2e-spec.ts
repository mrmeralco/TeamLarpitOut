import { describe, expect, it } from "vitest";
import type { CoachProvider } from "../src/coach/coach-provider.interface.js";
import { chargePrompt, type ChargeFacts } from "../src/domain/charge-chat.js";
import type { Bill } from "../src/domain/bill.js";
import { TemplateCoachProvider } from "../src/coach/template-coach.provider.js";
import { bill, harness, testAccounts, testLogins } from "./utils/test-harness.js";

const SIN = "1234567890";
const lines = (gen: number, dist: number) => [
  { label: "Generation Charge", amount: gen }, { label: "Distribution Charge", amount: dist },
  { label: "Supply Charge (per customer)", amount: 50 },
];
/** September 520 kWh at ₱6 + ₱4/kWh → October 610 kWh at ₱6.60 + ₱4.40/kWh (the harness Rate Schedules). */
const history = (octTotal?: number): Bill[] => [
  { ...bill("2026-09", 520, 30, lines(3120, 2080)), totalAmount: 3120 + 2080 + 50 },
  { ...bill("2026-10", 610, 33, lines(4026, 2684)), totalAmount: octTotal ?? 4026 + 2684 + 50 },
];
const ask = (lineId: string) => `/api/households/${SIN}/charges/${lineId}/ask`;

function fakeCoach(reply: string | null) {
  const seen: { facts: ChargeFacts; question: string }[] = [];
  const coach: CoachProvider = {
    phraseMission: async () => "ok",
    async answerCharge(input) { seen.push(structuredClone(input)); return reply; },
  };
  return Object.assign(coach, { seen });
}

async function setup(coach: CoachProvider, bills = history()) {
  const api = await harness({ bills: { [SIN]: bills }, coach });
  return { api, token: await api.login() };
}

describe("POST /api/households/:sin/charges/:lineId/ask", () => {
  it("sends only that line's computed facts and the question to the provider", async () => {
    const coach = fakeCoach("Generation went up because you used more electricity.");
    const { api, token } = await setup(coach);
    const res = await api.post(ask("generation"), { question: "Why did this go up?" }, token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ lineId: "generation", kind: "answer", source: "ai", answer: "Generation went up because you used more electricity." });
    expect(coach.seen).toHaveLength(1);
    const { facts, question } = coach.seen[0]!;
    expect(question).toBe("Why did this go up?");
    expect(facts).toMatchObject({
      line: "Generation", kind: "perKwh", goesTo: "Pass-through", passThrough: true,
      amountNow: 4026, amountBefore: 3120, change: 906, kwhNow: 610, kwhBefore: 520, kwhChange: 90, billCheck: "green",
    });
    expect(facts).toMatchObject({ ratePerKwhNow: 6.6, ratePerKwhBefore: 6, fromUsage: 540, fromRate: 366 });
    expect(facts.fromUsage! + facts.fromRate!).toBe(906);
    const prompt = chargePrompt(facts, question);
    for (const other of ["Distribution", "Supply", "2684", "2080", "6710"]) expect(prompt).not.toContain(other);
    for (const personal of [SIN, testAccounts[0]!.can, testLogins[0]!.email, "City A", "owner"]) expect(prompt).not.toContain(personal);
  });

  it("returns the template answer when the AI writes a peso or kWh figure that is not in the facts", async () => {
    for (const reply of ["It rose by ₱999 because of the heat.", "You used 75 kWh more.", "It rose by PHP 12.34."]) {
      const { api, token } = await setup(fakeCoach(reply));
      const res = await api.post(ask("generation"), { question: "Why did this go up?" }, token);
      expect(res.body.source).toBe("template");
      expect(res.body.answer).not.toBe(reply);
      expect(res.body.answer).toContain("₱906.00");
    }
  });

  it("accepts AI figures copied from the facts, including whole-peso rounding", async () => {
    const reply = "Your Generation charge rose by ₱906 (₱3,120.00 → ₱4,026.00). You used 90 kWh more (610 kWh vs. 520 kWh), about ₱540; the rate rose ₱0.60/kWh, about ₱366.";
    const { api, token } = await setup(fakeCoach(reply));
    expect((await api.post(ask("generation"), { question: "Why did this go up?" }, token)).body).toMatchObject({ source: "ai", answer: reply });
  });

  it("never offers to file a complaint: complaint questions get 'ask Meralco' plus the copy summary", async () => {
    const coach = fakeCoach("I will file a complaint for you.");
    const { api, token } = await setup(coach, history(9999));
    for (const question of ["Can you file a complaint for me?", "Paano ko ireklamo ito?", "I want to dispute this"]) {
      const res = await api.post(ask("generation"), { question }, token);
      expect(res.body.kind).toBe("askMeralco");
      expect(res.body.answer).toMatch(/does not file complaints/);
      expect(res.body.answer).toMatch(/ask Meralco/i);
      expect(res.body.summary.length).toBeGreaterThan(0);
    }
    expect(coach.seen).toHaveLength(0);
    const offer = await api.post(ask("generation"), { question: "Why did this go up?" }, token);
    expect(offer.body.source).toBe("template");
  });

  it("redirects off-topic questions to the charge without calling the AI", async () => {
    const coach = fakeCoach("Here is a recipe.");
    const { api, token } = await setup(coach);
    const res = await api.post(ask("distribution"), { question: "Give me an adobo recipe" }, token);
    expect(res.body).toMatchObject({ kind: "redirect", source: "template" });
    expect(res.body.answer).toMatch(/only answer questions about the Distribution charge/);
    expect(coach.seen).toHaveLength(0);
  });

  it("works with the template provider when no API key is set", async () => {
    const { api, token } = await setup(new TemplateCoachProvider());
    const why = await api.post(ask("generation"), { question: "Why did this go up?" }, token);
    expect(why.body.source).toBe("template");
    expect(why.body.answer).toMatch(/rose by ₱906\.00/);
    expect(why.body.answer).toMatch(/went up by ₱0\.60\/kWh, which added about ₱366\.00/);
    expect(why.body.answer).toMatch(/90 kWh more \(610 kWh vs\. 520 kWh\)/);
    expect(why.body.answer).toMatch(/pass-through/);
    expect((await api.post(ask("distribution"), { question: "Who sets this rate?" }, token)).body.answer).toMatch(/Meralco's own charge/);
    expect((await api.post(ask("supply"), { question: "Can I lower this?" }, token)).body.answer).toMatch(/fixed monthly charge/);
    expect((await api.post(ask("generation"), { question: "Is this correct?" }, token)).body.answer).toMatch(/Bill Checks for this bill pass/);
  });

  it("answers 'Is this correct?' on a red Bill with 'ask Meralco' and the summary", async () => {
    const { api, token } = await setup(new TemplateCoachProvider(), history(9999));
    const res = await api.post(ask("generation"), { question: "Is this correct?" }, token);
    expect(res.body.kind).toBe("askMeralco");
    expect(res.body.summary).toBeTruthy();
  });

  it("404 for an unknown line, 400 for a bad question, and the usual session and Household guards", async () => {
    const { api, token } = await setup(new TemplateCoachProvider());
    expect((await api.post(ask("nope"), { question: "Why?" }, token)).status).toBe(404);
    expect((await api.post(ask("generation"), { question: "" }, token)).status).toBe(400);
    expect((await api.post(ask("generation"), { question: "x".repeat(301) }, token)).status).toBe(400);
    expect((await api.post(ask("generation"), { question: "Why?" })).status).toBe(401);
    const other = await api.login(testLogins[1]!.email);
    expect((await api.post(ask("generation"), { question: "Why?" }, other)).status).toBe(404);
  });
});
