import type { GameCast } from "./gamecast.ts";

export type Sport = "NHL" | "NBA" | "NFL" | "NCAAF" | "NCAAB" | "NASCAR" | "MLB" | "WNBA" | "Tennis" | "Other";

export type BookId = "hr" | "dk";

export type PlayerStatusLabel =
  | "Out"
  | "Questionable"
  | "GTD"
  | "Minutes limit"
  | "Not starting"
  | "Active"
  | "Confirmed";

export type PlayerStatus = {
  label: PlayerStatusLabel;
  reportedAt?: string;
  tone: "bad" | "warn" | "quiet";
};

export type WhyBlock = {
  /** Capper rows say "Our read". It is our take, not the capper's writeup. */
  ours: boolean;
  line: string;
  why: string[];
  whyNot: string[];
};

export type Marker = {
  kind?: "star" | "green" | "sog" | "assist";
  label: string;
  icon?: string;
  tone?: "good" | "warn" | "neutral";
};

export type TeamSide = { abbr: string; record: string; standing: string };

export type Play = {
  id: string;
  name: string;
  detail: string;
  sport: Sport;
  /** American odds on that book, or null when the book does not offer the play. */
  hr: string | null;
  dk: string | null;
  alt?: { before: string; after: string };
  markers?: Marker[];
  lock?: string;
  lateInjury?: boolean;
  goalieConfirmed?: boolean;
  blocked?: "started" | "graded";
  status?: PlayerStatus;
  matchup?: { away: TeamSide; home: TeamSide; rankChip?: string };
  why: WhyBlock;
  source: "sample" | "edge-feed" | "desk";
  /** Desk game string, used only to match an ESPN scoreboard row. */
  gameText?: string;
  hrEvent?: string;
  pinId?: number;
  /** Hard Rock betslip selection id (hr_sid). Not the event id. */
  hrSid?: string;
  hrLink?: string;
  /** DraftKings Predictions selection id (dk_sid) and the phone-tested event link. */
  dkSid?: string;
  dkLink?: string;
  /** Feed hr_why when the stored Hard Rock selection could not be verified. Not a book-absence flag. */
  hrUnverified?: string;
  gradeNote?: { text: string; tone: "W" | "L" | "V" };
  /** Posted capper line when it differs from the live book line. Display only. */
  posted?: string;
  /** In-play Hard Rock note. Does not replace the posted odds. */
  liveNote?: string;
  /** False hides the Why chip when the file has no note. */
  showWhy?: boolean;
  /** HR / DK availability, display only. */
  books?: { hr: boolean; dk: boolean };
  /** Replaces the Hard Rock button. The leg stays on the card. */
  hrHold?: string;
  /** Replaces the DraftKings button. */
  dkHold?: string;
  /** False keeps this leg off the one-tap Hard Rock ticket. */
  slip?: boolean;
  /** Alt line tag. Separate from the before → after text. */
  altTag?: boolean;
  /** DraftKings before → after. Hard Rock uses `alt`. */
  altDk?: { before: string; after: string };
  /** Flagged alt row. No Alt line tag. */
  flagNote?: string;
  /** DraftKings line title when it differs from the Hard Rock title. */
  dkName?: string;
  /** PENDING, LIVE, or FINAL from the file. */
  legState?: string;
  /** Where this play was posted, such as Heist, Edge, or a capper handle. */
  tags?: string[];
  /** Voided by a pre-game rule change. It is not a live miss. */
  voidedPreGame?: boolean;
  lockWhy?: string;
  hrState?: string;
  hrAbsent?: boolean;
  dkAbsent?: boolean;
  /** Edge singles stay one play. No multi-select checkbox. */
  edgeSingle?: boolean;
};

export type Ticket = {
  id: string;
  productKey: string;
  title: string;
  meta: string;
  badge?: "official" | "fun" | "fixture" | "cappers";
  plays: Play[];
  share: boolean;
  /** Ticket price such as +190. Never a profit figure. */
  ticketOdds?: string;
  rules: string[];
  group: "main" | "official" | "edge" | "fun" | "props" | "cappers";
  /** Section time already on the source object, such as Built or Final. */
  stamp?: string;
  /**
   * Prepared POTD or +100 source. "ALL" is the all-sports ticket or ALL board.
   * A sport id is only that sport's board. Unset tickets still filter by each play's sport.
   */
  board?: string;
  /** Render every leg in file order, including ones this book cannot open. */
  showAll?: boolean;
  /** Leg count before a sport chip filters the card. */
  playCount?: number;
  /** One-tap Hard Rock label. Uses the full ticket, not the sport subset. */
  slipLabel?: string;
  /** Why some legs are off the one-tap slip. */
  slipNote?: string;
  /** DraftKings has no whole-ticket link. */
  dkSlipNote?: string;
  /** Verified Hard Rock deep link for the whole ticket. */
  hrSlip?: string;
  warnings?: string[];
  skips?: { capper: string; pick: string; reason: string }[];
  excluded?: { capper: string; pick: string; reason: string }[];
};

