import type { Board } from "./board.ts";
import type { LegPace, LiveFeed, LiveGame, LiveLeg, LiveTicket, Mood, Play, Ticket, WhyBlock } from "./types.ts";
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
  return team.names.some((name) => name === text || text.split(" ").includes(name) || name.split(" ").every((part) => part.length > 2 && text.includes(part)));
}

function matches(play: Play, event: EventRow): boolean {
  const away = play.matchup?.away.abbr ?? "";
  const home = play.matchup?.home.abbr ?? "";
  if (away && home) {
    const abbrs = [event.away.abbr, event.home.abbr];
    if (abbrs.includes(away) && abbrs.includes(home)) return true;
  }
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
  [/three|3pm|3-pointer/i, "threePointFieldGoalsMade-threePointFieldGoalsAttempted", "3PM"],
  [/rebounds?\s*\+\s*assists?|reb \+ ast|ast \+ reb/i, "rebounds+assists", "REB+AST"],
  [/points?\s*\+\s*rebounds?\s*\+\s*assists?|\bpra\b/i, "points+rebounds+assists", "PRA"],
  [/points?\s*\+\s*rebounds?/i, "points+rebounds", "PTS+REB"],
  [/points?\s*\+\s*assists?|\bpa\b/i, "points+assists", "PTS+AST"],
  [/rec(?:eiving)? y(?:ards|ds)/i, "receivingYards", "REC YDS"],
  [/receptions?\b/i, "receptions", "REC"],
  [/rush(?:ing)? y(?:ards|ds)/i, "rushingYards", "RUSH YDS"],
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

function readStat(summary: Json, player: string, key: string): number | null {
  const teams = isObj(summary.boxscore) && Array.isArray(summary.boxscore.players) ? summary.boxscore.players : [];
  const keys = key.split("+");
  let total = 0;
  let found = false;
  for (const part of keys) {
    let value: number | null = null;
    for (const team of teams) {
      if (!isObj(team) || !Array.isArray(team.statistics)) continue;
      for (const group of team.statistics) {
        if (!isObj(group) || !Array.isArray(group.keys) || !Array.isArray(group.athletes)) continue;
        const index = group.keys.findIndex((item) => {
          const text = str(item);
          return text === part || text.startsWith(`${part}-`) || text.startsWith(`${part}/`);
        });
        if (index < 0) continue;
        for (const athlete of group.athletes) {
          if (!isObj(athlete) || !isObj(athlete.athlete)) continue;
          if (!samePlayer(player, str(athlete.athlete.displayName))) continue;
          const cell = Array.isArray(athlete.stats) ? str(athlete.stats[index]) : "";
          const piece = part.startsWith("threePoint") ? cell.split("-")[0] : cell.split("/")[0];
          const parsed = num(piece);
          if (parsed != null) value = parsed;
        }
      }
    }
    if (value == null) return null;
    found = true;
    total += value;
  }
  return found ? total : null;
}

function propOf(name: string, league: LiveGame["league"]): { player: string; line: number; under: boolean; plus: boolean; unit: string; key: string } | null {
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

/** Keep one card per key, the short title, and a why note when either copy has one. */
export function absorbLiveLeg(prev: LiveLeg, next: LiveLeg): LiveLeg {
  return {
    ...prev,
    name: preferTitle(prev.name, next.name),
    why: realWhy(prev.why) ? prev.why : realWhy(next.why) ? next.why : prev.why,
    key: prev.key ?? next.key,
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
      current: known ? value : 0,
      line: prop.line,
      unit: prop.unit,
      pace: !started ? "pre" : known ? paceOf(value, prop.line, prop.under, prop.plus, event) : "pre",
      source: !started ? "Not started · ESPN" : known ? "ESPN box score" : "Not in the ESPN box score yet",
      why: play.why,
    };
  }
  const bet = teamBet(play.name);
  if (!bet) return null;
  const side = bet.kind === "total" ? null : betSide(bet.team, event);
  if (bet.kind !== "total" && !side) return null;
  const state = event.state === "post" ? "post" : event.state === "pre" ? "pre" : "in";
  const grade = gradeTeamBet(bet, awayScore, homeScore, side, state);
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

function box(summary: Json | undefined, names: string[]): LiveFeed["box"] {
  const teams = summary && isObj(summary.boxscore) && Array.isArray(summary.boxscore.players) ? summary.boxscore.players : [];
  const rows: LiveFeed["box"]["rows"] = [];
  let headers: string[] = [];
  for (const team of teams) {
    if (!isObj(team)) continue;
    const title = str(isObj(team.team) ? team.team.abbreviation : "");
    const groups = Array.isArray(team.statistics) ? team.statistics.filter(isObj) : [];
    const group = groups.find((item) => Array.isArray(item.athletes) && item.athletes.length);
    if (!group) continue;
    const labels = (Array.isArray(group.labels) ? group.labels : Array.isArray(group.keys) ? group.keys : []).map((item) => str(item)).slice(0, 5);
    if (!headers.length) headers = ["Player", ...labels];
    rows.push({ cells: [title], mine: false, header: title });
    for (const athlete of Array.isArray(group.athletes) ? group.athletes.slice(0, 8) : []) {
      if (!isObj(athlete)) continue;
      const name = str(isObj(athlete.athlete) ? athlete.athlete.displayName : "");
      const stats = (Array.isArray(athlete.stats) ? athlete.stats : []).map((item) => str(item)).slice(0, labels.length);
      rows.push({ cells: [name, ...stats], mine: names.some((want) => lastName(want) && lastName(want) === lastName(name)), header: undefined });
    }
  }
  return { headers, rows };
}

function espnTeamStats(summary: Json | undefined): { name: string; away: string; home: string }[] {
  const teams = summary && isObj(summary.boxscore) && Array.isArray(summary.boxscore.teams) ? summary.boxscore.teams : [];
  const parsed = teams.flatMap((team) => {
    if (!isObj(team) || !isObj(team.team) || !Array.isArray(team.statistics)) return [];
    return [{ home: str(team.homeAway) === "home", stats: team.statistics.filter(isObj) }];
  });
  const away = parsed.find((team) => !team.home);
  const home = parsed.find((team) => team.home);
  if (!away || !home) return [];
  const homeBy = new Map(home.stats.map((stat) => [str(stat.name) || str(stat.abbreviation), str(stat.displayValue)]));
  return away.stats.slice(0, 8).flatMap((stat) => {
    const key = str(stat.name) || str(stat.abbreviation);
    const label = str(stat.label) || str(stat.abbreviation) || key;
    const theirs = homeBy.get(key);
    if (!label || !str(stat.displayValue) || !theirs) return [];
    return [{ name: label, away: str(stat.displayValue), home: theirs }];
  });
}

type VsTeam = { ab?: string; ha?: string; rec?: string | null; v?: Record<string, { val?: number; rank?: number; n?: number }> };

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
};

function deskRanks(teamVs: unknown, away: string, home: string): { name: string; away: string; home: string }[] {
  if (!isObj(teamVs) || !isObj(teamVs.sports)) return [];
  for (const sport of Object.values(teamVs.sports)) {
    if (!isObj(sport) || !Array.isArray(sport.games)) continue;
    for (const game of sport.games) {
      if (!isObj(game) || !Array.isArray(game.teams)) continue;
      const teams = game.teams.filter(isObj) as VsTeam[];
      const left = teams.find((team) => team.ab === away);
      const right = teams.find((team) => team.ab === home);
      if (!left?.v || !right?.v) continue;
      return Object.keys(left.v).flatMap((key) => {
        const a = left.v?.[key];
        const b = right.v?.[key];
        if (!a || !b || a.rank == null || b.rank == null) return [];
        const aval = typeof a.val === "number" ? a.val.toFixed(1) : "";
        const bval = typeof b.val === "number" ? b.val.toFixed(1) : "";
        return [{ name: RANK_LABEL[key] ?? key, away: `#${a.rank}${aval ? ` · ${aval}` : ""}`, home: `#${b.rank}${bval ? ` · ${bval}` : ""}` }];
      });
    }
  }
  return [];
}

function gameOf(event: EventRow, plays: Play[], teamVs: unknown, teamBuilt: string | null, standings?: Board["standings"]): LiveGame {
  const names = plays.map((play) => propOf(play.name, event.league)?.player ?? "").filter(Boolean);
  const fromEspn = espnTeamStats(event.summary);
  const fromDesk = fromEspn.length ? [] : deskRanks(teamVs, event.away.abbr, event.home.abbr);
  const pre = event.state === "pre";
  const cast = event.summary ? parseCast(event.summary, event.league) ?? undefined : undefined;
  const awayScore = cast?.away.score ? Number(cast.away.score) : event.away.score;
  const homeScore = cast?.home.score ? Number(cast.home.score) : event.home.score;
  const teams = { away: { abbr: event.away.abbr, names: event.away.names }, home: { abbr: event.home.abbr, names: event.home.names } };
  const buckets = new Map<string, LiveLeg>();
  for (const play of plays) {
    const leg = legFor(play, event, Number.isFinite(awayScore) ? awayScore : event.away.score, Number.isFinite(homeScore) ? homeScore : event.home.score);
    if (!leg) continue;
    const key = liveLegKey(play.name, event.league, teams);
    const next = { ...leg, key, name: cleanLiveTitle(play.name) };
    const prev = buckets.get(key);
    buckets.set(key, prev ? absorbLiveLeg(prev, next) : next);
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
      box: box(event.summary, names),
      teamStats: fromEspn.length ? fromEspn : fromDesk,
      real: true,
      built: fromEspn.length ? undefined : teamBuilt || undefined,
      cast,
    },
  };
}

function keyTeams(game: LiveGame): { away: LiveKeySide; home: LiveKeySide } {
  const names = (abbr: string, name: string) => [abbr, name, ...name.split(/\s+/)];
  return { away: { abbr: game.away, names: names(game.away, game.awayName) }, home: { abbr: game.home, names: names(game.home, game.homeName) } };
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
  const plays = board.tickets.flatMap((ticket) => ticket.plays);
  const wanted = events.filter((event) => plays.some((play) => matches(play, event)));
  await Promise.all(
    wanted.slice(0, 24).map(async (event) => {
      try {
        const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${event.group}/${event.path}/summary?event=${event.id}`, { cache: "no-store" });
        if (response.ok) event.summary = (await response.json()) as Json;
      } catch {
        event.summary = undefined;
      }
    }),
  );
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
