/**
 * Adapter for the edge-picks feed.
 *
 * The fixture is a JSON array. One object is one graded (or still-open) play.
 * This module only renames and classifies fields that are already on the row.
 * It does not invent a DraftKings price, a player status, a closing line, or a unit stake.
 *
 * Shape (one row):
 *   sport, game, start, start_iso, pick, market,
 *   hr, hr_prob, fair_prob, fair, edge,
 *   hr_event, pin_id, date, picked_et, result, hr_fetched, rank, graded_et
 */

export type EdgeGrade = "win" | "loss" | "void" | "push" | "pending" | "unknown";

export type EdgeMarketTag = "sog" | "assist" | "player";

export type EdgePick = {
  sport: string;
  game: string;
  start: string;
  startIso: string;
  pick: string;
  market: string;
  hr: string;
  hrProb: number;
  fairProb: number;
  fair: string;
  /** Fraction, as stored in the feed (0.122 = 12.2%). */
  edge: number;
  hrEvent: string;
  pinId: number;
  date: string;
  pickedEt: string;
  result: string | null;
  grade: EdgeGrade;
  hrFetched: string;
  rank: number;
  gradedEt: string | null;
  marketTags: EdgeMarketTag[];
};

export type SkippedRow = { index: number; reason: string };

export type AdaptResult = { picks: EdgePick[]; skipped: SkippedRow[] };

export function gradeResult(result: string | null | undefined): EdgeGrade {
  if (result == null || String(result).trim() === "") return "pending";
  const s = String(result).trim().toLowerCase();
  if (s.startsWith("win")) return "win";
  if (s.startsWith("loss")) return "loss";
  if (s.startsWith("push")) return "push";
  if (s.startsWith("void")) return "void";
  return "unknown";
}

export function marketTags(pick: string, market: string): EdgeMarketTag[] {
  const blob = `${pick} ${market}`.toLowerCase();
  const tags: EdgeMarketTag[] = [];
  if (blob.includes("shot") || blob.includes("sog")) tags.push("sog");
  if (blob.includes("assist")) tags.push("assist");
  if (market.includes(" - ")) tags.push("player");
  return tags;
}

/** Star chip in the approved card is the 6–8% band. This only classifies the feed's edge number. */
export function inStarBand(edge: number): boolean {
  return edge >= 0.06 && edge <= 0.08;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function reqString(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  if (typeof value !== "string" || value.trim() === "") return null;
  return value;
}

function reqNumber(row: Record<string, unknown>, key: string): number | null {
  const value = row[key];
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

export function adaptEdgePicks(raw: unknown): AdaptResult {
  if (!Array.isArray(raw)) {
    throw new Error("edge-picks feed must be a JSON array of plays");
  }
  const picks: EdgePick[] = [];
  const skipped: SkippedRow[] = [];
  raw.forEach((row, index) => {
    if (!isRecord(row)) {
      skipped.push({ index, reason: "row is not an object" });
      return;
    }
    const sport = reqString(row, "sport");
    const game = reqString(row, "game");
    const pick = reqString(row, "pick");
    const market = reqString(row, "market");
    const hr = reqString(row, "hr");
    const fair = reqString(row, "fair");
    const date = reqString(row, "date");
    const edge = reqNumber(row, "edge");
    const hrProb = reqNumber(row, "hr_prob");
    const fairProb = reqNumber(row, "fair_prob");
    const rank = reqNumber(row, "rank");
    const pinId = reqNumber(row, "pin_id");
    if (!sport || !game || !pick || !market || !hr || !fair || !date || edge == null || hrProb == null || fairProb == null || rank == null || pinId == null) {
      skipped.push({ index, reason: "missing sport, game, pick, market, hr, fair, date, edge, hr_prob, fair_prob, rank, or pin_id" });
      return;
    }
    const result = row.result == null || row.result === "" ? null : String(row.result);
    picks.push({
      sport,
      game,
      start: typeof row.start === "string" ? row.start : "",
      startIso: typeof row.start_iso === "string" ? row.start_iso : "",
      pick,
      market,
      hr,
      hrProb,
      fairProb,
      fair,
      edge,
      hrEvent: row.hr_event == null ? "" : String(row.hr_event),
      pinId,
      date,
      pickedEt: typeof row.picked_et === "string" ? row.picked_et : "",
      result,
      grade: gradeResult(result),
      hrFetched: typeof row.hr_fetched === "string" ? row.hr_fetched : "",
      rank,
      gradedEt: row.graded_et == null || row.graded_et === "" ? null : String(row.graded_et),
      marketTags: marketTags(pick, market),
    });
  });
  return { picks, skipped };
}

export function latestEdgeDate(picks: EdgePick[]): string {
  return picks.reduce((max, pick) => (pick.date > max ? pick.date : max), "");
}

/** Flat 1u at the Hard Rock American price. Loss is −1, void and push are 0. Pending has no figure. */
export function flatUnitResult(hr: string, grade: EdgeGrade): number | null {
  if (grade === "pending" || grade === "unknown") return null;
  if (grade === "void" || grade === "push") return 0;
  if (grade === "loss") return -1;
  const price = Number(hr.replace("−", "-").replace(/[^\d.+-]/g, ""));
  if (!Number.isFinite(price) || price === 0) return null;
  if (price > 0) return price / 100;
  return 100 / Math.abs(price);
}
