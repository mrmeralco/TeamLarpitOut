import { BadGatewayException, BadRequestException, Inject, Injectable, ServiceUnavailableException, UnprocessableEntityException } from "@nestjs/common";
import { AirconPatternService } from "../appliances/aircon-pattern.service.js";
import { AppliancesService } from "../appliances/appliances.service.js";
import { POINTS_REPOSITORY, SETUP_REPOSITORY, VISION_PROVIDER } from "../common/injection-tokens.js";
import { findAppliance, UNKNOWN } from "../domain/appliance-catalog.js";
import type { Household } from "../domain/household.js";
import { appliancesFromGrid, GRID_TYPES, gridCatalog, MAX_PER_TYPE, ratingUnit, routineHours, type GridType } from "../domain/routine-presets.js";
import { VisionUnavailableError, type BillImage, type VisionProvider } from "../vision/vision-provider.interface.js";
import { hasVerifiedSavings, WELCOME_POINTS } from "../domain/welcome-points.js";
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
    private readonly pattern: AirconPatternService,
    @Inject(VISION_PROVIDER) private readonly vision: VisionProvider,
  ) {}

  private async hasAppliances(sin: string) {
    const saved = await this.appliances.list(sin);
    return { saved: saved.saved && saved.appliances.length > 0, aircon: saved.appliances.some((a) => a.type === "aircon") };
  }

  async status(sin: string) {
    // Independent reads go out together (each is a round trip to the database).
    const [record, appliances, firstEntries] = await Promise.all([this.repository.find(sin), this.hasAppliances(sin), this.points.getEntries(sin)]);
    const done: Record<(typeof SETUP_STEPS)[number]["key"], boolean> = {
      household: record.household !== undefined,
      appliances: appliances.saved,
      routine: record.routine !== undefined && (!appliances.aircon || record.routine.aircon !== null),
    };
    const steps = SETUP_STEPS.map((s) => ({ ...s, done: done[s.key] }));
    const doneCount = steps.filter((s) => s.done).length;
    const complete = record.completedAt !== undefined || doneCount === steps.length;
    let entries = firstEntries;
    if (complete && !record.completedAt) {
      await this.complete(sin, record);
      entries = await this.points.getEntries(sin); // now with the Welcome Points
    }
    const welcome = entries.find((e) => e.source === "welcome");
    const unlocked = hasVerifiedSavings(entries);
    return {
      steps,
      doneCount,
      total: steps.length,
      complete,
      household: record.household ?? null,
      routine: record.routine ?? null,
      hasAircon: appliances.aircon,
      grid: record.grid ?? null,
      gridCatalog: gridCatalog(record.photos),
      welcomePoints: { points: WELCOME_POINTS, granted: Boolean(welcome), locked: Boolean(welcome) && !unlocked },
      /** Eelio's Missions onboarding was already shown for this Household (on any device). */
      onboardingSeen: record.onboardingSeenAt !== undefined,
    };
  }

  async markOnboardingSeen(sin: string) {
    const record = await this.repository.find(sin);
    if (!record.onboardingSeenAt) await this.repository.save(sin, { ...record, onboardingSeenAt: new Date().toISOString() });
    return this.status(sin);
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
    if (hasAircon && !aircon) throw new BadRequestException({ error: "When is the aircon usually on?", issues: ["aircon"] });
    const record = await this.repository.find(sin);
    const next: SetupRecord = { ...record, routine: { home, aircon: hasAircon ? aircon! : null } };
    await this.repository.save(sin, next);
    if (next.grid && (await this.appliances.list(sin)).updatedAt === next.gridWrittenAt) await this.writeGridAppliances(sin, next);
    return this.status(sin);
  }

  /** Setup step 2: the tap grid. Replaces the appliance list with typical values for what was tapped. */
  async saveGrid(sin: string, counts: Record<string, number>) {
    const issues: string[] = [];
    const clean: Partial<Record<GridType, number>> = {};
    for (const [type, n] of Object.entries(counts)) {
      if (!(GRID_TYPES as readonly string[]).includes(type)) issues.push(`${type}: not in the list`);
      else if (!Number.isInteger(n) || n < 0 || n > MAX_PER_TYPE) issues.push(`${type}: 0–${MAX_PER_TYPE} only`);
      else if (n > 0) clean[type as GridType] = n;
    }
    if (issues.length) throw new BadRequestException({ error: "Something is wrong in the appliance list.", issues });
    if (Object.keys(clean).length === 0) throw new BadRequestException({ error: "Pick at least one appliance.", issues: ["counts"] });
    const record = await this.repository.find(sin);
    // A photo estimate stays only for appliances still in the grid.
    const photos = Object.fromEntries(Object.entries(record.photos ?? {}).filter(([type]) => clean[type as GridType]));
    const next: SetupRecord = { ...record, grid: clean, photos: Object.keys(photos).length ? photos : undefined };
    if (next.routine && !clean.aircon) next.routine = { ...next.routine, aircon: null };
    await this.repository.save(sin, next);
    await this.writeGridAppliances(sin, next);
    return this.status(sin);
  }

  private async writeGridAppliances(sin: string, record: SetupRecord) {
    const list = appliancesFromGrid({
      counts: record.grid!,
      home: record.routine?.home ?? "eveningsWeekends",
      aircon: record.routine?.aircon ?? null,
      answers: Object.fromEntries(Object.entries(record.photos ?? {}).map(([type, photo]) => [type, photo!.answers])),
    });
    const saved = await this.appliances.save(sin, list as never);
    await this.repository.save(sin, { ...record, gridWrittenAt: saved.updatedAt });
  }

  /** Optional "Snap your aircon": the vision model estimates its size; tagged "Estimated from photo". */
  /**
   * "Snap an appliance": recognises any tap-grid appliance in a photo and answers that type's
   * visual questions, so its tile (and the appliance list) use a closer rating than the typical
   * value. One estimate per type: a later photo of the same type replaces it.
   */
  async appliancePhoto(sin: string, image: BillImage) {
    if (!this.vision.readAppliancePhoto) throw new ServiceUnavailableException({ error: "Appliance photos aren't available yet. Tap the appliance instead." });
    let raw;
    try {
      raw = await this.vision.readAppliancePhoto(image);
    } catch (err) {
      if (err instanceof VisionUnavailableError) throw new ServiceUnavailableException({ error: "Photo estimates are not set up yet. Tap the appliance instead." });
      throw new BadGatewayException({ error: "We couldn't read the photo right now. Try again or tap the appliance instead." });
    }
    const type = (GRID_TYPES as readonly string[]).includes(raw?.type as string) ? (raw!.type as GridType) : null;
    if (!raw?.readable || !type) {
      throw new UnprocessableEntityException({ error: "We couldn't recognise an appliance in the photo. Retake it or tap the appliance instead." });
    }
    const def = findAppliance(type)!;
    // Only this type's questions, and only the options the catalog offers; anything else is "I don't know".
    const answers = Object.fromEntries(def.questions.map((q) => {
      const value = raw.answers?.[q.key];
      return [q.key, q.options.some((o) => o.value === value) ? value! : UNKNOWN];
    }));
    const estimated = Object.values(answers).some((v) => v !== UNKNOWN);
    const kwh = Math.round((def.rating(answers) ?? def.defaultRating) * 1000) / 1000;
    if (estimated) {
      const record = await this.repository.find(sin);
      const next: SetupRecord = { ...record, photos: { ...record.photos, [type]: { answers, kwh } } };
      await this.repository.save(sin, next);
      if (next.grid?.[type] && (await this.appliances.list(sin)).updatedAt === next.gridWrittenAt) await this.writeGridAppliances(sin, next);
    }
    return {
      type, label: def.label, answers, kwh, unit: ratingUnit(type),
      tag: estimated ? "Estimated from photo" as const : "Typical value" as const,
    };
  }

  /**
   * "Your 12 bills agree": compares the chosen aircon routine with the 12-bill estimate (#13)
   * on a traditional meter, or the smart meter pattern (#14).
   */
  async airconCheck(sin: string, household: Household, aircon: import("./setup-repository.js").AirconPattern) {
    const chosen = routineHours("aircon", "eveningsWeekends", aircon)!;
    const answers = (await this.repository.find(sin)).photos?.aircon?.answers;
    if (household.meter_type === "traditional") {
      const proposal = await this.appliances.airconProposal(sin, household, answers);
      if (!proposal.canPropose || proposal.hours === null) return { source: "bills" as const, available: false, chosenHours: chosen, reason: proposal.reason };
      const agrees = Math.abs(proposal.hours - chosen) <= 2;
      return {
        source: "bills" as const, available: true, chosenHours: chosen, estimatedHours: proposal.hours, agrees,
        message: agrees
          ? `Your 12 bills agree: about ${proposal.hours} hours a day.`
          : `Your 12 bills suggest about ${proposal.hours} hours a day. You can still keep your pick.`,
      };
    }
    try {
      const proposal = await this.pattern.propose(household, { ...(answers ? { answers } : {}) } as never);
      if (!proposal.canPropose) return { source: "smartMeter" as const, available: false, chosenHours: chosen, reason: proposal.reason };
      const hours = proposal.hours;
      const agrees = Math.abs(hours - chosen) <= 2;
      return {
        source: "smartMeter" as const, available: true, chosenHours: chosen, estimatedHours: hours, agrees, routine: proposal.routine,
        message: agrees
          ? `Your smart meter agrees: about ${hours} hours, ${proposal.routine.start}–${proposal.routine.end}.`
          : `Your smart meter suggests about ${hours} hours, ${proposal.routine.start}–${proposal.routine.end}.`,
      };
    } catch {
      return { source: "smartMeter" as const, available: false, chosenHours: chosen, reason: "readings-unavailable" };
    }
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
      description: `Welcome Points for Household Setup (locked until your first Verified Savings)`,
      createdAt: new Date().toISOString(),
    });
  }
}
