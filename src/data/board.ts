import edgeRaw from "../../fixtures/edge-picks-sample.json";
import { adaptEdgePicks, type EdgePick } from "./adaptEdgePicks.ts";
import { edgeFeedTicket } from "./presentEdgeFeed.ts";
import {
  capperTicket,
  cappers,
  CARD_DATE,
  liveGames,
  LIVE_NOTE,
  LIVE_UPDATED,
  liveTickets,
  nascar,
  recap,
  results,
  rings,
  sampleTickets,
  series,
} from "./sampleBoard.ts";
import { standings as fallbackStandings } from "./standings.ts";
import type { Capper, LiveGame, LiveTicket, Mood, Play, Recap, SeriesPoint, SettledTicket, StandingsFile, Ticket } from "./types.ts";

export type StatRow = { name: string; sub: string; right: string };

export type PrivateStats = {
  unofficial: StatRow[];
  props: StatRow[];
  edgeUnits: string;
  edgeLine: string;
  edgeSports: StatRow[];
  green: StatRow[];
  ringNote: string;
};

export type Board = {
  dateLabel: string;
  feedMode: "live" | "fallback";
  banner: string | null;
  slateDate: string;
  notices: string[];
  tickets: Ticket[];
  cappers: Capper[];
  liveTickets: LiveTicket[];
  liveGames: LiveGame[];
  liveNote: string;
  liveUpdated: string;
  liveMood: { mood: Mood; title: string; hit: number; alive: number; dead: number; pre: number } | null;
  results: SettledTicket[];
  recap: Recap;
  series: SeriesPoint[];
  rings: { pct: number; label: string }[];
  nascar: { when: string; rows: [string, string, string][] };
  edgePicks: EdgePick[];
  edgeSkipped: number;
  stars: Set<string>;
  standings: StandingsFile;
  privateStats: PrivateStats | null;
  /** Raw desk `teamvs` object. ESPN is preferred; this is the fallback rank table. */
  teamVs: unknown;
  updated: { text: string; stale: boolean } | null;
  heistStamp: string | null;
  injuryCheck: string | null;
  lockCheck: string | null;
  dkPrices: string | null;
  standingsUpdated: string | null;
  uiBuild: string | null;
  teamBuilt: string | null;
};

const ALIAS: Record<string, string> = { NYK: "NY" };

export function loadBoard(): Board {
  const adapted = adaptEdgePicks(edgeRaw);
  const feed = edgeFeedTicket(adapted.picks);
  const tickets: Ticket[] = [];
  for (const ticket of sampleTickets) {
    tickets.push(ticket);
    if (ticket.id === "edge") tickets.push(feed);
  }
  tickets.push(capperTicket(cappers));
  const order = ["heist", "safe", "potd", "parlay", "legday", "edge", "edge-feed", "first", "props", "cappers"];
  tickets.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  return {
    dateLabel: CARD_DATE,
    feedMode: "fallback",
    banner: "OFFLINE FALLBACK — SAMPLE DATA. The desk file did not load, so this card is the fixture.",
    slateDate: "",
    notices: [],
    tickets,
    cappers,
    liveTickets,
    liveGames,
    liveNote: LIVE_NOTE,
    liveUpdated: LIVE_UPDATED,
    liveMood: null,
    results,
    recap,
    series,
    rings,
    nascar,
    edgePicks: adapted.picks,
    edgeSkipped: adapted.skipped.length,
    stars: starTeams(tickets),
    standings: fallbackStandings,
    privateStats: null,
    teamVs: null,
    updated: null,
    heistStamp: null,
    injuryCheck: null,
    lockCheck: null,
    dkPrices: null,
    standingsUpdated: null,
    uiBuild: null,
    teamBuilt: null,
  };
}

export function starTeams(tickets: Ticket[]): Set<string> {
  const stars = new Set<string>();
  for (const ticket of tickets) {
    if (ticket.id === "edge-feed") continue;
    for (const play of ticket.plays) {
      if (!play.matchup) continue;
      for (const side of [play.matchup.away.abbr, play.matchup.home.abbr]) {
        stars.add(side);
        if (ALIAS[side]) stars.add(ALIAS[side]);
      }
    }
  }
  return stars;
}

export function allPlays(board: Board): Play[] {
  return board.tickets.flatMap((ticket) => ticket.plays);
}

export function findPlay(board: Board, id: string): Play | undefined {
  return allPlays(board).find((play) => play.id === id);
}
