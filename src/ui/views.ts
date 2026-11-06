import type { Board } from "../data/board.ts";
import { findPlay } from "../data/board.ts";
import { showsPreparedBoard } from "../data/desk.ts";
import { LEAGUES } from "../data/standings.ts";
import type { BookId, GradeMark, LiveGame, LiveLeg, Play, SeriesPoint, Ticket, TicketPart } from "../data/types.ts";
import { formatSigned, esc } from "../lib/format.ts";
import { fileBounds, historyScope, sliceHistory, unitChange, windowGrades, windowRings, windowWinRate, type RangeKey } from "../lib/history.ts";
import { shareCardIsPrivate, shareFromPending, shareFromSettled, type ShareCard } from "../lib/shareCard.ts";
import {
  PACE,
  asset,
  bookCode,
  bookName,
  canOpen,
  chartSvg,
  mascot,
  listedOn,
  paceWord,
  renderPlay,
  renderWhy,
  ringSvg,
} from "./bits.ts";
import { liveLegKey, liveWindowET, slateLabel, trackPlayOnBoard } from "../data/espn.ts";
import { displayCat, sectionMatch } from "../data/gradeLabels.ts";
import { fgLine, filterShots, sogLine, type CourtShot, type FootballMotion, type GameCast } from "../data/gamecast.ts";
import { courtHardware, footballField, nhlRink } from "./court.ts";
import { noteVisible } from "../lib/cardFilter.ts";
import { altPreviewTickets, altRecordLayout, findAltPreviewPlay, findAltPreviewTicket } from "./altLayout.ts";
import { statsCalendar, statsSections, statsSports } from "./statsScreen.ts";
import { BIG4_SPORTS, SPORT_ORDER, sportLabel } from "../lib/sport.ts";
import type { AppState, SportFilter, ViewId } from "./state.ts";

const paintedMotion = new Map<string, string>();

function motionAnimates(key: string, playId: string, gen: number): boolean {
  const token = `${playId}@${gen}`;
  if (paintedMotion.get(key) === token) return false;
  paintedMotion.set(key, token);
  return true;
}

function possBall(): string {
  return `<svg class="poss-ball" viewBox="0 0 20 12" role="img" aria-label="Has the ball"><ellipse cx="10" cy="6" rx="8.2" ry="4.6" fill="#9a4f24" stroke="#fff" stroke-width="1"/><path d="M10 2.4v7.2M7.7 3.5c.7.8.7 4.2 0 5M12.3 3.5c-.7.8-.7 4.2 0 5" fill="none" stroke="#fff" stroke-width="0.7" stroke-linecap="round"/></svg>`;
}

function timeoutBars(left: number, team: string): string {
  const count = Math.max(0, Math.min(3, Math.round(left)));
  const bars = [0, 1, 2].map((index) => `<i class="${index < count ? "on" : ""}"></i>`).join("");
  return `<span class="to-bars" role="img" aria-label="${esc(team)} ${count} timeout${count === 1 ? "" : "s"} remaining"><span class="to-pills" aria-hidden="true">${bars}</span><span class="to-lab">${count} TO</span></span>`;
}

function footballLive(game: LiveGame): boolean {
  return !game.pre && !game.final && (game.league === "NFL" || game.league === "NCAAF");
}

const NAV: [ViewId, string][] = [
  ["today", "Today"],
  ["live", "Live"],
  ["results", "Results"],
  ["cappers", "Cappers"],
];

const PRODUCTS: [string, string][] = [
  ["heist", "Heist"],
  ["heist-alt", "Heist Alt"],
  ["safe", "Safe +100"],
  ["potd", "POTD"],
  ["parlay", "Parlay +100"],
  ["edge", "Edge"],
  ["legday", "Props"],
  ["first", "First Blood"],
  ["nascar", "NASCAR"],
  ["props", "Prop Scout"],
  ["cappers", "Cappers"],
];

function sportOk(sport: Play["sport"], filter: SportFilter): boolean {
  if (filter === "All") return true;
  if (filter === "Big 4") return BIG4_SPORTS.has(sport);
  return sport === filter;
}

const LIVE_LEAGUES = new Set<LiveGame["league"]>(["NBA", "NHL", "NFL", "MLB", "NCAAF", "NCAAB", "WNBA"]);

function countLeague(sport: Play["sport"]): LiveGame["league"] {
  return LIVE_LEAGUES.has(sport as LiveGame["league"]) ? (sport as LiveGame["league"]) : "NBA";
}

function playsFor(ticket: Ticket, sport: SportFilter): Play[] {
  if (ticket.board) return showsPreparedBoard(ticket.board, sport) ? ticket.plays : [];
  return ticket.plays.filter((play) => sportOk(play.sport, sport));
}

function countPlays(board: Board, product: string | null, sport: SportFilter): number {
  if (product) {
    let count = 0;
    for (const ticket of board.tickets) {
      if (ticket.productKey !== product) continue;
      count += playsFor(ticket, sport).length;
    }
    return count;
  }
  const seen = new Set<string>();
  for (const ticket of board.tickets) {
    for (const play of playsFor(ticket, sport)) seen.add(`${play.sport}|${liveLegKey(play.name, countLeague(play.sport))}`);
  }
  return seen.size;
}

export function sportsFor(board: Board, product: string | null): { sport: string; count: number }[] {
  const present = new Set<string>();
  for (const ticket of board.tickets) {
    if (ticket.board && ticket.board !== "ALL") present.add(ticket.board);
    else if (!ticket.board) for (const play of ticket.plays) if (play.sport && play.sport !== "Other") present.add(play.sport);
  }
  for (const note of board.notices) if (note.sport && note.sport !== "Other") present.add(note.sport);
  return SPORT_ORDER.filter((sport) => present.has(sport)).map((sport) => ({ sport, count: countPlays(board, product, sport) }));
}

export function visibleTickets(board: Board, state: AppState): Ticket[] {
  const out: Ticket[] = [];
  for (const ticket of board.tickets) {
    if (state.product === "nascar") {
      const plays = ticket.plays.filter((play) => play.sport === "NASCAR");
      if (plays.length) out.push({ ...ticket, plays });
      continue;
    }
    if (state.product && ticket.productKey !== state.product) continue;
    if (ticket.board) {
      if (!showsPreparedBoard(ticket.board, state.sport)) continue;
      out.push(ticket);
      continue;
    }
    const plays = ticket.plays.filter((play) => sportOk(play.sport, state.sport));
    if (!plays.length) continue;
    out.push({ ...ticket, plays });
  }
  return out;
}

function shell(active: ViewId, inner: string, board: Board): string {
  const nav = NAV.map(
    ([id, label]) =>
      `<button type="button" class="${id === active ? "on" : ""}" data-act="nav" data-view="${id}">${label}${id === "live" ? `<i class="livedot">●</i>` : ""}</button>`,
  ).join("");
  const bar = board.banner ? `<div class="offlinebar">${esc(board.banner)}</div>` : "";
  const updated = board.updated
    ? `<div class="upd${board.updated.stale ? " stale" : ""}">${esc(board.updated.text)}</div>`
    : "";
  return `${bar}<div class="wrap" data-feed="${esc(board.feedMode)}"><header class="brand"><div class="brandmark"><img class="logo" src="${asset("brand/parlaybot-header.png")}?v=visor" alt="ParlayBOT">${updated}</div><button type="button" class="gear" data-act="settings" aria-label="Settings">⚙</button></header><nav class="topnav">${nav}</nav>${inner}</div>`;
}

function bookToggle(book: AppState["book"]): string {
  return `<div class="book" role="tablist"><button type="button" class="hr ${book === "hr" ? "on" : ""}" data-act="book" data-book="hr">Hard Rock</button><button type="button" class="dk ${book === "dk" ? "on" : ""}" data-act="book" data-book="dk">DraftKings</button></div>`;
}

function renderTicket(ticket: Ticket, state: AppState, board: Board): string {
  const book = ticket.productKey === "first" ? "hr" : state.book;
  const visible = ticket.showAll ? ticket.plays : ticket.plays.filter((play) => listedOn(play, book));
  const on = visible.filter((play) => !play.voidedPreGame);
  const voided = visible.filter((play) => play.voidedPreGame);
  const off = ticket.showAll ? [] : ticket.plays.filter((play) => !listedOn(play, book) && !play.voidedPreGame);
  const who = bookCode(book);
  const offHtml = off.length
    ? `<details class="off" data-keep="off:${esc(ticket.id)}"><summary>${off.length} play${off.length === 1 ? "" : "s"} not on ${who}, tap to view ▾</summary>${off.map((play) => renderPlay(play, book, state.selected, true, playTracker(board, state, ticket.id, play, book))).join("")}</details>`
    : "";
  const voidHtml = voided.length
    ? `<details class="off" data-keep="void:${esc(ticket.id)}"><summary>${voided.length} voided pre-game (rule change), tap to view</summary>${voided.map((play) => renderPlay(play, book, state.selected, true, playTracker(board, state, ticket.id, play, book))).join("")}</details>`
    : "";
  const openLegs = on.filter((play) => canOpen(play, book) && play.slip !== false);
  const foot = ticketFoot(ticket, state, on.length, off.length, openLegs.length);
  const share = ticket.share
    ? `<button type="button" class="btn share" data-act="share" data-id="${esc(ticket.id)}" data-settled="0">Share as image</button>`
    : "";
  const badge = ticket.badge === "cappers" ? `<span class="tag un">CAPPERS</span>` : "";
  const stamp = ticket.stamp ? `<div class="stamp">${esc(ticket.stamp)}</div>` : "";
  const warnings = (ticket.warnings ?? []).map((line) => `<p class="warnline">${esc(line)}</p>`).join("");
  const subset = ticket.playCount && state.sport !== "All" && ticket.plays.length < ticket.playCount
    ? `<p class="sub">Showing ${ticket.plays.length} of ${ticket.playCount} legs for ${esc(sportLabel(state.sport))}. The price above is the full ticket.</p>`
    : "";
  const skips = noteList(ticket.skips, "Not added to Heist");
  const excluded = noteList(ticket.excluded, "Not on Heist Alt");
  const footHtml = foot ? `<div class="tfoot">${foot}</div>` : "";
  return `<section class="ticket" id="ticket-${esc(ticket.id)}"><header><div><h3>${esc(ticket.title)} ${badge}<button type="button" class="info" data-act="rules" data-id="${esc(ticket.id)}" aria-label="Rules for ${esc(ticket.title)}">i</button></h3>${stamp}<div class="sub">${esc(ticket.meta)}</div>${warnings}${subset}</div>${share}</header>${on.map((play) => renderPlay(play, book, state.selected, false, playTracker(board, state, ticket.id, play, book))).join("")}${offHtml}${voidHtml}${skips}${excluded}${footHtml}</section>`;
}

