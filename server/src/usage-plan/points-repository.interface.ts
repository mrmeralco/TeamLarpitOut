export interface PointsEntry {
  id: string;
  sin: string;
  period: string;
  points: number;
  savedPesos: number; // centavos
  savedKwh: number;
  baselineKwh: number;
  actualKwh: number;
  source: "bill_verified" | "self_report" | "redemption" | "welcome";
  hasOutage: boolean;
  excludedReason?: string | null;
  description: string;
  createdAt: string;
  rewardId?: string;
  rewardName?: string;
}

export interface PointsRepository {
  getEntries(sin: string): Promise<PointsEntry[]>;
  addEntry(sin: string, entry: PointsEntry): Promise<void>;
  getBalance(sin: string): Promise<number>;
}
