import type { CardNote } from "../lib/cardFilter.ts";
import { isBlockedHrSid } from "../lib/links.ts";
import { classifySport } from "../lib/sport.ts";
import { heistLabel } from "../lib/stamps.ts";
import type { Play, PlayerStatus, Ticket, WhyBlock } from "./types.ts";

/**
 * THE HEIST and THE HEIST ALT, rendered from data.heist.
 * Prices, rungs, and which legs are flagged come from the file.
 * This module does not re-ladder or reprice a line.
 */

const HR_SLIP = "https://share.hardrock.bet/Pt0T/bet?deep_link_value=hardrock://betslip/";
const DK_LINK = /^https:\/\/sportsbook\.draftkings\.com\/event\/\d+\?outcomes=[\w%.-]+$/;
const DK_SID = /^0QA[0-9A-Za-z#_-]+$/;

type Row = Record<string, unknown>;

export type HrLive =
  | { kind: "number"; price: string | null }
  | { kind: "object"; price: string | null; label: string; at: string }
  | { kind: "empty" };

function isRow(value: unknown): value is Row {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function rowsOf(value: unknown): Row[] {
  return list(value).filter(isRow);
}

/** American odds as published. Positive numbers gain a plus. */
export function american(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 0) return `+${value}`;
    if (value < 0) return `−${Math.abs(value)}`;
    return null;
  }
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/[−–]/g, "-");
  if (/^\+\d+$/.test(text)) return text;
  if (/^-\d+$/.test(text)) return `−${text.slice(1)}`;
  if (/^\d+$/.test(text)) return `+${text}`;
  return null;
}

/**
 * hr_live is a number before the game and an object once a verified leg is in play.
 * A string price is accepted too, because some rows publish "-130" rather than -130.
 */
export function readHrLive(value: unknown): HrLive {
  if (typeof value === "number" && Number.isFinite(value)) return { kind: "number", price: american(value) };
  if (typeof value === "string") {
    const price = american(value);
    return price ? { kind: "number", price } : { kind: "empty" };
  }
  if (typeof value === "object" && value !== null) {
    const row = value as { label?: unknown; price?: unknown; at?: unknown };
    return {
      kind: "object",
      price: american(row.price),
      label: typeof row.label === "string" ? row.label.trim() : "",
      at: typeof row.at === "string" ? row.at.trim() : "",
    };
  }
  return { kind: "empty" };
}

/** Desk copy that still says buy-down is shown as an Alt line. The file itself is not edited. */
export function cleanHeistCopy(text: string): string {
  return text
    .replace(/bought-down/gi, "Alt line")
    .replace(/buy-downs?/gi, "Alt line")
    .replace(/ALT PROPS TRACKED/gi, "THE HEIST ALT");
}

