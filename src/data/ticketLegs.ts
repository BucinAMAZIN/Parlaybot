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
 * Legs recorded for this ticket.
 * Null when the row is not a ticket. An empty list means the ticket is real and no leg is uniquely linked.
 * A leg counts only when it is nested on the ticket, or when it is a sibling with the same non-empty tid and date.
 * Same date, category, or capper is not an identity. Those rows stay unattached.
 */
export function ticketParts(parent: Row, rows: Row[]): TicketPart[] | null {
  if (!isTicketRow(parent)) return null;
  if (Array.isArray(parent.legs) && parent.legs.length > 0) {
    return parent.legs.filter((item): item is Row => !!item && typeof item === "object").map(partFrom);
  }
  const tid = text(parent.tid);
  if (!tid) return [];
  const date = text(parent.date);
  return rows.filter((row) => row.leg === true && text(row.tid) === tid && text(row.date) === date).map(partFrom);
}

/** Names written in a ticket pick such as "6-leg parlay: A + B". Not a grade. */
export function listedLegNames(pick: string): string[] {
  const match = pick.trim().match(/^\d+\s*-?\s*leg\b[^:]*:\s*(.+)$/i);
  if (!match) return [];
  const names = match[1].split(/\s+\+\s+/).map((name) => name.trim()).filter(Boolean);
  return names.length >= 2 ? names : [];
}

/** A sourced leg grade. Anything else, including a blank or an ellipsis, is not Pending. */
export function legResultLabel(result: string): { text: string; tone: "" | "W" | "L" | "V" | "P" } {
  const raw = result.trim();
  if (/^(w|won)$/i.test(raw)) return { text: "Won", tone: "W" };
  if (/^(l|lost)$/i.test(raw)) return { text: "Lost", tone: "L" };
  if (/^(v|void)$/i.test(raw)) return { text: "Void", tone: "V" };
  if (/^(p|push)$/i.test(raw)) return { text: "Push", tone: "P" };
  if (/^pending$/i.test(raw)) return { text: "Pending", tone: "" };
  return { text: "Leg result unavailable", tone: "" };
}
