import { readFileSync } from "node:fs";
import fixture from "../data/meralco-real-bill.json" with { type: "json" };
import type { MeralcoAccount } from "./meralco-accounts.js";
import type { MeralcoHouseholdRecord } from "./meralco-records.js";

/**
 * Real identifiers for the real-Bill Household, kept out of git (server/seed.local.json, named by
 * LOCAL_SEED_FILE). With them, scanning the paper Bill finds this Household; without them it
 * keeps its placeholder CAN and Service ID Number.
 */
export interface LocalSeed {
  realBill?: { can?: string; sin?: string; meterNumber?: string };
}

export function readLocalSeed(file = process.env.LOCAL_SEED_FILE): LocalSeed {
  if (!file) return {};
  try {
    return JSON.parse(readFileSync(file, "utf8")) as LocalSeed;
  } catch (error) {
    throw new Error(`LOCAL_SEED_FILE ${file} could not be read: ${(error as Error).message}`);
  }
}

/** The Household behind the one real Meralco Bill: 12 Bills (the real one last) and its payments. */
export function realBillHousehold(local: LocalSeed = readLocalSeed()): MeralcoHouseholdRecord {
  const record = structuredClone(fixture) as unknown as MeralcoHouseholdRecord & { note?: string };
  delete record.note;
  const ids = local.realBill ?? {};
  if (ids.can !== undefined) {
    if (!/^\d{10}$/.test(ids.can)) throw new Error("seed.local.json: realBill.can must be the 10-digit CAN");
    record.account.can = ids.can;
  }
  if (ids.sin !== undefined) {
    if (!/^\d{10,12}$/.test(ids.sin)) throw new Error("seed.local.json: realBill.sin must be the 10- to 12-digit Service ID Number");
    record.account.sin = ids.sin;
  }
  if (ids.meterNumber !== undefined) {
    record.account.meterNumber = ids.meterNumber;
    for (const bill of record.bills) bill.meterNumber = ids.meterNumber;
  }
  return record;
}

/** The account as the mock Meralco API exposes it (area only, never the address). */
export const meralcoAccountOf = (record: MeralcoHouseholdRecord): MeralcoAccount => ({
  can: record.account.can,
  sin: record.account.sin,
  area: record.account.area,
  meter_type: record.account.meter_type,
});
