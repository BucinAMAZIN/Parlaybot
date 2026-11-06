import { emptyBoard, findPlay, type Board } from "./data/board.ts";
import { adaptDesk, fetchDesk, readSlateCache, rememberSlate, replayYesterday, writeSlateCache, type SlateSnap } from "./data/desk.ts";
import { offlineBanner, readDeskCache, writeDeskCache } from "./data/deskCache.ts";
import { attachLive, liveWindowET } from "./data/espn.ts";
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
import { canOpen, linkMismatch, toLinkPlay } from "./ui/bits.ts";
import { propOpenKey } from "./ui/statsScreen.ts";
import { cardForShare, liveSlice, render, sportsFor } from "./ui/views.ts";
import { disablePush, readPushDelivery, resyncPush, subscribePush } from "./lib/pushClient.ts";
import { defaultState, knownView, loadPrefs, savePrefs, type AppState, type ViewId } from "./ui/state.ts";
import { buildNumber, newerBuild } from "./lib/buildWatch.ts";

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

function revealLive() {
  if (state.view !== "live") return;
  const game = liveSlice(state, board).liveGames.find((item) => !item.pre && !item.final);
  if (!game || state.liveDismissed.has(game.id) || state.openGames.has(game.id)) return;
  state.openGames.add(game.id);
  state.gamePanel[game.id] = "feed";
}

