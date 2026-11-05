import { emptyBoard, findPlay, type Board } from "./data/board.ts";
import { adaptDesk, fetchDesk } from "./data/desk.ts";
import { offlineBanner, readDeskCache, writeDeskCache } from "./data/deskCache.ts";
import { attachLive } from "./data/espn.ts";
import type { Play, StandingLeague } from "./data/types.ts";
import {
  draftKingsLegLink,
  draftKingsSlipLink,
  hardRockLegLink,
  hardRockSlipLink,
  type LinkPlay,
} from "./lib/links.ts";
import { shareCardIsPrivate } from "./lib/shareCard.ts";
import { canvasBlob, drawShareCard } from "./lib/shareImage.ts";
import { canOpen, toLinkPlay } from "./ui/bits.ts";
import { cardForShare, render, sportsFor } from "./ui/views.ts";
import { disablePush, readPushDelivery, subscribePush } from "./lib/pushClient.ts";
import { defaultState, knownView, loadPrefs, savePrefs, type AppState, type ViewId } from "./ui/state.ts";

const EMPTY_NCAAB: StandingLeague = { note: "No data yet", columns: [], groups: [] };

function boardFromRaw(raw: unknown, savedAt: string | null): Board {
  const next = adaptDesk(raw, EMPTY_NCAAB);
  next.cachedAt = savedAt;
  return next;
}

function boardFromCache(): Board {
  const cached = readDeskCache();
  if (!cached) return emptyBoard();
  try {
    return boardFromRaw(cached.raw, cached.savedAt);
  } catch {
    return emptyBoard();
  }
}

let board: Board = boardFromCache();
const state: AppState = defaultState();
loadPrefs(state);

let toastTimer = 0;

function pickedPlays(): Play[] {
  return [...state.selected].map((id) => findPlay(board, id)).filter((play): play is Play => !!play);
}

function bookFor(plays: Play[]): "hr" | "dk" {
  if (plays.length && plays.every((play) => canOpen(play, "hr") && !canOpen(play, "dk"))) return "hr";
  return state.book;
}

function selectable(): Play[] {
  const plays = pickedPlays();
  const book = bookFor(plays);
  return plays.filter((play) => canOpen(play, book));
}

function applyChrome() {
  document.documentElement.classList.toggle("lg", state.text === "lg");
  document.documentElement.classList.toggle("xl", state.text === "xl");
  document.documentElement.classList.toggle("day", state.theme === "day");
  document.body.classList.toggle("book-dk", state.book === "dk");
  document.body.classList.toggle("hassel", selectable().length > 0);
  const theme = document.querySelector('meta[name="theme-color"]');
  if (theme) theme.setAttribute("content", state.theme === "day" ? "#f3f5f8" : "#0d1117");
}

function paint(toTop: boolean) {
  const y = window.scrollY;
  applyChrome();
  const app = document.getElementById("app");
  if (!app) return;
  app.innerHTML = render(state, board);
  if (toTop) window.scrollTo(0, 0);
  else window.scrollTo(0, y);
}

function showToast(message: string) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.hidden = false;
  toast.textContent = message;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 9000);
}

function toLink(play: Play): LinkPlay {
  return toLinkPlay(play);
}

function openScope(scope: string, id: string, forced?: "hr" | "dk") {
  let plays: Play[] = [];
  if (scope === "leg") {
    const play = findPlay(board, id);
    if (play) plays = [play];
  } else if (scope === "ticket") {
    plays = board.tickets.find((ticket) => ticket.id === id)?.plays ?? [];
  } else {
    plays = pickedPlays();
  }
  const book = forced ?? (scope === "leg" || scope === "ticket" ? state.book : bookFor(plays));
  const ready = plays.filter((play) => canOpen(play, book));
  const left = plays.filter((play) => !canOpen(play, book));
  if (!ready.length) {
    showToast("Nothing to load. A play that is off this book, already started, or already graded stays on the card and is not added to a slip.");
    return;
  }
  const links = ready.map(toLink);
  const leg = links[0];
  if (!leg) return;
  const built =
    scope === "leg"
      ? book === "hr"
        ? hardRockLegLink(leg)
        : draftKingsLegLink(leg)
      : book === "hr"
        ? hardRockSlipLink(links)
        : draftKingsSlipLink(links);
  const extra = left.length ? ` Left off the slip: ${left.map((play) => play.name).join(", ")}.` : "";
  if (built.status === "ready") {
    window.open(built.url, "_blank", "noopener");
    showToast(`${built.detail ? `${built.detail} ` : ""}Opened ${ready.length} play${ready.length === 1 ? "" : "s"}.${extra}`);
    return;
  }
  if (built.status === "legs") {
    for (const legLink of built.urls) window.open(legLink.url, "_blank", "noopener");
    showToast(`${built.detail}${extra}`);
    return;
  }
  showToast(`${built.detail}${extra}`);
}

