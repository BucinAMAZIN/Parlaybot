import type { Board } from "./board.ts";
import type { BookId, LegPace, LiveFeed, LiveGame, LiveLeg, LiveTicket, Mood, Play, TeamStat, Ticket, WhyBlock } from "./types.ts";
import { propLine } from "../lib/propLine.ts";
import { gcHum, isFreeThrow, parseCast } from "./gamecast.ts";
import { gradeTeamBet, sortLiveGames, teamBet } from "./liveCard.ts";

/**
 * Same public scoreboard the desk page uses. Summaries fill box score,
 * play-by-play, and team stats after a game is on the board.
 * MLB scores use this ESPN baseball/mlb path. The desk's MLB StatsAPI calls
 * are its no-run-inning calculator, which this card does not grade.
 */
const LVL: [string, string, LiveGame["league"], string][] = [
  ["baseball", "mlb", "MLB", ""],
  ["hockey", "nhl", "NHL", ""],
  ["football", "nfl", "NFL", ""],
  ["football", "college-football", "NCAAF", "&groups=80&limit=300"],
  ["basketball", "nba", "NBA", ""],
  ["basketball", "wnba", "WNBA", ""],
  ["basketball", "mens-college-basketball", "NCAAB", "&groups=50&limit=400"],
];

type Json = Record<string, unknown>;

function isObj(value: unknown): value is Json {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) return Number(value);
  return null;
}

function slateDate(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso.replace(/-/g, "");
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return parts.replace(/-/g, "");
}

type EventTeam = { abbr: string; name: string; score: number; home: boolean; names: string[]; record: string };

type EventRow = {
  id: string;
  league: LiveGame["league"];
  group: string;
  path: string;
  away: EventTeam;
  home: EventTeam;
  state: string;
  detail: string;
  date: string;
  period: number;
  clock: string;
  summary?: Json;
};

const ABBR_ALIAS: Record<string, string[]> = {
  UTA: ["UTAH"],
  UTAH: ["UTA"],
  NJ: ["NJD"],
  NJD: ["NJ"],
  TB: ["TBL"],
  TBL: ["TB"],
  LA: ["LAK"],
  LAK: ["LA"],
  SJ: ["SJS"],
  SJS: ["SJ"],
  MTL: ["MON"],
  MON: ["MTL"],
  WSH: ["WAS"],
  WAS: ["WSH"],
  NY: ["NYK"],
  NYK: ["NY"],
  JAC: ["JAX"],
  JAX: ["JAC"],
  GS: ["GSW"],
  GSW: ["GS"],
  NO: ["NOP"],
  NOP: ["NO"],
  SA: ["SAS"],
  SAS: ["SA"],
};

const DIVISION: Record<string, string> = {
  pacific: "Pac",
  atlantic: "Atl",
  metropolitan: "Met",
  metro: "Met",
  central: "Cen",
  east: "East",
  west: "West",
  north: "North",
  south: "South",
};

/** ESPN scoreboard record. Prefer the overall / total summary, such as 10-5-2. */
export function overallRecord(records: unknown): string {
  if (!Array.isArray(records)) return "";
  for (const row of records) {
    if (!isObj(row)) continue;
    const type = str(row.type).toLowerCase();
    const name = str(row.name).toLowerCase();
    if (type === "total" || name === "overall" || name === "total") {
      const summary = str(row.summary) || str(row.displayValue);
      if (summary) return summary;
    }
  }
  return "";
}

function ordinal(rank: number): string {
  const teen = rank % 100;
  const suffix = teen >= 11 && teen <= 13 ? "th" : rank % 10 === 1 ? "st" : rank % 10 === 2 ? "nd" : rank % 10 === 3 ? "rd" : "th";
  return `${rank}${suffix}`;
}

