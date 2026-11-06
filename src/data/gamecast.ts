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
  /** Down and spot before this snap, such as `2nd & 10 · UTSA 36`. */
  spot?: string;
  badge?: string;
  scoring?: boolean;
  /** Snap path for this row, so a tap can replay it on the field. */
  motion?: FootballMotion;
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
  /** A scoring shot. Drawn larger than a save. */
  goal: boolean;
  cx: number;
  cy: number;
  periodKey: string;
  color: string;
};

export type FootballMotionKind = "rush" | "pass" | "incomplete" | "sack" | "kick" | "penalty";

/** One snap on the 0–100 field. 0 is the away goal line, 100 is the home goal line. */
export type FootballMotion = {
  playId: string;
  kind: FootballMotionKind;
  fromYard: number;
  toYard: number;
  /** Incomplete target when the play text names one. Null means the mark stays at the line of scrimmage. */
  targetYard: number | null;
  yards: number | null;
  label: string;
  scoring: boolean;
};

export type FootballSpot = {
  /** Ball on the 0–100 field. 0 is the away goal line, 100 is the home goal line. */
  yard: number;
  down: string;
  drive: string;
  redZone: boolean;
  first: number | null;
  possession?: string;
  possessionColor?: string;
  /** Home has the ball and is driving toward 0. */
  homePossession?: boolean;
  /** Where this drive began, on the same 0–100 field. */
  driveStart?: number | null;
  /** Previous snap, for the gain/loss connector. */
  prevYard?: number | null;
  awayAbbr?: string;
  homeAbbr?: string;
  awayColor?: string;
  homeColor?: string;
  yardsToEndzone?: number | null;
  /** Latest non-admin snap. A timeout does not replace it. */
  motion?: FootballMotion;
};

