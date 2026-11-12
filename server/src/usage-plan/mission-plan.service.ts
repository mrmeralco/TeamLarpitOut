import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { AppliancesService } from "../appliances/appliances.service.js";
import type { CoachProvider } from "../coach/coach-provider.interface.js";
import type { OutageSource } from "../bills/outage-source.js";
import type { Clock } from "../common/clock.js";
import { addDays, manilaDate } from "../domain/daily-points.js";
import { CLOCK, COACH_PROVIDER, MISSION_REMINDER_REPOSITORY, OUTAGE_SOURCE, USAGE_PLAN_REPOSITORY } from "../common/injection-tokens.js";
import type { MissionReminderRepository } from "./mission-reminder.repository.js";
import { climateFor } from "../domain/climate.js";
import { earnedPoints, NOISE_BAND, PESOS_PER_POINT } from "../domain/points.js";
import { findAppliance } from "../domain/appliance-catalog.js";
import { GOAL_CUT } from "../domain/baseline.js";
import { rankMissions, type ApplianceUsage } from "../domain/mission-catalog.js";
import { buildCandidates, dailyMissions, fallbackPlan, greedyPlan, MIN_PLAN, planCoverage, validateAiPlan, type Candidate, type Plan } from "../domain/mission-plan.js";
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
    @Inject(MISSION_REMINDER_REPOSITORY) private readonly reminders: MissionReminderRepository,
    @Inject(OUTAGE_SOURCE) private readonly outageSource: OutageSource,
    @Inject(CLOCK) private readonly clock: Clock,
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
      goal: { cut: GOAL_CUT, kwh: goalKwh, pesos: goal.savings, baselineKwh: target.baseline.kwh, targetKwh: goal.kwh, targetPesos: goal.pesos, billingDays: target.billingDays },
      candidates: buildCandidates(ranked, applianceUsage, goalKwh, target.baseline.kwh),
    };
  }

  private async requireSetup(sin: string) {
    if (!(await this.setup.isComplete(sin))) {
      throw new ConflictException({ error: "Finish setup to unlock Missions.", reason: "setupIncomplete" });
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
      source: plan.source,
      wording: plan.wording,
      shown: [...shown, plan.missions.map((m) => m.id)],
      ...(await this.usagePlan.planStartedAt(sin)),
    };
    return this.plans.save(sin, stored);
  }

  private async present(sin: string, period: string, goal: Awaited<ReturnType<MissionPlanService["candidates"]>>["goal"], candidates: Candidate[], stored: UsagePlan, extra: Record<string, unknown> = {}) {
    const byId = new Map(candidates.map((c) => [c.id, c]));
    const missions = stored.missions.map((m) => byId.get(m.id)).filter((c): c is Candidate => Boolean(c));
    const covered = planCoverage(missions);
    const smart = await this.usagePlan.isSmartMeter(sin);
    // Points if every Mission is done, by the same rules as the bill (noise band, goal cap, climate);
    // each Mission shows its share of them.
    const climate = climateFor(period);
    const baselineCentavos = goal.targetPesos + goal.pesos;
    const planPesos = missions.reduce((s, m) => s + m.pesoValue, 0);
    const planPoints = earnedPoints({ savedCentavos: planPesos, baselineCentavos, multiplier: climate.multiplier }).points;
    const shareOf = (m: Candidate) => (planPesos > 0 ? Math.round((planPoints * m.pesoValue) / planPesos) : 0);
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
        /** This Mission's share of the plan's points. */
        rewardPoints: shareOf(m),
        share: round2(m.share),
        effort: m.effort,
        basis: m.basis,
        assumptions: m.assumptions,
      })),
      /** Points the whole plan is worth if every Mission is done. */
      rewardPoints: planPoints,
      /** This period's climate and its Points multiplier (PAGASA ENSO advisories). */
      climate: { phase: climate.phase, label: climate.label, multiplier: climate.multiplier, source: climate.source },
      ...(smart ? { daily: await this.daily(sin, goal, candidates, stored) } : {}),
      points: smart
        ? `Points are counted every day from your smart meter: 1 point per ₱${PESOS_PER_POINT} saved below your usual use for that day's heat, after the normal ${Math.round(NOISE_BAND * 100)}% change. ${climateFor(manilaDate(this.clock.now()).slice(0, 7)).label}: ×${climateFor(manilaDate(this.clock.now()).slice(0, 7)).multiplier}. A day with a brownout earns none.`
        : `1 point per ₱${PESOS_PER_POINT} saved on your next bill. The first ${Math.round(NOISE_BAND * 100)}% is normal month-to-month change and doesn't count; savings past your ${GOAL_CUT}% goal count half. ${climate.label} this month: ×${climate.multiplier}. A month with a brownout earns no points.`,
      ...extra,
    };
  }

  /**
   * A smart meter home's Missions change every day (its points are counted daily): today's set with
   * per-day kWh, pesos and points, yesterday's result from the meter, and the streak of days with points.
   */
  private async daily(sin: string, goal: Awaited<ReturnType<MissionPlanService["candidates"]>>["goal"], candidates: Candidate[], stored: UsagePlan) {
    const date = manilaDate(this.clock.now());
    const days = Math.max(1, goal.billingDays);
    const today = dailyMissions(candidates, date);
    const climate = climateFor(date.slice(0, 7));
    const baselineCentavos = (goal.targetPesos + goal.pesos) / days;
    const todayPesos = today.reduce((s, m) => s + m.pesoValue / days, 0);
    const todayPoints = earnedPoints({ savedCentavos: todayPesos, baselineCentavos, multiplier: climate.multiplier }).points;
    // getPoints settles any complete days first, so yesterday's result is there.
    const entries = (await this.usagePlan.getPoints(sin)).history.filter((e) => e.source === "meter_verified" && e.day);
    const byDay = new Map(entries.map((e) => [e.day!, e]));
    const yesterday = byDay.get(addDays(date, -1)) ?? null;
    let streak = 0;
    for (let d = addDays(date, -1); (byDay.get(d)?.points ?? 0) > 0; d = addDays(d, -1)) streak++;
    return {
      date,
      goal: { kwh: round2(goal.kwh / days), pesos: Math.round(goal.pesos / days) },
      rewardPoints: todayPoints,
      missions: today.map((m) => ({
        id: m.id,
        title: stored.wording?.[m.id]?.title ?? m.title,
        // The habit sentence stays; the saving is said for today instead of the whole period.
        why: m.why.replace(/\s*This saves around .*$/, "") +
          ` Today this saves about ${round2(m.kwhSaved / days)} kWh (~₱${Math.round(m.pesoValue / days / 100)}).`,
        how: m.how,
        appliance: m.appliance,
        effort: m.effort,
        kwhSaved: round2(m.kwhSaved / days),
        pesoValue: Math.round(m.pesoValue / days),
        percent: m.percent,
        share: round2(m.share),
        basis: m.basis,
        assumptions: m.assumptions,
        // Its share of today's points; at least 1 when the day earns any, so no Mission reads "+0".
        rewardPoints: todayPesos > 0 && todayPoints > 0 ? Math.max(1, Math.round((todayPoints * m.pesoValue) / days / todayPesos)) : 0,
      })),
      yesterday: yesterday
        ? { date: yesterday.day!, points: yesterday.points, savedKwh: yesterday.savedKwh, hasOutage: yesterday.hasOutage }
        : null,
      streak,
    };
  }

  /** Adds this period's reminders and any outage on Meralco's record for it (no Points for that month or day). */
  private async withReminders<T extends { period: string }>(sin: string, pending: T | Promise<T>) {
    const body = await pending;
    const [reminders, outages] = await Promise.all([this.reminders.forPeriod(sin, body.period), this.outageSource.outages(sin)]);
    const outage = outages.find((o) => o.period === body.period);
    return {
      ...body,
      reminders,
      outage: outage ? { date: outage.date ?? null, durationHours: outage.durationHours ?? null, description: outage.description ?? null } : null,
    };
  }

  /** "Remind me tonight" on a Mission in the current plan; kept on the server. */
  async remind(sin: string, missionId: string) {
    const current = await this.plan(sin);
    const daily = (current as { daily?: { missions: { id: string }[] } }).daily;
    const inPlan = current.missions.some((m) => m.id === missionId) || Boolean(daily?.missions.some((m) => m.id === missionId));
    if (!inPlan) throw new NotFoundException({ error: "This Mission is not in your plan." });
    await this.reminders.add(sin, current.period, missionId);
    return { missionId, reminded: true, reminders: await this.reminders.forPeriod(sin, current.period) };
  }

  async plan(sin: string) {
    await this.requireSetup(sin);
    const { target, goal, candidates } = await this.candidates(sin);
    let stored = await this.plans.find(sin);
    // A new plan when there is none for this period, the appliances changed since, a Mission no longer
    // fits the home, or a stored plan has fewer Missions than the home allows (e.g. saved before the three-Mission rule).
    const minSize = Math.min(MIN_PLAN, greedyPlan(candidates).length);
    // The appliances changed after the plan was made: the Missions should follow the new list.
    const appliancesAt = (await this.appliances.list(sin)).updatedAt;
    const stale = Boolean(stored && appliancesAt && new Date(appliancesAt).getTime() > new Date(stored.createdAt).getTime());
    if (!stored || stale || stored.period !== target.period || !stored.missions.every((m) => candidates.some((c) => c.id === m.id)) || stored.missions.length < minSize) {
      stored = await this.save(sin, target.period, goal, await this.pick(candidates, [], () => fallbackPlan(candidates)), []);
    }
    return this.withReminders(sin, this.present(sin, target.period, goal, candidates, stored));
  }

  /** Another combination when one exists; otherwise the same plan with `changed: false`. */
  async shuffle(sin: string) {
    await this.plan(sin);
    const { target, goal, candidates } = await this.candidates(sin);
    const current = (await this.plans.find(sin))!;
    const currentIds = current.missions.map((m) => m.id);
    const shown = current.shown ?? [currentIds];
    const seen = (ids: string[]) => shown.some((s) => [...s].sort().join(",") === [...ids].sort().join(","));
    const best = greedyPlan(candidates);
    const reachable = Math.min(1, planCoverage(best));
    const minSize = Math.min(MIN_PLAN, best.length);
    const alternative = (): Plan | null => {
      // Drop the current Missions one at a time (largest first), then all of them.
      const tries = [...currentIds.map((id) => [id]), currentIds];
      for (const exclude of tries) {
        const alt = fallbackPlan(candidates, { exclude });
        if (alt.missions.length >= Math.max(1, minSize) && alt.covered >= reachable - 1e-9 && !seen(alt.missions.map((m) => m.id))) return alt;
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
      return this.withReminders(sin, this.present(sin, target.period, goal, candidates, current, { changed: false }));
    }
    const stored = await this.save(sin, target.period, goal, next, fallback ? shown : []);
    return this.withReminders(sin, this.present(sin, target.period, goal, candidates, stored, { changed: true }));
  }

  /** Replaces one Mission and keeps the others. */
  async swap(sin: string, missionId: string) {
    await this.plan(sin);
    const { target, goal, candidates } = await this.candidates(sin);
    const current = (await this.plans.find(sin))!;
    const ids = current.missions.map((m) => m.id);
    if (!ids.includes(missionId)) throw new NotFoundException({ error: "This Mission is not in your plan." });
    const keep = ids.filter((id) => id !== missionId);
    const keptGroups = new Set(candidates.filter((c) => keep.includes(c.id)).map((c) => c.group));
    const replacement = candidates
      .filter((c) => !ids.includes(c.id) && !keptGroups.has(c.group))
      .sort((a, b) => b.kwhSaved - a.kwhSaved || a.id.localeCompare(b.id))[0];
    if (!replacement) throw new ConflictException({ error: "There is no other Mission to swap in for this home.", reason: "noAlternative" });
    const missions = [...candidates.filter((c) => keep.includes(c.id)), replacement].sort((a, b) => b.kwhSaved - a.kwhSaved);
    const wording = { ...(current.wording ?? {}) };
    delete wording[missionId];
    wording[replacement.id] = { title: replacement.title, why: replacement.why };
    const plan: Plan = { missions, wording, covered: planCoverage(missions), source: current.source === "ai" ? "ai" : "fallback" };
    const stored = await this.save(sin, target.period, goal, plan, current.shown ?? []);
    return this.withReminders(sin, this.present(sin, target.period, goal, candidates, stored, { swapped: { out: missionId, in: replacement.id } }));
  }
}