function shortDivision(name: string): string {
  const word = name.replace(/division/gi, "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (!word) return "";
  return DIVISION[word] ?? `${word.slice(0, 1).toUpperCase()}${word.slice(1, 3)}`;
}

/** Division place from the desk standings, such as 1st Pac. Empty when the team is not in the file. */
export function standingLabel(standings: Board["standings"] | undefined, league: string, abbr: string): string {
  const groups = standings?.leagues?.[league]?.groups ?? [];
  const names = new Set([abbr.toUpperCase(), ...(ABBR_ALIAS[abbr.toUpperCase()] ?? [])]);
  for (const group of groups) {
    const index = group.rows.findIndex((row) => names.has(row.abbr.toUpperCase()));
    if (index < 0) continue;
    const rank = group.rows[index]?.rank || index + 1;
    const division = shortDivision(group.name);
    return division ? `${ordinal(rank)} ${division}` : ordinal(rank);
  }
  return "";
}

function namesOf(team: Json): string[] {
  return [team.abbreviation, team.shortDisplayName, team.displayName, team.name, team.location]
    .map((item) => str(item).toLowerCase())
    .filter(Boolean);
}

function eventOf(raw: unknown, league: LiveGame["league"], group: string, path: string): EventRow | null {
  if (!isObj(raw)) return null;
  const comp = isObj(raw.competitions) ? null : listComp(raw);
  if (!comp) return null;
  const teams = (Array.isArray(comp.competitors) ? comp.competitors : []).flatMap((item) => {
    if (!isObj(item) || !isObj(item.team)) return [];
    const home = str(item.homeAway) === "home";
    return [{ abbr: str(item.team.abbreviation) || "?", name: str(item.team.shortDisplayName) || str(item.team.displayName), score: num(item.score) ?? 0, home, names: namesOf(item.team), record: overallRecord(item.records) }];
  });
  const away = teams.find((team) => !team.home);
  const home = teams.find((team) => team.home);
  if (!away || !home) return null;
  const status = isObj(comp.status) ? comp.status : {};
  const type = isObj(status.type) ? status.type : {};
  return {
    id: str(raw.id),
    league,
    group,
    path,
    away,
    home,
    state: str(type.state) || "pre",
    detail: str(type.shortDetail) || str(status.type && isObj(status.type) ? status.type.shortDetail : ""),
    date: str(comp.date) || str(raw.date),
    period: num(status.period) ?? 0,
    clock: str(status.displayClock),
  };
}

function listComp(raw: Json): Json | null {
  const comps = raw.competitions;
  if (!Array.isArray(comps) || !isObj(comps[0])) return null;
  return comps[0];
}

function hit(hint: string, team: EventTeam): boolean {
  const text = hint.toLowerCase().replace(/[^a-z0-9 ]/g, " ");
  if (!text.trim()) return false;
  const aliases = [team.abbr, ...(ABBR_ALIAS[team.abbr.toUpperCase()] ?? [])].map((name) => name.toLowerCase());
  const names = [...team.names, ...aliases];
  return names.some((name) => name === text || text.split(" ").includes(name) || name.split(" ").every((part) => part.length > 2 && text.includes(part)));
}

function aliasHit(abbr: string, other: string): boolean {
  const left = abbr.toUpperCase();
  const right = other.toUpperCase();
  if (!left || !right) return false;
  if (left === right) return true;
  return (ABBR_ALIAS[left] ?? []).includes(right) || (ABBR_ALIAS[right] ?? []).includes(left);
}

export function abbrsMatch(left: string, right: string): boolean {
  return aliasHit(left, right);
}

function bothSides(away: string, home: string, eventAway: string, eventHome: string): boolean {
  if (!away || !home) return false;
  const awayOk = aliasHit(away, eventAway) || aliasHit(away, eventHome);
  const homeOk = aliasHit(home, eventAway) || aliasHit(home, eventHome);
  return awayOk && homeOk && !aliasHit(away, home);
}

function matches(play: Play, event: EventRow): boolean {
  const away = play.matchup?.away.abbr ?? "";
  const home = play.matchup?.home.abbr ?? "";
  if (bothSides(away, home, event.away.abbr, event.home.abbr)) return true;
  const text = `${play.gameText ?? ""} ${play.detail} ${play.name}`;
  return hit(text, event.away) && hit(text, event.home);
}

function elapsed(event: EventRow): number {
  if (event.state === "post") return 1;
  if (event.state === "pre") return 0;
  const clock = event.clock.split(":");
  const left = (num(clock[0]) ?? 0) + (num(clock[1]) ?? 0) / 60;
  const quarter = event.path === "nhl" ? 20 : event.path === "nba" ? 12 : 15;
  const periods = event.path === "nhl" ? 3 : 4;
  const period = Math.max(event.period, 1);
  return Math.min(1, Math.max(0, ((period - 1) * quarter + (quarter - left)) / (periods * quarter)));
}

const STATS: [RegExp, string, string][] = [
  [/shots on goal|\bsog\b/i, "shotsTotal", "SOG"],
  [/tackles?\s*\+\s*assists?|total tackles?/i, "totalTackles", "TKL"],
  [/solo tackles?/i, "soloTackles", "SOLO"],
  [/sacks?/i, "sacks", "SACK"],
  [/steals?\s*\+\s*blocks?|stocks?/i, "steals+blocks", "STL+BLK"],
  [/(?:points?|\bpts\b)\s*\+\s*(?:rebounds?|\breb\b)\s*\+\s*(?:assists?|\bast\b)|\bpra\b/i, "points+rebounds+assists", "PRA"],
  [/(?:points?|\bpts\b)\s*\+\s*(?:rebounds?|\breb\b)|\bpr\b/i, "points+rebounds", "PTS+REB"],
  [/(?:points?|\bpts\b)\s*\+\s*(?:assists?|\bast\b)|\bpa\b/i, "points+assists", "PTS+AST"],
  [/(?:rebounds?|\breb\b)\s*\+\s*(?:assists?|\bast\b)|\bra\b/i, "rebounds+assists", "REB+AST"],
  [/pass(?:ing)? att(?:empts?|s)?/i, "passingAttempts", "PASS ATT"],
  [/(?:pass(?:ing)? )?completions?/i, "completions", "COMP"],
  [/pass(?:ing)? y(?:ards|ds)/i, "passingYards", "PASS YDS"],
  [/pass(?:ing)? td|td pass(?:es)?/i, "passingTouchdowns", "PASS TD"],
  [/interceptions?|\bint\b/i, "interceptions", "INT"],
  [/rush(?:ing)? att(?:empts?|s)?|carries/i, "rushingAttempts", "RUSH ATT"],
  [/rush(?:ing)? y(?:ards|ds)/i, "rushingYards", "RUSH YDS"],
  [/(?:rec(?:eiving)? )?targets?/i, "receivingTargets", "TGTS"],
  [/rec(?:eiving)? y(?:ards|ds)/i, "receivingYards", "REC YDS"],
  [/receptions?\b/i, "receptions", "REC"],
  [/anytime td|\batd\b/i, "rushingTouchdowns+receivingTouchdowns", "TD"],
  [/three|3pm|3-pointer/i, "threePointFieldGoalsMade-threePointFieldGoalsAttempted", "3PM"],
  [/steals?/i, "steals", "STL"],
  [/turnovers?/i, "turnovers", "TO"],
  [/assists?/i, "assists", "AST"],
  [/rebounds?/i, "rebounds", "REB"],
  [/points?|\bpts\b/i, "points", "PTS"],
  [/goals?/i, "goals", "G"],
  [/saves?/i, "saves", "SV"],
  [/blocked shots?/i, "blockedShots", "BLK"],
];

function samePlayer(pick: string, display: string): boolean {
  const clean = (value: string) => value.toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/g, "").trim().split(/\s+/).filter(Boolean);
  const left = clean(pick);
  const right = clean(display);
  if (!left.length || !right.length) return false;
  if (left[left.length - 1] !== right[right.length - 1]) return false;
  return left.length === 1 || left[0][0] === right[0][0];
}

function lastName(name: string): string {
  const parts = name.toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/g, "").trim().split(/\s+/);
  return parts[parts.length - 1] ?? "";
}

function statIndex(keys: unknown[], part: string): { index: number; keyName: string } | null {
  for (let index = 0; index < keys.length; index += 1) {
    const keyName = str(keys[index]);
    if (keyName === part || keyName.split(/[/-]/).includes(part)) return { index, keyName };
  }
  return null;
}

function statPiece(keyName: string, part: string, cell: string): number | null {
  const bits = keyName.split(/[/-]/);
  if (bits.length > 1) {
    const idx = bits.indexOf(part);
    if (idx >= 0) return num(cell.split(/[/-]/)[idx]);
  }
  if (part.startsWith("threePoint")) return num(cell.split("-")[0]);
  return num(cell.split("/")[0]);
}

