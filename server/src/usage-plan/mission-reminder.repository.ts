/** "Remind me tonight" on a Mission, per Household and plan period. */
export interface MissionReminderRepository {
  forPeriod(sin: string, period: string): Promise<string[]>;
  add(sin: string, period: string, missionId: string): Promise<void>;
}

export class InMemoryMissionReminderRepository implements MissionReminderRepository {
  private readonly reminders = new Map<string, Set<string>>();
  async forPeriod(sin: string, period: string) { return [...(this.reminders.get(`${sin}:${period}`) ?? [])]; }
  async add(sin: string, period: string, missionId: string) {
    const key = `${sin}:${period}`;
    this.reminders.set(key, new Set([...(this.reminders.get(key) ?? []), missionId]));
  }
}
