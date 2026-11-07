import { adaptClv, clvLookup, normPick } from "./adaptClv.ts";
import { adaptDeskStandings, type DeskStandings } from "./adaptStandings.ts";
import type { Board, PrivateStats, StatRow } from "./board.ts";
import type {
  Capper,
  GradeMark,
  Play,
  PlayerStatus,
  PlayerStatusLabel,
  Recap,
  SeriesPoint,
  SettledLeg,
  SettledTicket,
  Sport,
  StandingLeague,
  Ticket,
  WhyBlock,
} from "./types.ts";
import type { CardNote } from "../lib/cardFilter.ts";
import { formatSigned } from "../lib/format.ts";
import { classifySport, sportLabel } from "../lib/sport.ts";
import { dedupePlays } from "./dedupePlays.ts";
import { isTicketRow, ticketParts } from "./ticketLegs.ts";
import { capperOf, displayCat, normProp, normSide, normSport } from "./gradeLabels.ts";
import { buildHeist } from "./heist.ts";
import { readHeistContract } from "./heistContract.ts";
import { propLedgersFrom, propRetirementFrom, propTicketsFrom } from "./propTickets.ts";
import { builtLabel, dkLabel, heistLabel, injuryLabel, lockLabel, standingsLabel, uiBuildLabel, updatedLabel } from "../lib/stamps.ts";

export const DESK_URL = "https://bucinamazin.github.io/desk-dashboard/parlay/data.json";

