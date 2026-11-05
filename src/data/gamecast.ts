/**
 * ESPN summary → the Live gamecast.
 * Coordinates, scores, and play types are copied from the payload.
 * Nothing here invents a shot, a yard line, or a win probability.
 */

export type CastSide = {
  id: string;
  abbr: string;
  name: string;
  score: string;
  color: string;
  logo: string;
  home: boolean;
};

export type CastPlay = {
  id: string;
  abbr: string;
  logo: string;
  color: string;
  title: string;
  text: string;
  when: string;
  periodKey: string;
  awayScore: string;
  homeScore: string;
  win: string;
};

export type CourtShot = {
  abbr: string;
  home: boolean;
  made: boolean;
  cx: number;
  cy: number;
  periodKey: string;
  color: string;
};

export type RinkMark = {
  abbr: string;
  home: boolean;
  sog: boolean;
  cx: number;
  cy: number;
  periodKey: string;
  color: string;
};

export type FootballSpot = {
  yard: number;
  down: string;
  drive: string;
  redZone: boolean;
  first: number | null;
};

export type BaseballSpot = {
  balls: string;
  strikes: string;
  outs: string;
  bases: [boolean, boolean, boolean];
  batter: string;
  pitcher: string;
};

export type GameCast = {
  away: CastSide;
  home: CastSide;
  live: boolean;
  final: boolean;
  pre: boolean;
  clock: string;
  callout: string;
  plays: CastPlay[];
  kind: "basketball" | "football" | "hockey" | "baseball" | "none";
  court: "nba" | "ncaam" | "wnba" | null;
  /** Period pills besides All. OT is included only when a play uses it. */
  periods: string[];
  shots: CourtShot[];
  rink: RinkMark[];
  football: FootballSpot | null;
  baseball: BaseballSpot | null;
};

type Row = Record<string, unknown>;

function isRow(value: unknown): value is Row {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) return Number(value);
  return null;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

const NAMED: Record<string, string> = {
  jumpshot: "Jump Shot",
  layupshot: "Layup",
  dunkshot: "Dunk",
  personalfoul: "Personal Foul",
  madefreethrow: "Free Throw",
  missedfreethrow: "Free Throw",
  defensiverebound: "Defensive Rebound",
  offensiverebound: "Offensive Rebound",
  blockshot: "Block",
  lostballturnover: "Turnover",
  jumpball: "Jump Ball",
  shorttimeout: "Timeout",
  officialtvtimeout: "Timeout",
  substitution: "Substitution",
  steal: "Steal",
};

/** JumpShot → Jump Shot. A phrase that already has spaces stays. */
export function humanizeType(raw: string): string {
  const text = raw.trim();
  if (!text || /^play$/i.test(text)) return "";
  const key = text.toLowerCase().replace(/[^a-z]/g, "");
  if (NAMED[key]) return NAMED[key];
  if (/\s/.test(text) && !/[a-z][A-Z]/.test(text)) return text;
  return text.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
}

/** A title taken from the play sentence when ESPN left the type blank or set it to Play. */
export function derivePlayTitle(text: string): string {
  const line = text.toLowerCase();
  if (/free throw/.test(line)) return "Free Throw";
  if (/three[- ]point|3-point|\bthree\b/.test(line)) return "Three Point Jumper";
  if (/lay\s?up/.test(line)) return "Layup";
  if (/dunk/.test(line)) return "Dunk";
  if (/defensive rebound/.test(line)) return "Defensive Rebound";
  if (/offensive rebound/.test(line)) return "Offensive Rebound";
  if (/rebound/.test(line)) return "Rebound";
  if (/turnover/.test(line)) return "Turnover";
  if (/foul/.test(line)) return "Foul";
  if (/substitution|subbing/.test(line)) return "Substitution";
  if (/steal/.test(line)) return "Steal";
  if (/block/.test(line)) return "Block";
  if (/timeout/.test(line)) return "Timeout";
  if (/jump ball/.test(line)) return "Jump Ball";
  const words = text.replace(/[.]/g, "").trim().split(/\s+/).slice(0, 4).join(" ");
  return words && !/^play$/i.test(words) ? words : "Update";
}

export function isFreeThrow(typeText: string, playText: string): boolean {
  return /free\s*throw|freethrow/i.test(`${typeText} ${playText}`);
}

/**
 * Row title. Shooting plays that are not free throws gain made / missed.
 * The word Play is never returned.
 */