function playTracker(board: Board, state: AppState, ticketId: string, play: Play, book: BookId): string {
  const tracked = trackPlayOnBoard(play, board, book);
  if (!tracked) return "";
  const { game, leg } = tracked;
  const key = `${ticketId}:${play.id}`;
  const open = state.openPlayTracks.has(key) ? "open" : "";
  if (game.pre) {
    if (!game.liveFeed?.teamStats.length) return "";
    return `<details class="ptrack pre" data-play-live="${esc(key)}" ${open}><summary class="ptrack-sum"><span>Team VS · Matchup ranks</span><span class="car">${open ? "▴" : "▾"}</span></summary>${vsBody(game)}</details>`;
  }
  const clock = game.final ? `<span class="final">FINAL</span>` : `<span class="pdot"></span> LIVE · ${esc(game.clock)}`;
  const awayBall = game.possessionSide === "away" ? possBall() : "";
  const homeBall = game.possessionSide === "home" ? possBall() : "";
  const head = `<span class="ptrack-score"><span class="scoreteam">${esc(game.away)}${awayBall}</span> <b>${game.awayScore}</b> @ <span class="scoreteam">${esc(game.home)}${homeBall}</span> <b>${game.homeScore}</b></span><span class="ptrack-clock">${clock}<span class="car">${open ? "▴" : "▾"}</span></span>`;
  const waiting = /Waiting on 1st score/.test(leg?.label ?? "");
  const bar = leg && leg.pace !== "pre" && !waiting ? propBar(leg, game.final) : waiting ? `<div class="ptrack-wait">${esc(leg?.label ?? "")}</div>` : "";
  const panel = state.playPanel[key] ?? "feed";
  return `<details class="ptrack" data-play-live="${esc(key)}" ${open}><summary class="ptrack-sum">${head}${bar}<span class="ptrack-hint">Feed · Box · VS</span></summary>${renderGameBody(game, panel, state, key)}</details>`;
}

function propBar(leg: LiveLeg, final: boolean): string {
  const pace = PACE[leg.pace];
  const width = Math.max(0, Math.min(100, leg.line ? (leg.current / leg.line) * 100 : 0));
  const face = pace.mood ? mascot(pace.mood, 36) : "";
  const current = Number.isInteger(leg.current) ? String(leg.current) : String(leg.current);
  const line = Number.isInteger(leg.line) ? String(leg.line) : String(leg.line);
  const figure = /Waiting|HIT ·|MISS ·|VOID ·|Leading|Trailing|Tied|covering/.test(leg.label ?? "") ? "" : `${current} / ${line}${leg.unit ? ` ${leg.unit}` : ""}`;
  const word = paceWord(leg, final);
  const live = !final && leg.pace !== "dead" && leg.pace !== "pre" ? " live" : "";
  return `<span class="ptrack-prop">${face}<span class="ptrack-fig"><b>${esc(figure)}</b> ${figure ? "· " : ""}${esc(word)}</span></span><span class="ptrack-bar${live}"><i style="width:${width.toFixed(0)}%;background:${pace.color}"></i></span>`;
}

function noteList(rows: { capper: string; pick: string; reason: string }[] | undefined, label: string): string {
  if (!rows?.length) return "";
  const items = rows
    .map((row) => `<li><b>${esc(row.capper || "Capper")}</b> ${esc(row.pick)} — ${esc(row.reason)}</li>`)
    .join("");
  return `<details class="off"><summary>${esc(label)} (${rows.length}) ▸</summary><ul class="skiplist">${items}</ul></details>`;
}

function singlesCard(ticket: Ticket): boolean {
  return ticket.id.startsWith("edge") || (ticket.plays.length > 0 && ticket.plays.every((play) => play.edgeSingle === true));
}

function ticketFoot(ticket: Ticket, state: AppState, on: number, off: number, openLegs: number): string {
  if (singlesCard(ticket)) return "";
  const book = ticket.productKey === "first" ? "hr" : state.book;
  if (ticket.dkSlipNote && book === "dk") return `<p class="sub">${esc(ticket.dkSlipNote)}</p>`;
  if (ticket.slipLabel && book === "hr") {
    const note = ticket.slipNote ? `<p class="sub">${esc(ticket.slipNote)}</p>` : "";
    if (!ticket.hrSlip) return `<span class="na">No verified Hard Rock legs</span>${note}`;
    return `<button type="button" class="btn hr" data-act="open" data-scope="ticket" data-id="${esc(ticket.id)}" data-book="hr">${esc(ticket.slipLabel)}</button>${note}`;
  }
  if (off) return `<span class="na">${on} of ${on + off} legs on ${bookCode(book)}</span>`;
  if (openLegs) return `<button type="button" class="btn ${book}" data-act="open" data-scope="ticket" data-id="${esc(ticket.id)}" data-book="${book}">Whole ticket in ${bookName(book)}</button>`;
  return `<span class="na">No open legs</span>`;
}

function productChips(board: Board, state: AppState): string {
  const buttons = PRODUCTS.map(([key, label]) => {
    const total = countPlays(board, key, "All");
    const any = board.tickets.some((ticket) => ticket.productKey === key && ticket.plays.length);
    const filtered = countPlays(board, key, state.sport);
    const noted = board.notices.some((note) => note.section === key);
    if (!total && !any && !noted) return "";
    const on = state.product === key ? "on" : "";
    const dim = filtered === 0 ? " dim" : "";
    return `<button type="button" class="${on}${dim}" data-act="product" data-key="${key}">${label}<i>${filtered}</i></button>`;
  }).join("");
  const sports = sportsFor(board, state.product);
  const prepared = state.product === "potd" || state.product === "parlay";
  const allLabel = prepared ? "All sports" : "All";
  const big4 = countPlays(board, state.product, "Big 4");
  const sportButtons = [`<button type="button" class="${state.sport === "All" ? "on" : ""}" data-act="sport" data-key="All">${allLabel}</button><button type="button" class="${state.sport === "Big 4" ? "on" : ""}${big4 === 0 ? " dim" : ""}" data-act="sport" data-key="Big 4">Big 4<i>${big4}</i></button>`]
    .concat(
      sports.map(({ sport, count }) => {
        const dim = count === 0 ? " dim" : "";
        return `<button type="button" class="${state.sport === sport ? "on" : ""}${dim}" data-act="sport" data-key="${esc(sport)}">${esc(sportLabel(sport))}<i>${count}</i></button>`;
      }),
    )
    .join("");
  return `<nav class="scroller sport" aria-label="Sport">${sportButtons}</nav><nav class="scroller" aria-label="Products">${buttons}</nav>`;
}

function playOnGame(play: Play, game: LiveGame): boolean {
  const away = play.matchup?.away.abbr;
  const home = play.matchup?.home.abbr;
  if (away && home && [game.away, game.home].includes(away) && [game.away, game.home].includes(home)) return true;
  const blob = `${play.gameText ?? ""} ${play.detail} ${play.name}`.toLowerCase();
  const names = [game.away, game.home, game.awayName, game.homeName].map((name) => name.toLowerCase()).filter((name) => name.length > 2);
  return names.filter((name) => blob.includes(name)).length >= 2;
}

function recapCard(board: Board): string {
  const rows = board.recap.rows
    .map((row) => `<div class="rrow"><span>${esc(row.name)}</span><b class="${row.win ? "W" : "L"}">${esc(row.text)}</b></div>`)
    .join("");
  const tone = /^-|−/.test(board.recap.units.trim()) ? "L" : "W";
  return `<div class="recap"><div class="priv">🔒 Only you can see this</div><div class="sub">${esc(board.recap.when)}</div><div class="big ${tone}">${esc(board.recap.units)}</div><div class="sub" style="margin-bottom:8px">${esc(board.recap.summary)}</div>${rows}<div style="margin-top:12px"><button type="button" class="btn share" data-act="nav" data-view="results">See results</button></div></div>`;
}

function rangeControl(state: AppState): string {
  return (["14d", "30d", "60d", "90d", "all"] as const)
    .map((key) => `<button type="button" class="${key === "all" ? "all " : ""}${!state.statsFrom && state.profitRange === key ? "on" : ""}" data-act="range" data-key="${key}">${key === "all" ? "All" : key.replace("d", "D")}</button>`)
    .join("");
}

function sectionSeries(board: Board, section: string): SeriesPoint[] {
  const byDay = new Map<string, number>();
  for (const grade of board.grades) {
    if (!sectionMatch(grade, section)) continue;
    byDay.set(grade.date, (byDay.get(grade.date) ?? 0) + grade.units);
  }
  let running = 0;
  return [...byDay.keys()].sort().map((iso) => {
    running += byDay.get(iso) ?? 0;
    const [, month, date] = iso.split("-");
    return { day: `${Number(month)}/${Number(date)}`, iso, profit: running, winRate: null };
  });
}