const ODDS = /^[+-]\d+$/;

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

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function norm(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sportOf(raw: string): Sport {
  return classifySport(raw);
}

function oddsOf(...values: unknown[]): string | null {
  for (const value of values) {
    const text = str(value);
    if (ODDS.test(text)) return text;
  }
  return null;
}

function isPlaceholder(pick: string): boolean {
  return !pick || /builds at|not at \d|no pick today|not enough bought/i.test(pick);
}

function statusLabel(raw: string): PlayerStatusLabel | null {
  const s = raw.toLowerCase();
  if (!s) return null;
  if (s.startsWith("out") || /\bout\b/.test(s)) return "Out";
  if (s.includes("questionable")) return "Questionable";
  if (s.includes("gtd") || s.includes("day-to-day") || s.includes("day to day")) return "GTD";
  if (s.includes("minute")) return "Minutes limit";
  if (s.includes("not starting")) return "Not starting";
  return null;
}

function toneOf(label: PlayerStatusLabel): PlayerStatus["tone"] {
  return label === "Out" ? "bad" : "warn";
}

function statusIndex(raw: unknown): Map<string, PlayerStatus> {
  const map = new Map<string, PlayerStatus>();
  const players = list(isRow(raw) ? raw.players : null);
  for (const item of players) {
    if (!isRow(item)) continue;
    const label = statusLabel(str(item.label) || str(item.raw));
    if (!label) continue;
    const key = norm(str(item.key) || str(item.name));
    if (!key) continue;
    map.set(key, { label, reportedAt: str(item.posted) || undefined, tone: toneOf(label) });
  }
  return map;
}

function bullets(value: unknown, fallback: string): string[] {
  if (Array.isArray(value)) {
    const lines = value.map((item) => str(item)).filter(Boolean).slice(0, 6);
    if (lines.length) return lines;
  }
  const text = str(value);
  if (!text) return [fallback];
  const parts = text.split(/\s+\|\s+/).map((part) => part.trim()).filter(Boolean);
  return (parts.length ? parts : [text]).slice(0, 6);
}

function whyBlock(row: Row): WhyBlock {
  const lead = [str(row.why_src), str(row.grade_why), str(row.green_why)].filter(Boolean);
  const fromList = Array.isArray(row.gameday) ? bullets(row.gameday, "").filter(Boolean) : [];
  const fromWhy = str(row.why) ? bullets(row.why, "").filter(Boolean) : [];
  const whyLines = [...lead, ...(fromList.length ? fromList : fromWhy)];
  const whyNot = str(row.why_not) ? bullets(row.why_not, "").filter(Boolean) : [];
  const line = (whyLines[0] || str(row.pick) || "Desk play").slice(0, 110);
  return { ours: false, line, why: whyLines.length ? whyLines : ["No why text in the desk file."], whyNot };
}

export function gradeOf(row: Row): "W" | "L" | "V" | "P" | null {
  const res = str(row.result || row.res || row.status);
  if (/^win\b/i.test(res)) return "W";
  if (/^loss\b/i.test(res)) return "L";
  if (/^void\b/i.test(res)) return "V";
  if (/^push\b/i.test(res)) return "P";
  return null;
}

function playerOf(pick: string): string {
  const cleaned = pick.replace(/^#\d+\s+/, "").replace(/^\((?:Quality|\+EV)\)\s*/i, "");
  const match = cleaned.match(/^(.+?)\s+(Over|Under)\b/i);
  return (match ? match[1] : cleaned).trim();
}

function blockedOf(row: Row): Play["blocked"] {
  const res = str(row.result || row.res || row.status);
  const why = str(row.lock_why);
  if (gradeOf(row) || /graded:\s*void/i.test(why) || ["w", "l", "v", "p", "won", "lost"].includes(res.toLowerCase())) return "graded";
  if (row.locked === true || row.bk_started === true || row.started === true || row.final === true) return "started";
  return undefined;
}

function voidedPreGame(row: Row): boolean {
  return /rule change|pre-game/i.test(`${str(row.result || row.res || row.status)} ${str(row.lock_why)}`);
}

function pickText(row: Row): string {
  const pick = str(row.pick);
  if (pick) return pick;
  const player = str(row.player);
  const prop = str(row.prop);
  if (player && prop) return `${player} ${prop}`;
  return prop || player;
}

function sportOfRow(row: Row, hint = ""): Sport {
  const named = str(row.sport) || (isRow(row.ctx) ? str(row.ctx.sport) : "") || hint;
  const classified = classifySport(named);
  if (named && classified !== "Other") return classified;
  const ctx = isRow(row.ctx) ? row.ctx : {};
  const src = `${JSON.stringify(ctx.usage ?? "")} ${JSON.stringify(ctx.game_day ?? "")}`;
  if (/nhle|hockey/i.test(src)) return "NHL";
  if (/college football|ncaaf/i.test(src)) return "NCAAF";
  if (/college basketball|ncaam|ncaab/i.test(src)) return "NCAAB";
  if (/nba/i.test(src)) return "NBA";
  if (/nfl|football/i.test(src)) return "NFL";
  const record = isRow(ctx.record) ? Object.values(ctx.record).map(String) : [];
  if (record.some((value) => /^\d+-\d+-\d+$/.test(value))) return "NHL";
  return classified;
}

function playFrom(row: Row, id: string, statuses: Map<string, PlayerStatus>, hint = ""): Play | null {
  let pick = pickText(row);
  if (isPlaceholder(pick)) return null;
  const awayCode = str(isRow(row.ctx) ? row.ctx.away : "");
  const homeCode = str(isRow(row.ctx) ? row.ctx.home : "");
  if ((row.kind === "total" || /^(over|under)\s+\d/i.test(pick)) && awayCode && homeCode && !pick.includes("@")) pick = `${awayCode} @ ${homeCode} · ${pick}`;
  const dk = isRow(row.dk) ? row.dk : null;
  const dkOff = dk?.na === true || row.dk_absent === true;
  const hrOff = str(row.hr_state) === "absent";
  const hrSid = hrOff ? "" : str(row.hr_sid);
  const dkSid = dkOff ? "" : str(row.dk_sid);
  const ctx = isRow(row.ctx) ? row.ctx : null;
  const away = str(ctx?.away);
  const home = str(ctx?.home);
  const records = isRow(ctx?.record) ? ctx.record : null;
  const rank = isRow(ctx?.opp_rank) ? ctx.opp_rank : null;
  const rankN = num(rank?.rank);
  const rankOf = num(rank?.of);
  const edge = num(row.edge);
  const markers: Play["markers"] = [];
  if (edge != null) {
    const fair = str(row.fair);
    const grade = str(row.grade);
    markers.push({ icon: "📈", label: `${grade ? `${grade} · ` : ""}+${(edge * 100).toFixed(1)}% edge${fair ? ` (fair ${fair})` : ""}`, tone: edge >= 0.06 ? "good" : "neutral" });
  }
  if (edge != null && edge >= 0.06 && edge < 0.08) markers.push({ icon: "⭐", label: "6–8% sweet spot", tone: "good" });
  const nowPrice = str(row.hr_now || row.now);
  if (nowPrice && nowPrice !== str(row.hr)) markers.push({ icon: "⚡", label: `Now ${nowPrice}`, tone: row.hr_edge_gone === true ? "warn" : "neutral" });
  if (row.hr_edge_gone === true) markers.push({ icon: "⚠", label: "Edge gone (<4%)", tone: "warn" });
  if (row.green_circle === true) markers.push({ icon: "🟢", label: "Good matchup", tone: "good" });
  if (row.green_goalie && str(row.green_goalie_status) === "confirmed") markers.push({ icon: "🥅", label: `${str(row.green_goalie)} confirmed`, tone: "good" });
  if (row.sog_agree === true) markers.push({ icon: "🎯", label: row.sog_l10 != null ? `SOG L10 ${str(row.sog_l10)}` : "SOG agrees", tone: "good" });
  if (row.big_edge_assist === true) markers.push({ icon: "⚠", label: "12%+ Assist", tone: "warn" });
  const game = str(row.game) || str(ctx?.game);
  const start = str(row.start_et) || str(row.start) || str(row.kick);
  const sport = sportOfRow(row, hint);
  const name = playerOf(pick);
  const status = statuses.get(norm(name));
  const alt = row.alt === true ? " · Alt line" : "";
  return {
    id,
    name: pick,
    detail: [sport === "Other" ? str(row.sport) || "Other" : sportLabel(sport), game, start].filter(Boolean).join(" · ") + alt,
    sport,
    hr: oddsOf(row.hr, row.odds, row.hr_now),
    dk: dkOff ? null : oddsOf(dk?.odds, row.dk_live, row.dk_odds),
    markers: markers.length ? markers : undefined,
    blocked: blockedOf(row),
    voidedPreGame: voidedPreGame(row) || undefined,
    lockWhy: str(row.lock_why) || undefined,
    hrState: str(row.hr_state).toLowerCase() || undefined,
    hrAbsent: row.hr_absent === true || str(row.hr_state).toLowerCase() === "absent" || /does not list|line not offered on hard rock/i.test(str(row.hr_why)) || undefined,
    dkAbsent: row.dk_absent === true || (isRow(row.dk) && row.dk.na === true) || undefined,
    edgeSingle: row.edge_single === true || undefined,
    status,
    gameText: game,
    matchup:
      away && home
        ? {
            away: { abbr: away, record: str(records?.[away]) || "—", standing: "—" },
            home: { abbr: home, record: str(records?.[home]) || "—", standing: "—" },
            rankChip: rankN != null && rankOf != null ? `#${rankN}/${rankOf}` : undefined,
          }
        : undefined,
    why: whyBlock(row),
    source: "desk",
    hrSid: /^\d+$/.test(hrSid) ? hrSid : undefined,
    hrLink: hrOff ? undefined : str(row.hr_link) || undefined,
    hrUnverified: /unverified link/i.test(str(row.hr_why)) ? str(row.hr_why) : undefined,
    dkSid: /^0QA[0-9A-Za-z#_-]+$/.test(dkSid) ? dkSid : undefined,
    dkLink: dkOff ? undefined : str(row.dk_link) || undefined,
  };
}

function ticket(
  id: string,
  productKey: string,
  title: string,
  meta: string,
  plays: Play[],
  group: Ticket["group"],
  odds?: string,
  stamp?: string | null,
  board?: string,
): Ticket | null {
  if (!plays.length) return null;
  return {
    id,
    productKey,
    title,
    meta,
    plays,
    share: true,
    ticketOdds: odds,
    rules: ["Shown as published in the desk file. ParlayBOT does not regrade or reprice these plays."],
    group,
    stamp: stamp || undefined,
    board,
  };
}

/** "ALL" is the prepared all-sports source. Any other feed key is that sport's own board. */
export function preparedKey(key: string): string {
  if (/^all$/i.test(key.trim())) return "ALL";
  return sportOf(key);
}

/** A prepared board is shown on All or Big 4 only for its own source, and on a sport only when the keys match. */
export function showsPreparedBoard(board: string | undefined, sport: string): boolean {
  if (!board) return true;
  if (sport === "All") return board === "ALL" || board === "ALL_AND_BIG4";
  if (sport === "Big 4") return board === "BIG4" || board === "ALL_AND_BIG4";
  return board === sport;
}

function parlayReady(row: Row | null): boolean {
  if (!row) return false;
  if (rowsOf(row.legs).length) return true;
  return Boolean(str(row.pick));
}

function rowsOf(value: unknown): Row[] {
  return list(value).filter(isRow);
}

function legsOrSelf(row: Row): Row[] {
  const legs = rowsOf(row.legs);
  return legs.length ? legs : [row];
}

function withTags(plays: Play[], tag: string, voided = false): Play[] {
  return plays.map((play) => ({
    ...play,
    tags: [...new Set([...(play.tags ?? []), tag])],
    blocked: voided ? "graded" : play.blocked,
    gradeNote: voided ? { text: "Void", tone: "V" as const } : play.gradeNote,
  }));
}

function ticketVoid(item: Row): boolean {
  const blob = `${str(item.pick)} ${str(item.desc)} ${str(item.status)}`;
  return /\bvoid\b/i.test(blob) || /^v(oid)?$/i.test(str(item.status));
}

function takePlays(rows: Row[], prefix: string, statuses: Map<string, PlayerStatus>, seen: Set<string>, hint = ""): Play[] {
  const plays: Play[] = [];
  rows.forEach((row, index) => {
    const play = playFrom(row, `${prefix}-${index}`, statuses, hint);
    if (!play) return;
    const key = norm(play.name);
    if (seen.has(key)) return;
    seen.add(key);
    plays.push(play);
  });
  return plays;
}

function dateLabel(iso: string): string {
  const when = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(when.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "America/New_York" }).format(when);
}

function recordLine(value: unknown): { w: number; l: number; p: number; units: number | null; pct: number | null } {
  const row = isRow(value) ? value : {};
  return { w: num(row.w) ?? 0, l: num(row.l) ?? 0, p: num(row.p) ?? 0, units: num(row.units), pct: num(row.pct) };
}

function pctOf(w: number, l: number): number | null {
  return w + l ? Math.round((w / (w + l)) * 100) : null;
}

function night(rows: Row[], iso: string, clv: Map<string, number>): { results: SettledTicket[]; recap: Recap } {
  const day = rows.filter((row) => str(row.date) === iso && row.leg !== true && ["W", "L", "V", "P"].includes(str(row.res)));
  const byCat = new Map<string, Row[]>();
  for (const row of day) {
    const cat = str(row.cat) || "Other";
    const list = byCat.get(cat) ?? [];
    list.push(row);
    byCat.set(cat, list);
  }
  const results: SettledTicket[] = [];
  let wins = 0;
  let losses = 0;
  let units = 0;
  const recapRows: Recap["rows"] = [];
  for (const [cat, items] of byCat) {
    const legs: SettledLeg[] = items.map((row) => {
      const res = str(row.res) as SettledLeg["result"];
      const name = str(row.pick) || str(row.prop) || "Play";
      const clvPct = clv.get(`${iso}|${normPick(name)}`);
      const ticket = isTicketRow(row);
      return {
        name,
        stat: [str(row.prop), str(row.odds)].filter(Boolean).join(" · "),
        result: res,
        grade: "",
        note: str(row.stat),
        beatClose: null,
        clvPct,
        date: str(row.date),
        ticket,
        parts: ticket ? ticketParts(row, rows) ?? [] : undefined,
      };
    });
    const w = legs.filter((leg) => leg.result === "W").length;
    const l = legs.filter((leg) => leg.result === "L").length;
    const uu = items.reduce((sum, row) => sum + (num(row.uu) ?? 0), 0);
    wins += w;
    losses += l;
    units += uu;
    const result: SettledTicket["result"] = w + l === 0 ? "V" : w >= l ? "W" : "L";
    results.push({
      id: `night-${norm(cat).replace(/ /g, "-")}`,
      title: displayCat(cat),
      meta: `${iso} · ${w}-${l}${legs.length - w - l ? ` · ${legs.length - w - l} void/push` : ""} · ${formatSigned(uu, 2)}u`,
      result,
      legs,
      mood: result === "W" ? "cash" : "hook",
    });
    recapRows.push({ name: displayCat(cat), text: `${w}-${l} · ${formatSigned(uu, 2)}u`, win: uu > 0 });
  }
  return {
    results,
    recap: {
      when: dateLabel(iso),
      units: `${formatSigned(units, 2)}u`,
      summary: `${wins} won · ${losses} lost · graded tickets in the desk file`,
      rows: recapRows,
    },
  };
}

function seriesFrom(chart: unknown, rows: Row[], year: number, droppedUnits?: Map<string, number>): SeriesPoint[] {
  const last = new Map<string, number>();
  const order: string[] = [];
  for (const pair of list(chart)) {
    if (!Array.isArray(pair) || pair.length < 2) continue;
    const day = str(pair[0]);
    const value = num(pair[1]);
    if (!day || value == null) continue;
    if (!last.has(day)) order.push(day);
    last.set(day, value);
  }
  const byDay = new Map<string, { w: number; l: number }>();
  for (const row of rows) {
    if (row.leg === true) continue;
    const res = str(row.res);
    if (res !== "W" && res !== "L") continue;
    const iso = str(row.date);
    const bucket = byDay.get(iso) ?? { w: 0, l: 0 };
    if (res === "W") bucket.w += 1;
    else bucket.l += 1;
    byDay.set(iso, bucket);
  }
  let cursor = year;
  let nextMonth = 99;
  const isos = new Array<string>(order.length);
  for (let index = order.length - 1; index >= 0; index -= 1) {
    const [monthText, dateText] = order[index].split("/");
    const month = Number(monthText);
    if (month > nextMonth) cursor -= 1;
    nextMonth = month;
    isos[index] = `${cursor}-${monthText.padStart(2, "0")}-${dateText.padStart(2, "0")}`;
  }
  const points = order.map((day, index) => {
    const iso = isos[index];
    const bucket = byDay.get(iso);
    const rate = bucket ? pctOf(bucket.w, bucket.l) : null;
    return { day, iso, profit: last.get(day) ?? 0, winRate: rate };
  });
  if (!droppedUnits?.size) return points;
  let debt = 0;
  let prev = "";
  for (const point of points) {
    for (const [iso, units] of droppedUnits) {
      if (iso > prev && point.iso && iso <= point.iso) debt += units;
    }
    point.profit -= debt;
    prev = point.iso ?? prev;
  }
  return points;
}

function gradesFrom(rows: Row[]): GradeMark[] {
  const marks: GradeMark[] = [];
  for (const row of rows) {
    if (row.leg === true) continue;
    const res = str(row.res);
    const date = str(row.date);
    if (!date || (res !== "W" && res !== "L")) continue;
    const pick = str(row.pick);
    const prop = str(row.prop);
    const fam = str(row.fam);
    const stat = str(row.stat);
    const label = normProp(fam, prop, pick, stat);
    const famMissing = !fam.trim() || fam.trim().toLowerCase() === "other";
    const capper = capperOf(prop) || capperOf(pick);
    const cat = str(row.cat);
    const listed = Array.isArray(row.cats) ? row.cats.map(str).filter(Boolean) : [];
    marks.push({
      date,
      cat,
      cats: listed.length ? listed : [cat],
      win: res === "W",
      units: num(row.uu) ?? 0,
      unitsKnown: num(row.uu) != null,
      odds: str(row.odds) || undefined,
      stat: str(row.stat) || undefined,
      sport: normSport(str(row.sport)),
      prop: label,
      side: normSide(pick, prop, row.alt === true),
      capper: capper || undefined,
      detail: famMissing && label !== "First Blood" ? pick : undefined,
      play: pick || prop || "Play",
      ticket: isTicketRow(row),
      ticketKey: str(row.ticket_key) || undefined,
      parts: isTicketRow(row) ? ticketParts(row, rows) ?? [] : undefined,
    });
  }
  return marks;
}

function ringsFrom(rows: Row[]): Board["rings"] {
  const wanted: [string, string][] = [
    ["The Heist", "HEIST"],
    ["Safe +100 (Alt Parlay)", "Safe"],
    ["Edge", "Edge"],
    ["Cappers", "Cappers"],
    ["POTD", "POTD"],
    ["LEG DAY", "Props"],
    ["Parlay +100", "Parlay"],
    ["Alt lines", "Alt lines"],
  ];
  const tally = new Map<string, { w: number; l: number }>();
  for (const row of rows) {
    if (row.leg === true) continue;
    const res = str(row.res);
    if (res !== "W" && res !== "L") continue;
    const listed = Array.isArray(row.cats) ? row.cats.map(str).filter(Boolean) : [];
    const cats = listed.length ? listed : [str(row.cat)];
    for (const cat of cats) {
      const bucket = tally.get(cat) ?? { w: 0, l: 0 };
      if (res === "W") bucket.w += 1;
      else bucket.l += 1;
      tally.set(cat, bucket);
    }
  }
  const rings: Board["rings"] = [];
  for (const [cat, label] of wanted) {
    const bucket = tally.get(cat);
    const pct = bucket ? pctOf(bucket.w, bucket.l) : null;
    if (pct == null) continue;
    rings.push({ pct, label });
  }
  return rings;
}

function statRow(name: string, record: ReturnType<typeof recordLine>, withUnits = false): StatRow {
  const pct = record.pct ?? pctOf(record.w, record.l);
  return {
    name,
    sub: `${record.w}-${record.l}${record.p ? `-${record.p}` : ""}`,
    right: withUnits && record.units != null ? `${formatSigned(record.units, 2)}u` : pct == null ? "—" : `${pct}%`,
  };
}

function privateFrom(raw: Row, rows: Row[]): PrivateStats {
  const summary = isRow(raw.results_v2) && isRow(raw.results_v2.summary) ? raw.results_v2.summary : {};
  const unofficial: StatRow[] = [];
  const first = isRow(summary.F) ? recordLine(isRow(summary.F.tickets) ? summary.F.tickets : null) : null;
  const td = isRow(summary.T) ? recordLine(isRow(summary.T.tickets) ? summary.T.tickets : null) : null;
  if (first) unofficial.push(statRow("First Blood tickets", first, true));
  if (td) unofficial.push(statRow("TD City tickets", td, true));
  const props = list(isRow(raw.record) ? raw.record.props : null)
    .filter(isRow)
    .map((row) => ({ row, n: (num(row.w) ?? 0) + (num(row.l) ?? 0) }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 12)
    .map(({ row }) => statRow(str(row.prop) || "Prop", recordLine(row)));
  const edge = isRow(raw.edge_record) && isRow(raw.edge_record.overall) ? raw.edge_record.overall : {};
  const edgeRec = recordLine(edge);
  const bySport = isRow(raw.edge_record) && isRow(raw.edge_record.by_sport) ? raw.edge_record.by_sport : {};
  const sports = Object.entries(bySport).flatMap(([sport, value]) => (isRow(value) ? [statRow(sport, recordLine(value), true)] : []));
  const greenSrc = isRow(raw.edge) && isRow(raw.edge.green) && isRow(raw.edge.green.backtest) ? raw.edge.green.backtest : null;
  const green: StatRow[] = [];
  if (greenSrc) {
    const label = str(greenSrc.label) || "backtest";
    green.push({ name: "Window", sub: `${str(greenSrc.since)} – ${str(greenSrc.through)}`, right: label });
    green.push({ name: "Green plays", sub: `${str(greenSrc.green)} of ${str(greenSrc.plays)}`, right: "" });
    green.push({ name: "Record", sub: `${str(greenSrc.w)}-${str(greenSrc.l)}`, right: `${formatSigned(num(greenSrc.units) ?? 0, 1)}u` });
  }
  return {
    unofficial,
    props,
    edgeUnits: edgeRec.units == null ? "—" : `${formatSigned(edgeRec.units, 2)}u`,
    edgeLine: `${edgeRec.w}-${edgeRec.l}${edgeRec.p ? `-${edgeRec.p}` : ""} · ${edgeRec.pct ?? pctOf(edgeRec.w, edgeRec.l) ?? "—"}% · pending ${num(edge.pending) ?? 0}`,
    edgeSports: sports,
    green,
    ringNote: `Graded tickets in the desk file (${rows.length} result rows). Pending plays are not in the percentage.`,
  };
}

function lastGraded(rows: Row[], today: string): string {
  const dates = rows
    .filter((row) => str(row.date) < today && row.leg !== true && (str(row.res) === "W" || str(row.res) === "L"))
    .map((row) => str(row.date))
    .sort();
  return dates[dates.length - 1] ?? "";
}

export async function fetchDesk(): Promise<unknown> {
  const response = await fetch(`${DESK_URL}?v=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`desk ${response.status}`);
  return response.json();
}

const ALIAS: Record<string, string> = { NYK: "NY" };

function starTeams(tickets: Ticket[]): Set<string> {
  const stars = new Set<string>();
  for (const ticket of tickets) {
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

export function adaptDesk(raw: unknown, ncaab: StandingLeague): Board {
  const data = isRow(raw) ? raw : {};
  const today = isRow(data.today) ? data.today : {};
  const iso = str(today.date);
  const statuses = statusIndex(data.player_status);
  const tickets: Ticket[] = [];
  const notices: CardNote[] = [];

  const heist = isRow(data.heist) ? data.heist : null;
  const heistMark = heistLabel(heist);
  const heistCards = buildHeist(heist, statuses);
  tickets.push(...heistCards.tickets);
  if (heistCards.notice) notices.push(heistCards.notice);

  const retirement = propRetirementFrom(data);
  const propCards = propTicketsFrom(data, iso, (row, id, hint) => playFrom(row, id, statuses, hint));
  tickets.push(...propCards.tickets);
  notices.push(...propCards.notices);

  const sports = isRow(today.sports) ? today.sports : {};
  for (const item of rowsOf(today.tickets)) {
    if (!/potd/i.test(str(item.name))) continue;
    const name = str(item.name) || "POTD";
    const plays = withTags(takePlays(legsOrSelf(item), `potd-ticket-${norm(name).replace(/ /g, "-")}`, statuses, new Set()), "POTD · Big 4");
    const card = ticket(`potd-ticket-${norm(name).replace(/ /g, "-")}`, "potd", "POTD · Big 4", ["Big 4 · MLB · NHL · NBA · NFL", str(item.desc) || str(item.pick)].filter(Boolean).join(" · "), plays, "official", oddsOf(item.odds) ?? undefined, builtLabel(item), "BIG4");
    if (card) tickets.push(card);
  }
  for (const [key, value] of Object.entries(sports)) {
    if (!isRow(value) || !isRow(value.potd)) continue;
    const board = preparedKey(key);
    if (board === "ALL") {
      const plays = withTags(takePlays(legsOrSelf(value.potd), "potd-all", statuses, new Set()), "POTD · All");
      const card = ticket("potd-all", "potd", "POTD · All sports", ["All sports · Best pick", str(value.potd.desc) || str(value.potd.pick)].filter(Boolean).join(" · "), plays, "official", oddsOf(value.potd.odds) ?? undefined, builtLabel(value.potd), "ALL");
      if (card) tickets.push(card);
      continue;
    }
    if (board === "Other") continue;
    const plays = withTags(takePlays(legsOrSelf(value.potd), `potd-${board}`, statuses, new Set(), key), `POTD · ${board}`);
    const card = ticket(`potd-${board}`, "potd", `POTD · ${sportLabel(board)}`, str(value.potd.desc) || str(value.potd.pick) || sportLabel(board), plays, "official", oddsOf(value.potd.odds) ?? undefined, builtLabel(value.potd), board);
    if (card) tickets.push(card);
  }

  const labelMap = isRow(data.ticket_labels) ? data.ticket_labels : {};
  const officialName = str(labelMap.parlay100) || "Parlay +100";
  const allSports = isRow(sports.ALL) ? sports.ALL : {};
  const allParlay = isRow(allSports.parlay) ? allSports.parlay : null;
  const sharedParlay = !parlayReady(allParlay);
  for (const item of rowsOf(today.tickets)) {
    const name = str(item.name);
    if (/potd/i.test(name)) continue;
    if (/safe/i.test(name)) {
      const plays = takePlays(legsOrSelf(item), "safe-ticket", statuses, new Set());
      const card = ticket("safe", "safe", name, str(item.desc) || "Desk", plays, "main", oddsOf(item.odds) ?? undefined, builtLabel(item));
      if (card) tickets.push(card);
      else if (!retirement && str(item.pick) && !(/builds at the 10 AM|not at 7 AM/i.test(str(item.pick)) && rowsOf(today.tickets).some((ticket) => /\+100|parlay/i.test(str(ticket.name)) && !/safe/i.test(str(ticket.name)) && rowsOf(ticket.legs).length))) notices.push({ text: `${name}: ${str(item.pick)}`, section: "parlay", sport: null });
      continue;
    }
    const rawPlays = takePlays(legsOrSelf(item), `t-${norm(name).replace(/ /g, "-")}`, statuses, new Set());
    const board = sharedParlay ? "ALL_AND_BIG4" : "BIG4";
    const baseTag = board === "BIG4" ? "+100 · Big 4" : "+100";
    const voidTicket = ticketVoid(item);
    const plays = withTags(rawPlays, voidTicket ? `${baseTag} · Void` : baseTag, voidTicket);
    const title = sharedParlay ? officialName : `${officialName} · Big 4`;
    const meta = [voidTicket ? "Void" : "", sharedParlay ? "All sports · Big 4" : "Big 4 · MLB · NHL · NBA · NFL", str(item.desc) || str(item.pick)].filter(Boolean).join(" · ");
    const card = ticket(`parlay-${norm(name).replace(/ /g, "-")}`, "parlay", title, meta, plays, "official", oddsOf(item.odds) ?? undefined, builtLabel(item), board);
    if (card) tickets.push(card);
  }
  for (const [sport, value] of Object.entries(sports)) {
    if (!isRow(value) || !isRow(value.parlay)) continue;
    const board = preparedKey(sport);
    if (board === "ALL") {
      const voidTicket = ticketVoid(value.parlay);
      const plays = withTags(takePlays(legsOrSelf(value.parlay), "parlay-all", statuses, new Set()), voidTicket ? "+100 · All · Void" : "+100 · All", voidTicket);
      const card = ticket("parlay-all", "parlay", `${officialName} · All sports`, [voidTicket ? "Void" : "", "Best picks", str(value.parlay.pick) || str(value.parlay.desc)].filter(Boolean).join(" · "), plays, "official", oddsOf(value.parlay.odds) ?? undefined, builtLabel(value.parlay), "ALL");
      if (card) tickets.push(card);
      continue;
    }
    if (board === "Other") continue;
    const voidTicket = ticketVoid(value.parlay);
    const plays = withTags(takePlays(legsOrSelf(value.parlay), `parlay-${board}`, statuses, new Set(), sport), voidTicket ? `+100 · ${board} · Void` : `+100 · ${board}`, voidTicket);
    const card = ticket(`parlay-${board}`, "parlay", `${officialName} · ${sportLabel(board)}`, [voidTicket ? "Void" : "", str(value.parlay.pick) || sportLabel(board)].filter(Boolean).join(" · "), plays, "official", oddsOf(value.parlay.odds) ?? undefined, builtLabel(value.parlay), board);
    if (card) tickets.push(card);
  }

  const edge = isRow(data.edge) ? data.edge : {};
  const edgePlays = withTags(takePlays(rowsOf(edge.picks), "edge", statuses, new Set()), "Edge");
  const edgeTicket = ticket("edge", "edge", "Edge", str(edge.date) ? `Desk edge ${str(edge.date)}` : "Desk edge", edgePlays, "edge", undefined, builtLabel(edge));
  if (edgeTicket) tickets.push(edgeTicket);

  const legday = isRow(data.legday) ? data.legday : {};
  const legPlays = rowsOf(legday.board).flatMap((row, index) => {
    const play = playFrom(row, `legday-${index}`, statuses);
    return play ? [{ ...play, tags: [row.alt === true ? "Props ALT" : "Props"] }] : [];
  });
  const legTicket = ticket("legday", "legday", "Props", str(legday.date) || "Desk", legPlays, "props", undefined, builtLabel(legday));
  if (legTicket) tickets.push(legTicket);

  const cappers: Capper[] = [];
  const capperPlays: Play[] = [];
  for (const item of rowsOf(data.cappers)) {
    const name = str(item.name) || "Capper";
    const handle = name.startsWith("@") ? name : `Capper · ${name}`;
    const plays = rowsOf(item.today)
      .map((row, index) => playFrom({ ...row, sport: str(row.sport) }, `cap-${norm(name).replace(/ /g, "-")}-${index}`, statuses))
      .filter((play): play is Play => !!play)
      .map((play) => ({ ...play, tags: [...new Set([...(play.tags ?? []), handle])] }));
    const record = recordLine(item);
    const profile = num(item.w) != null || num(item.l) != null || num(item.pct) != null
      ? { w: num(item.w) ?? 0, l: num(item.l) ?? 0, p: num(item.p) ?? 0, pct: num(item.pct) }
      : undefined;
    const recentParlays = rowsOf(item.recent_parlays).map((row) => ({
      date: str(row.date),
      pick: str(row.pick),
      result: str(row.result) || str(row.res),
      ticketId: str(row.ticket_id),
      parts: ticketParts(row, [row]) ?? [],
    }));
    cappers.push({
      id: norm(name).replace(/ /g, "-"),
      name,
      group: plays.some((play) => /action network/i.test(play.name)) ? "an" : "heist",
      record: profile ? `${profile.w}-${profile.l}${profile.p ? `-${profile.p}` : ""} · ${profile.pct ?? "—"}%` : `${record.w}-${record.l}${record.p ? `-${record.p}` : ""} · ${record.pct ?? "—"}%`,
      plays,
      note: plays.length ? undefined : "No play in today's file.",
      profile,
      recentParlays,
    });
    capperPlays.push(...plays);
  }
  const capperTicket = ticket("cappers", "cappers", "Cappers", "Every play in today's file. A missing book id stays on the card.", capperPlays, "cappers");
  if (capperTicket) tickets.push(capperTicket);
  const quiet = cappers.filter((capper) => !capper.plays.length).map((capper) => capper.name);
  if (quiet.length) notices.push({ text: `No capper play today: ${quiet.join(", ")}.`, section: "cappers", sport: null });

  const firstTicket = firstBloodTicket(isRow(data.first_blood) ? data.first_blood : null, iso, statuses);
  if (firstTicket) tickets.push(firstTicket);
  const td = isRow(data.td_city) ? data.td_city : {};
  const tdLegs = rowsOf(td.legs);
  const tdSport = classifySport(str(td.sport) || str(td.title));
  const tdCurrent = tdLegs.length > 0 && (!iso || str(td.date) >= iso || tdLegs.some((leg) => str(leg.game_date) >= iso || str(leg.date) >= iso));
  if (tdCurrent && tdSport === "NFL") {
    const plays = withTags(takePlays(tdLegs, "lotto", statuses, new Set(), "NFL"), "Lotto Ticket");
    const card = ticket("lotto", "lotto", str(td.title) || "Lotto Ticket", str(td.label) || "Lotto Ticket", plays, "fun");
    if (card) tickets.push(card);
  } else if (!tdLegs.length && str(td.rolled_off || td.msg)) notices.push({ text: str(td.rolled_off || td.msg), section: "lotto", sport: "NFL" });
  const altRaw = Array.isArray(data.alt_lines) ? data.alt_lines : isRow(data.alt_lines) ? data.alt_lines.rows ?? data.alt_lines.board ?? [] : [];
  const altToday = rowsOf(altRaw).filter((row) => !str(row.date) || str(row.date) === iso);
  if (altToday.length) {
    const plays = withTags(takePlays(altToday, "alt-lines", statuses, new Set()), "Props ALT");
    const card = ticket("alt-lines", "legday", "Props ALT", "Desk", plays, "props");
    if (card) tickets.push(card);
  }

  const resultRows = rowsOf(isRow(data.results_v2) ? data.results_v2.rows : null);
  const chart = isRow(data.record) ? data.record.chart : null;
  const unique = dedupePlays(resultRows, chart);
  const graded = lastGraded(unique.rows, iso || "9999");
  const clv = adaptClv(data.clv);
  const settled = graded
    ? night(unique.rows, graded, clv ? clvLookup(clv.plays) : new Map())
    : { results: [], recap: { when: "No graded night in the file", units: "—", summary: "Nothing to total.", rows: [] } };
  const year = Number((iso || graded || "2026").slice(0, 4)) || 2026;
  const preparation = readHeistContract(data);
  if (preparation) {
    const hold = "Legacy row link is not an original action.";
    const strip = (play: Play): Play => ({
      ...play,
      hrSid: undefined,
      hrLink: undefined,
      dkSid: undefined,
      dkLink: undefined,
      hrUnverified: hold,
      dkHold: hold,
    });
    for (const capper of cappers) capper.plays = capper.plays.map(strip);
    for (const card of tickets) {
      if (card.id === "cappers") card.plays = card.plays.map(strip);
    }
  }

  return {
    dateLabel: iso ? dateLabel(iso) : "Desk",
    feedMode: "live",
    banner: null,
    cachedAt: null,
    slateDate: iso,
    notices,
    tickets,
    cappers,
    liveTickets: [],
    liveGames: [],
    liveNote: "",
    liveUpdated: "ESPN scores load with this card.",
    liveMood: null,
    results: settled.results,
    recap: settled.recap,
    series: seriesFrom(chart, unique.rows, year, unique.droppedUnits),
    grades: gradesFrom(unique.rows),
    rings: ringsFrom(unique.rows),
    nascar: { when: "", rows: [] },
    edgePicks: [],
    edgeSkipped: 0,
    stars: starTeams(tickets),
    standings: adaptDeskStandings((isRow(data.standings) ? data.standings : {}) as DeskStandings, ncaab),
    privateStats: privateFrom(data, unique.rows),
    teamVs: data.teamvs ?? null,
    updated: updatedLabel(data.generated),
    heistStamp: heistMark,
    injuryCheck: injuryLabel(data.late_injury),
    lockCheck: lockLabel(data.lock_check),
    dkPrices: dkLabel(data.dk),
    standingsUpdated: standingsLabel(data.standings),
    uiBuild: uiBuildLabel(data.ui_build),
    teamBuilt: builtLabel(data.teamvs),
    clv,
    fbNote: str(isRow(data.fb_legs) ? data.fb_legs.note : ""),
    fbLegs: fbLegRows(data.fb_legs),
    nightLive: null,
    propLedgers: propLedgersFrom(data, retirement),
    propRetirement: retirement,
    ticketLabels: isRow(data.ticket_labels)
      ? { parlay100: str(data.ticket_labels.parlay100) || undefined, safe250: str(data.ticket_labels.safe250) || undefined }
      : undefined,
    preparation,
  };
}

function firstBloodTicket(raw: Row | null, slate: string, statuses: Map<string, PlayerStatus>): Ticket | null {
  if (!raw || str(raw.date) !== slate) return null;
  const legs = rowsOf(raw.legs);
  if (!legs.length) return null;
  const plays = legs.map((leg, index) => firstBloodPlay(leg, index, statuses, str(raw.sport)));
  const locked = raw.final === true || raw.full_locked === true || !!str(raw.locked_at);
  const stamp = [locked ? "Locked · final" : "", str(raw.label)].filter(Boolean).join(" · ");
  return {
    id: "first",
    productKey: "first",
    title: str(raw.title) || str(raw.name) || "First Blood",
    meta: [str(raw.odds) ? `Est. ${str(raw.odds)}` : "", str(raw.odds_note)].filter(Boolean).join(" · "),
    badge: "fun",
    plays,
    share: true,
    ticketOdds: str(raw.odds) || undefined,
    rules: str(raw.why) ? str(raw.why).split(/\s+\|\s+/).slice(0, 8) : ["Unofficial. Not in the official win-loss record."],
    group: "fun",
    stamp: stamp || undefined,
  };
}

function firstBloodPlay(leg: Row, index: number, statuses: Map<string, PlayerStatus>, sportName: string): Play {
  const player = str(leg.player) || str(leg.pick);
  const score = num(leg.score);
  const model = score == null ? "" : `model ${score.toFixed(1)}%`;
  const lines = str(leg.why).split(/\n+|\s+\|\s+/).map((line) => line.trim()).filter(Boolean);
  const absent = leg.dk_absent === true || !str(leg.dk_sid);
  return {
    id: `first-${index}`,
    name: player,
    detail: [str(leg.team), str(leg.market) || str(leg.pick), model, str(leg.game), absent ? "Not on DK" : ""].filter(Boolean).join(" · "),
    sport: classifySport(sportName || str(leg.sport)),
    hr: oddsOf(leg.odds, leg.hr_live),
    dk: absent ? null : oddsOf(leg.dk_live),
    status: statuses.get(norm(player)),
    gameText: str(leg.game),
    why: { ours: false, line: lines[0]?.slice(0, 110) || str(leg.pick), why: lines.length ? lines : [str(leg.pick)], whyNot: str(leg.why_not) ? [str(leg.why_not)] : [] },
    source: "desk",
    hrSid: /^\d+$/.test(str(leg.hr_sid)) ? str(leg.hr_sid) : undefined,
    hrLink: str(leg.hr_link) || undefined,
    tags: ["First Blood"],
  };
}

export const SLATE_CACHE_KEY = "parlaybot-slate-cache-v1";

export type SlateSnap = {
  slateDate: string;
  tickets: Ticket[];
  cappers: Capper[];
  teamVs: unknown;
  teamBuilt: string | null;
};

type SlateStore = { getItem(key: string): string | null; setItem(key: string, value: string): void };

/** Keep the two newest slates that actually have plays. */
export function rememberSlate(entries: SlateSnap[], entry: SlateSnap): SlateSnap[] {
  const plays = entry.tickets.some((ticket) => ticket.plays.length) || entry.cappers.some((capper) => capper.plays.length);
  if (!entry.slateDate || !plays) return entries;
  const next = [entry, ...entries.filter((item) => item.slateDate !== entry.slateDate)];
  return next.sort((a, b) => b.slateDate.localeCompare(a.slateDate)).slice(0, 2);
}

function isSnap(value: unknown): value is SlateSnap {
  if (!isRow(value) || typeof value.slateDate !== "string" || !Array.isArray(value.tickets)) return false;
  return true;
}

export function readSlateCache(storage: SlateStore | null): SlateSnap[] {
  if (!storage) return [];
  try {
    const raw = JSON.parse(storage.getItem(SLATE_CACHE_KEY) || "[]") as unknown;
    return Array.isArray(raw) ? raw.filter(isSnap) : [];
  } catch {
    return [];
  }
}

export function writeSlateCache(storage: SlateStore | null, entries: SlateSnap[]): void {
  if (!storage) return;
  try {
    storage.setItem(SLATE_CACHE_KEY, JSON.stringify(entries.slice(0, 2)));
  } catch {
    /* private mode */
  }
}

/** Map a results row onto the card tags. */
export function replayTag(row: { grp?: unknown; cat?: unknown; prop?: unknown; sub?: unknown; pick?: unknown; alt?: unknown }): string {
  const cat = str(row.cat);
  const prop = str(row.prop);
  const blob = `${str(row.grp)} ${cat} ${prop} ${str(row.sub)}`.toLowerCase();
  const handle = prop.match(/@([a-z0-9_]+)/i);
  if (/first blood/i.test(cat) || /first blood/i.test(blob)) return "First Blood";
  if (/heist/i.test(blob) && (row.alt === true || /alt/i.test(`${cat} ${prop} ${str(row.sub)}`))) return "Heist ALT";
  if (/heist/i.test(blob)) return "Heist";
  if (/leg\s*day/i.test(cat) && (row.alt === true || /\balt\b/i.test(prop))) return "Props ALT";
  if (/leg\s*day/i.test(cat)) return "Props";
  if (/^edge$/i.test(cat) || str(row.grp) === "E") return "Edge";
  if (/potd/i.test(cat)) return "POTD";
  if (/\+100|parlay/i.test(cat)) return "+100";
  if (handle) return `@${handle[1]}`;
  if (/^cappers$/i.test(cat) || str(row.grp) === "C") return "@capper";
  return cat || "Play";
}

function summaryRow(row: Row): boolean {
  if (Array.isArray(row.legs) && row.legs.length > 0) return true;
  return /\d+\s*-?\s*leg\b/i.test(str(row.pick));
}

function expanded(row: Row): Row[] {
  if (Array.isArray(row.legs) && row.legs.length) {
    return rowsOf(row.legs).map((leg) => ({
      ...leg,
      cat: str(leg.cat) || str(row.cat),
      grp: leg.grp ?? row.grp,
      sport: str(leg.sport) || str(row.sport),
      alt: leg.alt ?? row.alt,
    }));
  }
  const sub = str(row.sub);
  if (!sub.includes(" + ")) return [];
  return sub.split(/\s+\+\s+/).filter(Boolean).map((part) => ({ ...row, pick: part.trim(), sub: "", leg: true }));
}

function codesIn(text: string): { away: string; home: string } | null {
  const match = text.match(/\b([A-Z]{2,5})\s*(?:@|vs\.?)\s*([A-Z]{2,5})\b/);
  if (!match?.[1] || !match[2]) return null;
  return { away: match[1], home: match[2] };
}

function resultPlay(row: Row, index: number): Play | null {
  const name = str(row.pick) || str(row.player);
  if (!name || isPlaceholder(name) || /\d+\s*-?\s*leg\b/i.test(name)) return null;
  const sport = classifySport(str(row.sport));
  const codes = codesIn(name);
  const whyLine = str(row.why);
  const tag = replayTag(row);
  return {
    id: `replay-${index}`,
    name,
    detail: [sport === "Other" ? str(row.sport) || "Other" : sportLabel(sport), str(row.prop)].filter(Boolean).join(" · "),
    sport,
    hr: oddsOf(row.odds),
    dk: null,
    why: { ours: false, line: whyLine.slice(0, 110), why: whyLine ? [whyLine] : [], whyNot: [] },
    showWhy: whyLine ? undefined : false,
    source: "desk",
    tags: [tag],
    gameText: name,
    matchup: codes
      ? { away: { abbr: codes.away, record: "—", standing: "—" }, home: { abbr: codes.home, record: "—", standing: "—" } }
      : undefined,
  };
}

function datedPlays(data: Row, date: string): Play[] {
  const out: Play[] = [];
  const take = (rows: Row[], tag: string, prefix: string) => {
    rows.forEach((row, index) => {
      const play = playFrom(row, `${prefix}-${index}`, new Map());
      if (!play) return;
      const alt = row.alt === true && tag === "Heist" ? "Heist ALT" : row.alt === true && tag === "Props" ? "Props ALT" : tag;
      out.push({ ...play, tags: [...new Set([...(play.tags ?? []), alt])] });
    });
  };
  const heist = isRow(data.heist) ? data.heist : null;
  if (heist && str(heist.date) === date) take(rowsOf(heist.legs), "Heist", "heist");
  const edge = isRow(data.edge) ? data.edge : null;
  if (edge && str(edge.date) === date) take(rowsOf(edge.picks), "Edge", "edge");
  const legday = isRow(data.legday) ? data.legday : null;
  if (legday && str(legday.date) === date) take(rowsOf(legday.board), "Props", "props");
  const first = isRow(data.first_blood) ? data.first_blood : null;
  if (first && str(first.date) === date) take(rowsOf(first.legs), "First Blood", "fb");
  for (const capper of rowsOf(data.cappers)) {
    if (str(capper.date) !== date) continue;
    const name = str(capper.name);
    const handle = name.startsWith("@") ? name : `@${name.replace(/\s+/g, "")}`;
    take(rowsOf(capper.today), handle || "@capper", `cap-${norm(handle)}`);
  }
  return out;
}

function resultPlays(data: Row, date: string): Play[] {
  const rows = rowsOf(isRow(data.results_v2) ? data.results_v2.rows : null).filter((row) => str(row.date) === date);
  const out: Play[] = [];
  rows.forEach((row, index) => {
    if (summaryRow(row)) {
      expanded(row).forEach((leg, legIndex) => {
        const play = resultPlay(leg, index * 100 + legIndex);
        if (play) out.push(play);
      });
      return;
    }
    const play = resultPlay(row, index);
    if (play) out.push(play);
  });
  return out;
}

/** Cold-device copy of yesterday: sections still dated that day, plus results_v2 legs. */
export function replayYesterday(raw: unknown, date: string): { tickets: Ticket[]; cappers: Capper[] } {
  const data = isRow(raw) ? raw : {};
  const seen = new Set<string>();
  const plays: Play[] = [];
  for (const play of [...datedPlays(data, date), ...resultPlays(data, date)]) {
    const key = norm(play.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    plays.push(play);
  }
  const capperMap = new Map<string, Play[]>();
  const buckets = new Map<string, Play[]>();
  for (const play of plays) {
    const tag = play.tags?.[0] || "Play";
    if (tag.startsWith("@")) {
      const list = capperMap.get(tag) ?? [];
      list.push(play);
      capperMap.set(tag, list);
      continue;
    }
    const list = buckets.get(tag) ?? [];
    list.push(play);
    buckets.set(tag, list);
  }
  const tickets: Ticket[] = [...buckets.entries()].map(([tag, list]) => ({
    id: `replay-${norm(tag).replace(/ /g, "-") || "play"}`,
    productKey: "replay",
    title: tag,
    meta: date,
    plays: list,
    share: false,
    rules: ["Rebuilt from last night's desk file."],
    group: "main" as const,
  }));
  const cappers: Capper[] = [...capperMap.entries()].map(([name, list]) => ({
    id: norm(name).replace(/ /g, "-") || "capper",
    name,
    group: "heist" as const,
    record: "",
    plays: list,
  }));
  return { tickets, cappers };
}

function fbLegRows(raw: unknown): { date: string; player: string; team: string; odds: string; hit: string; note: string }[] {
  if (!isRow(raw)) return [];
  return rowsOf(raw.rows).map((row) => ({
    date: str(row.date),
    player: str(row.player),
    team: str(row.team),
    odds: str(row.odds),
    hit: str(row.hit) || str(row.settled),
    note: str(row.note),
  }));
}