export function gcHum(typeText: string, playText: string, shooting: boolean, made: boolean, freeThrow: boolean): string {
  const raw = typeText.trim();
  let base = !raw || /^play$/i.test(raw) ? derivePlayTitle(playText) : humanizeType(raw) || derivePlayTitle(playText);
  if (!base || /^play$/i.test(base)) base = derivePlayTitle(playText);
  if (/^play$/i.test(base)) base = "Update";
  if (shooting && !freeThrow) return `${base} ${made ? "made" : "missed"}`;
  return base;
}

export function calloutOf(clock: string, play: { type: string; text: string; abbr: string; shooting: boolean; made: boolean; freeThrow: boolean } | null): string {
  if (/halftime/i.test(clock)) return "HALFTIME";
  if (!play) return "LIVE";
  if (/timeout/i.test(play.type) || /timeout/i.test(play.text)) return "TIMEOUT";
  if (play.shooting && !play.freeThrow && /\bthree\b|3-point/i.test(play.text) && play.made && play.abbr) return `${play.abbr} THREE`;
  if (play.shooting && !play.freeThrow && !play.made) return "MISSED SHOT";
  const title = gcHum(play.type, play.text, false, false, true);
  return title && !/^play$/i.test(title) ? title.toUpperCase() : "LIVE";
}

/** homeWinPercentage is ESPN's 0–1 home chance. The leader is named. A tie omits the line. */
export function winLine(homePct: number, away: string, home: string): string {
  if (!Number.isFinite(homePct)) return "";
  const homeWin = homePct <= 1 ? homePct * 100 : homePct;
  const awayWin = 100 - homeWin;
  if (Math.abs(homeWin - awayWin) < 0.05) return "";
  if (homeWin > awayWin) return `Win %: ${home}, ${homeWin.toFixed(1)}`;
  return `Win %: ${away}, ${awayWin.toFixed(1)}`;
}

export function validCourt(x: number, y: number): boolean {
  return x >= 0 && x <= 50 && y >= -5 && y <= 89;
}

/** Away shoots left, home shoots right. Returns null when the coordinate is outside ESPN's court. */
export function courtPoint(x: number, y: number, home: boolean): { cx: number; cy: number } | null {
  if (!validCourt(x, y)) return null;
  if (home) return { cx: 94 - 5.25 - y, cy: 50 - x };
  return { cx: 5.25 + y, cy: x };
}

function lum(color: string): number {
  const n = Number.parseInt(color.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function mix(color: string, toward: string, amount: number): string {
  const a = Number.parseInt(color.slice(1), 16);
  const b = Number.parseInt(toward.slice(1), 16);
  const channel = (shift: number) => Math.round(((a >> shift) & 255) * (1 - amount) + ((b >> shift) & 255) * amount);
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, "0")).join("")}`;
}

/** Team color that stays visible on both the night court and a day card. */
export function readableColor(color: string, alt: string): string {
  const hex = (value: string) => {
    const raw = value.replace("#", "").trim();
    return /^[0-9a-f]{6}$/i.test(raw) ? `#${raw}` : "";
  };
  const primary = hex(color);
  const secondary = hex(alt);
  const tune = (value: string) => {
    if (!value) return "";
    if (lum(value) < 0.22) return mix(value, "#ffffff", 0.45);
    if (lum(value) > 0.86) return mix(value, "#17202b", 0.4);
    return value;
  };
  return tune(primary) || tune(secondary) || "#8fb4ff";
}

function courtKind(league: string): GameCast["court"] {
  if (league === "NBA") return "nba";
  if (league === "WNBA") return "wnba";
  if (league === "NCAAB") return "ncaam";
  return null;
}

function kindOf(league: string): GameCast["kind"] {
  if (league === "NBA" || league === "WNBA" || league === "NCAAB") return "basketball";
  if (league === "NFL" || league === "NCAAF") return "football";
  if (league === "NHL") return "hockey";
  if (league === "MLB") return "baseball";
  return "none";
}

export function periodKey(periodNumber: number, periodText: string, league: string): string {
  const text = periodText.toLowerCase();
  if (/overtime|\bot\b/.test(text)) return "OT";
  if (league === "NCAAB") {
    if (periodNumber === 1) return "1H";
    if (periodNumber === 2) return "2H";
    return periodNumber > 2 ? "OT" : "";
  }
  if (league === "NBA" || league === "WNBA") {
    if (periodNumber >= 1 && periodNumber <= 4) return `Q${periodNumber}`;
    return periodNumber > 4 ? "OT" : "";
  }
  if (league === "NHL") {
    if (periodNumber >= 1 && periodNumber <= 3) return `P${periodNumber}`;
    return periodNumber > 3 ? "OT" : "";
  }
  return "";
}