async function saveShare(send: boolean) {
  const card = cardForShare(state, board);
  if (!card || !shareCardIsPrivate(card)) {
    showToast("That image was not saved. A share card cannot include profit or units.");
    return;
  }
  const blob = await canvasBlob(drawShareCard(card));
  const ticketId = state.sheet?.kind === "share" ? state.sheet.ticketId : "ticket";
  const file = new File([blob], `parlaybot-${ticketId}.png`, { type: "image/png" });
  if (send && typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: card.title });
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  URL.revokeObjectURL(url);
  if (send) showToast("This browser did not open the share sheet. The ticket image was saved instead.");
}

function onClick(event: Event) {
  const target = event.target as HTMLElement;
  const sheet = target.closest(".sheet");
  const action = target.closest<HTMLElement>("[data-act]");
  if (!action) return;
  if (action.classList.contains("sheetback") && sheet) return;
  const act = action.dataset.act;
  if (act === "close") {
    state.sheet = null;
    paint(false);
    return;
  }
  if (act === "nav") {
    const requested = action.dataset.view === "stats" ? "results" : ((action.dataset.view as ViewId) || "today");
    state.view = requested;
    state.resultsPick = null;
    state.sheet = null;
    const hash = `#${state.view}`;
    if (location.hash !== hash) history.replaceState(null, "", hash);
    paint(true);
    return;
  }
  if (act === "book") {
    state.book = action.dataset.book === "dk" ? "dk" : "hr";
    for (const id of [...state.selected]) {
      const play = findPlay(board, id);
      if (!play || !canOpen(play, state.book)) state.selected.delete(id);
    }
    savePrefs(state);
    paint(false);
    return;
  }
  if (act === "product") {
    const key = action.dataset.key ?? null;
    state.product = state.product === key ? null : key;
    paint(false);
    return;
  }
  if (act === "sport") {
    const key = action.dataset.key || "All";
    const allowed = key === "All" || sportsFor(board, state.product).some((item) => item.sport === key);
    if (allowed) state.sport = key as AppState["sport"];
    paint(false);
    return;
  }
  if (act === "settings") {
    state.sheet = { kind: "settings" };
    paint(false);
    void refreshPushStatus();
    return;
  }
  if (act === "rules") {
    state.sheet = { kind: "rules", ticketId: action.dataset.id || "heist" };
    paint(false);
    return;
  }
  if (act === "share") {
    state.sheet = { kind: "share", ticketId: action.dataset.id || "", settled: action.dataset.settled === "1" };
    paint(false);
    return;
  }
  if (act === "theme") {
    state.theme = action.dataset.theme === "day" ? "day" : "night";
    savePrefs(state);
    paint(false);
    return;
  }
  if (act === "text") {
    const size = action.dataset.size;
    state.text = size === "lg" || size === "xl" ? size : "md";
    savePrefs(state);
    paint(false);
    return;
  }
  if (act === "push") {
    const kind = action.dataset.kind;
    if (kind !== "picks" && kind !== "locks") return;
    void togglePush(kind);
    return;
  }
  if (act === "alert") {
    const key = action.dataset.key as keyof AppState["alerts"];
    if (key in state.alerts) state.alerts[key] = !state.alerts[key];
    savePrefs(state);
    paint(false);
    return;
  }
  if (act === "range") {
    const key = action.dataset.key;
    if (key === "14d" || key === "30d" || key === "60d" || key === "90d" || key === "all") {
      state.profitRange = key;
      state.statsFrom = "";
      state.statsTo = "";
      state.statsAnchor = "";
      state.statsDraft = "";
    }
    savePrefs(state);
    paint(false);
    return;
  }
  if (act === "games-toggle") {
    state.gamesOpen = !state.gamesOpen;
    paint(false);
    return;
  }
  if (act === "games-sport") {
    const key = action.dataset.key;
    if (key === "All" || key === "NHL" || key === "NBA" || key === "NFL" || key === "NCAAF" || key === "NCAAB" || key === "MLB" || key === "NASCAR") state.gamesSport = key;
    state.gamesOpen = true;
    paint(false);
    return;
  }
  if (act === "cal-toggle") {
    state.statsCalOpen = !state.statsCalOpen;
    paint(false);
    return;
  }
  if (act === "cal-mode") {
    const mode = action.dataset.key;
    if (mode === "day" || mode === "week" || mode === "range") state.statsMode = mode;
    paint(false);
    return;
  }
  if (act === "cal-day") {
    const date = action.dataset.date || "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    if (state.statsMode === "week") {
      const [start, end] = weekOf(date);
      state.statsAnchor = start;
      state.statsDraft = end;
    } else if (state.statsMode === "day") {
      state.statsAnchor = date;
      state.statsDraft = date;
    } else if (!state.statsAnchor || state.statsDraft) {
      state.statsAnchor = date;
      state.statsDraft = "";
    } else {
      state.statsDraft = date;
    }
    paint(false);
    return;
  }
  if (act === "cal-apply") {
    const start = state.statsAnchor;
    const end = state.statsDraft || state.statsAnchor;
    if (start && end) {
      state.statsFrom = start < end ? start : end;
      state.statsTo = start < end ? end : start;
      savePrefs(state);
    }
    state.statsCalOpen = false;
    paint(false);
    return;
  }
  if (act === "cal-clear") {
    state.statsFrom = "";
    state.statsTo = "";
    state.statsAnchor = "";
    state.statsDraft = "";
    savePrefs(state);
    paint(false);
    return;
  }
  if (act === "stats-section") {
    const key = action.dataset.key;
    if (key === "all" || key === "heist" || key === "safe" || key === "edge" || key === "cappers" || key === "legday") state.statsSection = key;
    paint(false);
    return;
  }
  if (act === "stats-sport") {
    const key = action.dataset.key || "";
    state.statsSport = state.statsSport === key ? "" : key;
    paint(false);
    return;
  }
  if (act === "night-toggle") {
    state.nightOpen = !state.nightOpen;
    paint(false);
    return;
  }
  if (act === "results-prop") {
    const sport = action.dataset.sport || "";
    const prop = action.dataset.prop || "";
    if (!sport || !prop) return;
    state.resultsPick = { sport, prop, alt: action.dataset.alt === "1" };
    state.openResultDates = new Set();
    paint(true);
    return;
  }
  if (act === "result-date") {
    const key = action.dataset.key || "";
    if (!key) return;
    if (state.openResultDates.has(key)) state.openResultDates.delete(key);
    else state.openResultDates.add(key);
    paint(false);
    return;
  }
  if (act === "ticket-legs") {
    const key = action.dataset.key || "";
    if (!key) return;
    if (state.openTickets.has(key)) state.openTickets.delete(key);
    else state.openTickets.add(key);
    paint(false);
    return;
  }
  if (act === "results-back") {
    state.resultsPick = null;
    paint(false);
    return;
  }
  if (act === "standings") {
    state.standingsFrom = action.dataset.from === "results" || action.dataset.from === "stats" ? "results" : "live";
    state.view = "standings";
    history.replaceState(null, "", "#standings");
    paint(true);
    return;
  }
  if (act === "league") {
    const key = action.dataset.key;
    if (key === "NBA" || key === "NHL" || key === "NFL" || key === "MLB" || key === "NCAAF" || key === "NCAAB") state.league = key;
    paint(false);
    return;
  }
  if (act === "panel") {
    const game = action.dataset.game;
    const panel = action.dataset.panel;
    if (game && (panel === "feed" || panel === "box" || panel === "vs")) {
      state.gamePanel[game] = panel;
      state.openGames.add(game);
      paint(false);
    }
    return;
  }
  if (act === "feed") {
    const game = action.dataset.game;
    if (!game) return;
    const current = state.feedFilter[game] ?? { team: "All", period: "All" };
    state.feedFilter[game] = {
      team: action.dataset.team ?? current.team,
      period: action.dataset.period ?? current.period,
    };
    state.openGames.add(game);
    paint(false);
    return;
  }
  if (act === "toggle-date") {
    const date = action.dataset.date;
    if (!date) return;
    if (state.openDates.has(date)) state.openDates.delete(date);
    else state.openDates.add(date);
    paint(false);
    return;
  }
  if (act === "open") {
    const forced = action.dataset.book === "hr" || action.dataset.book === "dk" ? action.dataset.book : undefined;
    openScope(action.dataset.scope || "leg", action.dataset.id || "", forced);
    return;
  }
  if (act === "save-share" || act === "send-share") {
    void saveShare(act === "send-share");
  }
}