function chartWindow(board: Board, range: RangeKey, customFrom = "", customTo = "", section = "all"): { points: SeriesPoint[]; headline: string; note: string; rings: { pct: number; label: string }[]; ringsNote: string; from: string | null; to: string | null; starts: string | null } {
  const series = sectionSeries(board, section);
  if (!series.length) return { points: [], headline: "No data yet", note: "", rings: [], ringsNote: "", from: null, to: null, starts: null };
  const preset = sliceHistory(series, range);
  const windowed = customFrom && customTo
    ? { points: series.filter((point) => point.iso && point.iso >= customFrom && point.iso <= customTo), from: customFrom, to: customTo, starts: null as string | null }
    : preset;
  const grades = windowGrades(board.grades.filter((grade) => sectionMatch(grade, section)), windowed.from, windowed.to);
  const delta = unitChange(series, windowed.points);
  const wins = grades.filter((grade) => grade.win).length;
  const losses = grades.length - wins;
  const rate = windowWinRate(grades);
  const record = grades.length ? `${wins}-${losses} · ` : "";
  const headline = delta == null ? "No chart in this file" : `${formatSigned(delta, 2)}u · ${record}${rate == null ? "no graded tickets in this range" : `${rate}% win rate`}`;
  const note = windowed.starts ? `History starts ${windowed.starts}.` : "Running units from the graded plays.";
  const ringsNote = windowed.starts ? `History starts ${windowed.starts}. Win rates use the graded tickets on these dates.` : "Win rates use the graded tickets on these dates.";
  return { points: windowed.points, headline, note, rings: windowRings(grades, section), ringsNote, from: windowed.from, to: windowed.to, starts: windowed.starts };
}

function altLayoutPage(state: AppState, board: Board): string {
  const cards = altPreviewTickets().map((ticket) => renderTicket(ticket, state, board)).join("");
  return `<div class="layoutpreview"><p class="previewban">Layout preview. Sample legs are not today’s board and are not a feed. Wiring waits for the schema. There is no +500 ticket.</p>${bookToggle(state.book)}<h2 class="grouph">Today cards</h2><p class="sub">Same play row, verified book buttons, availability notes, and multi-select as the live cards.</p>${cards}${altRecordLayout(board)}</div>`;
}

export function renderPage(state: AppState, board: Board): string {
  if (state.view === "alt-layout") return shell("alt-layout", altLayoutPage(state, board), board);
  if (state.view === "today") return shell("today", today(state, board), board);
  if (state.view === "live") return shell("live", live(state, board), board);
  if (state.view === "results" || state.view === "stats") return shell("results", results(state, board), board);
  if (state.view === "cappers") return shell("cappers", cappers(state, board), board);
  const from = state.standingsFrom === "stats" || state.standingsFrom === "results" ? "results" : "live";
  return shell(from, standingsView(state, board), board);
}

function today(state: AppState, board: Board): string {
  const windowed = chartWindow(board, state.profitRange, state.statsFrom, state.statsTo);
  const rings = windowed.rings
    .slice(0, 4)
    .map((ring) => ringSvg(ring.pct, ring.label))
    .join("");
  const tickets = visibleTickets(board, state);
  const visiblePlays = tickets.flatMap((ticket) => ticket.plays);
  const gameList = board.liveGames.filter((game) => visiblePlays.some((play) => playOnGame(play, game)));
  const sections = ["heist", "heist-alt", "safe", "potd", "parlay", "edge", "legday", "first", "lotto", "props", "cappers"];
  const blocks = sections
    .map((section) => {
      if (state.product && state.product !== section) return "";
      const mine = tickets.filter((ticket) => ticket.productKey === section);
      const notes = board.notices.filter((note) => note.section === section && noteVisible(note, state.product, state.sport));
      const stamp = section === "heist" && board.heistStamp && !mine.length && noteVisible({ text: "", section: "heist", sport: null }, state.product, state.sport)
        ? `<p class="stamprow"><b>THE HEIST</b> <span class="stamp">${esc(board.heistStamp)}</span></p>`
        : "";
      if (!mine.length && !notes.length && !stamp) return "";
      const bareTitle: Record<string, string> = { first: "First Blood", lotto: "Lotto", cappers: "Cappers", props: "Prop Scout" };
      const label = mine.length ? "" : (bareTitle[section] ?? "");
      const head = label ? `<h2 class="grouph">${label}</h2>` : "";
      const noteHtml = notes.map((note) => `<p class="sub">${esc(note.text)}</p>`).join("");
      const bodies = mine.map((ticket) => renderTicket(ticket, state, board)).join("");
      const injury = board.injuryCheck && mine.some((ticket) => ticket.plays.some((play) => play.status)) ? `<p class="stamp">${esc(board.injuryCheck)}</p>` : "";
      return `${head}${stamp}${noteHtml}${injury}${bodies}`;
    })
    .join("");
  const bookNote =
    state.book === "hr"
      ? "Showing plays live on Hard Rock. Legs are picked on Hard Rock."
      : "Showing plays live on DraftKings · DK price incl. fee (Florida DK Predictions). Legs are picked on Hard Rock.";
  const dkLine = board.dkPrices ? `<p class="stamp">${esc(board.dkPrices)}</p>` : "";
  const left = `${bookToggle(state.book)}${dkLine}${recapCard(board)}<div class="card"><h2>Profit</h2><div class="ranges" role="tablist" aria-label="Chart range">${rangeControl(state)}</div><div class="sub">${esc(windowed.headline)}</div><div class="sub">${esc(windowed.note)}</div><div class="priv">🔒 Only you can see this</div>${chartSvg(windowed.points)}<div class="rings">${rings}</div></div>`;
  const countLabel = gameList.length ? String(gameList.length) : "0 games";
  const lock = board.lockCheck ? `<span class="stamp">${esc(board.lockCheck)}</span>` : "";
  const gameBody = !state.gamesOpen ? "" : gameList.length ? gamesPanel(gameList, state) : `<p class="empty gamesempty">No games listed for this filter.</p>`;
  const gameHead = `<div class="gameslot"><button type="button" class="gameshead" data-act="games-toggle" aria-expanded="${state.gamesOpen ? "true" : "false"}"><b>Today's Games</b><span class="sub">· ${countLabel}</span><span class="car">${state.gamesOpen ? "▴" : "▾"}</span>${lock}</button>${gameBody}</div>`;
  const prepared = state.product === "potd" || state.product === "parlay";
  const empty = !board.tickets.length
    ? "No data yet"
    : prepared
      ? state.sport === "All"
        ? "No all-sports pick in the file."
        : "No prepared board for this sport."
      : "No plays in this filter.";
  const right = `${gameHead}${productChips(board, state)}<div class="sub" style="margin:-4px 0 10px">${bookNote}</div>${blocks || `<p class="empty">${empty}</p>`}`;
  return `<div class="sub date-line">${esc(board.dateLabel)}</div><div class="home"><div>${left}</div><div>${right}</div></div>`;
}

const GAME_SPORTS = ["NHL", "NBA", "NFL", "NCAAF", "NCAAB", "MLB", "NASCAR"] as const;

function byStart(a: LiveGame, b: LiveGame): number {
  return (a.start || "9999").localeCompare(b.start || "9999") || a.id.localeCompare(b.id);
}

function gamesPanel(games: LiveGame[], state: AppState): string {
  const counts = new Map<string, LiveGame[]>();
  for (const game of games) {
    const list = counts.get(game.league) ?? [];
    list.push(game);
    counts.set(game.league, list);
  }
  const sports = GAME_SPORTS.filter((sport) => (counts.get(sport) ?? []).length);
  const picked = state.gamesSport !== "All" && sports.includes(state.gamesSport) ? state.gamesSport : "All";
  const chips = [`<button type="button" class="${picked === "All" ? "on" : ""}" data-act="games-sport" data-key="All">All</button>`]
    .concat(
      sports.map((sport) => {
        const count = counts.get(sport)?.length ?? 0;
        return `<button type="button" class="${picked === sport ? "on" : ""}" data-act="games-sport" data-key="${sport}">${esc(sportLabel(sport))} ${count}</button>`;
      }),
    )
    .join("");
  const order = picked === "All" ? [...sports, ...[...counts.keys()].filter((sport) => !sports.includes(sport as (typeof GAME_SPORTS)[number]))] : [picked];
  const body = order
    .map((sport) => {
      const rows = (counts.get(sport) ?? []).slice().sort(byStart);
      if (!rows.length) return "";
      const head = picked === "All" ? `<p class="gamegroup">${esc(sportLabel(sport))}</p>` : "";
      return `${head}${rows.map((game) => renderGame(game, state, false)).join("")}`;
    })
    .join("");
  return `<nav class="scroller sport gamesports" aria-label="Today's games by sport">${chips}</nav>${body}`;
}

function renderLiveLeg(leg: LiveLeg): string {
  const pace = PACE[leg.pace];
  const width = Math.max(0, Math.min(100, leg.line ? (leg.current / leg.line) * 100 : 0));
  const face = pace.mood ? mascot(pace.mood, 36) : `<span class="mascot" style="width:36px;height:36px"></span>`;
  const current = Number.isInteger(leg.current) ? String(leg.current) : String(leg.current);
  const line = Number.isInteger(leg.line) ? String(leg.line) : String(leg.line);
  const figure = leg.label || `${current}/${line}${leg.unit ? ` ${leg.unit}` : ""}`;
  const live = leg.pace !== "dead" && leg.pace !== "pre" ? " live" : "";
  return `<div class="lv-leg">${face}<div class="lv-main"><div class="lv-row"><b>${esc(leg.name)}</b><span>${esc(figure)}</span></div>${legTags(leg.tags)}<div class="lv-bar${live}"><i style="width:${width.toFixed(0)}%;background:${pace.color}"></i></div><div class="lv-row"><span class="pace p-${leg.pace}">${esc(pace.label)}</span><span class="sub">${esc(leg.source)}</span></div>${renderWhy(leg.why, `why:${leg.key || leg.name}`)}</div></div>`;
}

function sideLine(side: LiveGame["awaySide"], timeouts: number | null): string {
  const bits = [side.record, side.standing].filter((value) => value && value !== "—");
  const extra = bits.join(" · ");
  const bars = timeouts == null ? "" : timeoutBars(timeouts, side.abbr);
  return `<span class="tm"><span class="tmrow"><b>${esc(side.abbr)}</b>${extra ? ` ${esc(extra)}` : ""}</span>${bars}</span>`;
}

