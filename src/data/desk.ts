import { adaptDeskStandings, type DeskStandings } from "./adaptStandings.ts";
import type { Board, PrivateStats, StatRow } from "./board.ts";
import type {
  Capper,
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
import { formatSigned } from "../lib/format.ts";
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
  const s = raw.toUpperCase();
  if (s.includes("WNBA")) return "WNBA";
  if (s.includes("NBA")) return "NBA";
  if (s.includes("NHL")) return "NHL";
  if (s.includes("NFL")) return "NFL";
  if (s.includes("MLB")) return "MLB";
  if (s.includes("NASCAR")) return "NASCAR";
  return "NCAA";
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
  const fromList = Array.isArray(row.gameday) ? bullets(row.gameday, "").filter(Boolean) : [];
  const fromWhy = str(row.why) ? bullets(row.why, "").filter(Boolean) : [];
  const whyLines = fromList.length ? fromList : fromWhy;
  const whyNot = str(row.why_not) ? bullets(row.why_not, "").filter(Boolean) : [];
  const line = (whyLines[0] || str(row.pick) || "Desk play").slice(0, 110);
  return { ours: false, line, why: whyLines.length ? whyLines : ["No why text in the desk file."], whyNot };
}

function playerOf(pick: string): string {
  const cleaned = pick.replace(/^#\d+\s+/, "").replace(/^\((?:Quality|\+EV)\)\s*/i, "");
  const match = cleaned.match(/^(.+?)\s+(Over|Under)\b/i);
  return (match ? match[1] : cleaned).trim();
}

function blockedOf(row: Row): Play["blocked"] {
  const res = str(row.result || row.res || row.status).toLowerCase();
  if (["w", "l", "v", "p", "win", "loss", "won", "lost", "push", "void"].includes(res)) return "graded";
  if (row.started === true || row.final === true) return "started";
  return undefined;
}

function pickText(row: Row): string {
  const pick = str(row.pick);
  if (pick) return pick;
  const player = str(row.player);
  const prop = str(row.prop);
  if (player && prop) return `${player} ${prop}`;
  return prop || player;
}

function playFrom(row: Row, id: string, statuses: Map<string, PlayerStatus>): Play | null {
  const pick = pickText(row);
  if (isPlaceholder(pick)) return null;
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
  if (edge != null && edge >= 0.06 && edge <= 0.08) markers.push({ kind: "star", label: "Star" });
  if (row.green_circle === true) markers.push({ kind: "green", label: "Green" });
  if (/shots on goal|\bsog\b/i.test(pick)) markers.push({ kind: "sog", label: "SOG" });
  else if (/assist/i.test(pick)) markers.push({ kind: "assist", label: "Assist" });
  const game = str(row.game) || str(ctx?.game);
  const start = str(row.start_et) || str(row.start) || str(row.kick);
  const sport = sportOf(str(row.sport) || str(ctx?.sport));
  const name = playerOf(pick);
  const status = statuses.get(norm(name));
  const alt = row.alt === true ? " · Alt line" : "";
  return {
    id,
    name: pick,
    detail: [sport, game, start].filter(Boolean).join(" · ") + alt,
    sport,
    hr: oddsOf(row.hr, row.odds, row.hr_now),
    dk: dkOff ? null : oddsOf(dk?.odds, row.dk_live, row.dk_odds),
    markers: markers.length ? markers : undefined,
    blocked: blockedOf(row),
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
  };
}

function rowsOf(value: unknown): Row[] {
  return list(value).filter(isRow);
}

function legsOrSelf(row: Row): Row[] {
  const legs = rowsOf(row.legs);
  return legs.length ? legs : [row];
}

function takePlays(rows: Row[], prefix: string, statuses: Map<string, PlayerStatus>, seen: Set<string>): Play[] {
  const plays: Play[] = [];
  rows.forEach((row, index) => {
    const play = playFrom(row, `${prefix}-${index}`, statuses);
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

function night(rows: Row[], iso: string): { results: SettledTicket[]; recap: Recap } {
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
      return {
        name: str(row.pick) || str(row.prop) || "Play",
        stat: [str(row.prop), str(row.odds)].filter(Boolean).join(" · "),
        result: res,
        grade: "",
        note: str(row.stat),
        beatClose: null,
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
      title: cat,
      meta: `${iso} · ${w}-${l}${legs.length - w - l ? ` · ${legs.length - w - l} void/push` : ""} · ${formatSigned(uu, 2)}u`,
      result,
      legs,
      mood: result === "W" ? "cash" : "hook",
    });
    recapRows.push({ name: cat, text: `${w}-${l} · ${formatSigned(uu, 2)}u`, win: uu > 0 });
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

function seriesFrom(chart: unknown, rows: Row[], year: number): SeriesPoint[] {
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
  return order.slice(-14).map((day) => {
    const [month, date] = day.split("/");
    const iso = `${year}-${month.padStart(2, "0")}-${date.padStart(2, "0")}`;
    const bucket = byDay.get(iso);
    const rate = bucket ? pctOf(bucket.w, bucket.l) : null;
    return { day, profit: last.get(day) ?? 0, winRate: rate };
  });
}

function ringsFrom(rows: Row[]): Board["rings"] {
  const wanted: [string, string][] = [
    ["The Heist", "HEIST"],
    ["Safe +100 (Alt Parlay)", "Safe"],
    ["Edge", "Edge"],
    ["Cappers", "Cappers"],
    ["POTD", "POTD"],
    ["LEG DAY", "LEG DAY"],
    ["Parlay +100", "Parlay"],
    ["Alt lines", "Alt lines"],
  ];
  const tally = new Map<string, { w: number; l: number }>();
  for (const row of rows) {
    if (row.leg === true) continue;
    const res = str(row.res);
    if (res !== "W" && res !== "L") continue;
    const cat = str(row.cat);
    const bucket = tally.get(cat) ?? { w: 0, l: 0 };
    if (res === "W") bucket.w += 1;
    else bucket.l += 1;
    tally.set(cat, bucket);
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
  const notices: string[] = [];

  const heist = isRow(data.heist) ? data.heist : null;
  const heistPlays = takePlays(rowsOf(heist?.legs), "heist", statuses, new Set());
  const heistMark = heistLabel(heist);
  const heistTicket = ticket("heist", "heist", "THE HEIST", heist ? str(heist.msg) || str(heist.status) || "Desk" : "Desk", heistPlays, "main", heist ? oddsOf(heist.odds) ?? undefined : undefined, heistMark);
  if (heistTicket) tickets.push(heistTicket);
  else if (heist && (str(heist.msg) || str(heist.status))) notices.push(`THE HEIST: ${str(heist.msg) || str(heist.status)}. No legs in the file.`);

  const safe = isRow(data.safe100) ? data.safe100 : {};
  const safePlays = takePlays(rowsOf(safe.legs ?? safe.plays), "safe", statuses, new Set());
  const safeTicket = ticket("safe", "safe", "Safe +100", "Desk", safePlays, "main", undefined, builtLabel(safe));
  if (safeTicket) tickets.push(safeTicket);

  const potdSeen = new Set<string>();
  const potdRows: Row[] = [];
  for (const item of rowsOf(today.tickets)) {
    if (!/potd/i.test(str(item.name))) continue;
    potdRows.push(...legsOrSelf(item));
  }
  const sports = isRow(today.sports) ? today.sports : {};
  for (const value of Object.values(sports)) {
    if (!isRow(value) || !isRow(value.potd)) continue;
    potdRows.push(value.potd);
  }
  const potdPlays = takePlays(potdRows, "potd", statuses, potdSeen);
  const potdBuilt = rowsOf(today.tickets).map((item) => (/potd/i.test(str(item.name)) ? builtLabel(item) : null)).find(Boolean)
    ?? Object.values(sports).map((value) => (isRow(value) && isRow(value.potd) ? builtLabel(value.potd) : null)).find(Boolean);
  const potdTicket = ticket("potd", "potd", "POTD", "Official ticket plus sport boards. A repeated pick is shown once.", potdPlays, "official", undefined, potdBuilt);
  if (potdTicket) tickets.push(potdTicket);

  for (const item of rowsOf(today.tickets)) {
    const name = str(item.name);
    if (/potd/i.test(name)) continue;
    if (/safe/i.test(name)) {
      const plays = takePlays(legsOrSelf(item), "safe-ticket", statuses, new Set());
      const card = ticket("safe", "safe", name, str(item.desc) || "Desk", plays, "main", oddsOf(item.odds) ?? undefined, builtLabel(item) ?? builtLabel(safe));
      if (card) tickets.push(card);
      else if (str(item.pick)) notices.push(`${name}: ${str(item.pick)}`);
      continue;
    }
    const plays = takePlays(legsOrSelf(item), `t-${norm(name).replace(/ /g, "-")}`, statuses, new Set());
    const card = ticket(`parlay-${norm(name).replace(/ /g, "-")}`, "parlay", name, str(item.desc) || str(item.pick) || "Desk", plays, "official", oddsOf(item.odds) ?? undefined, builtLabel(item));
    if (card) tickets.push(card);
  }
  for (const [sport, value] of Object.entries(sports)) {
    if (!isRow(value) || !isRow(value.parlay)) continue;
    const plays = takePlays(legsOrSelf(value.parlay), `parlay-${sport}`, statuses, new Set());
    const card = ticket(`parlay-${sport}`, "parlay", `Parlay +100 · ${sport}`, str(value.parlay.pick) || sport, plays, "official", oddsOf(value.parlay.odds) ?? undefined, builtLabel(value.parlay));
    if (card) tickets.push(card);
  }

  const edge = isRow(data.edge) ? data.edge : {};
  const edgePlays = takePlays(rowsOf(edge.picks), "edge", statuses, new Set());
  const edgeTicket = ticket("edge", "edge", "Edge", str(edge.date) ? `Desk edge ${str(edge.date)}` : "Desk edge", edgePlays, "edge", undefined, builtLabel(edge));
  if (edgeTicket) tickets.push(edgeTicket);

  const legday = isRow(data.legday) ? data.legday : {};
  const legPlays = takePlays(rowsOf(legday.board), "legday", statuses, new Set());
  const legTicket = ticket("legday", "legday", "LEG DAY", str(legday.date) || "Desk", legPlays, "props", undefined, builtLabel(legday));
  if (legTicket) tickets.push(legTicket);

  const cappers: Capper[] = [];
  const capperPlays: Play[] = [];
  for (const item of rowsOf(data.cappers)) {
    const name = str(item.name) || "Capper";
    const plays = rowsOf(item.today)
      .map((row, index) => playFrom({ ...row, sport: str(row.sport) }, `cap-${norm(name).replace(/ /g, "-")}-${index}`, statuses))
      .filter((play): play is Play => !!play);
    const record = recordLine(item);
    cappers.push({
      id: norm(name).replace(/ /g, "-"),
      name,
      group: plays.some((play) => /action network/i.test(play.name)) ? "an" : "heist",
      record: `${record.w}-${record.l}${record.p ? `-${record.p}` : ""} · ${record.pct ?? pctOf(record.w, record.l) ?? "—"}%`,
      plays,
      note: plays.length ? undefined : "No play in today's file.",
    });
    capperPlays.push(...plays);
  }
  const capperTicket = ticket("cappers", "cappers", "Cappers", "Every play in today's file. A missing book id stays on the card.", capperPlays, "cappers");
  if (capperTicket) tickets.push(capperTicket);
  const quiet = cappers.filter((capper) => !capper.plays.length).map((capper) => capper.name);
  if (quiet.length) notices.push(`No capper play today: ${quiet.join(", ")}.`);

  const first = isRow(data.first_blood) ? data.first_blood : {};
  if (!rowsOf(first.legs).length && str(first.rolled_off)) notices.push(str(first.rolled_off));
  const td = isRow(data.td_city) ? data.td_city : {};
  if (!rowsOf(td.legs).length && str(td.rolled_off || td.msg)) notices.push(str(td.rolled_off || td.msg));

  const resultRows = rowsOf(isRow(data.results_v2) ? data.results_v2.rows : null);
  const graded = lastGraded(resultRows, iso || "9999");
  const settled = graded ? night(resultRows, graded) : { results: [], recap: { when: "No graded night in the file", units: "—", summary: "Nothing to total.", rows: [] } };
  const year = Number((iso || graded || "2026").slice(0, 4)) || 2026;

  return {
    dateLabel: iso ? dateLabel(iso) : "Desk",
    feedMode: "live",
    banner: null,
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
    series: seriesFrom(isRow(data.record) ? data.record.chart : null, resultRows, year),
    rings: ringsFrom(resultRows),
    nascar: { when: "", rows: [] },
    edgePicks: [],
    edgeSkipped: 0,
    stars: starTeams(tickets),
    standings: adaptDeskStandings((isRow(data.standings) ? data.standings : {}) as DeskStandings, ncaab),
    privateStats: privateFrom(data, resultRows),
    teamVs: data.teamvs ?? null,
    updated: updatedLabel(data.generated),
    heistStamp: heistMark,
    injuryCheck: injuryLabel(data.late_injury),
    lockCheck: lockLabel(data.lock_check),
    dkPrices: dkLabel(data.dk),
    standingsUpdated: standingsLabel(data.standings),
    uiBuild: uiBuildLabel(data.ui_build),
    teamBuilt: builtLabel(data.teamvs),
  };
}
