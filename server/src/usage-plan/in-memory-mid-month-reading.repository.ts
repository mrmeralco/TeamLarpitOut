import type { MidMonthReading, MidMonthReadingRepository } from "./mid-month-reading-repository.interface.js";

/** Demo storage keyed by Service ID Number; lost on restart. */
export class InMemoryMidMonthReadingRepository implements MidMonthReadingRepository {
  private readonly byHousehold = new Map<string, MidMonthReading>();

  async find(sin: string): Promise<MidMonthReading | null> {
    const reading = this.byHousehold.get(sin);
    return reading ? structuredClone(reading) : null;
  }

  async save(sin: string, reading: MidMonthReading): Promise<MidMonthReading> {
    this.byHousehold.set(sin, structuredClone(reading));
    return structuredClone(reading);
  }

  async delete(sin: string): Promise<void> {
    this.byHousehold.delete(sin);
  }
}
