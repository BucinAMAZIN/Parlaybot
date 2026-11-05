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
import type { Capper, LiveGame, LiveTicket, Play, Recap, SeriesPoint, SettledTicket, Ticket } from "./types.ts";

export type Board = {
  dateLabel: string;
  tickets: Ticket[];
  cappers: Capper[];
  liveTickets: LiveTicket[];
  liveGames: LiveGame[];
  liveNote: string;
  liveUpdated: string;
  results: SettledTicket[];
  recap: Recap;
  series: SeriesPoint[];
  rings: { pct: number; label: string; color: string }[];
  nascar: { when: string; rows: [string, string, string][] };
  edgePicks: EdgePick[];
  edgeSkipped: number;
  stars: Set<string>;
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
    tickets,
    cappers,
    liveTickets,
    liveGames,
    liveNote: LIVE_NOTE,
    liveUpdated: LIVE_UPDATED,
    results,
    recap,
    series,
    rings,
    nascar,
    edgePicks: adapted.picks,
    edgeSkipped: adapted.skipped.length,
    stars: starTeams(tickets),
  };
}

function starTeams(tickets: Ticket[]): Set<string> {
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