function renderGame(game: LiveGame, state: AppState, withLegs: boolean): string {
  const awayBall = game.possessionSide === "away" ? possBall() : "";
  const homeBall = game.possessionSide === "home" ? possBall() : "";
  const score = game.pre
    ? `${esc(game.away)} @ ${esc(game.home)}`
    : `<span class="scoreteam">${esc(game.away)}${awayBall}</span> ${game.awayScore} – ${game.homeScore} <span class="scoreteam">${esc(game.home)}${homeBall}</span>`;
  const clock = `<span class="clock${game.pre || game.final ? " pre" : ""}">${game.pre || game.final ? "" : "● "}${esc(game.clock)}</span>`;
  const showTo = footballLive(game);
  const ctx = `<div class="ctx">${sideLine(game.awaySide, showTo ? game.awayTimeouts ?? null : null)}<span class="vs">vs</span>${sideLine(game.homeSide, showTo ? game.homeTimeouts ?? null : null)}</div>`;
  const panel = state.gamePanel[game.id] ?? "feed";
  const open = state.openGames.has(game.id) ? "open" : "";
  const legs = withLegs ? game.legs.map(renderLiveLeg).join("") : "";
  return `<section class="game"><details class="gx" data-game="${esc(game.id)}" ${open}><summary><div class="ghead"><div><div class="score">${score}</div>${ctx}</div>${clock}</div><div class="tap">▾ Feed · Box · VS</div></summary>${renderGameBody(game, panel, state)}</details>${legs}</section>`;
}

function renderGameBody(game: LiveGame, panel: "feed" | "box" | "vs", state: AppState, track = ""): string {
  const pills = (["feed", "box", "vs"] as const)
    .map((id) => {
      const label = id === "feed" ? "Feed" : id === "box" ? "Box score" : "Team VS";
      const who = track ? `data-act="play-panel" data-track="${esc(track)}"` : `data-act="panel" data-game="${esc(game.id)}"`;
      return `<button type="button" class="${panel === id ? "on" : ""}" ${who} data-panel="${id}">${label}</button>`;
    })
    .join("");
  let body = "";
  if (panel === "feed") body = feedBody(game, state, track);
  else if (panel === "box") body = boxBody(game);
  else body = vsBody(game);
  const cast = game.liveFeed?.cast;
  const head = cast ? scoreHead(cast) : "";
  const callout = panel === "feed" && cast?.callout ? calloutBar(game, cast, state, track) : "";
  const label = game.liveFeed?.real && !cast ? `<div class="sub">ESPN</div>` : "";
  return `<div class="feed">${head}<div class="pills" style="margin-top:0">${pills}</div>${callout}${label}${body}</div>`;
}

function scoreHead(cast: GameCast): string {
  const showTo = cast.kind === "football" && cast.live;
  const side = (team: GameCast["away"], flip = false) => {
    const mark = team.logo
      ? `<img class="castlogo" src="${esc(team.logo)}" alt="" width="36" height="36">`
      : `<span class="lg" style="background:${esc(team.color)}">${esc(team.abbr.slice(0, 3))}</span>`;
    const hasBall = (team.home && cast.possessionSide === "home") || (!team.home && cast.possessionSide === "away");
    const timeouts = !showTo ? null : team.home ? cast.homeTimeouts : cast.awayTimeouts;
    const bars = timeouts == null ? "" : timeoutBars(timeouts, team.abbr);
    const name = `<span class="castmeta"><span class="tmrow"><b>${esc(team.abbr)}</b>${hasBall ? possBall() : ""}</span>${bars}</span>`;
    return `<div class="castside">${flip ? `${name}${mark}` : `${mark}${name}`}</div>`;
  };
  const dot = cast.live ? "● " : "";
  return `<div class="casthead" style="--wash-a:${esc(cast.away.color)};--wash-h:${esc(cast.home.color)}">${side(cast.away)}<div class="castscore"><span class="nums"><b>${esc(cast.away.score || "–")}</b><b>${esc(cast.home.score || "–")}</b></span><span class="clock${cast.live ? "" : " pre"}">${dot}${esc(cast.clock || (cast.pre ? "Not started" : ""))}</span></div>${side(cast.home, true)}</div>`;
}

function feedBody(game: LiveGame, state: AppState, track = ""): string {
  const cast = game.liveFeed?.cast;
  if (!cast) {
    const items = game.liveFeed?.real ? game.liveFeed.pbp : [];
    if (!items.length) return `<p class="empty">No data yet</p>`;
    return items
      .map(
        (item) =>
          `<div class="pbp"><span class="lg">${esc(item.team)}</span><div class="pm"><b>${esc(item.event)}</b><div class="sub">${esc(item.when)}</div><div>${esc(item.desc)}</div></div><div class="ps">${esc(item.score)}</div></div>`,
      )
      .join("");
  }
  const filter = track
    ? { team: state.castTeam[track] ?? "All", period: state.castPeriod[track] ?? "All" }
    : state.feedFilter[game.id] ?? { team: "All", period: "All" };
  const visual = cast.kind === "basketball"
    ? courtBlock(game.id, cast, filter, track)
    : cast.kind === "football"
      ? fieldBlock(game.id, cast, state, track)
      : cast.kind === "hockey"
        ? rinkBlock(game.id, cast, filter, track)
        : cast.kind === "baseball"
          ? diamondBlock(cast)
          : "";
  const names = game.legs
    .map((leg) => leg.name.replace(/\s+(?:over|under|[ou])\b.*$/i, "").trim())
    .filter((name) => name.split(" ").length >= 2);
  const quarters = cast.kind === "football" ? pillRow(game.id, "Quarter", filter.period, ["All", ...cast.periods, "Scoring"], "period", track) : "";
  return `${visual}${quarters}${playList(game.id, cast, state.feedFull.has(track || game.id), track, filter.period, names, state.snapPreview[track || game.id] ?? "")}`;
}

function calloutBar(game: LiveGame, cast: GameCast, state: AppState, track: string): string {
  const key = track || game.id;
  const preview = state.snapPreview[key];
  const canReplay = cast.kind === "football" && (cast.football?.motion || cast.plays.some((play) => play.motion));
  const replay = canReplay
    ? `<button type="button" class="replay" data-act="snap-replay" data-game="${esc(game.id)}" data-track="${esc(track)}">↻ Replay</button>`
    : "";
  const back = preview
    ? `<button type="button" class="replay" data-act="snap-live" data-game="${esc(game.id)}" data-track="${esc(track)}">Back to live</button>`
    : "";
  return `<div class="callbar"><p class="callout">${esc(cast.callout)}</p>${replay}${back}</div>`;
}

function pillRow(gameId: string, label: string, current: string, keys: string[], field: "team" | "period", track = ""): string {
  const buttons = keys
    .map((key) => {
      const who = track ? `data-act="play-feed" data-track="${esc(track)}"` : `data-act="feed" data-game="${esc(gameId)}"`;
      return `<button type="button" class="${current === key ? "on" : ""}" ${who} data-${field}="${esc(key)}">${esc(key)}</button>`;
    })
    .join("");
  return `<div class="pills castpills" aria-label="${esc(label)}">${buttons}</div>`;
}

function courtBlock(gameId: string, cast: GameCast, filter: { team: string; period: string }, track = ""): string {
  const shown = filterShots(cast.shots, filter.team, filter.period);
  const marks = shown
    .map((shot, index) => shotMark(shot, index === shown.length - 1))
    .join("");
  const note = cast.shots.length
    ? ""
    : `<text class="court-note" x="47" y="27" text-anchor="middle">${esc(cast.pre ? "Fills in once the game starts" : "Shot locations not available for this game")}</text>`;
  const svg = `<svg class="court" viewBox="-1 -1 96 52" role="img" aria-label="Shot chart"><rect class="court-floor" x="0" y="0" width="94" height="50"/><rect class="court-line" x="0" y="0" width="94" height="50" fill="none"/><line class="court-line" x1="47" y1="0" x2="47" y2="50"/><circle class="court-line" cx="47" cy="25" r="6" fill="none"/>${courtHardware(cast.court === "nba", esc(cast.home.logo))}${marks}${note}</svg>`;
  const teams = ["All", cast.away.abbr, cast.home.abbr].filter(Boolean);
  return `${pillRow(gameId, "Team", filter.team, teams, "team", track)}${pillRow(gameId, "Period", filter.period, ["All", ...cast.periods], "period", track)}<div class="courtwrap">${svg}</div><p class="legendline"><span>● made</span><span>✕ missed</span><span>○ latest</span><b>${esc(fgLine(shown, cast.away.abbr))}</b><b>${esc(fgLine(shown, cast.home.abbr))}</b></p>`;
}

function shotMark(shot: CourtShot, latest: boolean): string {
  const ring = latest ? `<circle class="shot-ring" cx="${shot.cx.toFixed(2)}" cy="${shot.cy.toFixed(2)}" r="2.05" fill="none"/>` : "";
  if (shot.made) return `${ring}<circle cx="${shot.cx.toFixed(2)}" cy="${shot.cy.toFixed(2)}" r="1.15" fill="${esc(shot.color)}"/>`;
  const x = shot.cx;
  const y = shot.cy;
  return `${ring}<g stroke="${esc(shot.color)}" stroke-width="0.45" stroke-linecap="round"><line x1="${(x - 1).toFixed(2)}" y1="${(y - 1).toFixed(2)}" x2="${(x + 1).toFixed(2)}" y2="${(y + 1).toFixed(2)}"/><line x1="${(x - 1).toFixed(2)}" y1="${(y + 1).toFixed(2)}" x2="${(x + 1).toFixed(2)}" y2="${(y - 1).toFixed(2)}"/></g>`;
}

