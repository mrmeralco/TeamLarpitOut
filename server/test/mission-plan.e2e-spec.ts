import { describe, expect, it } from "vitest";
import type { CoachProvider, CandidateFacts } from "../src/coach/coach-provider.interface.js";
import type { PlannedMission } from "../src/domain/mission-plan.js";
import { TemplateCoachProvider } from "../src/coach/template-coach.provider.js";
import { bill, harness, testAccounts, testLogins } from "./utils/test-harness.js";

const SIN = "1234567890";
const weather = { "2026-09": 8, "2026-10": 10, "2026-11": 12 };
const history = () => [bill("2026-09", 280, 30), bill("2026-10", 300, 30)];
const grid = { counts: { aircon: 1, refrigerator: 1, electric_fan: 2, tv: 1, washing_machine: 1, flat_iron: 1, rice_cooker: 1 } };
const plan = `/api/households/${SIN}/missions/plan`;

function fakeCoach(pick: (input: { candidates: CandidateFacts[]; avoid: string[][] }) => PlannedMission[] | null) {
  const seen: { candidates: CandidateFacts[]; avoid: string[][]; goalPercent: number }[] = [];
  const coach: CoachProvider = {
    phraseMission: async () => "ok",
    async pickMissionPlan(input) { seen.push(structuredClone(input)); return pick(input); },
  };
  return Object.assign(coach, { seen });
}

async function ready(coach: CoachProvider = new TemplateCoachProvider(), counts = grid) {
  const api = await harness({ bills: { [SIN]: history() }, weather, coach });
  const token = await api.login();
  await api.put(`/api/households/${SIN}/setup/household`, { size: 4 }, token);
  await api.put(`/api/households/${SIN}/setup/appliances`, counts, token);
  await api.put(`/api/households/${SIN}/setup/routine`, { home: "allDay", aircon: "afternoonNight" }, token);
  return { api, token };
}