/** Scoreboard situation passed in from ESPN when the summary leaves it blank. */
export type ScoreSituation = {
  possessionId?: string;
  awayTimeouts?: number | null;
  homeTimeouts?: number | null;
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
  /** Who has the ball. Null before kickoff and after the final. */
  possessionSide: "away" | "home" | null;
  /** Timeouts left in regulation, 0–3. Null outside football or when ESPN omits them. */
  awayTimeouts: number | null;
  homeTimeouts: number | null;
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

/** Hockey row title. ESPN marks every hockey play shootingPlay, so made/missed is not used here. */
export function hockeyPlayTitle(typeText: string, playText: string, made: boolean): string {
  const blob = `${typeText} ${playText}`.toLowerCase();
  const key = typeText.toLowerCase().replace(/[\s_]+/g, "-");
  if (key === "goal" || /^goal$/i.test(typeText.trim()) || made) return "Goal";
  if (key === "shot-blocked" || key === "blocked" || /shot blocked by|\bblocked shot\b/.test(blob)) return "Blocked Shot";
  if (key === "shot-missed" || key === "missed" || /\bmissed shot\b/.test(blob)) return "Missed Shot";
  if (key === "shot-on-goal" || key === "shot") return "Shot on Goal";
  if (key === "faceoff" || /face ?off/.test(blob)) return "Faceoff";
  if (key === "penalty" || /\bpenalty\b/.test(blob)) return "Penalty";
  if (key === "stoppage" || /\bstoppage\b/.test(blob)) return "Stoppage";
  if (key === "period-start") return "Period Start";
  if (key === "period-end" || key === "end-of-period") return "End of Period";
  if (key === "hit" || /^hit$/i.test(typeText.trim())) return "Hit";
  if (key === "giveaway") return "Giveaway";
  if (key === "takeaway") return "Takeaway";
  const human = humanizeType(typeText) || derivePlayTitle(playText);
  return human && !/^play$/i.test(human) ? human : "Update";
}

/**
 * Row title. Basketball shooting plays that are not free throws gain made / missed.
 * Hockey, football, and baseball keep the play type. The word Play is never returned.
 */
export function gcHum(typeText: string, playText: string, shooting: boolean, made: boolean, freeThrow: boolean, kind: GameCast["kind"] = "basketball"): string {
  if (kind === "hockey") return hockeyPlayTitle(typeText, playText, made);
  const raw = typeText.trim();
  let base = !raw || /^play$/i.test(raw) ? derivePlayTitle(playText) : humanizeType(raw) || derivePlayTitle(playText);
  if (!base || /^play$/i.test(base)) base = derivePlayTitle(playText);
  if (/^play$/i.test(base)) base = "Update";
  if (kind === "basketball" && shooting && !freeThrow) return `${base} ${made ? "made" : "missed"}`;
  return base;
}

export function calloutOf(clock: string, play: { type: string; text: string; abbr: string; shooting: boolean; made: boolean; freeThrow: boolean } | null, kind: GameCast["kind"] = "basketball"): string {
  if (/halftime/i.test(clock)) return "HALFTIME";
  if (!play) return "LIVE";
  if (kind === "hockey") {
    const title = hockeyPlayTitle(play.type, play.text, play.made);
    if (title === "Goal") return play.abbr ? `${play.abbr} GOAL` : "GOAL";
    if (title === "Shot on Goal") return "SHOT SAVED";
    if (title === "Missed Shot") return "MISSED SHOT";
    if (title === "Blocked Shot") return "BLOCKED SHOT";
    if (title === "Faceoff") return "FACEOFF";
    if (title === "Penalty") return "PENALTY";
    if (title === "Stoppage") return "STOPPAGE";
    if (title === "Period Start") return "PERIOD START";
    if (title === "End of Period") return "END OF PERIOD";
    return title.toUpperCase();
  }
  if (kind === "basketball") {
    if (/timeout/i.test(play.type) || /timeout/i.test(play.text)) return "TIMEOUT";
    if (play.shooting && !play.freeThrow && /\bthree\b|3-point/i.test(play.text) && play.made && play.abbr) return `${play.abbr} THREE`;
    if (play.shooting && !play.freeThrow && !play.made) return "MISSED SHOT";
  }
  const title = gcHum(play.type, play.text, false, false, true, kind);
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

function colorDistance(left: string, right: string): number {
  const a = Number.parseInt(left.replace("#", ""), 16);
  const b = Number.parseInt(right.replace("#", ""), 16);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 999;
  const channel = (shift: number) => Math.abs(((a >> shift) & 255) - ((b >> shift) & 255));
  return channel(16) + channel(8) + channel(0);
}

/** Away and home marks stay different colors on pale ice. */
function splitIceColors(awayColor: string, awayAlt: string, homeColor: string, homeAlt: string): [string, string] {
  const away = readableColor(awayColor, awayAlt);
  let home = readableColor(homeColor, homeAlt);
  if (colorDistance(away, home) >= 90) return [away, home];
  const alt = readableColor(homeAlt, "#1d5bbf");
  if (colorDistance(away, alt) >= 90) return [away, alt];
  home = colorDistance(away, "#f5c400") >= 90 ? "#f5c400" : "#1d5bbf";
  return [away, home];
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
  if (league === "NFL" || league === "NCAAF") {
    if (/overtime|\bot\b/.test(text) || periodNumber > 4) return "OT";
    if (periodNumber >= 1 && periodNumber <= 4) return `Q${periodNumber}`;
    return "";
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
  if (league === "NFL" || league === "NCAAF") return used.has("OT") ? ["Q1", "Q2", "Q3", "Q4", "OT"] : ["Q1", "Q2", "Q3", "Q4"];
  return [];
}

function logoOf(team: Row): string {
  const logos = list(team.logos);
  const first = logos.find(isRow);
  return str(first?.href) || str(team.logo);
}

function paint(color: string, fallback: string): string {
  const raw = color.replace("#", "").trim();
  return /^[0-9a-f]{6}$/i.test(raw) ? `#${raw}` : fallback;
}

export function footballTitle(typeText: string, playText: string, yards: number | null, scoring: boolean): { title: string; badge: string } {
  const type = typeText.toLowerCase();
  const text = playText.toLowerCase();
  const yardsLabel = yards != null && yards !== 0 ? `${yards > 0 ? "+" : ""}${yards} yds` : "";
  const badge = /1st down/i.test(playText) ? "1ST DOWN" : "";
  if (scoring && /touchdown/.test(`${type} ${text}`)) return { title: "TOUCHDOWN", badge };
  if (/field goal/.test(type) || /field goal/.test(text)) return { title: "Field Goal", badge };
  if (/interception/.test(type) || /\bintercept/.test(text)) return { title: "Interception", badge };
  if (/fumble/.test(type) || /\bfumble/.test(text)) return { title: "Fumble", badge };
  if (/sack/.test(type)) return { title: yardsLabel ? `Sack ${yardsLabel}` : "Sack", badge };
  if (/incompletion|incomplete/.test(type) || /\bincomplete\b/.test(text)) return { title: "Incomplete Pass", badge };
  if (/punt return/.test(type)) return { title: yardsLabel ? `Punt Return ${yardsLabel}` : "Punt Return", badge };
  if (/^punt\b/.test(type)) return { title: "Punt", badge };
  if (/kickoff/.test(type)) return { title: "Kickoff", badge };
  if (/penalty/.test(type) || /\bpenalty\b/.test(text)) return { title: "Penalty", badge };
  if (/pass/.test(type)) return { title: yardsLabel ? `Pass ${yardsLabel}` : "Pass", badge };
  if (/rush/.test(type)) return { title: yardsLabel ? `Rush ${yardsLabel}` : "Rush", badge };
  if (/end period|end of/.test(type) || /end of/.test(text)) return { title: "End Period", badge: "" };
  if (/timeout/.test(type) || /timeout/.test(text)) return { title: /official/.test(text) ? "Official Timeout" : "Timeout", badge: "" };
  const human = humanizeType(typeText) || derivePlayTitle(playText);
  return { title: human && !/^play$/i.test(human) ? human : "Update", badge };
}

export function footballAdmin(typeText: string, playText: string): boolean {
  return /end period|end of|timeout|two-minute warning|two minute warning/i.test(`${typeText} ${playText}`);
}

const YARD_ALIAS: Record<string, string[]> = {
  BLT: ["BAL"],
  BAL: ["BLT"],
  JAC: ["JAX"],
  JAX: ["JAC"],
  WSH: ["WAS"],
  WAS: ["WSH"],
  LAR: ["LA"],
  LA: ["LAR"],
};

/** ESPN yard codes: full abbr, a 3-letter prefix such as UTS for UTSA, or BLT for BAL. */
export function yardCodeMatches(code: string, abbr: string): boolean {
  const left = code.toUpperCase();
  const right = abbr.toUpperCase();
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length >= 3 && right.startsWith(left)) return true;
  if (right.length >= 3 && left.startsWith(right)) return true;
  return (YARD_ALIAS[left] ?? []).includes(right);
}

/** `thrown to UTS42` / `thrown to FAU16` / `thrown to the FAU 16`. Null when the code is not one of the two teams. */
export function incompleteTarget(text: string, awayAbbr: string, homeAbbr: string): number | null {
  const match = text.match(/thrown to (?:the )?([A-Z]{2,5})\s*(\d{1,2})\b/);
  if (!match) return null;
  const code = match[1] ?? "";
  const line = Number(match[2]);
  if (!Number.isFinite(line)) return null;
  const away = yardCodeMatches(code, awayAbbr);
  const home = yardCodeMatches(code, homeAbbr);
  if (away === home) return null;
  const yard = away ? line : 100 - line;
  return Math.max(0, Math.min(100, yard));
}

function motionKind(typeText: string, playText: string): FootballMotionKind | null {
  const type = typeText.toLowerCase();
  const blob = `${typeText} ${playText}`.toLowerCase();
  if (/pass incompletion/.test(type) || /\bincomplete\b/.test(blob)) return "incomplete";
  if (/\bsack\b/.test(type)) return "sack";
  if (/\bpenalty\b/.test(type) || /\bpenalty\b/.test(blob)) return "penalty";
  if (/field goal|punt return|kickoff return|^punt\b|kickoff/.test(type)) return "kick";
  if (/pass reception|passing touchdown|pass interception|interception/.test(type) || /\bintercept/.test(blob)) return "pass";
  if (/rush|scramble|sneak|\bkneel/.test(type) || /scramble|sneak|\bkneel/.test(blob)) return "rush";
  if (/\bpass\b/.test(type)) return "pass";
  return null;
}

function signedYards(value: number): string {
  const abs = Math.abs(value);
  const body = Number.isInteger(abs) ? String(abs) : String(Math.round(abs * 10) / 10);
  if (value > 0) return `+${body}`;
  if (value < 0) return `-${body}`;
  return "+0";
}

function motionLabel(kind: FootballMotionKind, yards: number | null, scoring: boolean, typeText: string, playText: string): string {
  if (kind === "incomplete") return "INC";
  const blob = `${typeText} ${playText}`;
  if (scoring && /touchdown/i.test(blob)) return yards == null ? "TD" : `TD ${signedYards(yards)} YDS`;
  if (kind === "sack") return yards == null ? "SACK" : `SACK ${signedYards(yards)} YDS`;
  if (/field goal good/i.test(typeText) || (/field goal/i.test(blob) && scoring)) {
    return yards == null ? "FG" : `FG ${Math.abs(yards)} YDS`;
  }
  const word = kind === "rush" ? "RUN" : kind === "pass" ? "PASS" : kind === "kick" ? "KICK" : "PEN";
  if (yards == null) return word;
  return `${word} ${signedYards(yards)} YDS`;
}

/**
 * Ground push, pass lob, or kick arc for one snap.
 * Null for timeouts, end of period, the two-minute warning, and rows with no spot.
 */
export function footballMotion(
  row: Record<string, unknown>,
  teams: { homeId: string; awayAbbr: string; homeAbbr: string },
): FootballMotion | null {
  const text = str(row.text) || str(row.description);
  const typeText = playTypeText(row);
  if (!text || footballAdmin(typeText, text)) return null;
  const kind = motionKind(typeText, text);
  if (!kind) return null;
  const start = isRow(row.start) ? row.start : {};
  const end = isRow(row.end) ? row.end : {};
  const startTeamId = str(isRow(start.team) ? start.team.id : "");
  const endTeamId = str(isRow(end.team) ? end.team.id : "");
  const startYte = num(start.yardsToEndzone);
  if (startYte == null) return null;
  const startHome = !!startTeamId && startTeamId === teams.homeId;
  const endHome = endTeamId ? endTeamId === teams.homeId : startHome;
  const fromYard = clampYard(startHome ? startYte : 100 - startYte);
  const endYte = num(end.yardsToEndzone);
  let toYard = endYte == null ? fromYard : clampYard(endHome ? endYte : 100 - endYte);
  const blob = `${typeText} ${text}`;
  const touchdown = row.scoringPlay === true && /touchdown/i.test(blob);
  const fieldGoal = /field goal good/i.test(typeText) || (row.scoringPlay === true && /field goal/i.test(blob));
  if (touchdown) {
    if (startTeamId && endTeamId && startTeamId !== endTeamId) toYard = endHome ? 0 : 100;
    else toYard = startHome ? 0 : 100;
  } else if (fieldGoal) toYard = startHome ? 0 : 100;
  const stat = num(row.statYardage);
  const delta = startHome ? fromYard - toYard : toYard - fromYard;
  const yards = kind === "incomplete" ? 0 : stat != null ? stat : endYte != null || touchdown || fieldGoal ? delta : null;
  const targetYard = kind === "incomplete" ? incompleteTarget(text, teams.awayAbbr, teams.homeAbbr) : null;
  return {
    playId: str(row.id),
    kind,
    fromYard,
    toYard: kind === "incomplete" ? fromYard : toYard,
    targetYard,
    yards,
    label: motionLabel(kind, yards, touchdown || fieldGoal, typeText, text),
    scoring: touchdown || fieldGoal,
  };
}

function clampCount(value: number | null): number | null {
  if (value == null) return null;
  return Math.max(0, Math.min(3, Math.round(value)));
}

function timeoutsUsed(comp: Row, home: boolean): number | null {
  const row = list(comp.competitors).filter(isRow).find((side) => (str(side.homeAway) === "home") === home);
  return num(row?.timeoutsUsed);
}

function clockPrefix(text: string): string {
  return text.replace(/^\(\d{1,2}:\d{2}\)\s*/, "").trim();
}

function downSpot(row: Row): string {
  const down = num(row.down);
  const text = str(row.downDistanceText);
  if (down != null && down < 1) {
    const at = text.replace(/^.*\bat\s+/i, "").trim() || str(row.possessionText);
    return at ? `Kickoff / PAT at ${at}` : "Kickoff / PAT";
  }
  if (text) return text.replace(/\s+at\s+/i, " · ");
  const short = str(row.shortDownDistanceText);
  const spot = str(row.possessionText);
  return [short, spot].filter(Boolean).join(" · ");
}

/** Flatten ESPN drives. `current` replaces a repeated last previous drive. */
export function footballPlayRows(summary: Row): Row[] {
  const drives = isRow(summary.drives) ? summary.drives : {};
  const order: string[] = [];
  const byDrive = new Map<string, Row>();
  const add = (drive: Row) => {
    const id = str(drive.id) || `d${order.length}`;
    if (!byDrive.has(id)) order.push(id);
    byDrive.set(id, drive);
  };
  for (const drive of list(drives.previous).filter(isRow)) add(drive);
  if (isRow(drives.current)) add(drives.current);
  const plays: Row[] = [];
  const seen = new Set<string>();
  for (const id of order) {
    const drive = byDrive.get(id);
    if (!drive) continue;
    const driveTeam = isRow(drive.team) ? drive.team : {};
    for (const play of list(drive.plays).filter(isRow)) {
      const pid = str(play.id);
      if (pid && seen.has(pid)) continue;
      if (pid) seen.add(pid);
      const start = isRow(play.start) ? play.start : {};
      const end = isRow(play.end) ? play.end : {};
      const team = isRow(start.team) ? start.team : isRow(end.team) ? end.team : driveTeam;
      plays.push({ ...play, team });
    }
  }
  if (plays.length) return plays;
  return list(summary.plays).filter(isRow);
}

function clampYard(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function ballOnField(yardsToEndzone: number, homeOffense: boolean): number {
  const yards = clampYard(yardsToEndzone);
  return homeOffense ? yards : 100 - yards;
}

export function parseCast(summary: unknown, league: string, situation?: ScoreSituation | null): GameCast | null {
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
      rawColor: str(team.color),
      rawAlt: str(team.alternateColor),
      color: "",
      logo: logoOf(team),
      home: str(row.homeAway) === "home",
    };
  });
  const away = sides.find((side) => !side.home);
  const home = sides.find((side) => side.home);
  if (!away || !home) return null;
  const [awayColor, homeColor] = splitIceColors(away.rawColor, away.rawAlt, home.rawColor, home.rawAlt);
  away.color = awayColor;
  home.color = homeColor;
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
  const rawPlays = kind === "football" ? footballPlayRows(summary) : list(summary.plays).filter(isRow);
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
    const when = kind === "football" && key
      ? [key, clockText].filter(Boolean).join(" · ")
      : [clockText, periodLabel(periodNumber, periodText)].filter(Boolean).join(" - ");
    const typeAbbr = str(typeRow.abbreviation);
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
    const hockeyType = typeAbbr || typeText;
    const blockedShot = kind === "hockey" && (typeAbbr.toLowerCase() === "shot-blocked" || /shot blocked by/i.test(text));
    const markSide = blockedShot && side ? (side.home ? away : home) : side;
    if (kind === "hockey" && x != null && y != null && x >= -100 && x <= 100 && y >= -42.5 && y <= 42.5 && markSide) {
      const shot = hockeyPlayTitle(hockeyType, `${typeText} ${text}`, made);
      if (shot === "Goal" || shot === "Shot on Goal" || shot === "Missed Shot" || shot === "Blocked Shot") {
        rink.push({
          abbr: markSide.abbr,
          home: markSide.home,
          sog: shot === "Goal" || shot === "Shot on Goal",
          goal: shot === "Goal",
          cx: x,
          cy: y,
          periodKey: key,
          color: markSide.color,
        });
      }
    }
    const yards = num(row.statYardage);
    const football = kind === "football" ? footballTitle(typeText, text, yards, made) : null;
    const startSpot = isRow(row.start) ? row.start : {};
    const motion = kind === "football" ? footballMotion(row, { homeId: home.id, awayAbbr: away.abbr, homeAbbr: home.abbr }) : null;
    const play: CastPlay = {
      id: str(row.id),
      abbr,
      logo: side?.logo || "",
      color: side?.color || "",
      title: football?.title || gcHum(kind === "hockey" ? hockeyType : typeText, text, shooting, made, freeThrow, kind),
      text: kind === "football" ? clockPrefix(text) : text,
      when,
      periodKey: key,
      awayScore: str(row.awayScore),
      homeScore: str(row.homeScore),
      win: kind === "football" && str(row.id) && wpByPlay.has(str(row.id)) ? winLine(wpByPlay.get(str(row.id)) ?? 0, away.abbr, home.abbr) : "",
      spot: kind === "football" ? downSpot(startSpot) : undefined,
      badge: football?.badge || undefined,
      scoring: kind === "football" ? made : undefined,
      motion: motion ?? undefined,
    };
    plays.push(play);
    lastMeta = { type: kind === "hockey" ? hockeyType : typeText, text, abbr: markSide?.abbr || abbr, shooting, made, freeThrow };
  }
  const newest = plays.at(-1);
  if (newest && state === "in") {
    const pct = (newest.id ? wpByPlay.get(newest.id) : undefined) ?? wpFallback;
    if (pct != null) newest.win = winLine(pct, away.abbr, home.abbr);
  }
  const callout = state === "pre" ? "" : kind === "football" ? footballCallout(rawPlays) : calloutOf(clock, lastMeta, kind);
  const football = kind === "football" ? footballOf(summary, away, home) : null;
  const preGame = state === "pre" || state === "";
  const finalGame = state === "post";
  const awayLeft = clampCount(situation?.awayTimeouts ?? null) ?? (kind === "football" ? clampCount(timeoutsUsed(comp, false) == null ? null : 3 - (timeoutsUsed(comp, false) ?? 0)) : null);
  const homeLeft = clampCount(situation?.homeTimeouts ?? null) ?? (kind === "football" ? clampCount(timeoutsUsed(comp, true) == null ? null : 3 - (timeoutsUsed(comp, true) ?? 0)) : null);
  let possessionSide: GameCast["possessionSide"] = null;
  if (kind === "football" && !preGame && !finalGame) {
    const possId = situation?.possessionId || "";
    if (possId && possId === home.id) possessionSide = "home";
    else if (possId && possId === away.id) possessionSide = "away";
    else if (football?.homePossession === true) possessionSide = "home";
    else if (football?.possession && football.possession === away.abbr) possessionSide = "away";
    else if (football?.possession && football.possession === home.abbr) possessionSide = "home";
  }
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
    football,
    baseball: kind === "baseball" ? baseballOf(summary) : null,
    possessionSide,
    awayTimeouts: kind === "football" ? awayLeft : null,
    homeTimeouts: kind === "football" ? homeLeft : null,
  };
}

