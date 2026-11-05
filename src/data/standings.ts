import desk from "../../fixtures/desk-standings.json";
import { adaptDeskStandings, type DeskStandings } from "./adaptStandings.ts";
import sample from "./standings.sample.json";
import type { StandingsFile } from "./types.ts";

const ncaab = (sample as StandingsFile).leagues.NCAAB;
export const standings = adaptDeskStandings(desk as DeskStandings, {
  ...ncaab,
  note: "NCAAB by conference · SAMPLE DATA. College basketball standings are not in the desk snapshot.",
});

export const LEAGUES = ["NBA", "NHL", "NFL", "MLB", "NCAAF", "NCAAB"] as const;
export type LeagueId = (typeof LEAGUES)[number];
