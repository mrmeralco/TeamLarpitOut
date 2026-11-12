import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { AppliancesService } from "../appliances/appliances.service.js";
import type { CoachProvider } from "../coach/coach-provider.interface.js";
import { COACH_PROVIDER, USAGE_PLAN_REPOSITORY } from "../common/injection-tokens.js";
import { findAppliance } from "../domain/appliance-catalog.js";
import { GOAL_CUT } from "../domain/baseline.js";
import { rankMissions, type ApplianceUsage } from "../domain/mission-catalog.js";
import { buildCandidates, fallbackPlan, greedyPlan, planCoverage, validateAiPlan, type Candidate, type Plan } from "../domain/mission-plan.js";
import { SetupService } from "../setup/setup.service.js";
import type { UsagePlan, UsagePlanRepository } from "./usage-plan-repository.interface.js";
import { UsagePlanService } from "./usage-plan.service.js";

const round2 = (x: number) => Math.round(x * 100) / 100;

/** The 5% Mission Plan: computed candidates, AI pick and wording with a greedy fallback, shuffle and swap. */
@Injectable()
export class MissionPlanService {
  constructor(
    private readonly usagePlan: UsagePlanService,
    private readonly appliances: AppliancesService,
    private readonly setup: SetupService,
    @Inject(COACH_PROVIDER) private readonly coach: CoachProvider,
    @Inject(USAGE_PLAN_REPOSITORY) private readonly plans: UsagePlanRepository,
  ) {}

  /** The goal and every candidate this home's appliances and routine allow. */
  async candidates(sin: string) {
    const target = await this.usagePlan.target(sin);
    const goal = target.options.find((o) => o.cut === GOAL_CUT)!;
    const goalKwh = round2(target.baseline.kwh - goal.kwh);
    const usage = await this.appliances.calibratedUsage(sin);
    const perKwhRate = usage.schedule.perKwh.reduce((s, c) => s + c.rate, 0);
    const applianceUsage: ApplianceUsage[] = usage.appliances.map((a, i) => ({
      type: a.type,
      quantity: a.quantity ?? 1,
      kwh: usage.rows[i]!.kwh,
      hoursPerDay: findAppliance(a.type)!.routine === "timeRanges" ? usage.estimates[i]!.hoursPerDay : null,
      usesPerWeek: a.usesPerWeek ?? null,
      rating: usage.estimates[i]!.rating,
    }));
    const ranked = rankMissions({ billingDays: target.billingDays, usage: applianceUsage }, perKwhRate);
    return {
      target,
      goal: { cut: GOAL_CUT, kwh: goalKwh, pesos: goal.savings, baselineKwh: target.baseline.kwh, targetKwh: goal.kwh, targetPesos: goal.pesos },
      candidates: buildCandidates(ranked, applianceUsage, goalKwh, target.baseline.kwh),
    };
  }

  private async requireSetup(sin: string) {
    if (!(await this.setup.isComplete(sin))) {
      throw new ConflictException({ error: "Tapusin ang setup para ma-unlock ang Missions.", reason: "setupIncomplete" });
    }
  }

  /** Ask the AI for a plan from the candidates only; any invalid answer becomes the greedy pick. */
  private async pick(candidates: Candidate[], avoid: string[][], fallback: () => Plan): Promise<Plan> {
    const best = planCoverage(greedyPlan(candidates));
    const facts = candidates.map((c) => ({
      id: c.id, title: c.title, appliance: c.appliance, kwhSaved: c.kwhSaved, pesos: Math.round(c.pesoValue / 100),
      percent: c.percent, effort: c.effort, group: c.group, why: c.why,
    }));
    const picked = this.coach.pickMissionPlan
      ? await this.coach.pickMissionPlan({ goalPercent: GOAL_CUT, candidates: facts, avoid }).catch(() => null)
      : null;
    return validateAiPlan(picked, candidates, { avoid, best }) ?? fallback();
  }

  private async save(sin: string, period: string, goal: Awaited<ReturnType<MissionPlanService["candidates"]>>["goal"], plan: Plan, shown: string[][]) {
    const stored: UsagePlan = {
      period,
      cut: GOAL_CUT,
      targetKwh: goal.targetKwh,
      targetPesos: goal.targetPesos,
      airconSetting: null,
      missions: plan.missions.map((m) => ({ id: m.id, title: plan.wording[m.id]?.title ?? m.title, kwhSaved: m.kwhSaved, pesoValue: m.pesoValue })),
      createdAt: new Date().toISOString(),
      source: plan.source,
      wording: plan.wording,
      shown: [...shown, plan.missions.map((m) => m.id)],
    };
    return this.plans.save(sin, stored);
  }