export function periodLabel(periodNumber: number, periodText: string): string {
  if (/overtime/i.test(periodText)) return "OT";
  if (/^ot$/i.test(periodText.trim())) return "OT";
  if (periodNumber === 1) return "1st";
  if (periodNumber === 2) return "2nd";
  if (periodNumber === 3) return "3rd";
  if (periodNumber > 3) return `${periodNumber}th`;
  return periodText;
}

function periodsFor(league: string, used: Set<string>): string[] {
  if (league === "NCAAB") return used.has("OT") ? ["1H", "2H", "OT"] : ["1H", "2H"];
  if (league === "NBA" || league === "WNBA") return used.has("OT") ? ["Q1", "Q2", "Q3", "Q4", "OT"] : ["Q1", "Q2", "Q3", "Q4"];
  if (league === "NHL") return used.has("OT") ? ["P1", "P2", "P3", "OT"] : ["P1", "P2", "P3"];
  return [];
}

function logoOf(team: Row): string {
  const logos = list(team.logos);
  const first = logos.find(isRow);
  return str(first?.href) || str(team.logo);
}

export function parseCast(summary: unknown, league: string): GameCast | null {
  if (!isRow(summary)) return null;
  const header = isRow(summary.header) ? summary.header : {};
  const comp = list(header.competitions).find(isRow) ?? {};
  const status = isRow(comp.status) && isRow(comp.status.type) ? comp.status.type : {};
  const state = str(status.state) || "pre";
  const clock = str(status.shortDetail) || str(status.detail);
  const sides = list(comp.competitors).filter(isRow).map((row) => {
    const team = isRow(row.team) ? row.team : {};
    return {
      id: str(team.id),
      abbr: str(team.abbreviation),
      name: str(team.shortDisplayName) || str(team.displayName) || str(team.abbreviation),
      score: str(row.score),
      color: readableColor(str(team.color), str(team.alternateColor)),
      logo: logoOf(team),
      home: str(row.homeAway) === "home",
    };
  });
  const away = sides.find((side) => !side.home);
  const home = sides.find((side) => side.home);
  if (!away || !home) return null;
  const byId = new Map(sides.map((side) => [side.id, side]));
  const kind = kindOf(league);
  const court = kind === "basketball" ? courtKind(league) : null;
  const wpByPlay = new Map<string, number>();
  for (const row of list(summary.winprobability)) {
    if (!isRow(row)) continue;
    const pct = num(row.homeWinPercentage);
    const id = str(row.playId);
    if (pct != null && id) wpByPlay.set(id, pct);
  }
  const wpLast = list(summary.winprobability).filter(isRow).at(-1);
  const wpFallback = wpLast ? num(wpLast.homeWinPercentage) : null;
  const rawPlays = list(summary.plays).filter(isRow);
  const used = new Set<string>();
  const shots: CourtShot[] = [];
  const rink: RinkMark[] = [];
  const plays: CastPlay[] = [];
  let lastMeta: { type: string; text: string; abbr: string; shooting: boolean; made: boolean; freeThrow: boolean } | null = null;
  for (const row of rawPlays) {
    const text = str(row.text) || str(row.description) || str(row.shortText);
    if (!text) continue;
    const typeRow = isRow(row.type) ? row.type : {};
    const typeText = str(typeRow.text) || (typeof row.type === "string" ? row.type : "");
    const team = isRow(row.team) ? row.team : {};
    const side = byId.get(str(team.id));
    const abbr = side?.abbr || str(team.abbreviation);
    const period = isRow(row.period) ? row.period : {};
    const periodNumber = num(period.number) ?? 0;
    const periodText = str(period.displayValue);
    const key = periodKey(periodNumber, periodText, league);
    if (key) used.add(key);
    const clockText = str(isRow(row.clock) ? row.clock.displayValue : row.clock);
    const when = [clockText, periodLabel(periodNumber, periodText)].filter(Boolean).join(" - ");
    const freeThrow = isFreeThrow(typeText, text);
    const shooting = row.shootingPlay === true;
    const made = row.scoringPlay === true;
    const coord = isRow(row.coordinate) ? row.coordinate : null;
    const x = coord ? num(coord.x) : null;
    const y = coord ? num(coord.y) : null;
    if (kind === "basketball" && shooting && !freeThrow && x != null && y != null && side) {
      const point = courtPoint(x, y, side.home);
      if (point) shots.push({ abbr, home: side.home, made, cx: point.cx, cy: point.cy, periodKey: key, color: side.color });
    }
    if (kind === "hockey" && x != null && y != null && x >= -100 && x <= 100 && y >= -42.5 && y <= 42.5 && side) {
      const blob = `${typeText} ${text}`.toLowerCase();
      const blocked = /block/.test(blob);
      const missed = /miss/.test(blob);
      const sog = !blocked && !missed && /shot|goal/.test(blob);
      if (/shot|goal|miss|block/.test(blob)) rink.push({ abbr, home: side.home, sog, cx: x, cy: y, periodKey: key, color: side.color });
    }
    const play: CastPlay = {
      id: str(row.id),
      abbr,
      logo: side?.logo || "",
      color: side?.color || "#8fb4ff",
      title: gcHum(typeText, text, shooting, made, freeThrow),
      text,
      when,
      periodKey: key,
      awayScore: str(row.awayScore),
      homeScore: str(row.homeScore),
      win: "",
    };
    plays.push(play);
    lastMeta = { type: typeText, text, abbr, shooting, made, freeThrow };
  }
  const newest = plays.at(-1);
  if (newest && state === "in") {
    const pct = (newest.id ? wpByPlay.get(newest.id) : undefined) ?? wpFallback;
    if (pct != null) newest.win = winLine(pct, away.abbr, home.abbr);
  }
  const callout = state === "pre" ? "" : calloutOf(clock, lastMeta);
  return {
    away: { id: away.id, abbr: away.abbr, name: away.name, score: away.score, color: away.color, logo: away.logo, home: false },
    home: { id: home.id, abbr: home.abbr, name: home.name, score: home.score, color: home.color, logo: home.logo, home: true },
    live: state === "in",
    final: state === "post",
    pre: state === "pre" || state === "",
    clock,
    callout,
    plays: plays.reverse(),
    kind,
    court,
    periods: periodsFor(league, used),
    shots,
    rink,
    football: kind === "football" ? footballOf(summary, byId) : null,
    baseball: kind === "baseball" ? baseballOf(summary) : null,
  };
}

