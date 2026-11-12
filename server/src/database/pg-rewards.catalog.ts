import type { RewardItem, RewardsCatalog } from "../domain/rewards.js";
import type { Sql } from "./database.module.js";

interface RewardRow {
  id: string;
  name: string;
  category: RewardItem["category"];
  partner_name: string;
  points_cost: number;
  description: string;
  is_sample: boolean;
}

/** Active partner Rewards in `public.rewards`, read on every request so a price change shows at once. */
export class PgRewardsCatalog implements RewardsCatalog {
  constructor(private readonly sql: Sql) {}

  async list(): Promise<RewardItem[]> {
    const rows = await this.sql<RewardRow[]>`
      select id, name, category, partner_name, points_cost, description, is_sample
      from public.rewards where active order by sort_order, points_cost, id`;
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      partnerName: r.partner_name,
      pointsCost: r.points_cost,
      description: r.description,
      tag: r.is_sample ? "sample rewards" : "rewards",
      isSampleReward: r.is_sample,
    }));
  }
}
