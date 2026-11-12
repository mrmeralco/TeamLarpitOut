import { BadRequestException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { AppliancesService } from "../appliances/appliances.service.js";
import type { BillSource } from "../bills/bill-source.js";
import type { CoachProvider } from "../coach/coach-provider.interface.js";
import { TemplateCoachProvider } from "../coach/template-coach.provider.js";
import {
  BILL_SOURCE,
  COACH_PROVIDER,
  RATE_SCHEDULES,
  USAGE_PLAN_REPOSITORY,
  WEATHER_PROVIDER,
} from "../common/injection-tokens.js";
import { findAppliance } from "../domain/appliance-catalog.js";
import { baseline, nextPeriod, TARGET_CUTS, targetKwh, type TargetCut } from "../domain/baseline.js";
import { calculateHeatSensitivity } from "../domain/heat-sensitivity.js";
import { rankMissions, type ApplianceUsage } from "../domain/mission-catalog.js";
import { cost, type RateScheduleTable } from "../domain/rate-schedule.js";
import type { WeatherProvider } from "../weather/weather-provider.interface.js";
import type { UsagePlan, UsagePlanRepository } from "./usage-plan-repository.interface.js";

const round2 = (x: number) => Math.round(x * 100) / 100;

/** KilosWatt for traditional meters: Baseline, Target, and Missions for one billing period. */
@Injectable()
export class UsagePlanService {
  private readonly templateCoach = new TemplateCoachProvider();

  constructor(
    @Inject(BILL_SOURCE) private readonly bills: BillSource,
    @Inject(RATE_SCHEDULES) private readonly rates: RateScheduleTable,
    @Inject(WEATHER_PROVIDER) private readonly weather: WeatherProvider,
    @Inject(USAGE_PLAN_REPOSITORY) private readonly plans: UsagePlanRepository,
    @Inject(COACH_PROVIDER) private readonly coach: CoachProvider,
    private readonly appliances: AppliancesService,
  ) {}

  /** The weather- and days-adjusted Baseline for next period, and the Target for each cut. */
  async target(sin: string) {
    const history = await this.bills.bills(sin);
    const latest = history.at(-1);
    if (!latest) throw new NotFoundException({ error: "Walang Bill para sa Household na ito." });
    const schedule = this.rates.get(latest.period);
    if (!schedule) {
      throw new UnprocessableEntityException({ error: `Walang Rate Schedule para sa ${latest.period}`, period: latest.period });
    }

    const withWeather = await Promise.all(
      history.map(async (b) => ({ kwh: b.kwh, billingDays: b.billingDays, cddPerDay: (await this.weather.getCddPerDay(b.period)) ?? -1 })),
    );
    const sensitivity = calculateHeatSensitivity(withWeather);
    const period = nextPeriod(latest.period);
    const billingDays = latest.billingDays;
    const base = baseline({
      lastKwh: latest.kwh,
      lastBillingDays: latest.billingDays,
      nextBillingDays: billingDays,
      heatSensitivity: sensitivity.heatSensitivity,
      cddPerDayLast: await this.weather.getCddPerDay(latest.period),
      cddPerDayNext: await this.weather.getCddPerDay(period),
    });

    const opts = { lifelineEligible: latest.lifelineEligible };
    const baselinePesos = cost(base.kwh, billingDays, schedule, opts);
    return {
      currency: "PHP-centavos",
      period,
      billingDays,
      /** Next period's rates aren't published yet; the latest Bill's Rate Schedule is used. */
      rateSchedulePeriod: latest.period,
      baseline: {
        kwh: round2(base.kwh),
        kwhPerDay: round2(base.kwhPerDay),
        pesos: baselinePesos,
        weatherAdjusted: base.weatherAdjusted,
        weatherKwhPerDay: round2(base.weatherKwhPerDay),
        heatSensitivity: { value: sensitivity.heatSensitivity, source: sensitivity.source, label: sensitivity.label },
      },
      options: TARGET_CUTS.map((cut) => {
        const kwh = targetKwh(base.kwh, cut);
        const pesos = cost(kwh, billingDays, schedule, opts);
        return { cut, kwh: round2(kwh), pesos, savings: baselinePesos - pesos };
      }),
    };
  }

  /** Missions that apply to this household, highest computed peso value first, each worded by the Coach. */
  async missions(sin: string, airconSetting?: number) {
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
    const ranked = rankMissions({ billingDays: usage.bill.billingDays, usage: applianceUsage, airconSetting }, perKwhRate);

    const missions = await Promise.all(
      ranked.map(async (m) => {
        const facts = { id: m.id, title: m.title, kwhSaved: m.kwhSaved, pesoValue: m.pesoValue };
        const message = await this.coach.phraseMission(facts).catch(() => this.templateCoach.phraseMission(facts));
        return { ...m, message };
      }),
    );
    return {
      currency: "PHP-centavos",
      period: nextPeriod(usage.bill.period),
      perKwhRate: Math.round(perKwhRate * 10_000) / 10_000,
      missions,
    };
  }

  /** The Household's plan; `active` is false once a newer Bill has started another period. */
  async plan(sin: string) {
    const plan = await this.plans.find(sin);
    if (!plan) return { active: false, plan: null };
    const latest = (await this.bills.bills(sin)).at(-1);
    return { active: Boolean(latest) && plan.period === nextPeriod(latest!.period), plan };
  }

  async savePlan(sin: string, input: { cut: TargetCut; missionIds: string[]; airconSetting?: number }) {
    const [target, available] = await Promise.all([this.target(sin), this.missions(sin, input.airconSetting)]);
    const chosen = input.missionIds.map((id) => available.missions.find((m) => m.id === id));
    const missing = input.missionIds.filter((_, i) => !chosen[i]);
    if (missing.length) {
      throw new BadRequestException({ error: "May Mission na hindi para sa bahay na ito.", issues: missing });
    }
    const option = target.options.find((o) => o.cut === input.cut)!;
    const plan: UsagePlan = {
      period: target.period,
      cut: input.cut,
      targetKwh: option.kwh,
      targetPesos: option.pesos,
      airconSetting: input.airconSetting ?? null,
      missions: chosen.map((m) => ({ id: m!.id, title: m!.title, kwhSaved: m!.kwhSaved, pesoValue: m!.pesoValue })),
      createdAt: new Date().toISOString(),
    };
    return { active: true, plan: await this.plans.save(sin, plan) };
  }
}
