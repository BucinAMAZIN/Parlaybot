import type { BookId } from "../data/types.ts";
import type { LeagueId } from "../data/standings.ts";

export type ViewId = "today" | "live" | "results" | "stats" | "cappers" | "standings";
export type TextSize = "md" | "lg" | "xl";
export type Panel = "feed" | "box" | "vs";
export type SportFilter = "All" | "NHL" | "NBA" | "NFL" | "NCAAF" | "NCAAB" | "MLB" | "WNBA" | "NASCAR" | "Tennis" | "Other";

export type Alerts = { locks: boolean; finals: boolean; redzone: boolean; price: boolean };

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
  sheet: Sheet;
  league: LeagueId;
  standingsFrom: ViewId;
  gamePanel: Record<string, Panel>;
  openGames: Set<string>;
  feedFilter: Record<string, { team: string; period: string }>;
  profitRange: "14d" | "30d" | "60d" | "90d" | "all";
  openDates: Set<string>;
  /** NCAAB group name. Empty uses the first group, which is the AP Top 25. */
  conference: string;
};

const PREF_KEY = "parlaybot-v1";

export function defaultState(): AppState {
  const hash = location.hash.replace("#", "") as ViewId;
  const view: ViewId = ["today", "live", "results", "stats", "cappers", "standings"].includes(hash) ? hash : "today";
  return {
    view,
    book: "hr",
    sport: "All",
    product: null,
    selected: new Set(["heist-trae", "edge-makar"]),
    text: "md",
    theme: "night",
    alerts: { locks: true, finals: true, redzone: false, price: false },
    sheet: null,
    league: "NBA",
    standingsFrom: "live",
    gamePanel: {},
    openGames: new Set(),
    feedFilter: {},
    profitRange: "14d",
    openDates: new Set(),
    conference: "",
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
    if (saved.profitRange === "14d" || saved.profitRange === "30d" || saved.profitRange === "60d" || saved.profitRange === "90d" || saved.profitRange === "all") {
      state.profitRange = saved.profitRange;
    }
  } catch {
    /* ignore a bad local save */
  }
}

export function savePrefs(state: AppState) {
  localStorage.setItem(
    PREF_KEY,
    JSON.stringify({ book: state.book, text: state.text, theme: state.theme, alerts: state.alerts, profitRange: state.profitRange }),
  );
}