/** One recorded leg of a historical ticket. Empty strings mean that field was not in the file. */
export type TicketPart = {
  name: string;
  market: string;
  result: string;
  score: string;
  game: string;
};

export type SettledLeg = {
  name: string;
  stat: string;
  result: "W" | "L" | "V" | "P";
  grade: string;
  note: string;
  /** Null when the feed has no closing-line note. */
  beatClose: boolean | null;
  /** Closing-line percent when a CLV play matches this graded pick. */
  clvPct?: number;
  /** Graded date, so a ticket can be matched to that night's legs only. */
  date?: string;
  /** True when this row is a parlay or ticket, not a single play. */
  ticket?: boolean;
  /** Recorded constituent legs. Empty when this is a ticket and the file has none. */
  parts?: TicketPart[];
};

export type SettledTicket = {
  id: string;
  title: string;
  meta: string;
  result: "W" | "L" | "V";
  ticketOdds?: string;
  legs: SettledLeg[];
  mood: "cash" | "hook";
};

export type LegPace = "hit" | "on" | "behind" | "cold" | "dead" | "pre";
export type Mood = "ice" | "sweat" | "fire" | "cash" | "hook";

export type LiveLeg = {
  name: string;
  current: number;
  line: number;
  unit: string;
  pace: LegPace;
  source: string;
  why: WhyBlock;
  /** Replaces the current/line figure for a moneyline or spread. */
  label?: string;
  /** Canonical identity so the same bet from two products is one live leg. */
  key?: string;
  /** Every product that posted this same line. */
  tags?: string[];
};

export type LiveTicket = {
  name: string;
  legs: LegPace[];
  pace: LegPace;
  note: string;
};

export type LiveGame = {
  id: string;
  league: "NBA" | "NHL" | "NFL" | "MLB" | "NCAAF" | "NCAAB" | "WNBA";
  away: string;
  home: string;
  awayName: string;
  homeName: string;
  awayScore: number;
  homeScore: number;
  clock: string;
  /** ESPN scheduled start, ISO. Used only to order Today's Games. */
  start?: string;
  pre: boolean;
  final: boolean;
  awaySide: TeamSide;
  homeSide: TeamSide;
  legs: LiveLeg[];
  liveFeed?: LiveFeed;
  /** Ball side while the game is in progress. */
  possessionSide?: "away" | "home" | null;
  /** Timeouts left, 0–3, on a live NFL or NCAAF game. */
  awayTimeouts?: number | null;
  homeTimeouts?: number | null;
};

export type TeamStat = {
  name: string;
  away: string;
  home: string;
  awayRank?: string;
  homeRank?: string;
  awayOf?: string;
  homeOf?: string;
  awayTone?: string;
  homeTone?: string;
};

export type LiveFeed = {
  pbp: { team: string; event: string; when: string; score: string; desc: string; period: string }[];
  box: { headers: string[]; rows: { cells: string[]; mine: boolean; header?: string }[] };
  teamStats: TeamStat[];
  real: boolean;
  /** Desk `teamvs.built`, only when this panel is showing that table. */
  built?: string;
  /** Parsed ESPN gamecast. Empty when the summary has no header. */
  cast?: GameCast;
};

export type SeriesPoint = { day: string; profit: number; winRate: number | null; iso?: string };

export type GradeMark = {
  date: string;
  cat: string;
  /** Every product this one play was posted in. All sections counts the play once. */
  cats?: string[];
  win: boolean;
  units: number;
  sport: string;
  prop: string;
  side: "over" | "under" | "alt" | "other";
  /** Set when the desk row named a capper, so the prop row can credit them. */
  capper?: string;
  /** Set when this play was relabeled onto a real prop type, or landed in Misc. */
  detail?: string;
  /** The desk pick text, for the Results list. It does not change the record. */
  play?: string;
  /** True when this graded row is a parlay or ticket. It is not an extra result. */
  ticket?: boolean;
  /** Recorded constituent legs. Empty when this is a ticket and the file has none. */
  parts?: TicketPart[];
  /** Posted American odds, only when the result row has them. */
  odds?: string;
  /** Desk stat text. A masked leg list is not a per-leg grade. */
  stat?: string;
  /** False when the row has no units field. */
  unitsKnown?: boolean;
};

export type CapperGroup = "heist" | "an";

export type Capper = {
  id: string;
  name: string;
  group: CapperGroup;
  record: string;
  plays: Play[];
  note?: string;
};

export type StandingRow = {
  rank: number;
  abbr: string;
  label: string;
  cells: string[];
  starred: boolean;
};

export type StandingGroup = { name: string; columns: string[]; rows: StandingRow[] };

export type StandingGame = { away: string; home: string; when: string };

export type StandingLeague = { note: string; columns: string[]; groups: StandingGroup[]; games?: StandingGame[] };

export type StandingsFile = {
  source: string;
  leagues: Record<string, StandingLeague>;
};

export type RecapRow = { name: string; text: string; win: boolean };

export type Recap = {
  when: string;
  units: string;
  summary: string;
  rows: RecapRow[];
};