  private present(period: string, goal: Awaited<ReturnType<MissionPlanService["candidates"]>>["goal"], candidates: Candidate[], stored: UsagePlan, extra: Record<string, unknown> = {}) {
    const byId = new Map(candidates.map((c) => [c.id, c]));
    const missions = stored.missions.map((m) => byId.get(m.id)).filter((c): c is Candidate => Boolean(c));
    const covered = planCoverage(missions);
    return {
      currency: "PHP-centavos",
      period,
      goal,
      /** Share of the 5% goal the plan covers (1 = goal reached). */
      covered: round2(covered),
      coveredPercent: Math.round(missions.reduce((s, m) => s + m.percent, 0) * 10) / 10,
      source: stored.source ?? "fallback",
      missions: missions.map((m) => ({
        id: m.id,
        title: stored.wording?.[m.id]?.title ?? m.title,
        why: stored.wording?.[m.id]?.why ?? m.why,
        how: m.how,
        appliance: m.appliance,
        kwhSaved: m.kwhSaved,
        pesoValue: m.pesoValue,
        percent: m.percent,
        share: round2(m.share),
        effort: m.effort,
        basis: m.basis,
        assumptions: m.assumptions,
      })),
      points: "Points are counted on your whole bill, not per mission: at the next Bill, savings below the weather- and days-adjusted Baseline earn 1 point per ₱1.",
      ...extra,
    };
  }

  async plan(sin: string) {
    await this.requireSetup(sin);
    const { target, goal, candidates } = await this.candidates(sin);
    let stored = await this.plans.find(sin);
    if (!stored || stored.period !== target.period || !stored.missions.every((m) => candidates.some((c) => c.id === m.id))) {
      stored = await this.save(sin, target.period, goal, await this.pick(candidates, [], () => fallbackPlan(candidates)), []);
    }
    return this.present(target.period, goal, candidates, stored);
  }

  /** Another combination when one exists; otherwise the same plan with `changed: false`. */
  async shuffle(sin: string) {
    await this.plan(sin);
    const { target, goal, candidates } = await this.candidates(sin);
    const current = (await this.plans.find(sin))!;
    const currentIds = current.missions.map((m) => m.id);
    const shown = current.shown ?? [currentIds];
    const seen = (ids: string[]) => shown.some((s) => [...s].sort().join(",") === [...ids].sort().join(","));
    const reachable = Math.min(1, planCoverage(greedyPlan(candidates)));
    const alternative = (): Plan | null => {
      // Drop the current Missions one at a time (largest first), then all of them.
      const tries = [...currentIds.map((id) => [id]), currentIds];
      for (const exclude of tries) {
        const alt = fallbackPlan(candidates, { exclude });
        if (alt.missions.length && alt.covered >= reachable - 1e-9 && !seen(alt.missions.map((m) => m.id))) return alt;
      }
      return null;
    };
    const fallback = alternative();
    // Start over once every reachable combination has been shown.
    const avoid = fallback ? shown : [currentIds];
    // Without another combination that still reaches the goal, only a valid AI plan can change it.
    const none: Plan = { missions: [], wording: {}, covered: 0, source: "fallback" };
    const next = await this.pick(candidates, avoid, () => fallback ?? none);
    const nextIds = next.missions.map((m) => m.id);
    if (!next.missions.length || [...nextIds].sort().join(",") === [...currentIds].sort().join(",")) {
      return this.present(target.period, goal, candidates, current, { changed: false });
    }
    const stored = await this.save(sin, target.period, goal, next, fallback ? shown : []);
    return this.present(target.period, goal, candidates, stored, { changed: true });
  }

  /** Replaces one Mission and keeps the others. */
  async swap(sin: string, missionId: string) {
    await this.plan(sin);
    const { target, goal, candidates } = await this.candidates(sin);
    const current = (await this.plans.find(sin))!;
    const ids = current.missions.map((m) => m.id);
    if (!ids.includes(missionId)) throw new NotFoundException({ error: "Wala ang Mission na ito sa plan mo." });
    const keep = ids.filter((id) => id !== missionId);
    const keptGroups = new Set(candidates.filter((c) => keep.includes(c.id)).map((c) => c.group));
    const replacement = candidates
      .filter((c) => !ids.includes(c.id) && !keptGroups.has(c.group))
      .sort((a, b) => b.kwhSaved - a.kwhSaved || a.id.localeCompare(b.id))[0];
    if (!replacement) throw new ConflictException({ error: "Walang ibang Mission na puwedeng ipalit para sa bahay na ito.", reason: "noAlternative" });
    const missions = [...candidates.filter((c) => keep.includes(c.id)), replacement].sort((a, b) => b.kwhSaved - a.kwhSaved);
    const wording = { ...(current.wording ?? {}) };
    delete wording[missionId];
    wording[replacement.id] = { title: replacement.title, why: replacement.why };
    const plan: Plan = { missions, wording, covered: planCoverage(missions), source: current.source === "ai" ? "ai" : "fallback" };
    const stored = await this.save(sin, target.period, goal, plan, current.shown ?? []);
    return this.present(target.period, goal, candidates, stored, { swapped: { out: missionId, in: replacement.id } });
  }
}
