import type { TicketPart } from "./types.ts";

type Row = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

/** A parlay or ticket summary. A single graded play is not one. */
export function isTicketRow(row: Row): boolean {
  if (row.leg === true) return false;
  if (Array.isArray(row.legs) && row.legs.length > 0) return true;
  if (text(row.tid)) return true;
  const pick = text(row.pick);
  return /\d+\s*-?\s*leg\b/i.test(pick) || /\bparlay\b/i.test(pick);
}

function partFrom(row: Row): TicketPart {
  const name = text(row.pick) || text(row.player) || text(row.name) || "Play";
  const market = [text(row.prop) || text(row.fam) || text(row.market), text(row.odds)].filter(Boolean).join(" · ");
  return {
    name,
    market,
    result: text(row.result) || text(row.res) || text(row.hit),
    score: text(row.stat) || text(row.note),
    game: text(row.gm) || text(row.game) || text(row.team),
  };
}

/**
 * Legs recorded for this ticket in the same results rows.
 * Null when the row is not a ticket. An empty list means the ticket is real and the file has no legs for it.
 * Matching uses the ticket id, else the nested legs, else same date and product. It does not read today's card.
 */
export function ticketParts(parent: Row, rows: Row[]): TicketPart[] | null {
  if (!isTicketRow(parent)) return null;
  if (Array.isArray(parent.legs) && parent.legs.length > 0) {
    return parent.legs.filter((item): item is Row => !!item && typeof item === "object").map(partFrom);
  }
  const date = text(parent.date);
  const tid = text(parent.tid);
  const kids = tid
    ? rows.filter((row) => row.leg === true && text(row.tid) === tid && text(row.date) === date)
    : rows.filter((row) => row.leg === true && !text(row.tid) && text(row.date) === date && text(row.cat) === text(parent.cat));
  return kids.map(partFrom);
}
