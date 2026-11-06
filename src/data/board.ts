import type { EdgePick } from "./adaptEdgePicks.ts";
import type { ClvCard } from "./adaptClv.ts";
import type { CardNote } from "../lib/cardFilter.ts";
import type { Capper, GradeMark, LiveGame, LiveTicket, Mood, Play, Recap, SeriesPoint, SettledTicket, StandingsFile, Ticket } from "./types.ts";

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
  feedMode: "live" | "offline";
  banner: string | null;
  /** When this board was saved from a successful data.json fetch. */
  cachedAt: string | null;
  slateDate: string;
  notices: CardNote[];
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
  grades: GradeMark[];
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
  clv: ClvCard | null;
  fbNote: string;
  fbLegs: { date: string; player: string; team: string; odds: string; hit: string; note: string }[];
  /** Last night's live card, kept until 10:00 AM ET. Null once today is the live slate. */
  nightLive: NightLive | null;
};

export type NightLive = {
  slateDate: string;
  tickets: Ticket[];
  cappers: Capper[];
  teamVs: unknown;
  teamBuilt: string | null;
  liveGames: LiveGame[];
  liveTickets: LiveTicket[];
  liveNote: string;
  liveUpdated: string;
  liveMood: Board["liveMood"];
  cold: boolean;
};

const ALIAS: Record<string, string> = { NYK: "NY" };

function emptyLeague(): Board["standings"]["leagues"][string] {
  return { note: "No data yet", columns: [], groups: [] };
}

export function emptyBoard(): Board {
  return {
    dateLabel: "",
    feedMode: "offline",
    banner: null,
    cachedAt: null,
    slateDate: "",
    notices: [],
    tickets: [],
    cappers: [],
    liveTickets: [],
    liveGames: [],
    liveNote: "",
    liveUpdated: "",
    liveMood: null,
    results: [],
    recap: { when: "", units: "", summary: "", rows: [] },
    series: [],
    grades: [],
    rings: [],
    nascar: { when: "", rows: [] },
    edgePicks: [],
    edgeSkipped: 0,
    stars: new Set(),
    standings: {
      source: "desk",
      leagues: { NBA: emptyLeague(), NHL: emptyLeague(), NFL: emptyLeague(), MLB: emptyLeague(), NCAAF: emptyLeague(), NCAAB: emptyLeague() },
    },
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
    clv: null,
    fbNote: "",
    fbLegs: [],
    nightLive: null,
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
