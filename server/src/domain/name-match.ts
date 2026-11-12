/**
 * Does the name printed on a Bill belong to the person linking it?
 * Bills print names as "DELA CRUZ, JUAN P." and people type "Juan Dela Cruz", so the check
 * compares name words, not strings: order, case, accents, punctuation, titles, suffixes and
 * middle initials are ignored, and one wrong letter in a long word is forgiven (photo misreads).
 */

export type NameCheck =
  | { status: "match" }
  | { status: "mismatch"; billNameMasked: string }
  | { status: "unread" };

const IGNORED = new Set(["MR", "MRS", "MS", "MISS", "DR", "ENGR", "ATTY", "JR", "SR", "II", "III", "IV", "V"]);

/** "Dela Cruz, Juan P." → ["DELA", "CRUZ", "JUAN"]. Initials and titles are dropped. */
export function nameWords(raw: string | null | undefined): string[] {
  if (typeof raw !== "string") return [];
  return raw
    .normalize("NFD").replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !IGNORED.has(w));
}

function closeEnough(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1) return false;
  // At most one edit (Levenshtein ≤ 1).
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** "DELA CRUZ, JUAN P." → "D*** C*** J***": enough to recognise, not to read off. */
export function maskName(raw: string): string {
  return nameWords(raw).map((w) => `${w[0]}***`).join(" ");
}

/**
 * Match when every word of the shorter name appears in the other (so a second given name on
 * either side is fine). A missing name on either side is "unread".
 */
export function compareNames(accountName: string | null | undefined, billName: string | null | undefined): NameCheck {
  const mine = nameWords(accountName);
  const bill = nameWords(billName);
  if (bill.length === 0 || mine.length === 0) return { status: "unread" };
  const unused = [...bill];
  let matched = 0;
  for (const w of mine) {
    const k = unused.findIndex((b) => closeEnough(w, b));
    if (k >= 0) { matched++; unused.splice(k, 1); }
  }
  // Every word of the shorter name must be on the other one, so a shared (even two-word)
  // surname like "Dela Cruz" is never enough by itself.
  const shorter = Math.min(mine.length, bill.length);
  const ok = matched === shorter && matched >= Math.min(2, Math.max(mine.length, bill.length));
  return ok ? { status: "match" } : { status: "mismatch", billNameMasked: maskName(billName!) };
}
