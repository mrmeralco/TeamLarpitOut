import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { AppliancesService } from "../appliances/appliances.service.js";
import { POINTS_REPOSITORY, SETUP_REPOSITORY } from "../common/injection-tokens.js";
import { WELCOME_POINTS } from "../domain/welcome-points.js";
import type { PointsRepository } from "../usage-plan/points-repository.interface.js";
import type { AirconPattern, HomePattern, SetupRecord, SetupRepository } from "./setup-repository.js";

export const SETUP_STEPS = [
  { key: "household", label: "Household info" },
  { key: "appliances", label: "Appliances" },
  { key: "routine", label: "Typical day" },
] as const;

/**
 * Household Setup: a persistent checklist per Household. Finishing it grants
 * Welcome Points once per Household through the Points ledger (ADR-0004).
 */
@Injectable()
export class SetupService {
  constructor(
    @Inject(SETUP_REPOSITORY) private readonly repository: SetupRepository,
    @Inject(POINTS_REPOSITORY) private readonly points: PointsRepository,
    private readonly appliances: AppliancesService,
  ) {}

  private async hasAppliances(sin: string) {
    const saved = await this.appliances.list(sin);
    return { saved: saved.saved && saved.appliances.length > 0, aircon: saved.appliances.some((a) => a.type === "aircon") };
  }

  async status(sin: string) {
    const record = await this.repository.find(sin);
    const appliances = await this.hasAppliances(sin);
    const done: Record<(typeof SETUP_STEPS)[number]["key"], boolean> = {
      household: record.household !== undefined,
      appliances: appliances.saved,
      routine: record.routine !== undefined && (!appliances.aircon || record.routine.aircon !== null),
    };
    const steps = SETUP_STEPS.map((s) => ({ ...s, done: done[s.key] }));
    const doneCount = steps.filter((s) => s.done).length;
    const complete = record.completedAt !== undefined || doneCount === steps.length;
    if (complete && !record.completedAt) await this.complete(sin, record);
    const entries = await this.points.getEntries(sin);
    const welcome = entries.find((e) => e.source === "welcome");
    const unlocked = entries.some((e) => e.source === "bill_verified" && e.points > 0);
    return {
      steps,
      doneCount,
      total: steps.length,
      complete,
      household: record.household ?? null,
      routine: record.routine ?? null,
      hasAircon: appliances.aircon,
      welcomePoints: { points: WELCOME_POINTS, granted: Boolean(welcome), locked: Boolean(welcome) && !unlocked },
    };
  }

  async isComplete(sin: string): Promise<boolean> {
    return (await this.status(sin)).complete;
  }

  async saveHousehold(sin: string, size: number) {
    const record = await this.repository.find(sin);
    await this.repository.save(sin, { ...record, household: { size } });
    return this.status(sin);
  }

  async saveRoutine(sin: string, home: HomePattern, aircon: AirconPattern | null | undefined) {
    const { aircon: hasAircon } = await this.hasAppliances(sin);
    if (hasAircon && !aircon) throw new BadRequestException({ error: "Kailan karaniwang naka-on ang aircon?", issues: ["aircon"] });
    const record = await this.repository.find(sin);
    await this.repository.save(sin, { ...record, routine: { home, aircon: hasAircon ? aircon! : null } });
    return this.status(sin);
  }

  /** Marks setup done and grants Welcome Points once per Household, whichever login finishes it. */
  private async complete(sin: string, record: SetupRecord) {
    await this.repository.save(sin, { ...record, completedAt: new Date().toISOString() });
    const entries = await this.points.getEntries(sin);
    if (entries.some((e) => e.source === "welcome")) return;
    await this.points.addEntry(sin, {
      id: `welcome-${sin}`,
      sin,
      period: "",
      points: WELCOME_POINTS,
      savedPesos: 0,
      savedKwh: 0,
      baselineKwh: 0,
      actualKwh: 0,
      source: "welcome",
      hasOutage: false,
      excludedReason: null,
      description: `Welcome Points para sa Household Setup (naka-lock hanggang sa unang Verified Savings)`,
      createdAt: new Date().toISOString(),
    });
  }
}