function onChange(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.matches?.("select[data-act='conference']")) {
    state.conference = input.value;
    paint(false);
    return;
  }
  if (!input.matches?.(".chk input")) return;
  const id = input.dataset.id;
  if (!id) return;
  if (input.checked) state.selected.add(id);
  else state.selected.delete(id);
  applyChrome();
  const bar = document.getElementById("sel");
  const plays = selectable();
  if (!bar) return;
  if (!plays.length) {
    bar.hidden = true;
    bar.innerHTML = "";
    return;
  }
  bar.hidden = false;
  const book = bookFor(plays);
  const label = book === "hr" ? `Load ${plays.length} in Hard Rock` : `Open ${plays.length} selected in DraftKings`;
  bar.innerHTML = `<button type="button" class="btn ${book}" data-act="open" data-scope="selected">${label}</button>`;
}

async function refreshPushStatus() {
  state.pushDelivery = await readPushDelivery(state.pushWant, state.pushAck);
  if (state.sheet?.kind === "settings") paint(false);
}

async function togglePush(kind: "picks" | "locks") {
  const next = { ...state.pushWant, [kind]: !(state.pushDelivery === "on" && state.pushWant[kind]) };
  if (!next.picks && !next.locks) {
    const result = await disablePush();
    state.pushWant = next;
    state.pushAck = result.ack;
    state.pushDelivery = result.delivery;
    savePrefs(state);
    paint(false);
    return;
  }
  const result = await subscribePush(next);
  state.pushWant = result.delivery === "on" ? next : state.pushWant;
  state.pushAck = result.ack;
  state.pushDelivery = result.delivery;
  savePrefs(state);
  paint(false);
}

