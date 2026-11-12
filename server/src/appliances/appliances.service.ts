import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { BillSource } from "../bills/bill-source.js";
import { APPLIANCE_REPOSITORY, BILL_SOURCE, RATE_SCHEDULES } from "../common/injection-tokens.js";
import { findAppliance, type ApplianceType } from "../domain/appliance-catalog.js";
import {
  calibrateToBill,
  estimateAppliance,
  validateAppliance,
  type ApplianceInput,
} from "../domain/appliance-usage.js";
import { costLines, type RateScheduleTable } from "../domain/rate-schedule.js";
import type { ApplianceRepository } from "./appliance-repository.interface.js";
import type { ApplianceDto } from "./dto/save-appliances.dto.js";

@Injectable()
export class AppliancesService {
  constructor(
    @Inject(APPLIANCE_REPOSITORY) private readonly repository: ApplianceRepository,
    @Inject(BILL_SOURCE) private readonly bills: BillSource,
    @Inject(RATE_SCHEDULES) private readonly rates: RateScheduleTable,
  ) {}

  /** The Household's saved appliances; `saved: false` means the survey hasn't been answered yet. */
  async list(sin: string) {
    const stored = await this.repository.find(sin);
    if (!stored) return { saved: false, updatedAt: null, appliances: [] };
    return { saved: true, updatedAt: stored.updatedAt, appliances: stored.appliances.map((a) => this.describe(a)) };
  }

  /** Replace the Household's appliances (the survey, or an edit of it). */
  async save(sin: string, input: ApplianceDto[]) {
    const appliances = input.map((a) => this.normalize(a));
    const errors = appliances.flatMap(validateAppliance);
    if (errors.length) throw new BadRequestException({ error: "May mali sa listahan ng appliance.", issues: errors });
    const stored = await this.repository.save(sin, appliances);
    return { saved: true, updatedAt: stored.updatedAt, appliances: stored.appliances.map((a) => this.describe(a)) };
  }

  /**
   * Each saved appliance's use on the latest Bill, calibrated so the total
   * equals the Bill's kWh. Shared by "Saan napupunta?" and Missions.
   */
  async calibratedUsage(sin: string) {
    const stored = await this.repository.find(sin);
    if (!stored || stored.appliances.length === 0) {
      throw new ConflictException({ error: "Ilista muna ang mga appliance sa bahay." });
    }
    const latest = (await this.bills.bills(sin)).at(-1);
    if (!latest) throw new NotFoundException({ error: "Walang Bill para sa Household na ito." });
    const schedule = this.rates.get(latest.period);
    if (!schedule) {
      throw new UnprocessableEntityException({ error: `Walang Rate Schedule para sa ${latest.period}`, period: latest.period });
    }

    const lines = costLines(latest.kwh, latest.billingDays, schedule);
    const perKwhCharges = lines.filter((l) => l.kind === "perKwh").reduce((s, l) => s + l.amount, 0);
    const fixedCharges = lines.filter((l) => l.kind === "fixed").reduce((s, l) => s + l.amount, 0);

    const estimates = stored.appliances.map(estimateAppliance);
    if (estimates.every((e) => e.kwhPerDay === 0)) {
      throw new ConflictException({ error: "Lahat ng appliance ay walang oras ng gamit. Lagyan ng routine." });
    }
    const rows = calibrateToBill(estimates, stored.appliances, latest, perKwhCharges);
    return { bill: latest, schedule, perKwhCharges, fixedCharges, appliances: stored.appliances, estimates, rows };
  }

  /** "Saan napupunta?" for the Household's latest Bill. */
  async breakdown(sin: string) {
    const { bill, perKwhCharges, fixedCharges, rows: calibrated } = await this.calibratedUsage(sin);
    const rows = calibrated.map((r) => ({ ...r, label: findAppliance(r.type)!.label }));
    return {
      currency: "PHP-centavos",
      bill: { period: bill.period, kwh: bill.kwh, billingDays: bill.billingDays },
      rows: rows.sort((a, b) => b.kwh - a.kwh),
      totals: {
        kwh: rows.reduce((s, r) => s + Math.round(r.kwh * 100), 0) / 100,
        perKwhCharges,
        /** Charged per customer regardless of use, so no appliance causes them. */
        fixedCharges,
      },
    };
  }

  private normalize(a: ApplianceDto): ApplianceInput {
    const def = findAppliance(a.type);
    const out: ApplianceInput = { type: a.type as ApplianceType, quantity: a.quantity ?? 1, answers: a.answers ?? {} };
    // Keep only the routine this appliance is asked for.
    if (def?.routine === "timeRanges") out.timeRanges = a.timeRanges ?? [];
    if (def?.routine === "usesPerWeek") out.usesPerWeek = a.usesPerWeek;
    return out;
  }

  private describe(a: ApplianceInput) {
    const def = findAppliance(a.type)!;
    const e = estimateAppliance(a);
    return {
      ...a,
      label: def.label,
      routine: def.routine,
      source: e.source,
      sourceLabel: e.sourceLabel,
      hoursPerDay: e.hoursPerDay === null || def.routine !== "timeRanges" ? null : Math.round(e.hoursPerDay * 100) / 100,
      estimatedKwhPerDay: Math.round(e.kwhPerDay * 1000) / 1000,
    };
  }
}
