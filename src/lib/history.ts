import { sectionMatch } from "../data/gradeLabels.ts";
import type { GradeMark, SeriesPoint } from "../data/types.ts";

export type RangeKey = "14d" | "30d" | "60d" | "90d" | "all";

const DAYS: Record<Exclude<RangeKey, "all">, number> = { "14d": 14, "30d": 30, "60d": 60, "90d": 90 };

const CATS: [string, string][] = [
  ["The Heist", "HEIST"],
  ["Safe +100 (Alt Parlay)", "Safe"],
  ["Edge", "Edge"],
  ["Cappers", "Cappers"],
  ["POTD", "POTD"],
  ["LEG DAY", "LEG DAY"],
  ["Parlay +100", "Parlay"],
  ["Alt lines", "Alt lines"],
];

function addDays(iso: string, days: number): string {
  const [year, month, date] = iso.split("-").map(Number);
  const when = new Date(Date.UTC(year, month - 1, date));
  when.setUTCDate(when.getUTCDate() + days);
  return when.toISOString().slice(0, 10);
}

export function prettyDay(iso: string): string {
  const [year, month, date] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function sliceHistory(points: SeriesPoint[], range: RangeKey): { points: SeriesPoint[]; from: string | null; to: string | null; starts: string | null } {
  const dated = points.filter((point) => point.iso);
  if (!dated.length) return { points, from: null, to: null, starts: null };
  const start = dated[0].iso ?? "";
  const end = dated[dated.length - 1].iso ?? "";
  if (range === "all") return { points: dated, from: start, to: end, starts: null };
  const from = addDays(end, -(DAYS[range] - 1));
  const slice = dated.filter((point) => (point.iso ?? "") >= from && (point.iso ?? "") <= end);
  return { points: slice.length ? slice : dated, from, to: end, starts: start > from ? prettyDay(start) : null };
}

export function windowGrades(grades: GradeMark[], from: string | null, to: string | null): GradeMark[] {
  if (!from) return grades;
  return grades.filter((grade) => grade.date >= from && (!to || grade.date <= to));
}

export function windowWinRate(grades: GradeMark[]): number | null {
  const wins = grades.filter((grade) => grade.win).length;
  const losses = grades.length - wins;
  return wins + losses ? Math.round((wins / (wins + losses)) * 100) : null;
}

export function windowRings(grades: GradeMark[]): { pct: number; label: string }[] {
  const tally = new Map<string, { w: number; l: number }>();
  for (const grade of grades) {
    const bucket = tally.get(grade.cat) ?? { w: 0, l: 0 };
    if (grade.win) bucket.w += 1;
    else bucket.l += 1;
    tally.set(grade.cat, bucket);
  }
  const rings: { pct: number; label: string }[] = [];
  for (const [cat, label] of CATS) {
    const bucket = tally.get(cat);
    if (!bucket || bucket.w + bucket.l === 0) continue;
    rings.push({ pct: Math.round((bucket.w / (bucket.w + bucket.l)) * 100), label });
  }
  return rings;
}

export function fileBounds(grades: GradeMark[], series: SeriesPoint[], section: string): { first: string; last: string } {
  const dates: string[] = [];
  for (const grade of grades) if (sectionMatch(grade.cat, section)) dates.push(grade.date);
  if (!section || section === "all") for (const point of series) if (point.iso) dates.push(point.iso);
  dates.sort();
  return { first: dates[0] ?? "", last: dates[dates.length - 1] ?? "" };
}

const RANGE_LABEL: Record<RangeKey, string> = { "14d": "14D", "30d": "30D", "60d": "60D", "90d": "90D", all: "All dates" };

/** Says what the selected dates are, and that All is the whole file rather than hidden history. */
export function historyScope(input: { fileFirst: string; fileLast: string; from: string | null; to: string | null; range: RangeKey; custom: boolean; clippedLabel: string | null }): string {
  if (!input.fileFirst || !input.fileLast) return "No dated history in this file.";
  const first = prettyDay(input.fileFirst);
  const last = prettyDay(input.fileLast);
  if (!input.custom && input.range === "all") return `All dates in this file, ${first} through ${last}. Days before ${first} are not in the feed.`;
  if (!input.from || !input.to) return `All dates shows the whole file, ${first} through ${last}.`;
  const chip = input.custom ? "This custom range" : RANGE_LABEL[input.range];
  const clipped = input.clippedLabel ? ` History in this file starts ${input.clippedLabel}.` : "";
  return `${chip} is ${prettyDay(input.from)} through ${prettyDay(input.to)} inside this file.${clipped} All dates shows the whole file, ${first} through ${last}.`;
}

export function unitChange(all: SeriesPoint[], shown: SeriesPoint[]): number | null {
  if (!shown.length) return null;
  const first = shown[0];
  const last = shown[shown.length - 1];
  const prior = [...all].reverse().find((point) => point.iso && first.iso && point.iso < first.iso);
  return last.profit - (prior ? prior.profit : 0);
}