function fieldBlock(gameId: string, cast: GameCast, state: AppState, track = ""): string {
  const spot = cast.football;
  if (!spot) return `<p class="empty">Field position isn't in this ESPN summary.</p>`;
  const key = track || gameId;
  const preview = cast.plays.find((play) => play.id && play.id === state.snapPreview[key]);
  const motion: FootballMotion | null = preview?.motion ?? spot.motion ?? null;
  const animate = motion ? motionAnimates(key, `${preview ? "p:" : "l:"}${motion.playId}`, state.snapGen[key] ?? 0) : false;
  const zone = spot.redZone ? `<span class="rz">RED ZONE</span>` : "";
  return `<div class="courtwrap">${footballField(spot, { motion, animate })}</div><div class="fieldstrip"><div><b>${esc(spot.down || "Line of scrimmage")}</b> ${zone}</div><span>${esc(spot.drive)}</span></div>`;
}

function rinkMark(mark: GameCast["rink"][number], latest: boolean): string {
  const x = mark.cx;
  const y = mark.cy;
  const ring = latest ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.6" fill="none" stroke="#0d1117" stroke-width="0.55"/>` : "";
  if (mark.goal) return `${ring}<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.9" fill="${esc(mark.color)}" stroke="#ffd400" stroke-width="0.7"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.9" fill="none" stroke="#0d1117" stroke-width="0.35"/>`;
  if (mark.sog) return `${ring}<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.2" fill="${esc(mark.color)}" stroke="#0d1117" stroke-width="0.45"/>`;
  return `${ring}<g stroke="${esc(mark.color)}" stroke-width="0.65" stroke-linecap="round"><line x1="${(x - 1.7).toFixed(2)}" y1="${(y - 1.7).toFixed(2)}" x2="${(x + 1.7).toFixed(2)}" y2="${(y + 1.7).toFixed(2)}"/><line x1="${(x - 1.7).toFixed(2)}" y1="${(y + 1.7).toFixed(2)}" x2="${(x + 1.7).toFixed(2)}" y2="${(y - 1.7).toFixed(2)}"/></g>`;
}

function rinkBlock(gameId: string, cast: GameCast, filter: { team: string; period: string }, track = ""): string {
  const shown = filterShots(cast.rink, filter.team, filter.period);
  const marks = shown.map((mark, index) => rinkMark(mark, index === shown.length - 1)).join("");
  const note = cast.rink.length ? "" : `<text class="court-note" x="0" y="2" text-anchor="middle">${esc(cast.pre ? "Fills in once the game starts" : "Shot locations not available for this game")}</text>`;
  const clip = `rink-${gameId.replace(/[^a-z0-9_-]/gi, "") || "ice"}`;
  const svg = `<svg class="rink" viewBox="-104 -46 208 92" role="img" aria-label="Rink">${nhlRink(/^https:\/\//i.test(cast.home.logo) ? cast.home.logo : "", clip)}<g clip-path="url(#${clip})">${marks}${note}</g></svg>`;
  const teams = ["All", cast.away.abbr, cast.home.abbr].filter(Boolean);
  return `${pillRow(gameId, "Team", filter.team, teams, "team", track)}${pillRow(gameId, "Period", filter.period, ["All", ...cast.periods], "period", track)}<div class="courtwrap">${svg}</div><p class="legendline"><span>● SOG</span><span>✕ miss/blk</span><span>★ goal</span><span>○ latest</span><b>${esc(sogLine(shown, cast.away.abbr))}</b><b>${esc(sogLine(shown, cast.home.abbr))}</b></p>`;
}

function diamondBlock(cast: GameCast): string {
  const spot = cast.baseball;
  if (!spot) return `<p class="empty">The count isn't in this ESPN summary.</p>`;
  const base = (on: boolean, x: number, y: number) => `<rect class="${on ? "base on" : "base"}" x="${x}" y="${y}" width="7" height="7" transform="rotate(45 ${x + 3.5} ${y + 3.5})"/>`;
  return `<div class="diamondwrap"><svg class="diamond" viewBox="0 0 80 70" role="img" aria-label="Bases">${base(spot.bases[1], 36, 8)}${base(spot.bases[2], 16, 28)}${base(spot.bases[0], 56, 28)}<rect class="base on" x="36" y="50" width="7" height="7" transform="rotate(45 39.5 53.5)"/></svg><p class="legendline"><b>${esc(spot.balls)}-${esc(spot.strikes)}</b><span>${esc(spot.outs)} out</span>${spot.pitcher ? `<span>P ${esc(spot.pitcher)}</span>` : ""}${spot.batter ? `<span>AB ${esc(spot.batter)}</span>` : ""}</p></div>`;
}

function playList(gameId: string, cast: GameCast, full: boolean, track = "", period = "All", names: string[] = [], previewId = ""): string {
  const rows = cast.plays.filter((play) => {
    if (period === "All") return true;
    if (period === "Scoring") return play.scoring === true;
    return play.periodKey === period;
  });
  if (!rows.length) return `<p class="empty">${cast.pre ? "Fills in once the game starts" : cast.plays.length ? "No plays in this quarter." : "No play-by-play in this ESPN summary."}</p>`;
  const shown = full ? rows : rows.slice(0, 10);
  const list = shown.map((play) => playRow(play, names, gameId, track, previewId)).join("");
  const more = rows.length > 10
    ? `<button type="button" class="linkrow" ${track ? `data-act="play-full" data-track="${esc(track)}"` : `data-act="feed-full" data-game="${esc(gameId)}"`}>${full ? "Latest plays" : `Full play-by-play (${rows.length})`}</button>`
    : "";
  return `${list}${more}`;
}

function mentionsName(text: string, names: string[]): boolean {
  const hay = text.toLowerCase();
  return names.some((name) => {
    const last = name.split(" ").at(-1)?.toLowerCase() ?? "";
    return last.length > 2 && hay.includes(last);
  });
}

function playRow(play: GameCast["plays"][number], names: string[] = [], gameId = "", track = "", previewId = ""): string {
  const mark = play.logo
    ? `<img class="lg" src="${esc(play.logo)}" alt="" width="24" height="24">`
    : play.abbr
      ? `<span class="lg" style="background:${esc(play.color)}">${esc(play.abbr.slice(0, 3))}</span>`
      : `<span class="lg neutral">•</span>`;
  const score = play.awayScore || play.homeScore ? `${play.awayScore}  ${play.homeScore}` : "";
  const win = play.win ? `<div class="sub">${esc(play.win)}</div>` : "";
  const badge = play.badge ? `<span class="fd">${esc(play.badge)}</span>` : "";
  const spot = play.spot ? `<div class="sub">${esc(play.spot)}</div>` : "";
  const mine = mentionsName(`${play.text} ${play.title}`, names) ? " mine" : "";
  const scoring = play.scoring ? " score" : "";
  const snap = play.motion ? " snap" : "";
  const preview = previewId && play.id === previewId ? " preview" : "";
  const act = play.motion ? ` data-act="snap-preview" data-play="${esc(play.id)}" data-game="${esc(gameId)}" data-track="${esc(track)}" role="button"` : "";
  return `<div class="pbp${scoring}${mine}${snap}${preview}"${act}>${mark}<div class="pm"><b>${esc(play.title)}</b>${badge}${spot}<div>${esc(play.text)}</div></div><div class="ps${play.scoring ? " hot" : ""}"><div class="sub">${esc(play.when)}</div><b>${esc(score)}</b>${win}</div></div>`;
}

function tagTone(tag: string): string {
  if (tag.startsWith("POTD")) return "potd";
  if (tag.startsWith("+100 ALT")) return "alt100";
  if (tag.startsWith("+100")) return "plus";
  if (tag === "Edge") return "edge";
  if (tag.startsWith("Props")) return "props";
  if (tag.startsWith("Heist")) return "heist";
  if (tag === "First Blood") return "blood";
  if (tag === "Lotto") return "lotto";
  return "cap";
}

function legTags(tags: string[] | undefined): string {
  if (!tags?.length) return "";
  return `<span class="ltags">${tags.map((tag) => `<span class="ltag ${tagTone(tag)}">${esc(tag)}</span>`).join("")}</span>`;
}

function boxBody(game: LiveGame): string {
  const yours = game.legs
    .map((leg) => {
      const pace = PACE[leg.pace];
      const width = Math.max(0, Math.min(100, leg.line ? (leg.current / leg.line) * 100 : 0));
      const face = pace.mood ? mascot(pace.mood, 34) : "";
      return `<div class="lv-leg">${face}<div class="lv-main"><div class="lv-row"><b>${esc(leg.name)}</b><span>${leg.current}/${leg.line} ${esc(leg.unit)}</span></div>${legTags(leg.tags)}<div class="lv-bar"><i style="width:${width.toFixed(0)}%;background:${pace.color}"></i></div></div></div>`;
    })
    .join("");
  if (game.liveFeed?.real) {
    const box = game.liveFeed.box;
    if (!box.rows.length) return `<div class="sub"><b>Your players</b> · 🔒 Only you can see this</div>${yours}<p class="empty">Player box score is not posted on ESPN yet.</p>`;
    const head = box.headers.length ? `<tr>${box.headers.map((header) => `<th>${esc(header)}</th>`).join("")}</tr>` : "";
    const body = box.rows
      .map((row) =>
        row.header && row.cells.length > 1
          ? `<tr class="tmh">${row.cells.map((cell) => `<th>${esc(cell)}</th>`).join("")}</tr>`
          : row.header
            ? `<tr class="tmh"><td colspan="${Math.max(box.headers.length, row.cells.length, 1)}">${esc(row.header)}</td></tr>`
            : `<tr class="${row.mine ? "mine" : ""}"><td>${row.mine ? "★ " : ""}${esc(row.cells[0] ?? "")}</td>${row.cells.slice(1).map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`,
      )
      .join("");
    return `<div class="sub"><b>Your players</b> · 🔒 Only you can see this</div>${yours}<table class="bx">${head}${body}</table>`;
  }
  return `${yours}<p class="empty">No data yet</p>`;
}