function readOne(summary: Json, player: string, part: string): number | null {
  const teams = isObj(summary.boxscore) && Array.isArray(summary.boxscore.players) ? summary.boxscore.players : [];
  for (const team of teams) {
    if (!isObj(team) || !Array.isArray(team.statistics)) continue;
    for (const group of team.statistics) {
      if (!isObj(group) || !Array.isArray(group.keys) || !Array.isArray(group.athletes)) continue;
      const found = statIndex(group.keys, part);
      if (!found) continue;
      for (const athlete of group.athletes) {
        if (!isObj(athlete) || !isObj(athlete.athlete)) continue;
        if (!samePlayer(player, str(athlete.athlete.displayName))) continue;
        const cell = Array.isArray(athlete.stats) ? str(athlete.stats[found.index]) : "";
        return statPiece(found.keyName, part, cell);
      }
    }
  }
  return null;
}

export function readStat(summary: Json, player: string, key: string): number | null {
  if (key === "rushingTouchdowns+receivingTouchdowns") {
    const rush = readOne(summary, player, "rushingTouchdowns");
    const rec = readOne(summary, player, "receivingTouchdowns");
    if (rush == null && rec == null) return null;
    return (rush ?? 0) + (rec ?? 0);
  }
  const keys = key.split("+");
  let total = 0;
  let found = false;
  for (const part of keys) {
    const value = readOne(summary, player, part);
    if (value == null) return null;
    found = true;
    total += value;
  }
  return found ? total : null;
}

export function propOf(name: string, league: LiveGame["league"]): { player: string; line: number; under: boolean; plus: boolean; unit: string; key: string } | null {
  const parsed = propLine(name);
  if (!parsed) return null;
  if (league === "NHL" && /^(points?|pts)$/i.test(parsed.market)) {
    return { player: parsed.player, line: parsed.line, under: parsed.under, plus: parsed.plus, unit: "PTS", key: "goals+assists" };
  }
  const stat = STATS.find(([pattern]) => pattern.test(parsed.market));
  if (!stat) return null;
  return { player: parsed.player, line: parsed.line, under: parsed.under, plus: parsed.plus, unit: stat[2], key: stat[1] };
}

function paceOf(current: number, line: number, under: boolean, plus: boolean, event: EventRow): LegPace {
  if (event.state === "pre") return "pre";
  const done = event.state === "post";
  const cleared = plus ? current >= line : current > line;
  if (under) {
    if (current > line) return "dead";
    if (done) return current < line ? "hit" : "on";
    return "on";
  }
  if (cleared) return "hit";
  if (done) return !plus && current === line ? "on" : "dead";
  const gone = elapsed(event);
  if (gone < 0.08) return "on";
  const projected = current / gone;
  if (projected >= line) return "on";
  if (projected >= line * 0.7) return "behind";
  return "cold";
}

export type LiveKeySide = { abbr: string; names: string[] };

/** Drop a trailing matchup note such as "(vs UNT; CBB free play)". */
export function cleanLiveTitle(name: string): string {
  let text = name.trim();
  for (;;) {
    const next = text.replace(/\s*\([^)]*\)\s*$/, "").trim();
    if (next === text) return text;
    text = next;
  }
}

function normBit(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9.+ ]/g, " ").replace(/\s+/g, " ").trim();
}

function mentions(teamName: string, side: LiveKeySide): boolean {
  const text = normBit(teamName);
  if (!text) return false;
  const names = [side.abbr, ...side.names].map((name) => name.toLowerCase()).filter(Boolean);
  return names.some((name) => name === text || text.split(" ").includes(name) || name.split(" ").every((part) => part.length > 2 && text.includes(part)));
}

function betSideName(team: string, teams: { away: LiveKeySide; home: LiveKeySide }): "away" | "home" | null {
  const away = mentions(team, teams.away);
  const home = mentions(team, teams.home);
  if (away === home) return null;
  return away ? "away" : "home";
}

/** Same bet from two products shares a key. Different lines stay different keys. */
export function liveLegKey(playName: string, league: LiveGame["league"], teams?: { away: LiveKeySide; home: LiveKeySide }): string {
  const titled = cleanLiveTitle(playName);
  const prop = propOf(titled, league);
  if (prop) {
    const plusWhole = prop.plus && Number.isInteger(prop.line) && prop.line >= 1;
    const dir = prop.under ? "under" : plusWhole || !prop.plus ? "over" : "plus";
    const line = plusWhole ? prop.line - 0.5 : prop.line;
    return `prop:${normBit(prop.player)}:${prop.key}:${dir}:${line}`;
  }
  const bet = teamBet(titled);
  if (bet) {
    if (bet.kind === "total") return `total:${bet.under ? "u" : "o"}:${bet.line}`;
    const side = teams ? betSideName(bet.team, teams) : null;
    const who = side ?? normBit(bet.team);
    if (bet.kind === "ml") return `ml:${who}`;
    return `spread:${who}:${bet.spread}`;
  }
  return `name:${normBit(cleanLiveTitle(playName))}`;
}

function realWhy(why: WhyBlock): boolean {
  return [...why.why, ...why.whyNot].some((line) => {
    const text = line.trim();
    return !!text && !/no why text in the desk file/i.test(text);
  });
}

function preferTitle(current: string, incoming: string): string {
  const left = cleanLiveTitle(current);
  const right = cleanLiveTitle(incoming);
  if (current.trim() === left && incoming.trim() !== right) return left;
  if (incoming.trim() === right && current.trim() !== left) return right;
  return left.length <= right.length ? left : right;
}

export function tagRank(tag: string): number {
  if (/^POTD/i.test(tag)) return 0;
  if (/^\+100 ALT/i.test(tag)) return 2;
  if (/^\+100/i.test(tag)) return 1;
  if (tag === "Edge") return 3;
  if (tag === "Props ALT") return 5;
  if (tag === "Props") return 4;
  if (tag === "Heist ALT") return 7;
  if (tag === "Heist") return 6;
  if (tag === "First Blood") return 8;
  if (tag === "Lotto") return 9;
  return 10;
}

