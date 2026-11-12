import type { TargetCut } from "../domain/baseline.js";
import type { UsagePlan, UsagePlanRepository } from "../usage-plan/usage-plan-repository.interface.js";
import type { Sql } from "./database.module.js";
import { TtlCache } from "./ttl-cache.js";

interface PlanRow {
  period: string;
  cut: number;
  target_kwh: string;
  target_centavos: string;
  aircon_setting: number | null;
  source: UsagePlan["source"] | null;
  wording: UsagePlan["wording"] | null;
  shown: UsagePlan["shown"] | null;
  created_at: Date;
  started_at: Date | null;
}

interface MissionRow {
  mission_id: string;
  title: string;
  kwh_saved: string;
  peso_value: string;
}

/**
 * Target and Mission Plan in `public.usage_plans` + `public.usage_plan_missions`, one plan per
 * Household per period. `find` returns the latest period's plan, as the in-memory version kept only the last one.
 */
export class PgUsagePlanRepository implements UsagePlanRepository {
  private readonly cache = new TtlCache<UsagePlan | null>(60_000);

  constructor(private readonly sql: Sql) {}

  find(sin: string): Promise<UsagePlan | null> {
    return this.cache.get(sin, () => this.load(sin));
  }

  private async load(sin: string): Promise<UsagePlan | null> {
    const [plan] = await this.sql<PlanRow[]>`
      select period, cut, target_kwh, target_centavos, aircon_setting, source, wording, shown, created_at, started_at
      from public.usage_plans where sin = ${sin} order by period desc, created_at desc limit 1`;
    if (!plan) return null;
    const missions = await this.sql<MissionRow[]>`
      select mission_id, title, kwh_saved, peso_value from public.usage_plan_missions
      where sin = ${sin} and period = ${plan.period} order by position, mission_id`;
    const result: UsagePlan = {
      period: plan.period,
      cut: plan.cut as TargetCut,
      targetKwh: Number(plan.target_kwh),
      targetPesos: Number(plan.target_centavos),
      airconSetting: plan.aircon_setting,
      missions: missions.map((m) => ({ id: m.mission_id, title: m.title, kwhSaved: Number(m.kwh_saved), pesoValue: Number(m.peso_value) })),
      createdAt: new Date(plan.created_at).toISOString(),
    };
    if (plan.source !== null) result.source = plan.source;
    if (plan.wording !== null) result.wording = plan.wording;
    if (plan.shown !== null) result.shown = plan.shown;
    if (plan.started_at !== null) result.startedAt = new Date(plan.started_at).toISOString();
    return result;
  }

  async save(sin: string, plan: UsagePlan): Promise<UsagePlan> {
    await this.sql.begin(async (tx) => {
      const row = {
        sin,
        period: plan.period,
        cut: plan.cut,
        target_kwh: plan.targetKwh,
        target_centavos: Math.round(plan.targetPesos),
        aircon_setting: plan.airconSetting,
        source: plan.source ?? null,
        wording: plan.wording ? tx.json(plan.wording as never) : null,
        shown: plan.shown ? tx.json(plan.shown as never) : null,
        created_at: new Date(plan.createdAt),
        // When the Household first started Missions (ADR-0008); kept across saves.
        started_at: plan.startedAt ? new Date(plan.startedAt) : null,
      };
      await tx`
        insert into public.usage_plans ${tx(row)}
        on conflict (sin, period) do update set
          cut = excluded.cut,
          target_kwh = excluded.target_kwh,
          target_centavos = excluded.target_centavos,
          aircon_setting = excluded.aircon_setting,
          source = excluded.source,
          wording = excluded.wording,
          shown = excluded.shown,
          created_at = excluded.created_at,
          started_at = coalesce(public.usage_plans.started_at, excluded.started_at)`;
      await tx`delete from public.usage_plan_missions where sin = ${sin} and period = ${plan.period}`;
      if (plan.missions.length > 0) {
        const missions = plan.missions.map((m, position) => ({
          sin,
          position,
          period: plan.period,
          mission_id: m.id,
          title: m.title,
          kwh_saved: m.kwhSaved,
          peso_value: Math.round(m.pesoValue),
        }));
        await tx`insert into public.usage_plan_missions ${tx(missions)}`;
      }
    });
    // find() returns the latest period's plan: drop the cached one so it's re-read after any save.
    this.cache.delete(sin);
    return structuredClone(plan);
  }
}