function rankCell(rank: string | undefined, of: string | undefined, value: string, tone: string | undefined): string {
  const chip = rank ? `<b class="${esc(tone || "")}">${esc(rank)}</b>${of ? `<span class="rk-n">${esc(of)}</span>` : ""}` : "";
  return `<td>${chip}${value ? ` <span class="rk-val">${esc(value)}</span>` : ""}</td>`;
}

function vsBody(game: LiveGame): string {
  const rows = game.liveFeed?.teamStats ?? [];
  if (!rows.length) return `<p class="empty">No offensive/defensive rank data for this matchup.</p>`;
  const body = rows
    .map((row) => `<tr><td>${esc(row.name)}</td>${rankCell(row.awayRank, row.awayOf, row.away, row.awayTone)}${rankCell(row.homeRank, row.homeOf, row.home, row.homeTone)}</tr>`)
    .join("");
  const built = game.liveFeed?.built ? `<div class="stamp">${esc(game.liveFeed.built)}</div>` : "";
  return `<p class="sub vsleg">⚔️ Off #1 = most · 🛡️ Def #1 = fewest allowed</p>${built}<div class="vsh"><b>${esc(game.away)} <span class="sub">vs</span> ${esc(game.home)}</b></div><table class="vst"><tr><th>Stat</th><th>${esc(game.away)}</th><th>${esc(game.home)}</th></tr>${body}</table>`;
}

export function liveSlice(state: AppState, board: Board): Board {
  const win = liveWindowET();
  if (win.hourET >= 10 || state.liveNight === false) return board;
  if (board.slateDate === win.yesterdayET || !board.nightLive) return board;
  return {
    ...board,
    liveGames: board.nightLive.liveGames,
    liveTickets: board.nightLive.liveTickets,
    liveNote: board.nightLive.liveNote,
    liveUpdated: board.nightLive.liveUpdated,
    liveMood: board.nightLive.liveMood,
  };
}

function liveNightBar(state: AppState, board: Board): string {
  const win = liveWindowET();
  if (win.hourET >= 10) return "";
  const nightOn = state.liveNight !== false;
  const todayPosted = board.slateDate === win.todayET && (board.tickets.some((ticket) => ticket.plays.length) || board.cappers.some((capper) => capper.plays.length));
  const today = todayPosted
    ? `<button type="button" class="${nightOn ? "" : "on"}" data-act="live-slate" data-slate="today">Today · ${esc(slateLabel(win.todayET))}</button>`
    : "";
  return `<div class="pills liveslate" role="tablist" aria-label="Live slate"><button type="button" class="${nightOn ? "on" : ""}" data-act="live-slate" data-slate="night">Last night · ${esc(slateLabel(win.yesterdayET))}</button>${today}</div><p class="sub slatenote">Stays up until 10:00 AM ET</p>`;
}

function live(state: AppState, board: Board): string {
  const shown = liveSlice(state, board);
  const bars = shown.liveTickets
    .map((ticket) => {
      const pace = PACE[ticket.pace];
      const hits = ticket.legs.filter((leg) => leg === "hit").length;
      const face = pace.mood ? mascot(pace.mood, 44) : "";
      const segs = ticket.legs.map((leg) => `<i style="background:${PACE[leg].color}"></i>`).join("");
      return `<div class="tk">${face}<div class="lv-main"><div class="lv-row"><b>${esc(ticket.name)}</b><span>${hits}/${ticket.legs.length} legs</span></div><div class="tk-bar">${segs}</div><div class="lv-row"><span class="pace p-${ticket.pace}">${esc(pace.label)}</span><span class="sub">${esc(ticket.note)}</span></div></div></div>`;
    })
    .join("");
  const games = shown.liveGames.map((game) => renderGame(game, state, true)).join("");
  const mood = shown.liveMood;
  const waiting = !!mood && mood.pre > 0 && !mood.hit && !mood.alive && !mood.dead;
  const detail = !mood
    ? ""
    : waiting
      ? `${mood.pre} not started`
      : `${mood.hit} hit · ${mood.alive} alive · ${mood.dead} dead`;
  const moodBlock = mood
    ? `<div class="mood">${mascot(mood.mood, 64)}<div><b>${esc(mood.title)}</b><div class="sub">${esc(detail)}</div></div></div><div class="sweatbox"><div><b class="W">${mood.hit}</b>hit</div><div><b class="a">${waiting ? mood.pre : mood.alive}</b>${waiting ? "not started" : "alive"}</div><div><b class="L">${mood.dead}</b>dead</div></div>`
    : `<p class="empty">No data yet</p>`;
  const lock = board.lockCheck ? `<p class="stamp">${esc(board.lockCheck)}</p>` : "";
  const updated = shown.liveUpdated ? ` · ${esc(shown.liveUpdated)}` : "";
  return `<h1 style="font-size:1.75rem">Live</h1><div class="sub">Your legs in games now${updated}</div>${liveNightBar(state, board)}${lock}${moodBlock}<section class="game"><div class="sub"><b>Tickets</b></div>${bars || `<p class="empty">No data yet</p>`}</section>${games || `<p class="empty">No data yet</p>`}<div class="sub" style="margin:4px 0">${esc(shown.liveNote)}</div><button type="button" class="linkrow" data-act="standings" data-from="live">Standings · NBA · NHL · NFL ›</button>`;
}

function resultWord(value: string): string {
  if (value === "W") return "Won";
  if (value === "L") return "Lost";
  if (value === "V") return "Void";
  if (value === "P") return "Push";
  return value;
}

function recordedTeam(board: Board, date: string, name: string): string {
  const player = name.toLowerCase();
  const found = board.fbLegs.find((leg) => leg.date === date && player.includes(leg.player.toLowerCase()));
  if (!found) return "";
  return found.team;
}

function partBlock(parts: TicketPart[] | undefined, board: Board, date: string): string {
  if (!parts?.length) return `<p class="sub miss">Leg details aren't available for this ticket.</p>`;
  return parts
    .map((part) => {
      const where = [part.market, part.game || recordedTeam(board, date, part.name)].filter(Boolean).join(" · ");
      const score = part.score ? `<div class="sub">${esc(part.score)}</div>` : "";
      const badge = part.result ? `<span class="res ${esc(part.result)}">${esc(resultWord(part.result))}</span>` : "";
      return `<div class="part"><div><b>${esc(part.name)}</b>${where ? `<div class="sub">${esc(where)}</div>` : ""}${score}</div>${badge}</div>`;
    })
    .join("");
}