export function mergeTags(tags: Array<string | undefined>): string[] {
  return [...new Set(tags.filter((tag): tag is string => !!tag))].sort((a, b) => tagRank(a) - tagRank(b) || a.localeCompare(b));
}

/** A bare total such as Under 74.5 is shown with the matchup. */
export function liveTitle(name: string, away: string, home: string): string {
  const title = cleanLiveTitle(name);
  if (/^(over|under)\s+\d/i.test(title)) return `${away}/${home} ${title}`;
  return title;
}

/** Keep one card per key, the short title, a why note, and every source tag. */
export function absorbLiveLeg(prev: LiveLeg, next: LiveLeg): LiveLeg {
  return {
    ...prev,
    name: preferTitle(prev.name, next.name),
    why: realWhy(prev.why) ? prev.why : realWhy(next.why) ? next.why : prev.why,
    key: prev.key ?? next.key,
    tags: mergeTags([...(prev.tags ?? []), ...(next.tags ?? [])]),
  };
}

function betSide(team: string, event: EventRow): "away" | "home" | null {
  const away = hit(team, event.away);
  const home = hit(team, event.home);
  if (away === home) return null;
  return away ? "away" : "home";
}

function legFor(play: Play, event: EventRow, awayScore: number, homeScore: number): LiveLeg | null {
  const prop = propOf(play.name, event.league);
  if (prop) {
    const current = event.summary ? readStat(event.summary, prop.player, prop.key) : null;
    const started = event.state !== "pre";
    const value = current ?? 0;
    const known = current != null;
    return {
      name: play.name,
      current: value,
      line: prop.line,
      unit: prop.unit,
      pace: !started ? "pre" : paceOf(value, prop.line, prop.under, prop.plus, event),
      source: !started ? "Not started · ESPN" : known ? "ESPN box score" : "0 so far · ESPN",
      why: play.why,
    };
  }
  const bet = teamBet(play.name);
  if (!bet) return null;
  const side = bet.kind === "total" ? null : betSide(bet.team, event);
  if (bet.kind !== "total" && !side) return null;
  const state = event.state === "post" ? "post" : event.state === "pre" ? "pre" : "in";
  const grade = gradeTeamBet(bet, awayScore, homeScore, side, state, event.league, elapsed(event));
  return {
    name: play.name,
    current: grade.current,
    line: grade.line,
    unit: grade.unit,
    pace: grade.pace,
    source: grade.source,
    why: play.why,
    label: grade.label || undefined,
  };
}

function pbp(summary: Json | undefined, away: string, home: string, league: LiveGame["league"] = "NBA"): LiveFeed["pbp"] {
  if (!summary) return [];
  const raw = summary.plays;
  const items = Array.isArray(raw) ? raw : isObj(raw) && Array.isArray(raw.items) ? raw.items : [];
  return items.slice(-12).flatMap((item) => {
    if (!isObj(item)) return [];
    const text = str(item.text) || str(item.description) || str(item.shortText);
    if (!text) return [];
    const team = str(isObj(item.team) ? item.team.abbreviation : item.team) || away;
    const typeText = str(isObj(item.type) ? item.type.text : item.type);
    const freeThrow = isFreeThrow(typeText, text);
    const kind = league === "NHL" ? "hockey" : league === "NFL" || league === "NCAAF" ? "football" : league === "MLB" ? "baseball" : "basketball";
    const typeAbbr = str(isObj(item.type) ? item.type.abbreviation : "");
    const title = gcHum(kind === "hockey" ? typeAbbr || typeText : typeText, text, item.shootingPlay === true, item.scoringPlay === true, freeThrow, kind);
    const score = [str(item.awayScore), str(item.homeScore)].filter((part) => part !== "").join("  ");
    return [{ team: team === home || team === away ? team : away, event: title, when: str(isObj(item.clock) ? item.clock.displayValue : item.clock) || str(item.period) || "", score, desc: text, period: str(isObj(item.period) ? item.period.displayValue : item.period) || "All" }];
  });
}

type BoxRow = LiveFeed["box"]["rows"][number];

function groupNamed(groups: Json[], ...names: string[]): Json | undefined {
  return groups.find((group) => names.includes(str(group.name).toLowerCase()) || names.includes(str(group.type).toLowerCase()));
}

function cellAt(group: Json, athlete: Json, key: string): string {
  const keys = Array.isArray(group.keys) ? group.keys : [];
  if (!Array.isArray(athlete.stats)) return "";
  if (key.includes("/") || key.includes("-")) {
    const index = keys.findIndex((item) => str(item) === key);
    if (index >= 0) return str(athlete.stats[index]);
  }
  const found = statIndex(keys, key);
  if (!found) return "";
  const cell = str(athlete.stats[found.index]);
  const piece = statPiece(found.keyName, key, cell);
  return piece == null ? cell : String(piece);
}

function mineName(name: string, names: string[]): boolean {
  return names.some((want) => lastName(want) && lastName(want) === lastName(name));
}

function pushAthletes(rows: BoxRow[], group: Json, athletes: unknown[], names: string[], columns: { key: string; label: string }[], title: string): void {
  if (!athletes.length) return;
  rows.push({ cells: [title, ...columns.map((column) => column.label)], mine: false, header: title });
  for (const athlete of athletes.slice(0, 20)) {
    if (!isObj(athlete)) continue;
    const name = str(isObj(athlete.athlete) ? athlete.athlete.displayName : "");
    const stats = columns.map((column) => {
      if (column.key === "points-sum") {
        const goals = num(cellAt(group, athlete, "goals")) ?? 0;
        const assists = num(cellAt(group, athlete, "assists")) ?? 0;
        return String(goals + assists);
      }
      return cellAt(group, athlete, column.key);
    });
    rows.push({ cells: [name, ...stats], mine: mineName(name, names), header: undefined });
  }
}