function norm(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function lineCore(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s*\(.*$/, "")
    .replace(/[“”"]/g, "")
    .replace(/\bover\b/g, "o")
    .replace(/\bunder\b/g, "u")
    .replace(/[^a-z0-9.+]/g, "");
}

export function lineDiffers(pick: string, next: string): boolean {
  return lineCore(pick) !== lineCore(next);
}

/**
 * A whole-ticket id from heist.legs. hr_ticket.link can lag, so it is not the source.
 * Unverified and the known broken selection stay off. A name is never blocked.
 */
export function verifiedLegSid(leg: { hr_sid?: unknown; hr_why?: unknown }, unverified: Set<string>, blocked: Set<string>): boolean {
  if (!leg.hr_sid) return false;
  if (leg.hr_why) return false;
  const sid = String(leg.hr_sid);
  if (!/^\d+$/.test(sid)) return false;
  if (unverified.has(sid) || blocked.has(sid) || isBlockedHrSid(sid)) return false;
  return true;
}

/**
 * Alt line only when the file moved the rung.
 * A kickoff freeze that kept the original line, a bd_flag, or a flagged name stays untagged.
 */
export function movedAltLine(row: { hr_pick?: unknown; pick?: unknown; hr?: unknown; bd_flag?: unknown }, flagged: Set<string>): boolean {
  const hrPick = str(row.hr_pick);
  if (!hrPick) return false;
  if (row.bd_flag) return false;
  if (flagged.has(hrPick)) return false;
  if (/^original line kept/i.test(String(row.hr || ""))) return false;
  if (!lineDiffers(str(row.pick), hrPick)) return false;
  return true;
}

function bandCopy(band: unknown): string {
  const nums = list(band).map((item) => (typeof item === "number" ? item : Number.NaN)).filter((item) => Number.isFinite(item));
  if (nums.length >= 2) {
    const lo = Math.min(...nums);
    const hi = Math.max(...nums);
    return `No alt line in ${american(hi)} to ${american(lo)} — original line kept`;
  }
  return "No alt line in −250 to −425 — original line kept";
}

function clockOf(start: string, kick: string): string {
  if (kick && /[ap]m/i.test(kick)) return /ET/i.test(kick) ? kick : `${kick} ET`;
  const match = /(\d{1,2}):(\d{2})/.exec(start);
  if (!match) return kick || start;
  let hour = Number(match[1]);
  const suffix = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${match[2]} ${suffix} ET`;
}

function statusFor(pick: string, statuses: Map<string, PlayerStatus>): PlayerStatus | undefined {
  const text = norm(pick.replace(/\s*\(.*$/, ""));
  let best = "";
  let found: PlayerStatus | undefined;
  for (const [key, status] of statuses) {
    if (key.length < 3) continue;
    if ((text === key || text.startsWith(`${key} `)) && key.length > best.length) {
      best = key;
      found = status;
    }
  }
  return found;
}

function whyOf(row: Row): WhyBlock {
  const lines = [str(row.why), ...list(row.gameday).map(str)].map((line) => line.trim()).filter(Boolean).slice(0, 6);
  const whyNot = str(row.why_not) ? [str(row.why_not)] : [];
  return { ours: false, line: (lines[0] || "").slice(0, 110), why: lines, whyNot };
}

function dkReady(sid: string, link: string): boolean {
  if (!DK_SID.test(sid) || !DK_LINK.test(link)) return false;
  return link.endsWith(`outcomes=${encodeURIComponent(sid)}`);
}

function holdText(leg: Row, unverified: Set<string>): string {
  const sid = str(leg.hr_sid);
  const why = str(leg.hr_why);
  if ((sid && unverified.has(sid)) || /unverified/i.test(why)) return "Unverified HR link — held";
  if (why) return why.startsWith("HR link unavailable") ? why : `HR link unavailable: ${why}`;
  if (!sid) return "Not on HR";
  return "";
}

function slipUrl(sids: string[]): string {
  return sids.length ? `${HR_SLIP}${sids.join(",")}` : "";
}

function slipLabel(title: string, verified: number, total: number, verifiedWord: boolean): string {
  if (!verified) return "";
  if (verified < total) return `${title} (${verified} of ${total}${verifiedWord ? " verified" : ""} legs)`;
  return `${title} (all ${total} legs)`;
}

export function buildHeist(raw: unknown, statuses: Map<string, PlayerStatus>): { tickets: Ticket[]; notice: CardNote | null } {
  if (!isRow(raw)) return { tickets: [], notice: null };
  const legs = rowsOf(raw.legs);
  const conv = rowsOf(raw.conv);
  const altRows = conv.filter((row) => str(row.hr_pick));
  const ticketFile = isRow(raw.hr_ticket) ? raw.hr_ticket : {};
  const unverified = new Set(list(ticketFile.unverified).map((item) => str(item)).filter(Boolean));
  const bd = isRow(raw.bd_ticket) ? raw.bd_ticket : {};
  const flagged = new Set(list(bd.flagged).map(str).filter(Boolean));
  const flagLine = bandCopy(bd.band);
  const stamp = heistLabel(raw) || undefined;
  const stake = str(raw.stake) || "1u";
  const tickets: Ticket[] = [];

  if (legs.length) {
    const verified: string[] = [];
    const plays = legs.map((leg, index) => mainPlay(leg, index, statuses, unverified, verified));
    const total = legs.length;
    const odds = american(raw.odds);
    tickets.push({
      id: "heist",
      productKey: "heist",
      title: "THE HEIST",
      meta: [odds, stake].filter(Boolean).join(" · "),
      plays,
      share: true,
      ticketOdds: odds || undefined,
      rules: ["Shown as published in the desk file. ParlayBOT does not regrade or reprice these plays."],
      group: "main",
      stamp,
      showAll: true,
      playCount: total,
      slipLabel: slipLabel("Whole Heist in Hard Rock", verified.length, total, true),
      slipNote: verified.length && verified.length < total ? "Unverified and unreadable legs are left off this 1-tap slip." : undefined,
      dkSlipNote: "DraftKings opens each leg on its own. There is no whole-ticket link.",
      hrSlip: slipUrl(verified),
      skips: rowsOf(raw.skipped).map((row) => ({
        capper: str(row.capper),
        pick: str(row.pick) || "No pick",
        reason: cleanHeistCopy(str(row.why) || "No reason in the file"),
      })),
    });
  }

  if (altRows.length) {
    const verified: string[] = [];
    const plays = altRows.map((row) => altPlay(row, conv.indexOf(row), statuses, unverified, flagged, flagLine, verified));
    const bought = typeof bd.bought === "number" ? bd.bought : null;
    const count = typeof bd.legs === "number" ? bd.legs : null;
    const near = american(bd.target);
    const summary = bought != null && count != null ? `${bought} of ${count} legs on an Alt line${near ? ` near ${near}` : ""}` : "";
    const price = american(bd.odds);
    tickets.push({
      id: "heist-alt",
      productKey: "heist-alt",
      title: "THE HEIST ALT",
      meta: [`${stake} each`, price, summary].filter(Boolean).join(" · "),
      plays,
      share: true,
      ticketOdds: price || undefined,
      rules: ["Each row is the Hard Rock line published on heist.conv. ParlayBOT does not re-ladder it."],
      group: "main",
      stamp,
      showAll: true,
      playCount: altRows.length,
      slipLabel: slipLabel("Whole Heist Alt in Hard Rock", verified.length, altRows.length, false),
      slipNote: verified.length && verified.length < altRows.length ? "Unverified and unreadable legs are left off this 1-tap slip." : undefined,
      dkSlipNote: "DraftKings opens each leg on its own. There is no whole-ticket link.",
      hrSlip: slipUrl(verified),
      warnings: [...flagged].map((name) => `${name}: ${flagLine}`),
      excluded: conv
        .filter((row) => !str(row.hr_pick))
        .map((row) => ({
          capper: str(row.capper),
          pick: str(row.pick) || "No pick",
          reason: cleanHeistCopy(str(row.excluded) || "Not a convertible prop"),
        })),
    });
  }

  const msg = str(raw.msg) || str(raw.status);
  const notice = !tickets.length && msg ? { text: `${cleanHeistCopy(msg)}. No legs in the file.`, section: "heist", sport: null } : null;
  return { tickets, notice };
}

function mainPlay(leg: Row, index: number, statuses: Map<string, PlayerStatus>, unverified: Set<string>, verified: string[]): Play {
  const pick = str(leg.pick) || str(leg.orig) || "Play";
  const sid = str(leg.hr_sid);
  const onSlip = verifiedLegSid(leg, unverified, blockedSet());
  if (onSlip && !verified.includes(sid)) verified.push(sid);
  const held = !onSlip;
  const why = whyOf(leg);
  const orig = str(leg.orig);
  const postedOdds = american(leg.orig_odds);
  const liveOdds = american(leg.odds);
  const posted = orig && (lineDiffers(orig, pick) || (postedOdds && liveOdds && postedOdds !== liveOdds))
    ? `Posted: ${orig}${postedOdds ? ` (${postedOdds})` : ""}`
    : undefined;
  const live = readHrLive(leg.hr_live);
  const liveNote = onSlip && live.kind === "object" && live.label ? cleanHeistCopy(live.label) : undefined;
  const dk = dkFields(leg);
  const blockedSid = !!sid && isBlockedHrSid(sid);
  return {
    id: `heist-${index}`,
    name: pick,
    detail: credit(leg),
    sport: classifySport(str(leg.sport)),
    hr: liveOdds,
    dk: dk.odds,
    posted,
    liveNote,
    status: statusFor(pick, statuses),
    gameText: str(leg.game),
    why,
    showWhy: why.why.length > 0 || why.whyNot.length > 0,
    source: "desk",
    books: { hr: onSlip, dk: !!dk.sid },
    hrHold: held && !blockedSid ? holdText(leg, unverified) : undefined,
    dkHold: dk.sid ? undefined : dk.note,
    hrSid: onSlip ? sid : blockedSid ? sid : undefined,
    hrLink: onSlip ? str(leg.hr_link) || `${HR_SLIP}${sid}` : blockedSid ? str(leg.hr_link) || undefined : undefined,
    hrUnverified: holdText(leg, unverified) === "Unverified HR link — held" ? "Unverified HR link — held" : undefined,
    dkSid: dk.sid,
    dkLink: dk.link,
    slip: onSlip,
    legState: live.kind === "object" ? "LIVE" : undefined,
    tags: ["Heist"],
  };
}

function altPlay(
  row: Row,
  index: number,
  statuses: Map<string, PlayerStatus>,
  unverified: Set<string>,
  flagged: Set<string>,
  flagLine: string,
  verified: string[],
): Play {
  const hrPick = str(row.hr_pick);
  const pick = str(row.pick);
  const sid = str(row.hr_sid);
  const onSlip = verifiedLegSid(row, unverified, blockedSet());
  if (onSlip && !verified.includes(sid)) verified.push(sid);
  const tagged = movedAltLine(row, flagged);
  const flaggedRow = !!row.bd_flag || flagged.has(hrPick);
  const why = whyOf(row);
  const dk = dkFields(row);
  const dkPick = str(row.dk_pick);
  const grade = american(row.grade_odds) ?? american(row.hr_odds) ?? american(row.hr_x);
  const res = str(row.res).toUpperCase();
  const legState = res === "W" || res === "L" ? res : row.final === true ? "FINAL" : row.started === true ? "LIVE" : "PENDING";
  const blockedSid = !!sid && isBlockedHrSid(sid);
  return {
    id: `heist-alt-${index}`,
    name: hrPick,
    dkName: dkPick || undefined,
    detail: credit(row),
    sport: classifySport(str(row.sport)),
    hr: grade,
    dk: dk.odds,
    alt: pick && hrPick ? { before: pick, after: hrPick } : undefined,
    altDk: pick && dkPick ? { before: pick, after: dkPick } : undefined,
    altTag: tagged,
    flagNote: flaggedRow ? flagLine : undefined,
    status: statusFor(hrPick || pick, statuses),
    gameText: str(row.game),
    why,
    showWhy: why.why.length > 0 || why.whyNot.length > 0,
    source: "desk",
    books: { hr: onSlip, dk: !!dk.sid },
    hrHold: onSlip || blockedSid ? undefined : holdText(row, unverified) || "Not on HR",
    dkHold: dk.sid ? undefined : dk.note,
    hrSid: onSlip ? sid : blockedSid ? sid : undefined,
    hrLink: onSlip ? str(row.hr_link) || `${HR_SLIP}${sid}` : blockedSid ? str(row.hr_link) || undefined : undefined,
    dkSid: dk.sid,
    dkLink: dk.link,
    slip: onSlip,
    legState,
    tags: ["Heist ALT"],
  };
}

function blockedSet(): Set<string> {
  return new Set(["1051261159191216543"]);
}

function credit(row: Row): string {
  const who = str(row.capper);
  const game = str(row.game).split(";")[0].replace(/\s*\(.*$/, "").trim();
  const when = clockOf(str(row.start), str(row.kick));
  return [who, game, when].filter(Boolean).join(" · ");
}

function dkFields(row: Row): { sid?: string; link?: string; odds: string | null; note: string } {
  const nested = isRow(row.dk) ? row.dk : null;
  const absent = row.dk_absent === true || nested?.na === true;
  const sid = absent ? "" : str(row.dk_sid);
  const link = absent ? "" : str(row.dk_link);
  const ready = !absent && dkReady(sid, link);
  const odds = ready ? american(row.dk_live) ?? american(row.dk_odds) ?? american(nested?.odds) : null;
  const why = cleanHeistCopy(str(row.dk_why) || (!ready ? str(row.dk) : ""));
  const note = ready ? "" : why && !/^n\/a at dk$/i.test(why) ? `Not on DK · ${why}` : "Not on DK";
  return { sid: ready ? sid : undefined, link: ready ? link : undefined, odds, note };
}