function paint(toTop: boolean) {
  revealLive();
  const y = window.scrollY;
  const kept = [...document.querySelectorAll("details[open][data-keep]")].map((node) => (node as HTMLElement).dataset.keep).filter((key): key is string => !!key);
  applyChrome();
  const app = document.getElementById("app");
  if (!app) return;
  app.innerHTML = render(state, board);
  for (const key of kept) {
    const node = app.querySelector(`details[data-keep="${CSS.escape(key)}"]`);
    if (node instanceof HTMLDetailsElement) node.open = true;
  }
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
    plays = (board.tickets.find((ticket) => ticket.id === id)?.plays ?? []).filter((play) => play.slip !== false);
  } else {
    plays = pickedPlays();
  }
  const book = forced ?? (scope === "leg" || scope === "ticket" ? state.book : bookFor(plays));
  const ticket = scope === "ticket" ? board.tickets.find((item) => item.id === id) : undefined;
  if (scope === "ticket" && book === "dk" && ticket?.dkSlipNote) {
    showToast(ticket.dkSlipNote);
    return;
  }
  const ready = plays.filter((play) => canOpen(play, book) && play.slip !== false);
  const left = plays.filter((play) => !canOpen(play, book));
  if (!ready.length) {
    const mismatched = book === "hr" ? plays.filter((play) => linkMismatch(play, "hr") || play.hrUnverified) : [];
    showToast(mismatched.length
      ? "Hard Rock link unavailable. The stored selection opens a different game or prop, so it is not launched."
      : "Nothing to load. A play that is off this book, already started, or already graded stays on the card and is not added to a slip.");
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
    const allowed = key === "All" || key === "Big 4" || sportsFor(board, state.product).some((item) => item.sport === key);
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
    if (kind !== "all" && kind !== "picks" && kind !== "locks") return;
    void togglePush(kind === "locks" ? "locks" : kind === "picks" ? "picks" : "all");
    return;
  }
  if (act === "push-test") {
    void resyncPush().then((ok) => showToast(ok ? "Test sent. A confirmation alert arrives in about a minute." : "Turn phone alerts on before sending a test."));
    return;
  }
  if (act === "live-slate") {
    state.liveNight = action.dataset.slate !== "today";
    paint(false);
    return;
  }
  if (act === "snap-preview" || act === "snap-replay" || act === "snap-live") {
    const key = action.dataset.track || action.dataset.game || "";
    if (!key) return;
    if (act === "snap-preview") state.snapPreview[key] = action.dataset.play || "";
    if (act === "snap-live") delete state.snapPreview[key];
    state.snapGen[key] = (state.snapGen[key] ?? 0) + 1;
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
    const key = propOpenKey(sport, prop, action.dataset.alt === "1");
    if (state.openProps.has(key)) state.openProps.delete(key);
    else state.openProps.add(key);
    paint(false);
    return;
  }
  if (act === "prop-section") {
    const propKey = action.dataset.prop || "";
    const key = action.dataset.key;
    if (!propKey) return;
    if (key === "all" || key === "heist" || key === "safe" || key === "edge" || key === "cappers" || key === "legday") {
      state.propSection[propKey] = key;
      paint(false);
    }
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
  if (act === "feed-full") {
    const game = action.dataset.game;
    if (!game) return;
    if (state.feedFull.has(game)) state.feedFull.delete(game);
    else state.feedFull.add(game);
    state.openGames.add(game);
    paint(false);
    return;
  }
  if (act === "play-panel") {
    const track = action.dataset.track;
    const panel = action.dataset.panel;
    if (track && (panel === "feed" || panel === "box" || panel === "vs")) {
      state.playPanel[track] = panel;
      state.openPlayTracks.add(track);
      paint(false);
    }
    return;
  }
  if (act === "play-feed") {
    const track = action.dataset.track;
    if (!track) return;
    state.castTeam[track] = action.dataset.team ?? state.castTeam[track] ?? "All";
    state.castPeriod[track] = action.dataset.period ?? state.castPeriod[track] ?? "All";
    state.openPlayTracks.add(track);
    paint(false);
    return;
  }
  if (act === "play-full") {
    const track = action.dataset.track;
    if (!track) return;
    if (state.feedFull.has(track)) state.feedFull.delete(track);
    else state.feedFull.add(track);
    state.openPlayTracks.add(track);
    paint(false);
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

async function togglePush(kind: "picks" | "locks" | "all") {
  const on = state.pushDelivery === "on" && (kind === "all" ? state.pushWant.picks || state.pushWant.locks : state.pushWant[kind]);
  const next = kind === "all" ? { picks: !on, locks: !on } : { ...state.pushWant, [kind]: !on };
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
      const play = details.dataset?.playLive;
      if (play) {
        if (details.open) state.openPlayTracks.add(play);
        else state.openPlayTracks.delete(play);
        return;
      }
      const id = details.dataset?.game;
      if (!id) return;
      if (details.open) {
        state.openGames.add(id);
        state.liveDismissed.delete(id);
      } else {
        state.openGames.delete(id);
        state.liveDismissed.add(id);
      }
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
    state.sheet = null;
    paint(true);
  });
  if (location.hash === "#stats") history.replaceState(null, "", "#results");
  paint(false);
  void refreshDesk();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    void refreshDesk();
    void watchBuild();
  });
  window.addEventListener("focus", () => {
    void refreshDesk();
    void watchBuild();
  });
  window.setInterval(() => void refreshDesk(), 3 * 60 * 1000);
  window.setInterval(() => void refreshLiveOnly(), 30 * 1000);
  window.setInterval(() => void watchBuild(), 60 * 1000);
}

let refreshing = false;
let sawTen = liveWindowET().hourET >= 10;
const runningBuild = document.querySelector('meta[name="parlaybot-build"]')?.getAttribute("content") ?? "";

function slateStore(): { getItem(key: string): string | null; setItem(key: string, value: string): void } | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function saveSlate(next: Board) {
  const entry: SlateSnap = { slateDate: next.slateDate, tickets: next.tickets, cappers: next.cappers, teamVs: next.teamVs, teamBuilt: next.teamBuilt };
  const storage = slateStore();
  writeSlateCache(storage, rememberSlate(readSlateCache(storage), entry));
}

