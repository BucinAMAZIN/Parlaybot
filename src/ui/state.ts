import type { BookId } from "../data/types.ts";
import type { LeagueId } from "../data/standings.ts";

export type ViewId = "today" | "live" | "results" | "stats" | "cappers" | "standings";
export type TextSize = "md" | "lg" | "xl";
export type Panel = "feed" | "box" | "vs";
export type SportFilter = "All" | "NHL" | "NBA" | "NFL" | "NCAAF" | "NCAAB" | "MLB" | "WNBA" | "NASCAR" | "Tennis" | "Other";

export type Alerts = { locks: boolean; finals: boolean; redzone: boolean; price: boolean };
export type PushDelivery = "unknown" | "on" | "off" | "unsupported" | "standalone" | "denied" | "unavailable";

export type Sheet =
  | null
  | { kind: "settings" }
  | { kind: "rules"; ticketId: string }
  | { kind: "share"; ticketId: string; settled: boolean };

export type AppState = {
  view: ViewId;
  book: BookId;
  sport: SportFilter;
  product: string | null;
  selected: Set<string>;
  text: TextSize;
  theme: "night" | "day";
  alerts: Alerts;
  pushWant: { picks: boolean; locks: boolean };
  pushAck: boolean;
  pushDelivery: PushDelivery;
  sheet: Sheet;
  league: LeagueId;
  standingsFrom: ViewId;
  gamePanel: Record<string, Panel>;
  openGames: Set<string>;
  /** Today's Games list. Starts closed on every load and is not saved. */
  gamesOpen: boolean;
  /** Sport chip inside Today's Games. Separate from the plays filter. Not saved. */
  gamesSport: "All" | "NHL" | "NBA" | "NFL" | "NCAAF" | "NCAAB" | "MLB" | "NASCAR";
  feedFilter: Record<string, { team: string; period: string }>;
  profitRange: "14d" | "30d" | "60d" | "90d" | "all";
  openDates: Set<string>;
  /** NCAAB group name. Empty uses the first group, which is the AP Top 25. */
  conference: string;
  /** Custom stats dates. Empty means the 14D/30D/60D/90D/All chip is in charge. */
  statsFrom: string;
  statsTo: string;
  statsCalOpen: boolean;
  statsMode: "day" | "week" | "range";
  statsSection: "all" | "heist" | "safe" | "edge" | "cappers" | "legday";
  statsSport: string;
  statsAnchor: string;
  statsDraft: string;
  /** Last night disclosure. Starts closed and is not saved. */
  nightOpen: boolean;
  /** Open prop list. Null on the Results overview. Not saved. */
  resultsPick: { sport: string; prop: string; alt: boolean } | null;
};

/** A known tab name, with the retired Stats tab sent to Results. Empty and unknown hashes are null. */
export function knownView(hash: string): ViewId | null {
  const name = hash.replace(/^#/, "");
  if (name === "stats") return "results";
  if (name === "today" || name === "live" || name === "results" || name === "cappers" || name === "standings") return name;
  return null;
}

/** #stats from the old tab lands on the combined Results tab. An empty hash opens Today. */
export function viewFromHash(hash: string): ViewId {
  return knownView(hash) ?? "today";
}

const PREF_KEY = "parlaybot-v1";

export function defaultState(): AppState {
  const view = viewFromHash(location.hash);
  return {
    view,
    book: "hr",
    sport: "All",
    product: null,
    selected: new Set(),
    text: "md",
    theme: "night",
    alerts: { locks: true, finals: true, redzone: false, price: false },
    pushWant: { picks: false, locks: false },
    pushAck: false,
    pushDelivery: "unknown",
    sheet: null,
    league: "NBA",
    standingsFrom: "live",
    gamePanel: {},
    openGames: new Set(),
    gamesOpen: false,
    gamesSport: "All",
    feedFilter: {},
    profitRange: "14d",
    openDates: new Set(),
    conference: "",
    statsFrom: "",
    statsTo: "",
    statsCalOpen: false,
    statsMode: "range",
    statsSection: "all",
    statsSport: "",
    statsAnchor: "",
    statsDraft: "",
    nightOpen: false,
    resultsPick: null,
  };
}

export function loadPrefs(state: AppState) {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as Partial<AppState>;
    if (saved.book === "hr" || saved.book === "dk") state.book = saved.book;
    if (saved.text === "md" || saved.text === "lg" || saved.text === "xl") state.text = saved.text;
    if (saved.theme === "night" || saved.theme === "day") state.theme = saved.theme;
    if (saved.alerts) state.alerts = { ...state.alerts, ...saved.alerts };
    if (saved.pushWant && typeof saved.pushWant.picks === "boolean" && typeof saved.pushWant.locks === "boolean") state.pushWant = saved.pushWant;
    if (saved.pushAck === true) state.pushAck = true;
    if (saved.profitRange === "14d" || saved.profitRange === "30d" || saved.profitRange === "60d" || saved.profitRange === "90d" || saved.profitRange === "all") {
      state.profitRange = saved.profitRange;
    }
    if (typeof saved.statsFrom === "string" && typeof saved.statsTo === "string" && /^\d{4}-\d{2}-\d{2}$/.test(saved.statsFrom) && /^\d{4}-\d{2}-\d{2}$/.test(saved.statsTo)) {
      state.statsFrom = saved.statsFrom;
      state.statsTo = saved.statsTo;
    }
  } catch {
    /* ignore a bad local save */
  }
}

export function savePrefs(state: AppState) {
  localStorage.setItem(
    PREF_KEY,
    JSON.stringify({ book: state.book, text: state.text, theme: state.theme, alerts: state.alerts, pushWant: state.pushWant, pushAck: state.pushAck, profitRange: state.profitRange, statsFrom: state.statsFrom, statsTo: state.statsTo }),
  );
}
