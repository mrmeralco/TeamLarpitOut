import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { AppliancesService } from "../appliances/appliances.service.js";
import type { BillSource } from "../bills/bill-source.js";
import type { OutageSource } from "../bills/outage-source.js";
import type { CoachProvider } from "../coach/coach-provider.interface.js";
import { TemplateCoachProvider } from "../coach/template-coach.provider.js";
import {
  BILL_SOURCE,
  COACH_PROVIDER,
  MID_MONTH_READING_REPOSITORY,
  OUTAGE_SOURCE,
  POINTS_REPOSITORY,
  RATE_SCHEDULES,
  USAGE_PLAN_REPOSITORY,
  WEATHER_PROVIDER,
} from "../common/injection-tokens.js";
import { findAppliance } from "../domain/appliance-catalog.js";
import { baseline, nextPeriod, TARGET_CUTS, targetKwh, type TargetCut } from "../domain/baseline.js";
import type { Bill } from "../domain/bill.js";
import { compareTarget, detectHeatWave, forecastRange, forecastSingle } from "../domain/forecast.js";
import { calculateHeatSensitivity, predictKwhPerDay } from "../domain/heat-sensitivity.js";
import { rankMissions, type ApplianceUsage } from "../domain/mission-catalog.js";
import { computeVerifiedSavings, type VerifiedSavingsResult } from "../domain/points.js";
import { cost, type RateScheduleTable } from "../domain/rate-schedule.js";
import { lockedPoints } from "../domain/welcome-points.js";
import { SetupService } from "../setup/setup.service.js";
import type { WeatherProvider } from "../weather/weather-provider.interface.js";
import type { MidMonthReading, MidMonthReadingRepository } from "./mid-month-reading-repository.interface.js";
import type { PointsEntry, PointsRepository } from "./points-repository.interface.js";
import type { UsagePlan, UsagePlanRepository } from "./usage-plan-repository.interface.js";

const round2 = (x: number) => Math.round(x * 100) / 100;
const MONTHS = ["Enero", "Pebrero", "Marso", "Abril", "Mayo", "Hunyo", "Hulyo", "Agosto", "Setyembre", "Oktubre", "Nobyembre", "Disyembre"];
const monthName = (period: string) => MONTHS[Number(period.slice(5, 7)) - 1] ?? period;

/** KilosWatt for traditional meters: Baseline, Target, and Missions for one billing period. */
@Injectable()
export class UsagePlanService {
  private readonly templateCoach = new TemplateCoachProvider();

