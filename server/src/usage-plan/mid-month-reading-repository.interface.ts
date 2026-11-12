/**
 * Mid-month Reading repository (GLOSSARY / KuryenteKo §4).
 * Stores the household's cumulative typed meter reading for a billing period.
 */
export interface MidMonthReading {
  sin: string;
  period: string;
  reading: number;
  kwhSoFar: number;
  elapsedDays: number;
  remainingDays: number;
  readingDate?: string | null;
  createdAt: string;
}

export interface MidMonthReadingRepository {
  find(sin: string): Promise<MidMonthReading | null>;
  save(sin: string, reading: MidMonthReading): Promise<MidMonthReading>;
  delete(sin: string): Promise<void>;
}
