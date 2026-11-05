import type { BookId, Play, SettledTicket, Ticket } from "../data/types.ts";

/** Friends see legs, odds, and the result. No units, profit, or bankroll. */
export type ShareCard = {
  title: string;
  result: "WON" | "LOST" | "PENDING";
  odds: string | null;
  legs: { mark: string; name: string; detail: string }[];
  foot: string;
};

const MONEY = /\d+(?:\.\d+)?\s*u\b|\bprofit\b|\bbankroll\b|\bunits\b|\broi\b/i;

export function shareCardIsPrivate(card: ShareCard): boolean {
  return !MONEY.test(JSON.stringify(card));
}

function legOdds(play: Play, book: BookId): string {
  const price = book === "hr" ? play.hr : play.dk;
  if (price) return price;
  return book === "hr" ? "Not on HR" : "Not on DK";
}

export function shareFromPending(ticket: Ticket, book: BookId, foot: string): ShareCard {
  return {
    title: ticket.title.replace(/\s+feed$/i, ""),
    result: "PENDING",
    odds: ticket.ticketOdds ?? null,
    legs: ticket.plays.map((play) => ({
      mark: "•",
      name: play.name.replace(/^★\s*/, ""),
      detail: legOdds(play, book),
    })),
    foot,
  };
}

export function shareFromSettled(ticket: SettledTicket, foot: string): ShareCard {
  return {
    title: ticket.title,
    result: ticket.result === "W" ? "WON" : "LOST",
    odds: ticket.ticketOdds ?? null,
    legs: ticket.legs.map((leg) => ({
      mark: leg.result === "W" ? "✓" : "✗",
      name: leg.name,
      detail: leg.stat,
    })),
    foot,
  };
}
