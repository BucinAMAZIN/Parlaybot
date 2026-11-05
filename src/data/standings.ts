import raw from "./standings.sample.json";
import type { StandingsFile } from "./types.ts";

export const standings = raw as StandingsFile;

export const LEAGUES = ["NBA", "NHL", "NFL", "MLB", "NCAAF", "NCAAB"] as const;
export type LeagueId = (typeof LEAGUES)[number];
