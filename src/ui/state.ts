import type { BookId } from "../data/types.ts";
import type { LeagueId } from "../data/standings.ts";

export type ViewId = "today" | "live" | "results" | "stats" | "cappers" | "standings";
export type TextSize = "md" | "lg" | "xl";
export type Panel = "feed" | "box" | "vs";
export type SportFilter = "All" | "Big 4" | "NHL" | "NBA" | "NFL" | "NCAAF" | "NCAAB" | "MLB" | "WNBA" | "NASCAR" | "Tennis" | "Other";

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
  /** Open Today prop drawers, keyed by ticket id and play id. Not saved. */
  openPlayTracks: Set<string>;
  /** Feed / Box / Team VS inside one Today play. Separate from the Live tab. */
  playPanel: Record<string, Panel>;
  /** Team filter inside one Today play's feed. */
  castTeam: Record<string, string>;
  /** Period filter inside one Today play's feed. */
  castPeriod: Record<string, string>;
  /** Games whose play-by-play is expanded past the latest 10. Not saved. */
  feedFull: Set<string>;
  /** In-progress games the phone closed on Live. Not saved, so a fresh visit opens the first one. */
  liveDismissed: Set<string>;
  profitRange: "14d" | "30d" | "60d" | "90d" | "all";
  openDates: Set<string>;
  /** NCAAB group name. Empty uses the first group, which is the AP Top 25. */
  conference: string;
  /** Custom stats dates. Empty means the 14D/30D/60D/90D/All chip is in charge. */
  statsFrom: string;
  statsTo: string;
  statsCalOpen: boolean;
  statsMode: "day" | "week" | "range";
  statsSection: "all" | "heist" | "safe" | "plus100" | "plus250" | "edge" | "cappers" | "legday";
  statsSport: string;
  statsAnchor: string;
  statsDraft: string;
  /** Yesterday’s Results disclosure. Starts closed and is not saved. */
  nightOpen: boolean;
  /** Open prop drawers inside By sport. Not saved. */
  openProps: Set<string>;
  /** Section chip inside one open prop drawer. Missing means All sections. Not saved. */
  propSection: Record<string, AppState["statsSection"]>;
  /** Prop-history dates the phone has opened. Starts empty and is not saved. */
  openResultDates: Set<string>;
  /** Ticket rows opened for their recorded legs. Starts empty and is not saved. */
  openTickets: Set<string>;
  /** Null follows the 10:00 AM ET rule. False peeks at today's slate before then. */
  liveNight: boolean | null;
  /** Football snap being previewed, keyed by game id or Today tracker key. */
  snapPreview: Record<string, string>;
  /** Bumped to replay a snap. Background polls leave it alone. */
  snapGen: Record<string, number>;
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
    openPlayTracks: new Set(),
    playPanel: {},
    castTeam: {},
    castPeriod: {},
    feedFull: new Set(),
    liveDismissed: new Set(),
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
    openProps: new Set(),
    propSection: {},
    openResultDates: new Set(),
    openTickets: new Set(),
    liveNight: null,
    snapPreview: {},
    snapGen: {},
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