function weekday(iso: string): string {
  const [year, month, date] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function scopeLine(state: AppState, board: Board, windowed: { from: string | null; to: string | null; starts: string | null }): string {
  const span = fileBounds(board.grades, board.series, state.statsSection);
  return historyScope({
    fileFirst: span.first,
    fileLast: span.last,
    from: windowed.from,
    to: windowed.to,
    range: state.statsFrom ? "14d" : state.profitRange,
    custom: Boolean(state.statsFrom && state.statsTo),
    clippedLabel: windowed.starts,
  });
}

function nightBlock(state: AppState, board: Board): string {
  const open = state.nightOpen;
  const summary = board.recap.summary.replace(" · graded tickets in the desk file", "");
  const tone = /^-|−/.test(board.recap.units.trim()) ? "L" : "W";
  const cards = open
    ? board.results
        .map((ticket) => {
          const legs = ticket.legs
            .map((leg, index) => {
              const capper = leg.name.match(/@[a-z0-9_]+/gi)?.join(", ") || leg.stat.match(/@[a-z0-9_]+/gi)?.join(", ") || "";
              const extra = `${leg.grade ? `<span class="grade">${esc(leg.grade)}</span>` : ""}${esc(leg.note)}`;
              const via = capper ? `<div class="via">via ${esc(capper)}</div>` : "";
              const clv = leg.clvPct == null ? "" : `<div class="stamp clvchip ${leg.clvPct > 0 ? "W" : leg.clvPct < 0 ? "L" : ""}">${esc(signedPct(leg.clvPct))} CLV</div>`;
              const close = leg.beatClose == null ? "" : `<div class="sub clv ${leg.beatClose ? "W" : "L"}">${leg.beatClose ? "✓ Beat close" : "✗ Missed close"}</div>`;
              const outcome = `<span class="res ${leg.result}">${leg.result === "W" ? "Won" : leg.result === "L" ? "Lost" : esc(leg.result)}</span>`;
              if (!leg.ticket) {
                return `<div class="leg"><div><b>${esc(leg.name)}</b><div class="sub">${esc(leg.stat)}</div><div>${extra}</div>${via}${clv}${close}</div>${outcome}</div>`;
              }
              const key = `${ticket.id}|${index}`;
              const open = state.openTickets.has(key);
              return `<div class="leg ticketleg"><button type="button" class="ticketbtn" data-act="ticket-legs" data-key="${esc(key)}" aria-expanded="${open}"><span class="car">${open ? "▾" : "▸"}</span><span><b>${esc(leg.name)}</b><div class="sub">${esc(leg.stat)}</div></span>${outcome}</button>${open ? partBlock(leg.parts, board, leg.date || "") : ""}<div>${extra}</div>${via}${clv}${close}</div>`;
            })
            .join("");
          return `<section class="ticket"><header><div><h3>${esc(ticket.title)}</h3><div class="sub">${esc(ticket.meta)}</div></div><span style="display:flex;align-items:center;gap:6px">${mascot(ticket.mood, 40)}<span class="res ${ticket.result}">${ticket.result === "W" ? "Won" : ticket.result === "L" ? "Lost" : "Void"}</span></span></header>${legs}<div class="tfoot"><button type="button" class="btn share" data-act="share" data-id="${esc(ticket.id)}" data-settled="1">Share as image</button></div></section>`;
        })
        .join("")
    : "";
  const fbRows = open
    ? [...board.fbLegs].reverse().map((leg) => `<tr><td>${esc(leg.date)} ${esc(leg.player)} <span class="sub">${esc(leg.team)} ${esc(leg.odds)}</span>${leg.note ? `<div class="sub">${esc(leg.note)}</div>` : ""}</td><td class="${leg.hit === "W" ? "W" : leg.hit === "L" ? "L" : ""}">${esc(leg.hit || "—")}</td></tr>`).join("")
    : "";
  const fb = open && board.fbLegs.length ? `<section class="ticket"><header><div><h3>First Blood legs</h3><div class="sub">${esc(board.fbNote || "Per-leg tracking. Not counted in the official win-loss.")}</div></div></header><table class="tbl">${fbRows}</table></section>` : "";
  const empty = open && !cards && !fb ? `<p class="empty">No graded night in this file.</p>` : "";
  return `<section class="night"><button type="button" class="nighthead" data-act="night-toggle" aria-expanded="${open}" aria-label="Yesterday’s Results, ${esc(board.recap.when)}, ${esc(summary)}, ${esc(board.recap.units)}"><span class="nighttop"><b>Yesterday’s Results</b><span class="car">${open ? "▾" : "▸"}</span></span><span class="nightmeta">${esc(board.recap.when)} · ${esc(summary)} · <b class="${tone}">${esc(board.recap.units)}</b></span></button><p class="sub nightnote">Latest graded night in this file, ${esc(board.recap.when)}. The date filter below does not hide it.</p>${open ? `<div class="nightbody">${cards}${fb}${empty}</div>` : ""}</section>`;
}

function gradeHits(state: AppState, board: Board, rows: GradeMark[], prefix: string): string {
  return rows
    .map((row, index) => {
      const units = `${formatSigned(row.units, 2)}u`;
      const body = `<b>${esc(row.play || row.detail || row.prop)}</b><div class="sub">${esc(weekday(row.date))} · ${esc(displayCat(row.cat))} · ${esc(units)}</div>${row.capper ? `<div class="via">via ${esc(row.capper)}</div>` : ""}`;
      const outcome = `<span class="res ${row.win ? "W" : "L"}">${row.win ? "Won" : "Lost"}</span>`;
      if (!row.ticket) return `<article class="hit">${outcome}<div>${body}</div></article>`;
      const ticketKey = `grade|${prefix}|${index}`;
      const ticketOpen = state.openTickets.has(ticketKey);
      return `<article class="hit ticketleg"><button type="button" class="ticketbtn" data-act="ticket-legs" data-key="${esc(ticketKey)}" aria-expanded="${ticketOpen}"><span class="car">${ticketOpen ? "▾" : "▸"}</span><span>${body}</span>${outcome}</button>${ticketOpen ? partBlock(row.parts, board, row.date) : ""}</article>`;
    })
    .join("");
}

function results(state: AppState, board: Board): string {
  const windowed = chartWindow(board, state.profitRange, state.statsFrom, state.statsTo, state.statsSection);
  const head = `<div class="hdr"><h1 style="font-size:1.75rem">Results</h1><button type="button" class="stdchip" data-act="standings" data-from="results">Standings</button></div><div class="priv">🔒 Only you can see units and win rate</div>`;
  if (!board.series.length && !board.grades.length && !board.clv && !board.results.length) return `${head}${nightBlock(state, board)}<p class="empty">No data yet</p>`;
  const four = windowed.rings.slice(0, 4).map((ring) => ringSvg(ring.pct, ring.label)).join("");
  return `${head}
${nightBlock(state, board)}
${statsCalendar(state, board, windowed.from, windowed.to)}
<div class="ranges" role="tablist" aria-label="Date range in this file">${rangeControl(state)}</div>
<p class="sub scope">${esc(scopeLine(state, board, windowed))}</p>
<nav class="scroller sport wrap" aria-label="Section">${statsSections(state)}</nav>
<div class="card"><h2>Profit</h2><div class="sub">${esc(windowed.headline)}</div><div class="sub">${esc(windowed.note)}</div>${chartSvg(windowed.points)}</div>
${four ? `<div class="card"><div class="rings">${four}</div></div>` : ""}
${statsSports(state, board, windowed.from, windowed.to, (rows, prefix) => gradeHits(state, board, rows, prefix))}
${clvCard(board, windowed.from, windowed.to, state.statsSection)}`;
}

function cappers(state: AppState, board: Board): string {
  const group = (name: string, items: typeof board.cappers) => {
    const blocks = items
      .map((capper) => {
        const plays = capper.plays.length
          ? capper.plays.map((play) => renderPlay(play, state.book, state.selected, !listedOn(play, state.book), playTracker(board, state, capper.id, play, state.book))).join("")
          : `<p class="empty">${esc(capper.note ?? "No play.")}</p>`;
        const off = capper.plays.some((play) => !listedOn(play, state.book));
        const body = off && capper.plays.length && capper.plays.every((play) => !listedOn(play, state.book))
          ? `<details class="off" open><summary>1 play not on ${bookCode(state.book)}, tap to view ▾</summary>${plays}</details>`
          : plays;
        return `<section class="ticket"><header><div><h3>${esc(capper.name)} <button type="button" class="info" data-act="rules" data-id="cappers" aria-label="Rules">i</button></h3><div class="sub">${esc(capper.record)}</div></div></header>${body}</section>`;
      })
      .join("");
    return `<h2 class="grouph">${name}</h2>${blocks}`;
  };
  if (!board.cappers.length) return `<h1 style="font-size:1.75rem">Cappers</h1>${bookToggle(state.book)}<p class="empty">No data yet</p>`;
  const withPlays = board.cappers.filter((capper) => capper.plays.length);
  const quiet = board.cappers.filter((capper) => !capper.plays.length).map((capper) => capper.name);
  const note = quiet.length ? `<p class="sub">No play today: ${esc(quiet.join(", "))}. Those names are still in the file.</p>` : "";
  const body = withPlays.length ? group("Cappers", withPlays) : `<p class="empty">No data yet</p>`;
  return `<h1 style="font-size:1.75rem">Cappers</h1><div class="sub" style="margin-bottom:8px">${withPlays.length} with a play today · every play stays · ${bookName(state.book)} view</div>${bookToggle(state.book)}${note}${body}`;
}

function signedPct(n: number): string {
  const text = Math.abs(n).toFixed(2);
  if (n > 0) return `+${text}%`;
  if (n < 0) return `−${text}%`;
  return `${text}%`;
}

function clvCard(board: Board, from: string | null = null, to: string | null = null, section = "all"): string {
  const clv = board.clv;
  if (!clv) return "";
  const playsInRange = clv.plays.filter((play) => {
    if (from && play.date < from) return false;
    if (to && play.date > to) return false;
    return sectionMatch(play.section, section);
  });
  const scoped = from || section !== "all";
  const count = scoped ? playsInRange.length : clv.count;
  const beat = scoped ? playsInRange.filter((play) => play.clvPct > 0).length : clv.beat;
  const avg = scoped ? (playsInRange.length ? playsInRange.reduce((sum, play) => sum + play.clvPct, 0) / playsInRange.length : null) : clv.avg;
  const beatPct = scoped ? (playsInRange.length && beat != null ? Math.round((beat / playsInRange.length) * 1000) / 10 : null) : clv.beatPct;
  const grouped = new Map<string, { count: number; beat: number; sum: number }>();
  for (const play of scoped ? playsInRange : []) {
    const bucket = grouped.get(play.section) ?? { count: 0, beat: 0, sum: 0 };
    bucket.count += 1;
    if (play.clvPct > 0) bucket.beat += 1;
    bucket.sum += play.clvPct;
    grouped.set(play.section, bucket);
  }
  const sectionRows = scoped
    ? [...grouped.entries()].map(([name, bucket]) => ({ name, count: bucket.count, beat: bucket.beat, beatPct: bucket.count ? Math.round((bucket.beat / bucket.count) * 1000) / 10 : 0, avg: bucket.count ? bucket.sum / bucket.count : 0 }))
    : clv.sections;
  const recent = (scoped ? [...playsInRange].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12) : clv.recent);
  const sections = sectionRows
    .map(
      (row) =>
        `<tr><td>${esc(row.name)}</td><td class="sub">${row.beat} of ${row.count}</td><td>${row.beatPct}%</td><td class="${row.avg > 0 ? "W" : row.avg < 0 ? "L" : ""}">${esc(signedPct(row.avg))}</td></tr>`,
    )
    .join("");
  const plays = recent
    .map((play) => {
      const line = play.postedLine || play.closeLine ? ` · line ${esc(play.postedLine ?? "—")} → ${esc(play.closeLine ?? "—")}` : "";
      return `<tr><td>${esc(play.pick)}<div class="sub">${esc(play.section)} · ${esc(play.postedOdds || "—")} → ${esc(play.closeOdds || "—")}${line}</div></td><td class="${play.clvPct > 0 ? "W" : play.clvPct < 0 ? "L" : ""}">${esc(signedPct(play.clvPct))}</td></tr>`;
    })
    .join("");
  const beatHtml = beatPct == null ? "" : `<div><div class="big" style="font-size:1.75rem">${beatPct}%</div><div class="sub">beat the close${beat != null ? ` · ${beat} of ${count}` : ""}</div></div>`;
  const avgHtml = avg == null ? "" : `<div><div class="big ${avg > 0 ? "W" : avg < 0 ? "L" : ""}" style="font-size:1.75rem">${esc(signedPct(avg))}</div><div class="sub">average CLV</div></div>`;
  const built = clv.built ? `<p class="stamp">Built ${esc(clv.built)}</p>` : "";
  const stale = clv.stale ? `<p class="stamp">CLV data may be stale</p>` : "";
  const empty = scoped && !playsInRange.length ? `<p class="empty">No posted closes in this range.</p>` : "";
  return `<div class="card"><h2>Closing line value</h2><div class="priv">🔒 Only you can see this</div><div class="sub">How often the posted line beat the closing line. From the desk file.</div>${built}${stale}<div class="split">${beatHtml}${avgHtml}</div>${empty}<table class="tbl"><tr><th>Section</th><th>Beat</th><th></th><th>Avg</th></tr>${sections}</table><h3 style="margin:12px 0 4px">Recent closes</h3><table class="tbl">${plays}</table></div>`;
}

