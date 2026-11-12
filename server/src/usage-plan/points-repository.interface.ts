export interface PointsEntry {
  id: string;
  sin: string;
  /** "YYYY-MM": the Bill's period, or the month of `day`. */
  period: string;
  /** Smart meter daily entries only: the Asia/Manila date (YYYY-MM-DD) the savings were measured on. */
  day?: string;
  points: number;
  savedPesos: number; // centavos
  savedKwh: number;
  baselineKwh: number;
  actualKwh: number;
  source: "bill_verified" | "meter_verified" | "self_report" | "redemption" | "welcome";
  hasOutage: boolean;
  excludedReason?: string | null;
  description: string;
  createdAt: string;
  rewardId?: string;
  rewardName?: string;
}

export interface PointsRepository {
  getEntries(sin: string): Promise<PointsEntry[]>;
  /** Rows are only added. An entry whose id is already in the ledger is ignored, so settling a Bill or day twice adds nothing. */
  addEntry(sin: string, entry: PointsEntry): Promise<void>;
  getBalance(sin: string): Promise<number>;
}
