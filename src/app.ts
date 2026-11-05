import { loadBoard, findPlay, type Board } from "./data/board.ts";
import { adaptDesk, fetchDesk } from "./data/desk.ts";
import { attachLive } from "./data/espn.ts";
import { standings as fallbackStandings } from "./data/standings.ts";
import type { Play } from "./data/types.ts";
import { edgeDates } from "./data/presentEdgeFeed.ts";
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
import { cardForShare, render } from "./ui/views.ts";
import { defaultState, loadPrefs, savePrefs, type AppState, type ViewId } from "./ui/state.ts";

let board: Board = loadBoard();
const state: AppState = defaultState();
loadPrefs(state);
const latest = edgeDates(board.edgePicks)[0];
if (latest) state.openDates.add(latest);

let toastTimer = 0;

function selectable(): Play[] {
  return [...state.selected]
    .map((id) => findPlay(board, id))
    .filter((play): play is Play => !!play && canOpen(play, state.book));
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

function openScope(scope: string, id: string) {
  let plays: Play[] = [];
  if (scope === "leg") {
    const play = findPlay(board, id);
    if (play) plays = [play];
  } else if (scope === "ticket") {
    plays = board.tickets.find((ticket) => ticket.id === id)?.plays ?? [];
  } else {
    plays = [...state.selected].map((playId) => findPlay(board, playId)).filter((play): play is Play => !!play);
  }
  const ready = plays.filter((play) => canOpen(play, state.book));
  const left = plays.filter((play) => !canOpen(play, state.book));
  if (!ready.length) {
    showToast("Nothing to load. A play that is off this book, already started, or already graded stays on the card and is not added to a slip.");
    return;
  }
  const links = ready.map(toLink);
  const leg = links[0];
  if (!leg) return;
  const built =
    scope === "leg"
      ? state.book === "hr"
        ? hardRockLegLink(leg)
        : draftKingsLegLink(leg)
      : state.book === "hr"
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
    state.view = (action.dataset.view as ViewId) || "today";
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
    state.sport = (action.dataset.key as AppState["sport"]) || "All";
    paint(false);
    return;
  }
  if (act === "settings") {
    state.sheet = { kind: "settings" };
    paint(false);
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
  if (act === "alert") {
    const key = action.dataset.key as keyof AppState["alerts"];
    if (key in state.alerts) state.alerts[key] = !state.alerts[key];
    savePrefs(state);
    paint(false);
    return;
  }
  if (act === "range") {
    const key = action.dataset.key;
    state.profitRange = key === "7d" || key === "season" ? key : "30d";
    paint(false);
    return;
  }
  if (act === "standings") {
    state.standingsFrom = action.dataset.from === "stats" ? "stats" : "live";
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
    const current = state.feedFilter[game] ?? { team: "All", period: game === "atl-nyk" ? "Q3" : "All" };
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
    openScope(action.dataset.scope || "leg", action.dataset.id || "");
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
  const label = state.book === "hr" ? `Load ${plays.length} in Hard Rock` : `Open ${plays.length} selected in DraftKings`;
  bar.innerHTML = `<button type="button" class="btn ${state.book}" data-act="open" data-scope="selected">${label}</button>`;
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
    const hash = location.hash.replace("#", "");
    const views: ViewId[] = ["today", "live", "results", "stats", "cappers", "standings"];
    if (!views.includes(hash as ViewId) || hash === state.view) return;
    state.view = hash as ViewId;
    state.sheet = null;
    paint(true);
  });
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
    const next = adaptDesk(raw, fallbackStandings.leagues.NCAAB);
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
    if (board.feedMode !== "live") {
      board = loadBoard();
      paint(false);
    }
  } finally {
    refreshing = false;
  }
}