function playTypeText(row: Row): string {
  const typeRow = isRow(row.type) ? row.type : {};
  return str(typeRow.text) || (typeof row.type === "string" ? row.type : "");
}

function footballCallout(rows: Row[]): string {
  const labeled = rows.map((row) => {
    const text = str(row.text) || str(row.description);
    const typeText = playTypeText(row);
    const title = footballTitle(typeText, text, num(row.statYardage), row.scoringPlay === true).title;
    return { typeText, text, title, admin: footballAdmin(typeText, text) };
  });
  const last = labeled.at(-1);
  if (!last?.title) return "LIVE";
  if (!last.admin) return last.title.toUpperCase();
  const snap = [...labeled].reverse().find((row) => !row.admin && row.title);
  const blob = `${last.typeText} ${last.text}`;
  const status = /end period|end of/i.test(blob) ? "END PERIOD" : /two-minute warning|two minute warning/i.test(blob) ? "TWO-MINUTE WARNING" : "TIMEOUT";
  return snap ? `${status} · ${snap.title.toUpperCase()}` : status;
}

function footballOf(summary: Row, away: { id: string; abbr: string; color: string; rawColor?: string }, home: { id: string; abbr: string; color: string; rawColor?: string }): FootballSpot | null {
  const header = isRow(summary.header) ? summary.header : {};
  const comp = list(header.competitions).find(isRow) ?? {};
  const sit = isRow(summary.situation) ? summary.situation : isRow(comp.situation) ? comp.situation : {};
  const drives = isRow(summary.drives) ? summary.drives : {};
  const current = isRow(drives.current) ? drives.current : {};
  const rows = footballPlayRows(summary);
  let spotPlay: Row | null = null;
  let prevPlay: Row | null = null;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (!row) continue;
    const text = str(row.text) || str(row.description);
    if (footballAdmin(playTypeText(row), text)) continue;
    if (!spotPlay) spotPlay = row;
    else {
      prevPlay = row;
      break;
    }
  }
  const end = spotPlay && isRow(spotPlay.end) ? spotPlay.end : {};
  const start = spotPlay && isRow(spotPlay.start) ? spotPlay.start : {};
  const yardsToEndzone = num(end.yardsToEndzone) ?? num(start.yardsToEndzone) ?? num(sit.yardsToEndzone);
  const possId = str(isRow(end.team) ? end.team.id : "") || str(isRow(start.team) ? start.team.id : "") || str(sit.possession) || str(isRow(current.team) ? current.team.id : "");
  const homePoss = !!possId && possId === home.id;
  const awayPoss = !!possId && possId === away.id;
  const downNumber = num(end.down) ?? num(start.down) ?? num(sit.down);
  const distance = num(end.distance) ?? num(start.distance) ?? num(sit.distance);
  const legacy = num(sit.yardLine);
  let yard = 50;
  let first: number | null = null;
  if (yardsToEndzone != null && (homePoss || awayPoss)) {
    yard = ballOnField(yardsToEndzone, homePoss);
    first = downNumber != null && downNumber >= 1 && distance != null && distance > 0 ? (homePoss ? Math.max(0, yard - distance) : Math.min(100, yard + distance)) : null;
  } else if (legacy != null) {
    yard = clampYard(legacy);
    const gap = num(sit.distance);
    first = gap != null ? clampYard(legacy + gap) : null;
  }
  const place = downSpot(Object.keys(end).length ? end : start);
  const possAbbr = homePoss ? home.abbr : awayPoss ? away.abbr : str(sit.possessionText).split(" ")[0] || "";
  const down = place ? `${possAbbr ? `${possAbbr} ball · ` : ""}${place}` : [possAbbr, str(sit.shortDownDistanceText)].filter(Boolean).join(" ");
  const playsN = num(current.offensivePlays);
  const yardsN = num(current.yards);
  const elapsed = str(isRow(current.timeElapsed) ? current.timeElapsed.displayValue : current.timeElapsed);
  const drive = playsN != null && yardsN != null
    ? `${playsN} play${playsN === 1 ? "" : "s"}, ${yardsN} yds${elapsed ? ` · ${elapsed}` : ""}`
    : str(current.description) || str(current.shortDisplayResult) || str(sit.possessionText) || str(current.displayResult);
  if (yardsToEndzone == null && legacy == null && !down && !drive) return null;
  let driveStart: number | null = null;
  if ((homePoss || awayPoss) && str(isRow(current.team) ? current.team.id : "") === possId && isRow(current.start)) {
    const startYards = num(current.start.yardsToEndzone) ?? num(current.start.yardLine);
    if (startYards != null) driveStart = ballOnField(startYards, homePoss);
  }
  let prevYard: number | null = null;
  if (prevPlay && (homePoss || awayPoss)) {
    const prevEnd = isRow(prevPlay.end) ? prevPlay.end : {};
    const prevYards = num(prevEnd.yardsToEndzone);
    const prevTeam = str(isRow(prevEnd.team) ? prevEnd.team.id : "");
    if (prevYards != null && prevTeam === possId) prevYard = ballOnField(prevYards, homePoss);
  }
  const redZone = sit.isRedZone === true || (yardsToEndzone != null && yardsToEndzone > 0 && yardsToEndzone <= 20);
  return {
    yard,
    down,
    drive,
    redZone,
    first,
    possession: possAbbr,
    possessionColor: homePoss ? home.color : away.color,
    homePossession: homePoss,
    driveStart,
    prevYard,
    awayAbbr: away.abbr,
    homeAbbr: home.abbr,
    awayColor: paint(away.rawColor ?? "", away.color),
    homeColor: paint(home.rawColor ?? "", home.color),
    yardsToEndzone,
    motion: spotPlay ? footballMotion(spotPlay, { homeId: home.id, awayAbbr: away.abbr, homeAbbr: home.abbr }) ?? undefined : undefined,
  };
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