describe("GET /api/households/:sin/missions/plan", () => {
  it("is locked until Household Setup is complete", async () => {
    const api = await harness({ bills: { [SIN]: history() }, weather });
    const token = await api.login();
    expect((await api.get(plan, token)).body).toMatchObject({ reason: "setupIncomplete" });
  });

  it("sets a fixed 5% goal and a plan of up to five Missions that covers it (template provider: greedy pick)", async () => {
    const { api, token } = await ready();
    const { status, body } = await api.get(plan, token);
    expect(status).toBe(200);
    expect(body.goal.cut).toBe(5);
    expect(body.goal.kwh).toBeCloseTo(body.goal.baselineKwh * 0.05, 1);
    expect(body.goal.pesos).toBeGreaterThan(0);
    expect(body.source).toBe("fallback");
    expect(body.missions.length).toBeGreaterThan(0);
    expect(body.missions.length).toBeLessThanOrEqual(5);
    expect(body.covered).toBeGreaterThanOrEqual(1);
    expect(new Set(body.missions.map((m: { appliance: string }) => m.appliance)).size).toBeGreaterThan(1);
    for (const m of body.missions) {
      expect(m).toMatchObject({ effort: expect.stringMatching(/Easy|Medium/), how: expect.any(Array), why: expect.any(String) });
      if (m.basis === "assumption") expect(m.assumptions.length).toBeGreaterThan(0);
    }
    expect(body.points).toMatch(/whole bill/);
    expect(await api.get(plan, token)).toEqual({ status: 200, body });
  });

  it("uses the AI's pick and wording when ids and figures check out; the AI sees only candidates", async () => {
    const coach = fakeCoach(({ candidates }) => {
      const sorted = [...candidates].sort((a, b) => b.kwhSaved - a.kwhSaved);
      const out: PlannedMission[] = [];
      const groups = new Set<string>();
      let percent = 0;
      for (const c of sorted) {
        if (percent >= 5 || out.length === 5 || groups.has(c.group)) continue;
        groups.add(c.group); percent += c.percent;
        out.push({ id: c.id, title: `Try this: ${c.title}`, why: `About ${c.kwhSaved} kWh for your home.` });
      }
      return out;
    });
    const { api, token } = await ready(coach);
    const { body } = await api.get(plan, token);
    expect(body.source).toBe("ai");
    expect(body.missions[0].title).toMatch(/^Try this: /);
    expect(coach.seen[0]!.goalPercent).toBe(5);
    const sent = JSON.stringify(coach.seen[0]);
    for (const personal of [SIN, testAccounts[0]!.can, testLogins[0]!.email, "City A"]) expect(sent).not.toContain(personal);
  });

  it.each([
    ["unknown ids", (c: CandidateFacts[]) => [{ id: "buy-solar", title: "Buy solar", why: "Saves a lot." }, ...c.slice(0, 2).map((x) => ({ id: x.id, title: x.title, why: x.why }))]],
    ["changed numbers", (c: CandidateFacts[]) => c.slice(0, 5).map((x) => ({ id: x.id, title: x.title, why: "Saves ₱5,000 and 400 kWh." }))],
    ["no answer", () => null],
  ])("rejects a plan with %s and returns the fallback plan", async (_name, pick) => {
    const { api, token } = await ready(fakeCoach(({ candidates }) => pick(candidates)));
    const { body } = await api.get(plan, token);
    expect(body.source).toBe("fallback");
    expect(body.covered).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(body)).not.toMatch(/buy-solar|₱5,000/);
  });

  it("shuffle returns a different set when one exists", async () => {
    const { api, token } = await ready();
    const first = (await api.get(plan, token)).body;
    const shuffled = await api.post(`${plan}/shuffle`, {}, token);
    expect(shuffled.status).toBe(201);
    expect(shuffled.body.changed).toBe(true);
    const ids = (b: { missions: { id: string }[] }) => b.missions.map((m) => m.id).sort().join(",");
    expect(ids(shuffled.body)).not.toBe(ids(first));
    expect(shuffled.body.missions.length).toBeLessThanOrEqual(5);
    expect(ids((await api.get(plan, token)).body)).toBe(ids(shuffled.body));
  });

  it("shuffle keeps the plan when no other combination exists", async () => {
    const { api, token } = await ready(new TemplateCoachProvider(), { counts: { refrigerator: 1 } } as never);
    const first = (await api.get(plan, token)).body;
    const again = await api.post(`${plan}/shuffle`, {}, token);
    expect(again.body.changed).toBe(false);
    expect(again.body.missions.map((m: { id: string }) => m.id)).toEqual(first.missions.map((m: { id: string }) => m.id));
  });

  it("swap replaces one Mission and keeps the others", async () => {
    const { api, token } = await ready();
    const first = (await api.get(plan, token)).body;
    const out = first.missions.at(-1).id;
    const swapped = await api.post(`/api/households/${SIN}/missions/${out}/swap`, {}, token);
    expect(swapped.status).toBe(201);
    const before = first.missions.map((m: { id: string }) => m.id).filter((id: string) => id !== out);
    const after = swapped.body.missions.map((m: { id: string }) => m.id);
    expect(after).not.toContain(out);
    for (const id of before) expect(after).toContain(id);
    expect(after).toHaveLength(first.missions.length);
    expect(swapped.body.swapped.out).toBe(out);
    expect((await api.post(`/api/households/${SIN}/missions/not-in-plan/swap`, {}, token)).status).toBe(404);
  });

  it("self-report still earns nothing and Points stay on the whole Bill", async () => {
    const { api, token } = await ready();
    await api.get(plan, token);
    const res = await api.post(`/api/households/${SIN}/missions/self-report`, { missionId: "ref-medium" }, token);
    expect(res.body.awardedPoints).toBe(0);
  });

  it("is per Household and owner-only", async () => {
    const { api, token } = await ready();
    const other = await api.login(testLogins[1]!.email);
    expect((await api.get(plan, other)).status).toBe(404);
    expect((await api.get(plan)).status).toBe(401);
    expect((await api.get(plan, token)).status).toBe(200);
  });
});
