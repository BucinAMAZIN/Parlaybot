import type { Board } from "../data/board.ts";
import { findPlay } from "../data/board.ts";
import { LEAGUES } from "../data/standings.ts";
import type { LiveGame, LiveLeg, Play, SeriesPoint, Ticket, TicketPart } from "../data/types.ts";
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
  renderPlay,
  renderWhy,
  ringSvg,
} from "./bits.ts";
import { sectionMatch, sportTitle } from "../data/gradeLabels.ts";
import { noteVisible, sportCounts } from "../lib/cardFilter.ts";
import { matchingPlays, statsCalendar, statsSections, statsSports } from "./statsScreen.ts";
import { SPORT_ORDER, sportLabel } from "../lib/sport.ts";
import type { AppState, SportFilter, ViewId } from "./state.ts";

const NAV: [ViewId, string][] = [
  ["today", "Today"],
  ["live", "Live"],
  ["results", "Results"],
  ["cappers", "Cappers"],
];

const PRODUCTS: [string, string][] = [
  ["heist", "THE HEIST"],
  ["safe", "Safe +100"],
  ["potd", "POTD"],
  ["parlay", "Parlay +100"],
  ["edge", "Edge"],
  ["legday", "LEG DAY"],
  ["first", "First Blood · for fun"],
  ["nascar", "NASCAR"],
  ["props", "Prop Scout"],
  ["cappers", "Cappers"],
];

function sportOk(sport: Play["sport"], filter: SportFilter): boolean {
  return filter === "All" || sport === filter;
}

function sectionPlays(board: Board, product: string | null): Play[] {
  return board.tickets.flatMap((ticket) => (product && ticket.productKey !== product ? [] : ticket.plays));
}

export function sportsFor(board: Board, product: string | null): { sport: string; count: number }[] {
  const present = sportCounts(sectionPlays(board, null), board.notices, null);
  const scoped = sportCounts(sectionPlays(board, product), board.notices, product);
  return SPORT_ORDER.filter((sport) => present.has(sport) || scoped.has(sport)).map((sport) => ({ sport, count: scoped.get(sport) ?? 0 }));
}

