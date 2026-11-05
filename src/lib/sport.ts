import type { Sport } from "../data/types.ts";

/** Feed sport string → card sport. College hockey is never football or basketball. */
export function classifySport(raw: string): Sport {
  const sport = raw.toUpperCase().replace(/\s+/g, " ").trim();
  if (/COLLEGE HOCKEY|\bNCAA H\b|NCAAH|NCAA-H/.test(sport)) return "Other";
  if (sport.includes("WNBA")) return "WNBA";
  if (sport.includes("NCAAM") || sport.includes("NCAAB") || sport.includes("COLLEGE BASKETBALL")) return "NCAAB";
  if (sport.includes("NCAAF") || sport.includes("NCAA F") || sport.includes("COLLEGE FOOTBALL")) return "NCAAF";
  if (sport.includes("NBA")) return "NBA";
  if (sport.includes("NHL")) return "NHL";
  if (sport.includes("NFL")) return "NFL";
  if (sport.includes("MLB")) return "MLB";
  if (sport.includes("NASCAR")) return "NASCAR";
  if (sport.includes("TENNIS")) return "Tennis";
  return "Other";
}

/** Label used on chips, play rows, and standings tabs. */
export function sportLabel(sport: string): string {
  if (sport === "NCAAF" || sport === "NCAA F") return "NCAA 🏈";
  if (sport === "NCAAB" || sport === "NCAAM" || sport === "NCAA B") return "NCAA 🏀";
  if (sport === "Other") return "Other";
  return sport;
}

export const SPORT_ORDER = ["NHL", "NBA", "NFL", "NCAAF", "NCAAB", "MLB", "WNBA", "NASCAR", "Tennis"] as const;