export function box(summary: Json | undefined, names: string[], league = ""): LiveFeed["box"] {
  const teams = summary && isObj(summary.boxscore) && Array.isArray(summary.boxscore.players) ? summary.boxscore.players : [];
  const rows: BoxRow[] = [];
  for (const team of teams) {
    if (!isObj(team)) continue;
    const abbr = str(isObj(team.team) ? team.team.abbreviation : "");
    const groups = Array.isArray(team.statistics) ? team.statistics.filter(isObj) : [];
    if (league === "NHL") {
      const forwards = groupNamed(groups, "forwards");
      const defense = groupNamed(groups, "defenses", "defense");
      const goalies = groupNamed(groups, "goalies");
      const skaterGroup = forwards ?? defense ?? groupNamed(groups, "skaters") ?? groups.find((group) => Array.isArray(group.athletes) && group.athletes.length);
      const skaters = [...(forwards && Array.isArray(forwards.athletes) ? forwards.athletes : []), ...(defense && Array.isArray(defense.athletes) ? defense.athletes : [])];
      const listed = skaters.length ? skaters : Array.isArray(skaterGroup?.athletes) ? skaterGroup.athletes : [];
      if (skaterGroup && listed.length) {
        pushAthletes(rows, skaterGroup, listed, names, [
          { key: "goals", label: "G" },
          { key: "assists", label: "A" },
          { key: "points-sum", label: "PTS" },
          { key: "shotsTotal", label: "SOG" },
          { key: "timeOnIce", label: "TOI" },
        ], abbr);
      }
      if (goalies && Array.isArray(goalies.athletes) && goalies.athletes.length) {
        pushAthletes(rows, goalies, goalies.athletes, names, [
          { key: "saves", label: "SV" },
          { key: "shotsAgainst", label: "SA" },
          { key: "goalsAgainst", label: "GA" },
          { key: "savePct", label: "SV%" },
          { key: "timeOnIce", label: "TOI" },
        ], `${abbr} Goalies`);
      }
      continue;
    }
    if (league === "NBA" || league === "NCAAB" || league === "WNBA") {
      const group = groups.find((item) => Array.isArray(item.athletes) && item.athletes.length) ?? groups[0];
      if (group && Array.isArray(group.athletes)) {
        pushAthletes(rows, group, group.athletes, names, [
          { key: "minutes", label: "MIN" },
          { key: "points", label: "PTS" },
          { key: "rebounds", label: "REB" },
          { key: "assists", label: "AST" },
          { key: "threePointFieldGoalsMade-threePointFieldGoalsAttempted", label: "3PT" },
        ], abbr);
      }
      continue;
    }
    if (league === "NFL" || league === "NCAAF") {
      const specs: [string, string, { key: string; label: string }[]][] = [
        ["passing", "Passing", [{ key: "completions/passingAttempts", label: "C/ATT" }, { key: "passingYards", label: "YDS" }, { key: "passingTouchdowns", label: "TD" }, { key: "interceptions", label: "INT" }]],
        ["rushing", "Rushing", [{ key: "rushingAttempts", label: "CAR" }, { key: "rushingYards", label: "YDS" }, { key: "rushingTouchdowns", label: "TD" }, { key: "longRushing", label: "LONG" }]],
        ["receiving", "Receiving", [{ key: "receptions", label: "REC" }, { key: "receivingYards", label: "YDS" }, { key: "receivingTouchdowns", label: "TD" }, { key: "receivingTargets", label: "TGTS" }]],
        ["defensive", "Defense", [{ key: "totalTackles", label: "TOT" }, { key: "soloTackles", label: "SOLO" }, { key: "sacks", label: "SACKS" }, { key: "passesDefended", label: "PD" }]],
      ];
      for (const [name, label, columns] of specs) {
        const group = groupNamed(groups, name);
        if (!group || !Array.isArray(group.athletes) || !group.athletes.length) continue;
        const athletes = group.athletes.filter(isObj);
        const tracked = names.some((want) => athletes.some((athlete) => isObj(athlete.athlete) && samePlayer(want, str(athlete.athlete.displayName))));
        if (name === "defensive" && !tracked && !athletes.length) continue;
        pushAthletes(rows, group, group.athletes, names, columns, `${abbr} · ${label}`);
      }
      continue;
    }
    if (league === "MLB") {
      const specs: [string, string, { key: string; label: string }[]][] = [
        ["batting", "Batting", [{ key: "atBats", label: "AB" }, { key: "runs", label: "R" }, { key: "hits", label: "H" }, { key: "RBIs", label: "RBI" }, { key: "homeRuns", label: "HR" }]],
        ["pitching", "Pitching", [{ key: "innings", label: "IP" }, { key: "hits", label: "H" }, { key: "earnedRuns", label: "ER" }, { key: "walks", label: "BB" }, { key: "strikeouts", label: "K" }]],
      ];
      for (const [name, label, columns] of specs) {
        const group = groupNamed(groups, name);
        if (!group || !Array.isArray(group.athletes) || !group.athletes.length) continue;
        pushAthletes(rows, group, group.athletes, names, columns, `${abbr} · ${label}`);
      }
      continue;
    }
    const group = groups.find((item) => Array.isArray(item.athletes) && item.athletes.length);
    if (!group || !Array.isArray(group.athletes)) continue;
    const labels = (Array.isArray(group.labels) ? group.labels : []).map((item) => str(item)).slice(0, 4);
    const keys = (Array.isArray(group.keys) ? group.keys : []).map((item) => str(item)).slice(0, 4);
    pushAthletes(rows, group, group.athletes, names, keys.map((key, index) => ({ key, label: labels[index] || key })), abbr);
  }
  return { headers: [], rows };
}

const SPORT_KEY: Record<string, string> = {
  NBA: "NBA",
  NHL: "NHL",
  NFL: "NFL",
  MLB: "MLB",
  WNBA: "WNBA",
  NCAAF: "NCAA F",
  NCAAB: "NCAAM",
};

const RANK_LABEL: Record<string, string> = {
  pts_o: "Points / gm",
  pts_d: "Pts allowed / gm",
  yds_o: "Yards / gm",
  yds_d: "Yds allowed / gm",
  ortg: "Off. rating",
  drtg: "Def. rating",
  gf: "Goals / gm",
  ga: "GA / gm",
  sf: "SOG / gm",
  sa: "SOG allowed / gm",
  adjo: "Adj. offense",
  adjd: "Adj. defense",
  tempo: "Tempo",
  r_o: "Off. rank",
  r_d: "Def. rank",
};

const OFF_KEYS = new Set(["pts_o", "yds_o", "ortg", "gf", "sf", "r_o", "adjo"]);
const DEF_KEYS = new Set(["pts_d", "yds_d", "drtg", "ga", "sa", "r_d", "adjd"]);