function weekOf(iso: string): [string, string] {
  const [year, month, date] = iso.split("-").map(Number);
  const when = new Date(Date.UTC(year, month - 1, date));
  const start = new Date(when);
  start.setUTCDate(when.getUTCDate() - when.getUTCDay());
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
}

export function start() {
  const app = document.getElementById("app");
  app?.addEventListener("click", onClick);
  app?.addEventListener("change", onChange);
  document.addEventListener(
    "toggle",
    (event) => {
      const details = event.target as HTMLDetailsElement;
      const id = details.dataset?.game;
      if (!id) return;
      if (details.open) state.openGames.add(id);
      else state.openGames.delete(id);
    },
    true,
  );
  document.getElementById("toast")?.addEventListener("click", () => {
    const toast = document.getElementById("toast");
    if (toast) toast.hidden = true;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.sheet) {
      state.sheet = null;
      paint(false);
    }
  });
  window.addEventListener("hashchange", () => {
    if (location.hash === "#stats") {
      history.replaceState(null, "", "#results");
      if (state.view !== "results") {
        state.view = "results";
        state.sheet = null;
        paint(true);
      }
      return;
    }
    const next = knownView(location.hash);
    if (!next || next === state.view) return;
    state.view = next;
    state.resultsPick = null;
    state.sheet = null;
    paint(true);
  });
  if (location.hash === "#stats") history.replaceState(null, "", "#results");
  paint(false);
  void refreshDesk();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void refreshDesk();
  });
  window.addEventListener("focus", () => void refreshDesk());
  window.setInterval(() => void refreshDesk(), 3 * 60 * 1000);
}

let refreshing = false;

async function refreshDesk() {
  if (refreshing) return;
  refreshing = true;
  try {
    const raw = await fetchDesk();
    const savedAt = new Date().toISOString();
    writeDeskCache(raw, savedAt);
    const next = boardFromRaw(raw, savedAt);
    try {
      await attachLive(next);
    } catch {
      next.liveNote = "ESPN scoreboard did not load. Scores stay blank until it does.";
    }
    board = next;
    for (const id of [...state.selected]) {
      if (!findPlay(board, id)) state.selected.delete(id);
    }
    paint(false);
  } catch {
    const cached = board.feedMode === "live" ? null : readDeskCache();
    if (board.feedMode === "live") {
      board = { ...board, banner: offlineBanner(board.cachedAt) };
    } else if (cached) {
      try {
        const next = boardFromRaw(cached.raw, cached.savedAt);
        next.banner = offlineBanner(cached.savedAt);
        try {
          await attachLive(next);
        } catch {
          next.liveNote = "ESPN scoreboard did not load. Scores stay blank until it does.";
        }
        board = next;
      } catch {
        const next = emptyBoard();
        next.banner = offlineBanner(null);
        board = next;
      }
    } else {
      const next = emptyBoard();
      next.banner = offlineBanner(null);
      board = next;
    }
    paint(false);
  } finally {
    refreshing = false;
  }
}
