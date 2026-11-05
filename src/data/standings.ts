export const LEAGUES = ["NBA", "NHL", "NFL", "MLB", "NCAAF", "NCAAB"] as const;
export type LeagueId = (typeof LEAGUES)[number];