function standingsView(state: AppState, board: Board): string {
  const league = board.standings.leagues[state.league];
  const tabs = LEAGUES.map(
    (id) => `<button type="button" class="${id === state.league ? "on" : ""}" data-act="league" data-key="${id}">${esc(sportLabel(id))}</button>`,
  ).join("");
  const ncaab = state.league === "NCAAB" && (league?.groups.length ?? 0) > 1;
  const selectedName = league?.groups.some((group) => group.name === state.conference) ? state.conference : league?.groups[0]?.name ?? "";
  const shown = ncaab ? (league?.groups ?? []).filter((group) => group.name === selectedName) : league?.groups ?? [];
  const picker = ncaab
    ? `<label class="confpick">Conference<select data-act="conference">${(league?.groups ?? []).map((group) => `<option value="${esc(group.name)}"${group.name === selectedName ? " selected" : ""}>${esc(group.name)}</option>`).join("")}</select></label>`
    : "";
  const games = (league?.games ?? [])
    .map((game) => `<div class="sub">${esc(game.away)} @ ${esc(game.home)}${game.when ? ` · ${esc(game.when)}` : ""}</div>`)
    .join("");
  const gameBlock = games ? `<div class="sub" style="margin-top:8px"><b>Games</b></div>${games}` : "";
  const tables = shown
    .map((group) => {
      if (!group.rows.length) return `<p class="empty">${esc(group.name)}</p>`;
      const head = group.columns.map((column) => `<th>${esc(column)}</th>`).join("");
      const rows = group.rows
        .map((row) => {
          const you = board.stars.has(row.abbr);
          const name = row.label ? `${row.abbr} ${row.label}` : row.abbr;
          const cells = row.cells
            .map((cell) => {
              const klass = /^\+\d/.test(cell) ? "pos" : /^-\d/.test(cell) ? "neg" : "";
              return `<td class="${klass}">${esc(cell)}</td>`;
            })
            .join("");
          return `<tr class="${you ? "you" : ""}"><td>${row.rank}. <b>${esc(name)}</b>${you ? " ★" : ""}</td>${cells}</tr>`;
        })
        .join("");
      return `<div class="sub" style="margin:10px 0 2px"><b>${esc(group.name)}</b></div><div class="sx"><table class="ftbl"><tr><th>Team</th>${head}</tr>${rows}</table></div>`;
    })
    .join("");
  const when = board.standingsUpdated ? `<p class="stamp">${esc(board.standingsUpdated)}</p>` : "";
  const body = tables || `<p class="empty">No data yet</p>`;
  const back = state.standingsFrom === "stats" ? "results" : state.standingsFrom;
  return `<button type="button" class="back" data-act="nav" data-view="${back}">‹ Back</button><h1 style="font-size:1.75rem">Standings</h1>${when}<div class="sub">Six sports · ★ = a team on today's card · swipe tables sideways; team column stays put</div><div class="sub" style="margin-bottom:6px">${esc(league?.note ?? "")}</div><div class="lgtabs" role="tablist">${tabs}</div>${picker}${gameBlock}${body}`;
}

function sharePreview(card: ShareCard): string {
  const badge = card.result === "LOST" ? "LOST" : card.result === "WON" ? "WON" : "PENDING";
  return `<div class="sharecard"><div class="sc-top"><span>${esc(card.title)}</span><span class="sc-res ${card.result === "LOST" ? "LOST" : ""}">${badge}</span></div><div class="sc-big">${esc(card.odds ?? `${card.legs.length} legs`)} <small>· ${card.legs.length} legs</small></div><ul>${card.legs.map((leg) => `<li><span>${esc(leg.mark)} ${esc(leg.name)}</span><b>${esc(leg.detail)}</b></li>`).join("")}</ul><div class="sc-foot">${esc(card.foot)}</div></div>`;
}

export function cardForShare(state: AppState, board: Board): ShareCard | null {
  if (!state.sheet || state.sheet.kind !== "share") return null;
  const ticketId = state.sheet.ticketId;
  if (state.sheet.settled) {
    const found = board.results.find((item) => item.id === ticketId);
    return found ? shareFromSettled(found, `${board.recap.when} · ParlayBOT`) : null;
  }
  const ticket = board.tickets.find((item) => item.id === ticketId);
  return ticket ? shareFromPending(ticket, state.book, `${board.dateLabel} · ParlayBOT`) : null;
}

export function renderSheet(state: AppState, board: Board): string {
  if (!state.sheet) return "";
  if (state.sheet.kind === "settings") {
    const size = (key: AppState["text"], label: string, font: string) =>
      `<button type="button" class="${state.text === key ? "on" : ""}" style="font-size:${font}" data-act="text" data-size="${key}">${label}</button>`;
    return `<div class="sheetback" data-act="close"><div class="sheet"><div class="grab"></div><h2>Settings</h2>
<div class="srow"><b>Book</b><div class="toggle"><button type="button" class="${state.book === "hr" ? "on" : ""}" data-act="book" data-book="hr">Hard Rock</button><button type="button" class="${state.book === "dk" ? "on" : ""}" data-act="book" data-book="dk">DraftKings</button></div></div>
<div class="srow"><b>Theme</b><div class="toggle"><button type="button" class="${state.theme === "night" ? "on" : ""}" data-act="theme" data-theme="night">Night</button><button type="button" class="${state.theme === "day" ? "on" : ""}" data-act="theme" data-theme="day">Day</button></div></div>
<div class="srow"><b>Text size</b><div class="toggle">${size("md", "A", "1rem")}${size("lg", "A", "1.25rem")}${size("xl", "A", "1.5rem")}</div></div>
<h3>Phone alerts</h3>
<p class="sub" id="push-status" role="status">${esc(pushStatusText(state))}</p>
${state.pushDelivery === "standalone" ? `<p class="sub">On iPhone, add ParlayBOT to your Home Screen, open that icon, then turn Phone alerts on.</p>` : ""}
${pushRow("Phone alerts", "Ticket locks, final grades & live NFL red-zone / TD alerts", state.pushDelivery === "on", "all")}
${state.pushDelivery === "on" ? `<button type="button" class="btn share pushtest" data-act="push-test">Send test / re-sync</button>` : ""}
<p class="sub">A confirmation alert arrives in about a minute. Alerts never include profit or units.</p>
${board.uiBuild ? `<p class="stamp about">${esc(board.uiBuild)}</p>` : ""}
<div class="tfoot"><button type="button" class="btn share" data-act="close">Close</button></div></div></div>`;
  }
  if (state.sheet.kind === "rules") {
    const sheet = state.sheet;
    const ticket = board.tickets.find((item) => item.id === sheet.ticketId) ?? (state.view === "alt-layout" ? findAltPreviewTicket(sheet.ticketId) : undefined);
    const rules = ticket?.rules ?? ["No rules sheet for this product."];
    return `<div class="sheetback" data-act="close"><div class="sheet"><div class="grab"></div><h2>${esc(ticket?.title ?? "Rules")}</h2><ul>${rules.map((rule) => `<li>${esc(rule)}</li>`).join("")}</ul><div class="tfoot"><button type="button" class="btn share" data-act="close">Close</button></div></div></div>`;
  }
  const card = cardForShare(state, board);
  if (!card || !shareCardIsPrivate(card)) {
    return `<div class="sheetback" data-act="close"><div class="sheet"><h2>Share</h2><p>This ticket can't be shared.</p><button type="button" class="btn share" data-act="close">Close</button></div></div>`;
  }
  return `<div class="sheetback" data-act="close"><div class="sheet"><div class="grab"></div><h2>Share ticket</h2><div class="sub">Friends see the legs, odds and result. No profit or bankroll.</div>${sharePreview(card)}<div class="tfoot"><button type="button" class="btn share" data-act="save-share">Save image</button><button type="button" class="btn hr" data-act="send-share">Send to friends</button></div></div></div>`;
}

function pushStatusText(state: AppState): string {
  if (state.pushDelivery === "unsupported") return "This browser can't receive closed-app alerts.";
  if (state.pushDelivery === "standalone") return "On iPhone, add ParlayBOT to your Home Screen, open that icon, then turn alerts on.";
  if (state.pushDelivery === "denied") return "Notifications are blocked. Allow them for ParlayBOT in system settings.";
  if (state.pushDelivery === "unavailable") return "Alert delivery isn't set up yet, so this phone will not be notified.";
  if (state.pushDelivery === "on") return "On. A confirmation alert arrives in about a minute. No profit or units are included.";
  if (state.pushDelivery === "unknown") return "Checking whether this phone can receive alerts.";
  return "Off. Turn on phone alerts for ticket locks, final grades, and live NFL red-zone / TD alerts.";
}

function pushRow(title: string, sub: string, on: boolean, kind: string): string {
  return `<div class="srow"><div><b>${esc(title)}</b><div class="sub">${esc(sub)}</div></div><button type="button" class="sw ${on ? "" : "no"}" data-act="push" data-kind="${kind}" aria-pressed="${on}" aria-label="${esc(title)}, ${on ? "on" : "off"}"></button></div>`;
}

export function renderSelbar(state: AppState, board: Board): string {
  const plays = [...state.selected]
    .map((id) => findPlay(board, id) ?? (state.view === "alt-layout" ? findAltPreviewPlay(id) : undefined))
    .filter((play): play is Play => !!play && canOpen(play, state.book));
  if (!plays.length) return `<div class="selbar" id="sel" hidden></div>`;
  const label = state.book === "hr" ? `Load ${plays.length} in Hard Rock` : `Open ${plays.length} selected in DraftKings`;
  return `<div class="selbar" id="sel"><button type="button" class="btn ${state.book}" data-act="open" data-scope="selected">${label}</button></div>`;
}

export function render(state: AppState, board: Board): string {
  return `${renderPage(state, board)}${renderSelbar(state, board)}${renderSheet(state, board)}`;
}