async function fillNight(next: Board, raw: unknown) {
  const win = liveWindowET();
  if (win.hourET >= 10 || next.slateDate === win.yesterdayET) {
    next.nightLive = null;
    return;
  }
  const cached = readSlateCache(slateStore()).find((item) => item.slateDate === win.yesterdayET) ?? null;
  const source = cached ?? replayYesterday(raw, win.yesterdayET);
  const ghost = emptyBoard();
  ghost.slateDate = win.yesterdayET;
  ghost.tickets = source.tickets;
  ghost.cappers = source.cappers;
  ghost.teamVs = cached?.teamVs ?? next.teamVs;
  ghost.teamBuilt = cached?.teamBuilt ?? next.teamBuilt;
  ghost.standings = next.standings;
  try {
    await attachLive(ghost, { matchPlayers: !cached });
  } catch {
    ghost.liveNote = "ESPN scoreboard did not load. Scores stay blank until it does.";
  }
  next.nightLive = {
    slateDate: win.yesterdayET,
    tickets: ghost.tickets,
    cappers: ghost.cappers,
    teamVs: ghost.teamVs,
    teamBuilt: ghost.teamBuilt,
    liveGames: ghost.liveGames,
    liveTickets: ghost.liveTickets,
    liveNote: ghost.liveNote || "No plays saved for last night.",
    liveUpdated: ghost.liveUpdated,
    liveMood: ghost.liveMood,
    cold: !cached,
  };
}

async function refreshNight(next: Board) {
  const night = next.nightLive;
  if (!night) return;
  const ghost = emptyBoard();
  ghost.slateDate = night.slateDate;
  ghost.tickets = night.tickets;
  ghost.cappers = night.cappers;
  ghost.teamVs = night.teamVs;
  ghost.teamBuilt = night.teamBuilt;
  ghost.standings = next.standings;
  await attachLive(ghost, { matchPlayers: night.cold });
  next.nightLive = {
    ...night,
    liveGames: ghost.liveGames,
    liveTickets: ghost.liveTickets,
    liveNote: ghost.liveNote,
    liveUpdated: ghost.liveUpdated,
    liveMood: ghost.liveMood,
  };
}

function busyPainting(): boolean {
  return state.sheet != null || document.activeElement instanceof HTMLSelectElement;
}

async function refreshLiveOnly() {
  if (document.visibilityState !== "visible" || refreshing) return;
  const win = liveWindowET();
  if (win.hourET >= 10 && !sawTen && state.view === "live") {
    sawTen = true;
    board.nightLive = null;
    if (!busyPainting()) paint(false);
  }
  sawTen = win.hourET >= 10;
  const onCard = state.view === "live" || state.view === "today" || state.view === "cappers";
  const watching = onCard || board.liveGames.some((game) => !game.pre && !game.final);
  const nightWatch = win.hourET < 10 && !!board.nightLive && (state.view === "live" || board.nightLive.liveGames.some((game) => !game.pre && !game.final));
  if (!watching && !nightWatch) return;
  refreshing = true;
  try {
    if (watching) await attachLive(board);
    if (nightWatch) await refreshNight(board);
    if (!busyPainting()) paint(false);
  } catch {
    /* keep the scores already on the card */
  } finally {
    refreshing = false;
  }
}

async function watchBuild() {
  if (document.visibilityState !== "visible" || !runningBuild) return;
  const base = import.meta.env?.BASE_URL || "/";
  try {
    const response = await fetch(`${base}?_b=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return;
    const remote = buildNumber(await response.text());
    if (!newerBuild(runningBuild, remote)) return;
    localStorage.setItem("parlaybot-build", remote);
    const url = new URL(location.href);
    url.searchParams.set("b", remote);
    location.replace(url.toString());
  } catch {
    /* stay on this build */
  }
}

async function refreshDesk() {
  if (refreshing) return;
  refreshing = true;
  try {
    const raw = await fetchDesk();
    const savedAt = new Date().toISOString();
    writeDeskCache(raw, savedAt);
    const next = boardFromRaw(raw, savedAt);
    saveSlate(next);
    try {
      await attachLive(next);
    } catch {
      next.liveNote = "ESPN scoreboard did not load. Scores stay blank until it does.";
    }
    try {
      await fillNight(next, raw);
    } catch {
      next.nightLive = null;
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
        saveSlate(next);
        try {
          await attachLive(next);
        } catch {
          next.liveNote = "ESPN scoreboard did not load. Scores stay blank until it does.";
        }
        try {
          await fillNight(next, cached.raw);
        } catch {
          next.nightLive = null;
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