  constructor(
    @Inject(BILL_SOURCE) private readonly bills: BillSource,
    @Inject(RATE_SCHEDULES) private readonly rates: RateScheduleTable,
    @Inject(WEATHER_PROVIDER) private readonly weather: WeatherProvider,
    @Inject(USAGE_PLAN_REPOSITORY) private readonly plans: UsagePlanRepository,
    @Inject(MID_MONTH_READING_REPOSITORY) private readonly readings: MidMonthReadingRepository,
    @Inject(COACH_PROVIDER) private readonly coach: CoachProvider,
    @Inject(POINTS_REPOSITORY) private readonly pointsRepo: PointsRepository,
    @Inject(OUTAGE_SOURCE) private readonly outageSource: OutageSource,
    private readonly appliances: AppliancesService,
    private readonly setup: SetupService,
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
    if (!(await this.setup.isComplete(sin))) {
      throw new ConflictException({ error: "Tapusin ang setup para ma-unlock ang Missions.", reason: "setupIncomplete" });
    }
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

  /**
   * Forecast for the upcoming billing period.
   * Without reading: range based on history and 14-day weather forecast.
   * With typed reading: narrows to single projected figure compared with Target.
   * Heat wave raises consumption and flags a warning banner.
   */
  async forecast(sin: string) {
    const history = await this.bills.bills(sin);
    const latest = history.at(-1);
    if (!latest) throw new NotFoundException({ error: "Walang Bill para sa Household na ito." });
    const schedule = this.rates.get(latest.period);
    if (!schedule) {
      throw new UnprocessableEntityException({ error: `Walang Rate Schedule para sa ${latest.period}`, period: latest.period });
    }

    const withWeather = await Promise.all(
      history.map(async (b) => ({
        kwh: b.kwh,
        billingDays: b.billingDays,
        cddPerDay: (await this.weather.getCddPerDay(b.period)) ?? -1,
      })),
    );
    const sensitivity = calculateHeatSensitivity(withWeather);
    const period = nextPeriod(latest.period);
    const billingDays = latest.billingDays;
    const opts = { lifelineEligible: latest.lifelineEligible };

    const forecastWeather = this.weather.getForecast
      ? await this.weather.getForecast(period)
      : null;
    const cddForecast =
      forecastWeather?.cddPerDay ??
      (await this.weather.getCddPerDay(period)) ??
      (await this.weather.getCddPerDay(latest.period)) ??
      4.0;

    const heatWave = detectHeatWave({
      isHeatWave: forecastWeather?.isHeatWave,
      heatIndexMax: forecastWeather?.heatIndexMax,
      cddForecast,
      heatSensitivity: sensitivity.heatSensitivity,
    });

    const fallbackBaseDaily = latest.kwh / latest.billingDays;
    const baseDailyKwh = predictKwhPerDay(sensitivity, cddForecast, fallbackBaseDaily);
    const predictedKwhPerDay = baseDailyKwh + heatWave.kwhAdjustmentPerDay;

    const existingReading = await this.readings.find(sin);
    const hasActiveReading = Boolean(existingReading && existingReading.period === period);

    const sigma = sensitivity.sigma ?? 1.0;
    const heatSensitivityInfo = {
      value: sensitivity.heatSensitivity,
      source: sensitivity.source,
      label: sensitivity.label,
      sigma,
    };

    if (!hasActiveReading) {
      const range = forecastRange({
        predictedKwhPerDay,
        sigma,
        billingDays,
        schedule,
        lifelineEligible: latest.lifelineEligible,
      });

      return {
        currency: "PHP-centavos" as const,
        period,
        billingDays,
        rateSchedulePeriod: latest.period,
        hasReading: false,
        lastReading: latest.presentReading ?? null,
        range,
        projected: null,
        targetComparison: null,
        heatWave,
        heatSensitivity: heatSensitivityInfo,
      };
    }

    const r = existingReading!;
    const projected = forecastSingle({
      kwhSoFar: r.kwhSoFar,
      remainingDays: r.remainingDays,
      predictedKwhPerDay,
      billingDays,
      schedule,
      lifelineEligible: latest.lifelineEligible,
      reading: r.reading,
      elapsedDays: r.elapsedDays,
      readingDate: r.readingDate,
    });

    const planState = await this.plan(sin);
    let targetComparison: ReturnType<typeof compareTarget> | null = null;
    if (planState.active && planState.plan) {
      targetComparison = compareTarget({
        projectedPesos: projected.pesos,
        projectedKwh: projected.kwh,
        targetPesos: planState.plan.targetPesos,
        targetKwh: planState.plan.targetKwh,
      });
    }

    return {
      currency: "PHP-centavos" as const,
      period,
      billingDays,
      rateSchedulePeriod: latest.period,
      hasReading: true,
      lastReading: latest.presentReading ?? null,
      range: null,
      projected,
      targetComparison,
      heatWave,
      heatSensitivity: heatSensitivityInfo,
    };
  }

  /** Save a typed cumulative meter reading for the mid-month reading. */
  async saveReading(sin: string, input: { reading: number; elapsedDays?: number; readingDate?: string }) {
    const history = await this.bills.bills(sin);
    const latest = history.at(-1);
    if (!latest) throw new NotFoundException({ error: "Walang Bill para sa Household na ito." });

    if (latest.presentReading !== undefined && input.reading < latest.presentReading) {
      throw new BadRequestException({
        error: `Ang reading ay hindi maaaring mas mababa sa huling reading sa bill (${latest.presentReading}).`,
      });
    }

    const period = nextPeriod(latest.period);
    const billingDays = latest.billingDays;
    const elapsedDays = input.elapsedDays !== undefined
      ? Math.max(1, Math.min(billingDays - 1, input.elapsedDays))
      : Math.floor(billingDays / 2);
    const remainingDays = Math.max(1, billingDays - elapsedDays);
    const kwhSoFar = latest.presentReading !== undefined ? input.reading - latest.presentReading : input.reading;

    const reading: MidMonthReading = {
      sin,
      period,
      reading: input.reading,
      kwhSoFar: round2(kwhSoFar),
      elapsedDays,
      remainingDays,
      readingDate: input.readingDate ?? null,
      createdAt: new Date().toISOString(),
    };

    await this.readings.save(sin, reading);
    return this.forecast(sin);
  }

  async deleteReading(sin: string) {
    await this.readings.delete(sin);
    return this.forecast(sin);
  }

  /**
   * Points balance and ledger for the Household.
   * Auto-settles any newly arrived bills against their weather-adjusted baseline.
   */
  async getPoints(sin: string) {
    const history = await this.bills.bills(sin);
    if (!history.length) throw new NotFoundException({ error: "Walang Bill para sa Household na ito." });
    await this.autoSettle(sin);
    const [balance, entries] = await Promise.all([
      this.pointsRepo.getBalance(sin),
      this.pointsRepo.getEntries(sin),
    ]);
    const locked = Math.min(lockedPoints(entries), Math.max(balance, 0));
    return {
      currency: "PHP-centavos",
      balance,
      /** Welcome Points that cannot be spent until the first Verified Savings (ADR-0004). */
      lockedPoints: locked,
      spendable: balance - locked,
      history: entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    };
  }

  /**
   * Self-report for a Mission.
   * Per specification (§2.6): "Never self-reported. Tapping 'tapos na' earns nothing."
   */
  async selfReport(sin: string, _missionId?: string) {
    const history = await this.bills.bills(sin);
    if (!history.length) throw new NotFoundException({ error: "Walang Bill para sa Household na ito." });
    const balance = await this.pointsRepo.getBalance(sin);
    return {
      awardedPoints: 0,
      balance,
      message: "Ang Points ay ibinibigay lamang mula sa Verified Savings sa susunod na Bill, hindi sa self-report.",
    };
  }

  private async autoSettle(sin: string) {
    const history = await this.bills.bills(sin);
    if (history.length < 2) return;
    const existing = await this.pointsRepo.getEntries(sin);
    const settled = new Set(existing.filter((e) => e.source === "bill_verified").map((e) => e.period));
    const plan = await this.plans.find(sin);

    if (plan) {
      for (let i = 1; i < history.length; i++) {
        const b = history[i]!;
        if (b.period >= plan.period && !settled.has(b.period)) {
          const prev = history[i - 1]!;
          await this.settlePeriod(sin, prev, b);
          settled.add(b.period);
        }
      }
    } else {
      const latest = history[history.length - 1]!;
      if (!settled.has(latest.period)) {
        const prev = history[history.length - 2]!;
        await this.settlePeriod(sin, prev, latest);
        settled.add(latest.period);
      }
    }
  }

  private async settlePeriod(sin: string, prev: Bill, actual: Bill): Promise<VerifiedSavingsResult> {
    const history = await this.bills.bills(sin);
    const priorBills = history.filter((b) => b.period < actual.period);
    const withWeather = await Promise.all(
      (priorBills.length ? priorBills : history).map(async (b) => ({
        kwh: b.kwh,
        billingDays: b.billingDays,
        cddPerDay: (await this.weather.getCddPerDay(b.period)) ?? -1,
      })),
    );
    const sensitivity = calculateHeatSensitivity(withWeather);
    const schedule = this.rates.get(actual.period) ?? this.rates.get(prev.period)!;
    const cddLast = await this.weather.getCddPerDay(prev.period);
    const cddActual = await this.weather.getCddPerDay(actual.period);
    const hasOutage = await this.outageSource.hasOutage(sin, actual.period);

    const result = computeVerifiedSavings({
      previousBill: prev,
      actualBill: actual,
      schedule,
      heatSensitivity: sensitivity.heatSensitivity,
      cddPerDayPrevious: cddLast,
      cddPerDayActual: cddActual,
      hasOutage,
    });

    const desc = result.hasOutage
      ? `May naitalang brownout/outage noong ${monthName(result.period)} (${result.period}) kaya hindi kwalipikado sa Points.`
      : result.points > 0
        ? `Verified Savings sa Bill ng ${monthName(result.period)} (${result.savedKwh} kWh natipid)`
        : `Walang Verified Savings para sa Bill ng ${monthName(result.period)}`;

    const entry: PointsEntry = {
      id: `pts-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      sin,
      period: result.period,
      points: result.points,
      savedPesos: result.savedPesos,
      savedKwh: result.savedKwh,
      baselineKwh: result.baselineKwh,
      actualKwh: result.actualKwh,
      source: "bill_verified",
      hasOutage: result.hasOutage,
      excludedReason: result.excludedReason,
      description: desc,
      createdAt: new Date().toISOString(),
    };

    await this.pointsRepo.addEntry(sin, entry);
    return result;
  }
}