type RankCell = { val?: number; rank?: number; n?: number };

export function rankTone(rank: number, total: number): "rk-good" | "rk-mid" | "rk-bad" {
  const third = Math.ceil(total / 3);
  if (rank <= third) return "rk-good";
  if (rank > total - third) return "rk-bad";
  return "rk-mid";
}

export function formatRankValue(key: string, value: number): string {
  const shown = key === "ortg" || key === "drtg" ? value * 100 : value;
  return shown.toFixed(1);
}

function rankIcon(key: string, side: string): string {
  if (key === "tempo") return "⏱";
  if (side === "def" || DEF_KEYS.has(key)) return "🛡️";
  if (side === "off" || OFF_KEYS.has(key)) return "⚔️";
  return "";
}

function looseName(want: string, have: string): boolean {
  const left = want.toLowerCase().trim();
  const right = have.toLowerCase().trim();
  if (!left || !right || left.length < 3 || right.length < 3) return false;
  if (left === right || left.includes(right) || right.includes(left)) return true;
  return left.split(/\s+/).filter((word) => word.length > 3).some((word) => right.includes(word));
}

function teamHit(abbr: string, name: string, team: Json): boolean {
  const code = str(team.ab);
  const label = str(team.name);
  if (aliasHit(abbr, code)) return true;
  return looseName(name, label) || looseName(abbr, label) || looseName(name, code);
}

/** Team VS ignores the live box score. `summary` is accepted so a live game cannot swap these ranks out. */
export function teamStatsFor(summary: unknown, teamVs: unknown, league: string, awayAbbr: string, awayName: string, homeAbbr: string, homeName: string): { rows: TeamStat[]; stamp: string } {
  void summary;
  return matchupRanks(teamVs, league, awayAbbr, awayName, homeAbbr, homeName);
}

/** Season offense and defense ranks from teamvs. Never the live box score. */
export function matchupRanks(teamVs: unknown, league: string, awayAbbr: string, awayName: string, homeAbbr: string, homeName: string): { rows: TeamStat[]; stamp: string } {
  if (!isObj(teamVs) || !isObj(teamVs.sports)) return { rows: [], stamp: "" };
  const sports = teamVs.sports;
  const preferred = str(SPORT_KEY[league] || league);
  const order = [sports[preferred], ...Object.values(sports).filter((sport) => sport !== sports[preferred])].filter(isObj);
  for (const sport of order) {
    if (!Array.isArray(sport.games)) continue;
    const meta = new Map((Array.isArray(sport.stats) ? sport.stats : []).filter(isObj).map((stat) => [str(stat.key), stat]));
    for (const game of sport.games) {
      if (!isObj(game) || !Array.isArray(game.teams)) continue;
      const sides = game.teams.filter(isObj);
      const away = sides.find((team) => teamHit(awayAbbr, awayName, team));
      const home = sides.find((team) => teamHit(homeAbbr, homeName, team));
      if (!away || !home || away === home || !isObj(away.v) || !isObj(home.v)) continue;
      const keys = [...meta.keys()];
      for (const key of Object.keys(away.v)) if (!keys.includes(key)) keys.push(key);
      const rows: TeamStat[] = [];
      const sources = new Set<string>();
      for (const key of keys) {
        const a = away.v[key] as RankCell | undefined;
        const b = home.v[key] as RankCell | undefined;
        if (!a || !b || a.rank == null || b.rank == null) continue;
        const spec = meta.get(key);
        const side = spec ? str(spec.side) : "";
        const label = spec ? str(spec.label) : RANK_LABEL[key] ?? key;
        const icon = rankIcon(key, side);
        const total = a.n || b.n || (spec ? num(spec.n) ?? 0 : 0);
        if (spec) {
          const src = [str(spec.src), str(spec.as_of) ? `as of ${str(spec.as_of)}` : ""].filter(Boolean).join(" ");
          if (src) sources.add(src);
        }
        rows.push({
          name: icon ? `${icon} ${label}` : label,
          away: typeof a.val === "number" ? formatRankValue(key, a.val) : "",
          home: typeof b.val === "number" ? formatRankValue(key, b.val) : "",
          awayRank: `#${a.rank}`,
          homeRank: `#${b.rank}`,
          awayOf: total ? `/${total}` : "",
          homeOf: total ? `/${total}` : "",
          awayTone: total ? rankTone(a.rank, total) : "",
          homeTone: total ? rankTone(b.rank, total) : "",
        });
      }
      const built = str(teamVs.built);
      return { rows, stamp: [built, ...sources].filter(Boolean).join(" · ") };
    }
  }
  return { rows: [], stamp: str(isObj(teamVs) ? teamVs.built : "") };
}

