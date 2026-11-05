import { clockEt } from "../lib/stamps.ts";

export type ClvPlay = {
  pick: string;
  section: string;
  date: string;
  postedOdds: string;
  closeOdds: string;
  postedLine: string | null;
  closeLine: string | null;
  clvPct: number;
};

export type ClvSection = {
  name: string;
  count: number;
  avg: number;
  beat: number;
  beatPct: number;
};

export type ClvCard = {
  built: string | null;
  stale: boolean;
  count: number;
  avg: number | null;
  beat: number | null;
  beatPct: number | null;
  sections: ClvSection[];
  /** Newest closes shown on the card. */
  recent: ClvPlay[];
  /** Every close, used to match a graded result. */
  plays: ClvPlay[];
};

function isRow(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

export function normPick(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9.+]+/g, " ").replace(/\s+/g, " ").trim();
}

function lineOf(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  const text = str(value);
  return text || null;
}

export function adaptClv(raw: unknown): ClvCard | null {
  if (!isRow(raw)) return null;
  const plays = (Array.isArray(raw.plays) ? raw.plays : []).flatMap((item) => {
    if (!isRow(item)) return [];
    const pct = num(item.clv_pct);
    const pick = str(item.pick);
    if (pct == null || !pick) return [];
    return [{
      pick,
      section: str(item.section),
      date: str(item.date),
      postedOdds: str(item.posted_odds),
      closeOdds: str(item.close_odds),
      postedLine: lineOf(item.posted_line),
      closeLine: lineOf(item.close_line),
      clvPct: pct,
    } satisfies ClvPlay];
  });
  const totals = isRow(raw.totals) ? raw.totals : null;
  const count = num(totals?.count) ?? (plays.length || null);
  const sections = Object.entries(isRow(raw.by_section) ? raw.by_section : {}).flatMap(([name, value]) => {
    if (!isRow(value)) return [];
    const n = num(value.count);
    const avg = num(value.avg_clv);
    const beat = num(value.beat_close);
    const beatPct = num(value.beat_close_pct);
    if (n == null && avg == null && beatPct == null) return [];
    return [{ name, count: n ?? 0, avg: avg ?? 0, beat: beat ?? 0, beatPct: beatPct ?? 0 }];
  });
  if (!plays.length && !count && !sections.length) return null;
  const recent = [...plays].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
  const error = str(raw.error);
  return {
    built: clockEt(raw.built),
    stale: error.length > 0,
    count: count ?? plays.length,
    avg: num(totals?.avg_clv),
    beat: num(totals?.beat_close),
    beatPct: num(totals?.beat_close_pct),
    sections,
    recent,
    plays,
  };
}

export function clvLookup(plays: ClvPlay[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const play of plays) {
    if (!play.date) continue;
    map.set(`${play.date}|${normPick(play.pick)}`, play.clvPct);
  }
  return map;
}