function footballOf(summary: Row, byId: Map<string, { abbr: string }>): FootballSpot | null {
  const sit = isRow(summary.situation) ? summary.situation : {};
  const drives = isRow(summary.drives) ? summary.drives : {};
  const current = isRow(drives.current) ? drives.current : {};
  const yard = num(sit.yardLine);
  const down = str(sit.shortDownDistanceText) || [str(sit.down) && `${str(sit.down)}`, str(sit.distance) && `& ${str(sit.distance)}`].filter(Boolean).join(" ");
  const drive = str(current.description) || str(current.shortDisplayResult) || str(sit.possessionText) || str(current.displayResult);
  const distance = num(sit.distance);
  if (yard == null && !down && !drive) return null;
  const spot = yard == null ? 50 : Math.max(0, Math.min(100, yard));
  const first = yard != null && distance != null ? Math.max(0, Math.min(100, yard + distance)) : null;
  const redZone = sit.isRedZone === true;
  const possession = byId.get(str(sit.possession))?.abbr || "";
  return { yard: spot, down: [possession, down].filter(Boolean).join(" "), drive, redZone, first };
}

function baseballOf(summary: Row): BaseballSpot | null {
  const sit = isRow(summary.situation) ? summary.situation : {};
  const balls = str(sit.balls);
  const strikes = str(sit.strikes);
  const outs = str(sit.outs);
  if (!balls && !strikes && !outs && sit.onFirst == null) return null;
  const name = (value: unknown) => {
    if (!isRow(value)) return "";
    const athlete = isRow(value.athlete) ? value.athlete : value;
    return str(athlete.displayName) || str(athlete.shortName);
  };
  return {
    balls: balls || "0",
    strikes: strikes || "0",
    outs: outs || "0",
    bases: [sit.onFirst === true || isRow(sit.onFirst), sit.onSecond === true || isRow(sit.onSecond), sit.onThird === true || isRow(sit.onThird)],
    batter: name(sit.batter),
    pitcher: name(sit.pitcher),
  };
}

export function filterShots<T extends { abbr: string; periodKey: string }>(rows: T[], team: string, period: string): T[] {
  return rows.filter((row) => (team === "All" || row.abbr === team) && (period === "All" || row.periodKey === period));
}

export function fgLine(shots: CourtShot[], abbr: string): string {
  const mine = shots.filter((shot) => shot.abbr === abbr);
  const made = mine.filter((shot) => shot.made).length;
  return `${abbr} ${made}/${mine.length} FG`;
}

export function sogLine(marks: RinkMark[], abbr: string): string {
  const n = marks.filter((mark) => mark.abbr === abbr && mark.sog).length;
  return `${abbr} ${n} SOG`;
}