export function visibleTickets(board: Board, state: AppState): Ticket[] {
  const out: Ticket[] = [];
  for (const ticket of board.tickets) {
    let plays = ticket.plays.filter((play) => sportOk(play.sport, state.sport));
    if (state.product === "nascar") plays = plays.filter((play) => play.sport === "NASCAR");
    else if (state.product && ticket.productKey !== state.product) continue;
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

function renderTicket(ticket: Ticket, state: AppState): string {
  const book = ticket.productKey === "first" ? "hr" : state.book;
  const on = ticket.plays.filter((play) => listedOn(play, book));
  const off = ticket.plays.filter((play) => !listedOn(play, book));
  const who = bookCode(book);
  const offHtml = off.length
    ? `<details class="off"><summary>${off.length} play${off.length === 1 ? "" : "s"} not on ${who}, tap to view ▾</summary>${off.map((play) => renderPlay(play, book, state.selected, true)).join("")}</details>`
    : "";
  const openLegs = on.filter((play) => canOpen(play, book));
  const foot = off.length
    ? `<span class="na">${on.length} of ${on.length + off.length} legs on ${who}</span>`
    : openLegs.length
      ? `<button type="button" class="btn ${book}" data-act="open" data-scope="ticket" data-id="${esc(ticket.id)}" data-book="${book}">Whole ticket in ${bookName(book)}</button>`
      : `<span class="na">No open legs</span>`;
  const share = ticket.share
    ? `<button type="button" class="btn share" data-act="share" data-id="${esc(ticket.id)}" data-settled="0">Share as image</button>`
    : "";
  const badge =
    ticket.badge === "fun"
      ? `<span class="tag un">FOR FUN</span>`
      : ticket.badge === "cappers"
          ? `<span class="tag un">CAPPERS</span>`
          : "";
  const stamp = ticket.stamp ? `<div class="stamp">${esc(ticket.stamp)}</div>` : "";
  return `<section class="ticket" id="ticket-${esc(ticket.id)}"><header><div><h3>${esc(ticket.title)} ${badge}<button type="button" class="info" data-act="rules" data-id="${esc(ticket.id)}" aria-label="Rules for ${esc(ticket.title)}">i</button></h3>${stamp}<div class="sub">${esc(ticket.meta)}</div></div>${share}</header>${on.map((play) => renderPlay(play, book, state.selected)).join("")}${offHtml}<div class="tfoot">${foot}</div></section>`;
}

function productChips(board: Board, state: AppState): string {
  const buttons = PRODUCTS.map(([key, label]) => {
    const plays = board.tickets.filter((ticket) => ticket.productKey === key).flatMap((ticket) => ticket.plays);
    const total = plays.length;
    const filtered = state.sport === "All" ? total : plays.filter((play) => play.sport === state.sport).length;
    const noted = board.notices.some((note) => note.section === key);
    if (!total && !noted) return "";
    const on = state.product === key ? "on" : "";
    const dim = filtered === 0 ? " dim" : "";
    return `<button type="button" class="${on}${dim}" data-act="product" data-key="${key}">${label}<i>${filtered}</i></button>`;
  }).join("");
  const sports = sportsFor(board, state.product);
  const sportButtons = [`<button type="button" class="${state.sport === "All" ? "on" : ""}" data-act="sport" data-key="All">All</button>`]
    .concat(
      sports.map(({ sport, count }) => {
        const dim = count === 0 ? " dim" : "";
        return `<button type="button" class="${state.sport === sport ? "on" : ""}${dim}" data-act="sport" data-key="${esc(sport)}">${esc(sportLabel(sport))}<i>${count}</i></button>`;
      }),
    )
    .join("");
  return `<nav class="scroller" aria-label="Products">${buttons}</nav><nav class="scroller sport" aria-label="Sport">${sportButtons}</nav>`;
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
    if (!sectionMatch(grade.cat, section)) continue;
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
  const series = section === "all" ? board.series : sectionSeries(board, section);
  if (!series.length) return { points: [], headline: "No data yet", note: "", rings: [], ringsNote: "", from: null, to: null, starts: null };
  const preset = sliceHistory(series, range);
  const windowed = customFrom && customTo
    ? { points: series.filter((point) => point.iso && point.iso >= customFrom && point.iso <= customTo), from: customFrom, to: customTo, starts: null as string | null }
    : preset;
  const grades = windowGrades(board.grades.filter((grade) => sectionMatch(grade.cat, section)), windowed.from, windowed.to);
  const delta = unitChange(series, windowed.points);
  const rate = windowWinRate(grades);
  const headline = delta == null ? "No chart in this file" : `${formatSigned(delta, 2)}u · ${rate == null ? "no graded tickets in this range" : `${rate}% win rate`}`;
  const note = windowed.starts ? `History starts ${windowed.starts}.` : "Running units from the desk chart.";
  const ringsNote = windowed.starts ? `History starts ${windowed.starts}. Win rates use the graded tickets on these dates.` : "Win rates use the graded tickets on these dates.";
  return { points: windowed.points, headline, note, rings: windowRings(grades), ringsNote, from: windowed.from, to: windowed.to, starts: windowed.starts };
}

export function renderPage(state: AppState, board: Board): string {
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
  const sections = ["heist", "safe", "potd", "parlay", "edge", "legday", "first", "lotto", "props", "cappers"];
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
      const bodies = mine.map((ticket) => renderTicket(ticket, state)).join("");
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
  const lock = board.lockCheck && gameList.length ? `<span class="stamp">${esc(board.lockCheck)}</span>` : "";
  const gameHead = gameList.length
    ? `<div class="gameslot"><button type="button" class="gameshead" data-act="games-toggle" aria-expanded="${state.gamesOpen ? "true" : "false"}"><b>Today's Games</b><span class="sub">· ${gameList.length}</span>${lock}<span class="car">${state.gamesOpen ? "▴" : "▾"}</span></button>${state.gamesOpen ? gamesPanel(gameList, state) : ""}</div>`
    : "";
  const right = `${gameHead}${productChips(board, state)}<div class="sub" style="margin:-4px 0 10px">${bookNote}</div>${blocks || `<p class="empty">${board.tickets.length ? "No plays in this filter." : "No data yet"}</p>`}`;
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
  const width = Math.max(0, Math.min(100, (leg.current / leg.line) * 100));
  const face = pace.mood ? mascot(pace.mood, 36) : `<span class="mascot" style="width:36px;height:36px"></span>`;
  const current = Number.isInteger(leg.current) ? String(leg.current) : String(leg.current);
  const line = Number.isInteger(leg.line) ? String(leg.line) : String(leg.line);
  return `<div class="lv-leg">${face}<div class="lv-main"><div class="lv-row"><b>${esc(leg.name)}</b><span>${current}/${line} ${esc(leg.unit)}</span></div><div class="lv-bar"><i style="width:${width.toFixed(0)}%;background:${pace.color}"></i></div><div class="lv-row"><span class="pace p-${leg.pace}">${esc(pace.label)}</span><span class="sub">${esc(leg.source)}</span></div>${renderWhy(leg.why)}</div></div>`;
}

function renderGame(game: LiveGame, state: AppState, withLegs: boolean): string {
  const score = game.pre ? `${game.away} @ ${game.home}` : `${game.away} ${game.awayScore} – ${game.homeScore} ${game.home}`;
  const clock = `<span class="clock${game.pre || game.final ? " pre" : ""}">${game.pre || game.final ? "" : "● "}${esc(game.clock)}</span>`;
  const ctx = `<div class="ctx"><span class="tm"><b>${esc(game.awaySide.abbr)}</b> ${esc(game.awaySide.record)} · ${esc(game.awaySide.standing)}</span><span class="vs">vs</span><span class="tm"><b>${esc(game.homeSide.abbr)}</b> ${esc(game.homeSide.record)} · ${esc(game.homeSide.standing)}</span></div>`;
  const panel = state.gamePanel[game.id] ?? "feed";
  const open = state.openGames.has(game.id) ? "open" : "";
  const legs = withLegs ? game.legs.map(renderLiveLeg).join("") : "";
  return `<section class="game"><details class="gx" data-game="${esc(game.id)}" ${open}><summary><div class="ghead"><div><div class="score">${esc(score)}</div>${ctx}</div>${clock}</div><div class="tap">▾ Box · VS</div></summary>${renderGameBody(game, panel, state)}</details>${legs}</section>`;
}

function renderGameBody(game: LiveGame, panel: "feed" | "box" | "vs", state: AppState): string {
  const pills = (["feed", "box", "vs"] as const)
    .map((id) => {
      const label = id === "feed" ? "Feed" : id === "box" ? "Box score" : "Team VS";
      return `<button type="button" class="${panel === id ? "on" : ""}" data-act="panel" data-game="${esc(game.id)}" data-panel="${id}">${label}</button>`;
    })
    .join("");
  let body = "";
  if (panel === "feed") body = feedBody(game, state);
  else if (panel === "box") body = boxBody(game);
  else body = vsBody(game);
  const label = game.liveFeed?.real ? `<div class="sub">ESPN</div>` : "";
  return `<div class="feed"><div class="pills" style="margin-top:0">${pills}</div>${label}${body}</div>`;
}

function feedBody(game: LiveGame, _state: AppState): string {
  const items = game.liveFeed?.real ? game.liveFeed.pbp : [];
  if (!items.length) return `<p class="empty">No data yet</p>`;
  return items
    .map(
      (item) =>
        `<div class="pbp"><span class="lg">${esc(item.team)}</span><div class="pm"><b>${esc(item.event)}</b><div class="sub">${esc(item.when)}</div><div>${esc(item.desc)}</div></div><div class="ps">${esc(item.score)}</div></div>`,
    )
    .join("");
}

function boxBody(game: LiveGame): string {
  const yours = game.legs
    .map((leg) => {
      const pace = PACE[leg.pace];
      const width = Math.max(0, Math.min(100, (leg.current / leg.line) * 100));
      const face = pace.mood ? mascot(pace.mood, 34) : "";
      return `<div class="lv-leg">${face}<div class="lv-main"><div class="lv-row"><b>${esc(leg.name)}</b><span>${leg.current}/${leg.line} ${esc(leg.unit)}</span></div><div class="lv-bar"><i style="width:${width.toFixed(0)}%;background:${pace.color}"></i></div></div></div>`;
    })
    .join("");
  if (game.liveFeed?.real) {
    const box = game.liveFeed.box;
    if (!box.rows.length) return `<div class="sub"><b>Your players</b> · 🔒 Only you can see this</div>${yours}<p class="empty">Player box score is not posted on ESPN yet.</p>`;
    const head = box.headers.map((header) => `<th>${esc(header)}</th>`).join("");
    const body = box.rows
      .map((row) =>
        row.header && row.cells.length === 1
          ? `<tr class="tmh"><td colspan="${Math.max(box.headers.length, 1)}">${esc(row.header)}</td></tr>`
          : `<tr class="${row.mine ? "mine" : ""}"><td>${row.mine ? "★ " : ""}${esc(row.cells[0] ?? "")}</td>${row.cells.slice(1).map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`,
      )
      .join("");
    return `<div class="sub"><b>Your players</b> · 🔒 Only you can see this</div>${yours}<table class="bx"><tr>${head}</tr>${body}</table>`;
  }
  return `${yours}<p class="empty">No data yet</p>`;
}

function vsBody(game: LiveGame): string {
  if (game.liveFeed?.real) {
    const rows = game.liveFeed.teamStats;
    if (!rows.length) return `<p class="empty">No data yet</p>`;
    const body = rows
      .map((row) => `<tr><td>${esc(row.name)}</td><td>${esc(row.away)}</td><td>${esc(row.home)}</td></tr>`)
      .join("");
    const source = rowLooksRanked(rows) ? "Desk team ranks published in data.json" : "ESPN team stats. Values only — ranks are not invented.";
    const built = game.liveFeed?.built ? `<div class="stamp">${esc(game.liveFeed.built)}</div>` : "";
    return `<div class="sub">${source}</div>${built}<div class="vsh"><b>${esc(game.away)} <span class="sub">vs</span> ${esc(game.home)}</b></div><table class="vst"><tr><th>Stat</th><th>${esc(game.away)}</th><th>${esc(game.home)}</th></tr>${body}</table>`;
  }
  return `<p class="empty">No data yet</p>`;
}

function rowLooksRanked(rows: { away: string }[]): boolean {
  return rows.some((row) => row.away.startsWith("#"));
}

function live(state: AppState, board: Board): string {
  const bars = board.liveTickets
    .map((ticket) => {
      const pace = PACE[ticket.pace];
      const hits = ticket.legs.filter((leg) => leg === "hit").length;
      const face = pace.mood ? mascot(pace.mood, 44) : "";
      const segs = ticket.legs.map((leg) => `<i style="background:${PACE[leg].color}"></i>`).join("");
      return `<div class="tk">${face}<div class="lv-main"><div class="lv-row"><b>${esc(ticket.name)}</b><span>${hits}/${ticket.legs.length} legs</span></div><div class="tk-bar">${segs}</div><div class="lv-row"><span class="pace p-${ticket.pace}">${esc(pace.label)}</span><span class="sub">${esc(ticket.note)}</span></div></div></div>`;
    })
    .join("");
  const games = board.liveGames.map((game) => renderGame(game, state, true)).join("");
  const mood = board.liveMood;
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
  const updated = board.liveUpdated ? ` · ${esc(board.liveUpdated)}` : "";
  return `<h1 style="font-size:1.75rem">Live</h1><div class="sub">Your legs in games now${updated}</div>${lock}${moodBlock}<section class="game"><div class="sub"><b>Tickets</b></div>${bars || `<p class="empty">No data yet</p>`}</section>${games || `<p class="empty">No data yet</p>`}<div class="sub" style="margin:4px 0">${esc(board.liveNote)}</div><button type="button" class="linkrow" data-act="standings" data-from="live">Standings · NBA · NHL · NFL ›</button>`;
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
  return `<section class="night"><button type="button" class="nighthead" data-act="night-toggle" aria-expanded="${open}"><span class="nighttop"><b>Last night</b><span class="car">${open ? "▾" : "▸"}</span></span><span class="nightmeta">${esc(board.recap.when)} · ${esc(summary)} · <b class="${tone}">${esc(board.recap.units)}</b></span></button><p class="sub nightnote">Latest graded night in this file, ${esc(board.recap.when)}. The date filter below does not hide it.</p>${open ? `<div class="nightbody">${cards}${fb}${empty}</div>` : ""}</section>`;
}

function propList(state: AppState, board: Board, windowed: { from: string | null; to: string | null; starts: string | null }): string {
  const pick = state.resultsPick;
  if (!pick) return "";
  const grades = windowGrades(board.grades, windowed.from, windowed.to).filter((grade) => sectionMatch(grade.cat, state.statsSection));
  const rows = matchingPlays(grades, pick.sport, pick.prop, pick.alt);
  const wins = rows.filter((row) => row.win).length;
  const units = rows.reduce((sum, row) => sum + row.units, 0);
  const pct = rows.length ? Math.round((wins / rows.length) * 100) : 0;
  const byDate = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byDate.get(row.date) ?? [];
    list.push(row);
    byDate.set(row.date, list);
  }
  const groups = [...byDate.keys()].sort().reverse().map((date) => {
    const list = byDate.get(date) ?? [];
    const dayWins = list.filter((row) => row.win).length;
    const key = `${pick.sport}|${pick.prop}|${pick.alt ? "alt" : "reg"}|${date}`;
    const open = state.openResultDates.has(key);
    const items = list
      .map((row, index) => {
        const body = `<b>${esc(row.play || row.detail || row.prop)}</b><div class="sub">${esc(weekday(row.date))} · ${esc(row.cat)}</div>${row.capper ? `<div class="via">via ${esc(row.capper)}</div>` : ""}`;
        const outcome = `<span class="res ${row.win ? "W" : "L"}">${row.win ? "Won" : "Lost"}</span>`;
        if (!row.ticket) return `<article class="hit">${outcome}<div>${body}</div></article>`;
        const ticketKey = `grade|${key}|${index}`;
        const ticketOpen = state.openTickets.has(ticketKey);
        return `<article class="hit ticketleg"><button type="button" class="ticketbtn" data-act="ticket-legs" data-key="${esc(ticketKey)}" aria-expanded="${ticketOpen}"><span class="car">${ticketOpen ? "▾" : "▸"}</span><span>${body}</span>${outcome}</button>${ticketOpen ? partBlock(row.parts, board, row.date) : ""}</article>`;
      })
      .join("");
    return `<section class="dategrp"><button type="button" class="datehead" data-act="result-date" data-key="${esc(key)}" aria-expanded="${open}"><b>${esc(weekday(date))}</b><span>${dayWins}-${list.length - dayWins}</span><span class="car">${open ? "▾" : "▸"}</span></button>${open ? items : ""}</section>`;
  }).join("");
  const title = `${sportTitle(pick.sport)} · ${pick.prop}${pick.alt ? " Alt" : ""}`;
  const kind = pick.alt ? "Alt lines only. The same play in another product stays listed there too." : "Regular lines only. Alt lines stay on the Alt row, and the same play in another product stays listed there too.";
  const body = groups || `<p class="empty">No graded plays for this prop in the dates you picked. All dates shows every graded day in this file.</p>`;
  return `<button type="button" class="back" data-act="results-back">‹ Results</button><div class="hdr"><h1 style="font-size:1.75rem">${esc(title)}</h1><button type="button" class="stdchip" data-act="standings" data-from="results">Standings</button></div><div class="priv">🔒 Only you can see units and win rate</div><div class="ranges" role="tablist" aria-label="Date range in this file">${rangeControl(state)}</div><p class="sub">${rows.length} plays · ${wins}-${rows.length - wins} · ${esc(formatSigned(units, 2))}u · ${pct}%. ${esc(kind)} ${esc(scopeLine(state, board, windowed))}</p><nav class="scroller sport wrap" aria-label="Section">${statsSections(state)}</nav>${body}`;
}

function results(state: AppState, board: Board): string {
  const windowed = chartWindow(board, state.profitRange, state.statsFrom, state.statsTo, state.statsSection);
  const head = `<div class="hdr"><h1 style="font-size:1.75rem">Results</h1><button type="button" class="stdchip" data-act="standings" data-from="results">Standings</button></div><div class="priv">🔒 Only you can see units and win rate</div>`;
  if (state.resultsPick) return propList(state, board, windowed);
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
${statsSports(state, board, windowed.from, windowed.to)}
${clvCard(board, windowed.from, windowed.to, state.statsSection)}`;
}

function cappers(state: AppState, board: Board): string {
  const group = (name: string, items: typeof board.cappers) => {
    const blocks = items
      .map((capper) => {
        const plays = capper.plays.length
          ? capper.plays.map((play) => renderPlay(play, state.book, state.selected, !listedOn(play, state.book))).join("")
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
${pushRow("New picks", "When a new pick is added", state.pushDelivery === "on" && state.pushWant.picks, "picks")}
${pushRow("Ticket locks", "When a ticket locks", state.pushDelivery === "on" && state.pushWant.locks, "locks")}
${alertRow("Finals", "Saved on this phone only", state.alerts.finals, "finals")}
${alertRow("NFL red zone / TD", "Saved on this phone only", state.alerts.redzone, "redzone")}
${alertRow("Price moves on locked picks", "Saved on this phone only", state.alerts.price, "price")}
<p class="sub">Finals, red zone, and price switches do not send notifications.</p>
${board.uiBuild ? `<p class="stamp about">${esc(board.uiBuild)}</p>` : ""}
<div class="tfoot"><button type="button" class="btn share" data-act="close">Close</button></div></div></div>`;
  }
  if (state.sheet.kind === "rules") {
    const sheet = state.sheet;
    const ticket = board.tickets.find((item) => item.id === sheet.ticketId);
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
  if (state.pushDelivery === "on") return "On. Alerts can arrive while ParlayBOT is closed. No profit or units are included.";
  if (state.pushDelivery === "unknown") return "Checking whether this phone can receive alerts.";
  return "Off. Turn on new picks or ticket locks to subscribe this phone.";
}

function pushRow(title: string, sub: string, on: boolean, kind: string): string {
  return `<div class="srow"><div><b>${esc(title)}</b><div class="sub">${esc(sub)}</div></div><button type="button" class="sw ${on ? "" : "no"}" data-act="push" data-kind="${kind}" aria-pressed="${on}" aria-label="${esc(title)}, ${on ? "on" : "off"}"></button></div>`;
}

function alertRow(title: string, sub: string, on: boolean, key: string): string {
  return `<div class="srow"><div><b>${title}</b><div class="sub">${sub}</div></div><button type="button" class="sw ${on ? "" : "no"}" data-act="alert" data-key="${key}" aria-pressed="${on}" aria-label="${title}"></button></div>`;
}

export function renderSelbar(state: AppState, board: Board): string {
  const plays = [...state.selected]
    .map((id) => findPlay(board, id))
    .filter((play): play is Play => !!play && canOpen(play, state.book));
  if (!plays.length) return `<div class="selbar" id="sel" hidden></div>`;
  const label = state.book === "hr" ? `Load ${plays.length} in Hard Rock` : `Open ${plays.length} selected in DraftKings`;
  return `<div class="selbar" id="sel"><button type="button" class="btn ${state.book}" data-act="open" data-scope="selected">${label}</button></div>`;
}

export function render(state: AppState, board: Board): string {
  return `${renderPage(state, board)}${renderSelbar(state, board)}${renderSheet(state, board)}`;
}
