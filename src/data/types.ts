export type Sport = "NHL" | "NBA" | "NFL" | "NCAA" | "NASCAR" | "MLB" | "WNBA";

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

export type Marker = { kind: "star" | "green" | "sog" | "assist"; label: string };

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
  source: "sample" | "edge-feed";
  hrEvent?: string;
  pinId?: number;
  /** Hard Rock betslip selection id (hr_sid). Not the event id. */
  hrSid?: string;
  hrLink?: string;
  /** DraftKings Predictions selection id (dk_sid) and the phone-tested event link. */
  dkSid?: string;
  dkLink?: string;
  gradeNote?: { text: string; tone: "W" | "L" | "V" };
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
};

export type SettledLeg = {
  name: string;
  stat: string;
  result: "W" | "L";
  grade: string;
  note: string;
  beatClose: boolean;
};

export type SettledTicket = {
  id: string;
  title: string;
  meta: string;
  result: "W" | "L";
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
};

export type LiveTicket = {
  name: string;
  legs: LegPace[];
  pace: LegPace;
  note: string;
};

export type LiveGame = {
  id: string;
  league: "NBA" | "NHL";
  away: string;
  home: string;
  awayName: string;
  homeName: string;
  awayScore: number;
  homeScore: number;
  clock: string;
  pre: boolean;
  final: boolean;
  awaySide: TeamSide;
  homeSide: TeamSide;
  legs: LiveLeg[];
};

export type SeriesPoint = { day: string; profit: number; winRate: number };

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

export type StandingLeague = { note: string; columns: string[]; groups: StandingGroup[] };

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
