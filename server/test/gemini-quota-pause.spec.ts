import { describe, expect, it } from "vitest";
import { GeminiCoachProvider } from "../src/coach/gemini-coach.provider.js";

describe("GeminiCoachProvider after a quota error", () => {
  it("skips Gemini for a while instead of waiting on calls that will fail", async () => {
    const coach = new GeminiCoachProvider("test-key", "test-model");
    let calls = 0;
    (coach as unknown as { client: unknown }).client = {
      models: { generateContent: async () => { calls++; throw new Error('{"error":{"code":429,"message":"You exceeded your current quota"}}'); } },
    };
    const pick = () => coach.pickMissionPlan({ goalPercent: 5, candidates: [], avoid: [] });
    expect(await pick()).toBeNull();
    expect(await pick()).toBeNull();
    expect(await coach.answerCharge({ facts: {} as never, question: "Why?" })).toBeNull();
    expect(calls).toBe(1);
  });

  it("keeps trying after other errors", async () => {
    const coach = new GeminiCoachProvider("test-key", "test-model");
    let calls = 0;
    (coach as unknown as { client: unknown }).client = { models: { generateContent: async () => { calls++; throw new Error("network down"); } } };
    await coach.pickMissionPlan({ goalPercent: 5, candidates: [], avoid: [] });
    await coach.pickMissionPlan({ goalPercent: 5, candidates: [], avoid: [] });
    expect(calls).toBe(2);
  });
});
