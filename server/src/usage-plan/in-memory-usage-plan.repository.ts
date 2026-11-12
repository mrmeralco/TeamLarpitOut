import type { UsagePlan, UsagePlanRepository } from "./usage-plan-repository.interface.js";

/** Demo storage keyed by Service ID Number; lost on restart. */
export class InMemoryUsagePlanRepository implements UsagePlanRepository {
  private readonly byHousehold = new Map<string, UsagePlan>();

  async find(sin: string): Promise<UsagePlan | null> {
    const plan = this.byHousehold.get(sin);
    return plan ? structuredClone(plan) : null;
  }

  async save(sin: string, plan: UsagePlan): Promise<UsagePlan> {
    this.byHousehold.set(sin, structuredClone(plan));
    return structuredClone(plan);
  }
}