function gameOf(event: EventRow, plays: Play[], teamVs: unknown, teamBuilt: string | null, standings?: Board["standings"]): LiveGame {
  const names = plays.flatMap((play) => {
    const prop = propOf(play.name, event.league);
    if (prop) return [prop.player];
    return isFirstBloodPlay(play) ? [play.name] : [];
  });
  const ranks = teamStatsFor(event.summary, teamVs, event.league, event.away.abbr, event.away.name, event.home.abbr, event.home.name);
  const pre = event.state === "pre";
  const cast = event.summary ? parseCast(event.summary, event.league) ?? undefined : undefined;
  const awayScore = cast?.away.score ? Number(cast.away.score) : event.away.score;
  const homeScore = cast?.home.score ? Number(cast.home.score) : event.home.score;
  const teams = { away: { abbr: event.away.abbr, names: event.away.names }, home: { abbr: event.home.abbr, names: event.home.names } };
  const buckets = new Map<string, LiveLeg>();
  const scoredAway = Number.isFinite(awayScore) ? awayScore : event.away.score;
  const scoredHome = Number.isFinite(homeScore) ? homeScore : event.home.score;
  for (const play of plays) {
    if (play.voidedPreGame) continue;
    const titles = [play.name];
    if (play.dkName && cleanLiveTitle(play.dkName) !== cleanLiveTitle(play.name)) titles.push(play.dkName);
    for (const title of titles) {
      const source = title === play.name ? play : { ...play, name: title };
      if (isFirstBloodPlay(source)) {
        const phase = event.state === "post" ? "post" : event.state === "pre" ? "pre" : "in";
        const special = firstBloodLeg(source.name, event.summary, phase, scoredAway, scoredHome);
        const key = `first:${normBit(source.name)}`;
        const waiting = phase === "pre" ? { name: source.name, current: 0, line: 1, unit: "", pace: "pre" as const, source: "Not started · ESPN", why: source.why, label: "Waiting on 1st score", key } : null;
        const leg: LiveLeg | null = special ?? waiting;
        if (leg) {
          const next = { ...leg, key, tags: mergeTags([...(leg.tags ?? []), ...(source.tags ?? []), "First Blood"]) };
          const prev = buckets.get(key);
          buckets.set(key, prev ? absorbLiveLeg(prev, next) : next);
        }
        continue;
      }
      const leg = legFor(source, event, scoredAway, scoredHome);
      if (!leg) continue;
      const key = liveLegKey(source.name, event.league, teams);
      const next = { ...leg, key, name: liveTitle(source.name, event.away.abbr, event.home.abbr), tags: mergeTags(source.tags ?? []) };
      const prev = buckets.get(key);
      buckets.set(key, prev ? absorbLiveLeg(prev, next) : next);
    }
  }
  const legs = [...buckets.values()];
  const clock = cast?.clock || (pre ? event.detail || "Not started" : event.state === "post" ? "Final" : event.detail || event.clock || "Live");
  return {
    id: event.id,
    league: event.league,
    away: event.away.abbr,
    home: event.home.abbr,
    awayName: event.away.name,
    homeName: event.home.name,
    awayScore: Number.isFinite(awayScore) ? awayScore : event.away.score,
    homeScore: Number.isFinite(homeScore) ? homeScore : event.home.score,
    clock,
    start: event.date || undefined,
    pre: cast ? cast.pre : pre,
    final: cast ? cast.final : event.state === "post",
    awaySide: { abbr: event.away.abbr, record: event.away.record || "—", standing: standingLabel(standings, event.league, event.away.abbr) || "—" },
    homeSide: { abbr: event.home.abbr, record: event.home.record || "—", standing: standingLabel(standings, event.league, event.home.abbr) || "—" },
    legs,
    liveFeed: {
      pbp: cast
        ? cast.plays.slice(0, 12).map((item) => ({
            team: item.abbr,
            event: item.title,
            when: item.when,
            score: `${item.awayScore}  ${item.homeScore}`.trim(),
            desc: item.text,
            period: item.periodKey,
          }))
        : pbp(event.summary, event.away.abbr, event.home.abbr, event.league),
      box: box(event.summary, names, event.league),
      teamStats: ranks.rows,
      real: true,
      built: ranks.stamp || teamBuilt || undefined,
      cast,
    },
  };
}

function keyTeams(game: LiveGame): { away: LiveKeySide; home: LiveKeySide } {
  const names = (abbr: string, name: string) => [abbr, name, ...name.split(/\s+/)];
  return { away: { abbr: game.away, names: names(game.away, game.awayName) }, home: { abbr: game.home, names: names(game.home, game.homeName) } };
}

const emptyWhy: WhyBlock = { ours: false, line: "", why: [], whyNot: [] };

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function isFirstBloodPlay(play: Pick<Play, "id" | "name" | "detail">): boolean {
  return play.id.startsWith("first-") || /first (basket|point|player to score)|1st player to score/i.test(`${play.name} ${play.detail}`);
}

function scorerName(row: Json): string {
  for (const participant of list(row.participants)) {
    if (!isObj(participant)) continue;
    const athlete = isObj(participant.athlete) ? participant.athlete : participant;
    const name = str(athlete.displayName) || str(athlete.shortName);
    if (name) return name;
  }
  return "";
}

function didNotStart(summary: Json | undefined, player: string): boolean {
  const teams = summary && isObj(summary.boxscore) && Array.isArray(summary.boxscore.players) ? summary.boxscore.players : [];
  for (const team of teams) {
    if (!isObj(team) || !Array.isArray(team.statistics)) continue;
    for (const group of team.statistics) {
      if (!isObj(group) || !Array.isArray(group.athletes)) continue;
      for (const athlete of group.athletes) {
        if (!isObj(athlete) || !isObj(athlete.athlete)) continue;
        if (!samePlayer(player, str(athlete.athlete.displayName))) continue;
        const stats = (Array.isArray(athlete.stats) ? athlete.stats : []).map((item) => str(item)).join(" ");
        if (athlete.didNotPlay === true || /\bDNP\b/i.test(stats)) return true;
        if (athlete.starter === false && stats.trim() === "") return true;
        return false;
      }
    }
  }
  return false;
}

/** First point of the game. Null before tip so Today does not show an empty bar. */
export function firstBloodLeg(player: string, summary: unknown, state: "pre" | "in" | "post", awayScore: number, homeScore: number): LiveLeg | null {
  if (state === "pre") return null;
  const key = `first:${normBit(player)}`;
  const rows = isObj(summary) ? list(summary.plays).filter(isObj) : [];
  const scored = rows
    .filter((row) => row.scoringPlay === true && (num(row.scoreValue) ?? 0) > 0 && list(row.participants).some(isObj))
    .sort((a, b) => (num(a.sequenceNumber) ?? 0) - (num(b.sequenceNumber) ?? 0));
  const first = scored[0];
  if (!first) {
    if (state === "in" && awayScore + homeScore === 0) {
      return { name: player, current: 0, line: 1, unit: "", pace: "on", source: "ESPN play-by-play", why: emptyWhy, label: "LIVE · Waiting on 1st score", key };
    }
    return null;
  }
  const scorer = scorerName(first);
  const clock = str(isObj(first.clock) ? first.clock.displayValue : first.clock);
  const period = str(isObj(first.period) ? first.period.displayValue : "");
  const when = [clock, period].filter(Boolean).join(" ");
  if (scorer && samePlayer(player, scorer)) {
    return { name: player, current: 1, line: 1, unit: "", pace: "hit", source: "ESPN play-by-play", why: emptyWhy, label: `HIT · 1st point: ${scorer} (${when || "scored"})`, key };
  }
  if (didNotStart(isObj(summary) ? summary : undefined, player)) {
    return { name: player, current: 0, line: 1, unit: "", pace: "dead", source: "ESPN play-by-play", why: emptyWhy, label: "VOID · did not start", key };
  }
  return { name: player, current: 0, line: 1, unit: "", pace: "dead", source: "ESPN play-by-play", why: emptyWhy, label: `MISS · 1st point: ${scorer || "another player"} (${when || "scored"})`, key };
}

