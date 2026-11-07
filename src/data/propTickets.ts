import type { CardNote } from "../lib/cardFilter.ts";
import { DK_MULTI_NOTE, hardRockSlipLink } from "../lib/links.ts";
import { sportLabel } from "../lib/sport.ts";
import type { Play, Ticket } from "./types.ts";

/**
 * Feed contract for the tickets named +100 and +250.
 * The active +100 tab is the official parlay, displayed as +100. alt100 is not an active tab.
 * safe100_record stays the legacy Safe history. safe250 is +250.
 * availability means a ticket was built, not that its markets are still open.
 */

export type PropLedger = {
  key: "safe100" | "alt100" | "safe250";
  title: string;
  detail: string;
  w: number;
  l: number;
  p: number;
  pct: number | null;
  sports: { name: string; line: string }[];
};

export type PropRetirement = {
  label: string;
  retiredOn: string;
  newTicketsFrom: string;
};

type Row = Record<string, unknown>;

function isRow(value: unknown): value is Row {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function rowsOf(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter(isRow) : [];
}

const PRODUCTS = [
  { stateKey: "safe250", ticketKey: "alt250", productKey: "plus250", label: "+250" },
] as const;

export function isLegacySafeState(state: Row, from: string): boolean {
  if (str(state.label) === "+100" || str(state.label) === "+250") return false;
  if (str(state.effective_from)) return false;
  const date = str(state.date);
  if (date && from && date < from) return true;
  const sports = isRow(state.sports) ? state.sports : {};
  for (const value of Object.values(sports)) {
    if (isRow(value) && (str(value.ticket_key) === "alt100" || str(value.ticket_key) === "alt250")) return false;
  }
  return true;
}

function boardFor(sport: string): string {
  if (/^today$/i.test(sport)) return "ALL_AND_BIG4";
  if (/^all$/i.test(sport)) return "ALL";
  return sport.toUpperCase() === sport ? sport : sport;
}

function sportTitle(sport: string): string {
  if (/^today$/i.test(sport)) return "Today";
  return sportLabel(sport);
}

function recordLine(value: unknown): { w: number; l: number; p: number; pct: number | null } {
  const row = isRow(value) ? value : {};
  const w = num(row.w) ?? 0;
  const l = num(row.l) ?? 0;
  const p = num(row.p) ?? 0;
  const pct = num(row.pct);
  return { w, l, p, pct: pct == null ? (w + l ? Math.round((w / (w + l)) * 100) : null) : pct };
}

function safe250Detail(raw: Row): string {
  const record = isRow(raw.safe250_record) ? raw.safe250_record : {};
  const trial = isRow(record.trial) ? record.trial : null;
  const base = "Not the official +100 ticket. Not the Safe +100 record.";
  if (!trial) return base;
  const rule = str(trial.rule);
  const since = str(trial.since);
  return [base, rule ? `Trial ${rule}` : "", since ? `since ${since}` : ""].filter(Boolean).join(" · ");
}

function ledger(raw: unknown, key: PropLedger["key"], title: string, detail: string): PropLedger | null {
  if (!isRow(raw) || !isRow(raw.overall)) return null;
  const overall = recordLine(raw.overall);
  const sports = isRow(raw.by_sport)
    ? Object.entries(raw.by_sport).flatMap(([sport, value]) => {
        if (!isRow(value)) return [];
        const line = recordLine(value);
        const pushes = line.p ? `-${line.p}` : "";
        return [{ name: sportTitle(sport), line: `${line.w}-${line.l}${pushes}${line.pct == null ? "" : ` · ${line.pct}%`}` }];
      })
    : [];
  return { key, title, detail, ...overall, sports };
}

export function propLedgersFrom(raw: Row, retirement: PropRetirement | null): PropLedger[] {
  const retired = retirement ? `Retired ${retirement.retiredOn}. Legacy Safe +100 only. Not +100, not +250, and not Official Parlay +100.` : "Legacy Safe +100 only. Not +100, not +250, and not Official Parlay +100.";
  const specs: [string, PropLedger["key"], string, string][] = [
    ["safe100_record", "safe100", "Safe +100", retired],
    ["alt100_record", "alt100", "alt100 record", "Still in this file. Not the official +100 tab and not the Safe +100 record."],
    ["safe250_record", "safe250", "+250", safe250Detail(raw)],
  ];
  return specs.flatMap(([field, key, title, detail]) => {
    const item = ledger(raw[field], key, title, detail);
    return item ? [item] : [];
  });
}

export function propRetirementFrom(raw: Row): PropRetirement | null {
  const row = isRow(raw.safe_retirement) ? raw.safe_retirement : null;
  if (!row) return null;
  const retiredOn = str(row.retired_on);
  const newTicketsFrom = str(row.new_tickets_from);
  if (!retiredOn || !newTicketsFrom) return null;
  return { label: str(row.label) || "Safe +100", retiredOn, newTicketsFrom };
}

function statusCard(productKey: string, title: string, meta: string, note: string, board?: string): Ticket {
  return {
    id: board ? `${productKey}-${board}` : `${productKey}-scheduled`,
    productKey,
    title,
    meta,
    plays: [],
    share: false,
    rules: [
      `The ticket is named ${title}.`,
      "This is not Official Parlay +100.",
      "Alt-line plays are allowed, not required. There is no +500 ticket.",
      "A ticket in the file is availability only. Book buttons still depend on the verified link fields.",
    ],
    group: "official",
    board,
    emptyNote: note,
  };
}

function withVerifiedSlip(ticket: Ticket): Ticket {
  const built = hardRockSlipLink(ticket.plays.map((play) => ({ id: play.id, name: play.name, hrSid: play.hrSid, hrLink: play.hrLink })));
  const dkReady = ticket.plays.filter((play) => play.dkSid && play.dkLink).length;
  return {
    ...ticket,
    hrSlip: built.status === "ready" ? built.url : undefined,
    slipLabel: built.status === "ready" ? "Whole ticket in Hard Rock" : undefined,
    slipNote: built.status === "ready" ? built.detail : undefined,
    dkSlipNote: dkReady > 1 ? DK_MULTI_NOTE : undefined,
  };
}

function ticketCard(
  product: (typeof PRODUCTS)[number],
  sport: string,
  ticket: Row,
  playFrom: (row: Row, id: string, hint: string) => Play | null,
): Ticket | null {
  const id = str(ticket.id) || `${str(ticket.date) || "slate"}|${product.ticketKey}|${sport}|1`;
  const label = str(ticket.label) || product.label;
  const plays = rowsOf(ticket.legs).flatMap((leg, index) => {
    const play = playFrom(leg, `${id}:${index}`, sport);
    return play ? [play] : [];
  });
  if (!plays.length) return null;
  for (const play of plays) play.tags = [...new Set([...(play.tags ?? []), label])];
  const posted = str(ticket.odds);
  const count = num(ticket.n) ?? plays.length;
  const book = str(ticket.book_name) || (str(ticket.book) === "DK" ? "DraftKings" : "");
  const window = Array.isArray(ticket.odds_window) ? ticket.odds_window.map((item) => str(item)).filter(Boolean).join("–") : "";
  const meta = [sportTitle(sport), `${count} leg${count === 1 ? "" : "s"}`, posted, window ? `odds window ${window}` : "", book, "Not Official Parlay +100"].filter(Boolean).join(" · ");
  const warnings = [str(ticket.price_note), str(ticket.rule)].filter(Boolean);
  if (ticket.locked === true) warnings.push("Locked");
  return withVerifiedSlip({
    id,
    productKey: product.productKey,
    title: label,
    meta,
    plays,
    share: true,
    ticketOdds: posted || undefined,
    rules: [
      `The ticket is named ${label}.`,
      "This is not Official Parlay +100.",
      "Alt-line plays are allowed, not required. There is no +500 ticket.",
      "Book buttons use only the verified link fields on each leg.",
    ],
    group: "official",
    stamp: str(ticket.posted) ? `Posted ${str(ticket.posted)}` : undefined,
    board: boardFor(sport),
    warnings: warnings.length ? warnings : undefined,
  });
}

export function propTicketsFrom(
  raw: Row,
  slate: string,
  playFrom: (row: Row, id: string, hint: string) => Play | null,
): { tickets: Ticket[]; notices: CardNote[] } {
  const retirement = propRetirementFrom(raw);
  const from = retirement?.newTicketsFrom ?? "";
  const tickets: Ticket[] = [];
  const notices: CardNote[] = [];
    const beforeStart = Boolean(slate && from && slate < from);
  for (const product of PRODUCTS) {
    const value = raw[product.stateKey];
    const state: Row = isRow(value) ? value : {};
    if (beforeStart) {
      tickets.push(statusCard(product.productKey, product.label, "Not Official Parlay +100", `Starts ${from} at 10:00 AM ET. No ticket in this file yet.`, "ALL_AND_BIG4"));
      continue;
    }
    if (!str(state.date) && !str(state.label) && !isRow(state.sports)) {
      tickets.push(statusCard(product.productKey, product.label, "Not Official Parlay +100", "No ticket in this file yet.", "ALL_AND_BIG4"));
      continue;
    }
    const sports = isRow(state.sports) ? state.sports : {};
    const availability = isRow(state.availability) ? state.availability : {};
    const notes = isRow(state.notes) ? state.notes : {};
    const seen = new Set<string>();
    for (const [sport, value] of Object.entries(sports)) {
      if (!isRow(value)) continue;
      const card = ticketCard(product, sport, value, playFrom);
      if (!card) continue;
      tickets.push(card);
      seen.add(sport.toUpperCase());
    }
    for (const [sport, value] of Object.entries(availability)) {
      if (!isRow(value) || value.available !== false || seen.has(sport.toUpperCase())) continue;
      const reason = str(value.reason) || "No ticket was built for this sport.";
      tickets.push(statusCard(product.productKey, product.label, `${sportTitle(sport)} · Not Official Parlay +100`, reason, boardFor(sport)));
      seen.add(sport.toUpperCase());
    }
    const extra = rowsOf(state.extra).flatMap((leg, index) => {
      const play = playFrom(leg, `${product.productKey}-extra:${index}`, "");
      return play ? [play] : [];
    });
    if (extra.length) {
      for (const play of extra) play.tags = [...new Set([...(play.tags ?? []), product.label])];
      tickets.push(withVerifiedSlip({
        id: `${product.productKey}-extra`,
        productKey: product.productKey,
        title: product.label,
        meta: "Extra · Not Official Parlay +100",
        plays: extra,
        share: true,
        rules: [`The ticket is named ${product.label}.`, "Extra legs are the file's extra list. Book buttons use only verified link fields."],
        group: "official",
        board: "ALL_AND_BIG4",
      }));
    }
    for (const [sport, text] of Object.entries(notes)) {
      if (!str(text) || seen.has(sport.toUpperCase())) continue;
      notices.push({ text: str(text), section: product.productKey, sport: /^today$|^all$/i.test(sport) ? null : sport.toUpperCase() });
    }
  }
  return { tickets, notices };
}