export function trackPlayOnBoard(play: Play, board: Board, book: BookId): { game: LiveGame; leg: LiveLeg | null } | null {
  const game = board.liveGames.find((item) => playMatchesLive(play, item));
  if (!game) return null;
  if (isFirstBloodPlay(play)) {
    const key = `first:${normBit(play.name)}`;
    return { game, leg: game.pre ? null : game.legs.find((leg) => leg.key === key) ?? null };
  }
  const line = book === "dk" && play.dkName ? play.dkName : play.name;
  return { game, leg: findLiveLeg(line, game) ?? null };
}

function playMatchesLive(play: Play, game: LiveGame): boolean {
  const away = play.matchup?.away.abbr;
  const home = play.matchup?.home.abbr;
  if (bothSides(away ?? "", home ?? "", game.away, game.home)) return true;
  const blob = `${play.gameText ?? ""} ${play.detail} ${play.name}`.toLowerCase();
  const names = [game.away, game.home, game.awayName, game.homeName].map((name) => name.toLowerCase()).filter((name) => name.length > 2);
  return names.filter((name) => blob.includes(name)).length >= 2;
}

export function findLiveLeg(playName: string, game: LiveGame): LiveLeg | undefined {
  const key = liveLegKey(playName, game.league, keyTeams(game));
  return game.legs.find((leg) => leg.key === key) ?? game.legs.find((leg) => cleanLiveTitle(leg.name) === cleanLiveTitle(playName));
}

function ticketBar(ticket: Ticket, games: LiveGame[]): LiveTicket | null {
  const paces = ticket.plays.flatMap((play) => {
    for (const game of games) {
      const leg = findLiveLeg(play.name, game);
      if (leg) return [leg.pace];
    }
    return [];
  });
  if (!paces.length) return null;
  const dead = paces.includes("dead");
  const alive = paces.some((pace) => pace === "on" || pace === "behind" || pace === "cold");
  const pace: LegPace = paces.every((item) => item === "hit") ? "hit" : dead && !alive ? "dead" : dead ? "behind" : paces.every((item) => item === "pre") ? "pre" : "on";
  return { name: ticket.title, legs: paces, pace, note: "ESPN box score" };
}

function moodOf(games: LiveGame[]): { mood: Mood; title: string; note: string; hit: number; alive: number; dead: number; pre: number } {
  const legs = games.flatMap((game) => game.legs);
  const hit = legs.filter((leg) => leg.pace === "hit").length;
  const dead = legs.filter((leg) => leg.pace === "dead").length;
  const alive = legs.filter((leg) => leg.pace === "on" || leg.pace === "behind" || leg.pace === "cold").length;
  const pre = legs.filter((leg) => leg.pace === "pre").length;
  if (!legs.length) return { mood: "ice", title: "Waiting", note: "No prop on an ESPN game yet", hit, alive, dead, pre };
  if (hit && !alive && !dead && !pre) return { mood: "cash", title: "Cashed", note: `${hit} hit`, hit, alive, dead, pre };
  if (dead && !alive && !hit && !pre) return { mood: "hook", title: "On the hook", note: `${dead} dead`, hit, alive, dead, pre };
  if (hit && (alive || dead)) return { mood: "fire", title: "On fire", note: `${hit} hit · ${alive} alive · ${dead} dead`, hit, alive, dead, pre };
  if (dead) return { mood: "sweat", title: "Sweating", note: `${alive} alive · ${dead} dead`, hit, alive, dead, pre };
  if (alive) return { mood: "sweat", title: "Sweating", note: `${alive} still alive`, hit, alive, dead, pre };
  return { mood: "ice", title: "Waiting on tip", note: `${pre} not started`, hit, alive, dead, pre };
}

async function scoreboard(group: string, path: string, league: LiveGame["league"], extra: string, date: string): Promise<EventRow[]> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/${group}/${path}/scoreboard?x=1&dates=${date}${extra}`;
  let response: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await fetch(url, { cache: "no-store" });
      if (response.ok) break;
    } catch {
      response = null;
    }
  }
  if (!response?.ok) return [];
  const payload = (await response.json()) as Json;
  return (Array.isArray(payload.events) ? payload.events : []).flatMap((event) => {
    const row = eventOf(event, league, group, path);
    return row ? [row] : [];
  });
}

export async function attachLive(board: Board): Promise<void> {
  const date = slateDate(board.slateDate);
  const fetched: EventRow[][] = [];
  for (const [group, path, league, extra] of LVL) fetched.push(await scoreboard(group, path, league, extra, date));
  const events = fetched.flat();
  const plays = [...board.tickets.flatMap((ticket) => ticket.plays), ...board.cappers.flatMap((capper) => capper.plays)];
  const wanted = events.filter((event) => plays.some((play) => matches(play, event)));
  const capped = wanted.slice(0, 60);
  for (let index = 0; index < capped.length; index += 8) {
    await Promise.all(
      capped.slice(index, index + 8).map(async (event) => {
        try {
          const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${event.group}/${event.path}/summary?event=${event.id}`, { cache: "no-store" });
          if (response.ok) event.summary = (await response.json()) as Json;
        } catch {
          event.summary = undefined;
        }
      }),
    );
  }
  const games = sortLiveGames(wanted.map((event) => gameOf(event, plays.filter((play) => matches(play, event)), board.teamVs, board.teamBuilt, board.standings)));
  const mood = moodOf(games);
  board.liveGames = games;
  board.liveTickets = board.tickets.flatMap((ticket) => {
    const bar = ticketBar(ticket, games);
    return bar ? [bar] : [];
  });
  board.liveMood = { mood: mood.mood, title: mood.title, hit: mood.hit, alive: mood.alive, dead: mood.dead, pre: mood.pre };
  board.liveNote = games.length ? mood.note : "No ESPN game matched today's plays.";
  board.liveUpdated = `ESPN · ${new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })} ET`;
}
