import type { Board } from "../data/board.ts";
import { findPlay } from "../data/board.ts";
import { edgeDates, presentEdgePick, tallyEdge } from "../data/presentEdgeFeed.ts";
import type { EdgePick } from "../data/adaptEdgePicks.ts";
import { LEAGUES, standings } from "../data/standings.ts";
import type { LiveGame, LiveLeg, Play, SeriesPoint, Ticket } from "../data/types.ts";
import { formatSigned, esc } from "../lib/format.ts";
import { shareCardIsPrivate, shareFromPending, shareFromSettled, type ShareCard } from "../lib/shareCard.ts";
import {
  PACE,
  asset,
  bookCode,
  bookName,
  canOpen,
  chartSvg,
  courtSvg,
  mascot,
  listedOn,
  renderPlay,
  renderWhy,
  ringSvg,
  rinkSvg,
} from "./bits.ts";
import type { AppState, SportFilter, ViewId } from "./state.ts";

const NAV: [ViewId, string][] = [
  ["today", "Today"],
  ["live", "Live"],
  ["results", "Results"],
  ["stats", "Stats"],
  ["cappers", "Cappers"],
];

const SPORTS: SportFilter[] = ["All", "NHL", "NBA", "NFL", "NCAA", "NASCAR"];

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

const GROUP_LABEL: Record<string, string> = {
  official: "Official",
  edge: "Edge",
  fun: "For fun",
  props: "Props",
  cappers: "Cappers",
};

function sportOk(sport: Play["sport"], filter: SportFilter): boolean {
  return filter === "All" || sport === filter;
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

function shell(active: ViewId, inner: string): string {
  const nav = NAV.map(
    ([id, label]) =>
      `<button type="button" class="${id === active ? "on" : ""}" data-act="nav" data-view="${id}">${label}${id === "live" ? `<i class="livedot">●</i>` : ""}</button>`,
  ).join("");
  return `<div class="samplebar">SAMPLE DATA — Edge feed rows are the attached fixture</div><div class="wrap"><header class="brand"><img class="logo" src="${asset("brand/parlaybot-header.png")}?v=visor" alt="ParlayBOT"><button type="button" class="gear" data-act="settings" aria-label="Settings">⚙</button></header><nav class="topnav">${nav}</nav>${inner}</div>`;
}

function bookToggle(book: AppState["book"]): string {
  return `<div class="book" role="tablist"><button type="button" class="hr ${book === "hr" ? "on" : ""}" data-act="book" data-book="hr">Hard Rock</button><button type="button" class="dk ${book === "dk" ? "on" : ""}" data-act="book" data-book="dk">DraftKings</button></div>`;
}

function renderTicket(ticket: Ticket, state: AppState): string {
  const book = state.book;
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
      ? `<button type="button" class="btn ${book}" data-act="open" data-scope="ticket" data-id="${esc(ticket.id)}">Whole ticket in ${bookName(book)}</button>`
      : `<span class="na">No open legs</span>`;
  const share = ticket.share
    ? `<button type="button" class="btn share" data-act="share" data-id="${esc(ticket.id)}" data-settled="0">Share as image</button>`
    : "";
  const badge =
    ticket.badge === "fun"
      ? `<span class="tag un">FOR FUN</span>`
      : ticket.badge === "fixture"
        ? `<span class="tag fx">FIXTURE</span>`
        : ticket.badge === "cappers"
          ? `<span class="tag un">CAPPERS</span>`
          : "";
  return `<section class="ticket" id="ticket-${esc(ticket.id)}"><header><div><h3>${esc(ticket.title)} ${badge}<button type="button" class="info" data-act="rules" data-id="${esc(ticket.id)}" aria-label="Rules for ${esc(ticket.title)}">i</button></h3><div class="sub">${esc(ticket.meta)}</div></div>${share}</header>${on.map((play) => renderPlay(play, book, state.selected)).join("")}${offHtml}<div class="tfoot">${foot}</div></section>`;
}

function productChips(board: Board, state: AppState): string {
  const buttons = PRODUCTS.map(([key, label]) => {
    const count =
      key === "nascar"
        ? board.tickets.reduce((sum, ticket) => sum + ticket.plays.filter((play) => play.sport === "NASCAR").length, 0)
        : board.tickets.reduce((sum, ticket) => sum + (ticket.productKey === key ? ticket.plays.length : 0), 0);
    if (!count) return "";
    const on = state.product === key ? "on" : "";
    return `<button type="button" class="${on}" data-act="product" data-key="${key}">${label}<i>${count}</i></button>`;
  }).join("");
  const sports = SPORTS.map(
    (sport) => `<button type="button" class="${state.sport === sport ? "on" : ""}" data-act="sport" data-key="${sport}">${sport}</button>`,
  ).join("");
  return `<nav class="scroller" aria-label="Products">${buttons}</nav><nav class="scroller sport" aria-label="Sport">${sports}</nav>`;
}

function recapCard(board: Board): string {
  const rows = board.recap.rows
    .map((row) => `<div class="rrow"><span>${esc(row.name)}</span><b class="${row.win ? "W" : "L"}">${esc(row.text)}</b></div>`)
    .join("");
  return `<div class="recap"><div class="priv">🔒 Only you can see this</div><div class="sub">${esc(board.recap.when)}</div><div class="big W">${esc(board.recap.units)}</div><div class="sub" style="margin-bottom:8px">${esc(board.recap.summary)}</div>${rows}<div style="margin-top:12px"><button type="button" class="btn share" data-act="nav" data-view="results">See results</button></div></div>`;
}

function sliceSeries(points: SeriesPoint[], range: AppState["profitRange"]): { points: SeriesPoint[]; headline: string; note: string } {
  if (range === "7d") {
    const slice = points.slice(-7);
    const before = points[points.length - 8]?.profit ?? slice[0].profit;
    const delta = slice[slice.length - 1].profit - before;
    return { points: slice, headline: `${formatSigned(delta)}u · ${slice[slice.length - 1].winRate}% wins`, note: "Change across the last 7 points of the sample series." };
  }
  const headline = "+9.4u · 62% wins";
  if (range === "season") return { points, headline, note: "Season view is this 14-day sample. A longer history is not in this build." };
  return { points, headline, note: "30-day toggle shows the 14-day sample that shipped with the card." };
}

export function renderPage(state: AppState, board: Board): string {
  if (state.view === "today") return shell("today", today(state, board));
  if (state.view === "live") return shell("live", live(state, board));
  if (state.view === "results") return shell("results", results(state, board));
  if (state.view === "stats") return shell("stats", stats(state, board));
  if (state.view === "cappers") return shell("cappers", cappers(state, board));
  return shell(state.standingsFrom === "stats" ? "stats" : "live", standingsView(state, board));
}

function today(state: AppState, board: Board): string {
  const windowed = sliceSeries(board.series, "30d");
  const rings = board.rings
    .slice(0, 4)
    .map((ring) => ringSvg(ring.pct, ring.label))
    .join("");
  const games = board.liveGames
    .filter((game) => game.id === "atl-nyk" || game.id === "okc-den")
    .map((game) => renderGame(game, state, false))
    .join("");
  const tickets = visibleTickets(board, state);
  const nascarAnchor = [...tickets].reverse().find((ticket) => ticket.plays.some((play) => play.sport === "NASCAR"))?.id;
  let lastGroup = "";
  const blocks = tickets
    .map((ticket) => {
      const label = GROUP_LABEL[ticket.group];
      const head = label && label !== lastGroup ? `<h2 class="grouph">${label}</h2>` : "";
      if (label) lastGroup = label;
      const nascar =
        ticket.id === nascarAnchor
          ? `<div class="card"><div class="sub">${esc(board.nascar.when)}</div><h2>Top-10 projection</h2><div class="sub">Display only · SAMPLE</div><table class="tbl">${board.nascar.rows.map((row) => `<tr><td>${esc(row[0])}</td><td class="sub">${esc(row[1])}</td><td>${esc(row[2])}</td></tr>`).join("")}</table></div>`
          : "";
      return `${head}${renderTicket(ticket, state)}${nascar}`;
    })
    .join("");
  const bookNote =
    state.book === "hr"
      ? "Showing plays live on Hard Rock. Legs are picked on Hard Rock. TD City hidden (no plays today)."
      : "Showing plays live on DraftKings · DK price incl. fee (Florida DK Predictions). Legs are picked on Hard Rock. TD City hidden (no plays today).";
  const left = `${bookToggle(state.book)}${recapCard(board)}<div class="card"><h2>Last 14 days</h2><div class="sub">${esc(windowed.headline)}</div><div class="priv">🔒 Only you can see this</div>${chartSvg(windowed.points)}<div class="rings">${rings}</div></div>`;
  const right = `<div class="sub" style="margin:2px 0 4px"><b>Games tonight</b> · tap a game for Feed · Box · VS</div>${games}${productChips(board, state)}<div class="sub" style="margin:-4px 0 10px">${bookNote}</div>${blocks || `<p class="empty">No plays in this filter.</p>`}`;
  return `<div class="sub date-line">${esc(board.dateLabel)}</div><div class="home"><div>${left}</div><div>${right}</div></div>`;
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
  return `<div class="feed"><div class="pills" style="margin-top:0">${pills}</div><div class="sub">SAMPLE · not a live feed</div>${body}</div>`;
}

type PbpItem = { team: string; color: string; event: string; when: string; score: string; desc: string; win?: string; period: string };

function feedItems(game: LiveGame): PbpItem[] {
  if (game.id === "atl-nyk") {
    return [
      { team: "NYK", color: "#f58426", event: "3PT Jumper", when: "4:12 · 3rd", score: "88 91", desc: "Jalen Brunson 26-ft three (assist: Hart)", win: "NYK 61%", period: "Q3" },
      { team: "ATL", color: "#c8102e", event: "Assist", when: "4:40 · 3rd", score: "88 88", desc: "Trae Young assist #9 → Jalen Johnson dunk", win: "ATL 52%", period: "Q3" },
      { team: "NYK", color: "#f58426", event: "Defensive Rebound", when: "5:02 · 3rd", score: "86 88", desc: "Mitchell Robinson defensive rebound", period: "Q3" },
      { team: "ATL", color: "#c8102e", event: "Jump Shot missed", when: "5:04 · 3rd", score: "86 88", desc: "Trae Young misses 27-ft three", period: "Q3" },
      { team: "ATL", color: "#c8102e", event: "Layup", when: "1:10 · 2nd", score: "52 49", desc: "Trae Young driving layup", period: "Q2" },
    ];
  }
  return [
    { team: game.away, color: "#5aa9ff", event: "Sample event", when: game.clock, score: `${game.awayScore} ${game.homeScore}`, desc: `${game.awayName} sequence · placeholder`, period: "All" },
    { team: game.home, color: "#ff8c28", event: "Sample event", when: game.clock, score: `${game.awayScore} ${game.homeScore}`, desc: `${game.homeName} sequence · placeholder`, period: "All" },
  ];
}

function feedBody(game: LiveGame, state: AppState): string {
  const items = feedItems(game);
  const filter = state.feedFilter[game.id] ?? { team: "All", period: game.id === "atl-nyk" ? "Q3" : "All" };
  const teams = ["All", game.away, game.home];
  const periods = game.league === "NBA" ? ["All", "Q1", "Q2", "Q3", "Q4"] : ["All", "1st", "2nd", "3rd"];
  const teamPills = teams
    .map((team) => `<button type="button" class="${filter.team === team ? "on" : ""}" data-act="feed" data-game="${esc(game.id)}" data-team="${esc(team)}">${esc(team)}</button>`)
    .join("");
  const periodPills = periods
    .map((period) => `<button type="button" class="${filter.period === period ? "on" : ""}" data-act="feed" data-game="${esc(game.id)}" data-period="${esc(period)}">${esc(period)}</button>`)
    .join("");
  const rows = items
    .filter((item) => (filter.team === "All" || item.team === filter.team) && (filter.period === "All" || item.period === filter.period || item.period === "All"))
    .map(
      (item) =>
        `<div class="pbp"><span class="lg" style="background:${item.color}">${esc(item.team)}</span><div class="pm"><b>${esc(item.event)}</b><div class="sub">${esc(item.when)}</div><div>${esc(item.desc)}</div></div><div class="ps">${esc(item.score)}${item.win ? `<div class="sub">Win %: ${esc(item.win)}</div>` : ""}</div></div>`,
    )
    .join("");
  const chart = game.league === "NHL" ? rinkSvg(game.id) : courtSvg(game.id);
  const legend =
    game.league === "NHL"
      ? `<div class="fgl"><span><b style="color:#e04a5a">${esc(game.away)}</b> shots</span><span style="color:#ffcc46">● goal</span><span><b style="color:#5aa9ff">${esc(game.home)}</b> shots</span></div>`
      : `<div class="fgl"><span>● made · × missed · ◯ latest</span><span>SAMPLE shot chart</span></div>`;
  return `<div class="pills">${teamPills}</div><div class="pills">${periodPills}</div>${chart}${legend}${rows || `<p class="empty">No sample events in this filter.</p>`}`;
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
  if (game.id === "mtl-wsh") {
    const rows = [
      ["MTL", "", "", "", "", "head"],
      ["Nick Suzuki", "18:22", "0", "1", "2", "mine"],
      ["Cole Caufield", "17:40", "1", "0", "4", ""],
      ["Juraj Slafkovsky", "16:05", "1", "0", "2", ""],
      ["WSH", "", "", "", "", "head"],
      ["Alex Ovechkin", "15:10", "0", "0", "0", "mine"],
      ["Dylan Strome", "16:44", "0", "1", "1", ""],
      ["Tom Wilson", "14:58", "1", "0", "3", ""],
    ];
    const table = rows
      .map((row) =>
        row[5] === "head"
          ? `<tr class="tmh"><td colspan="5">${esc(row[0])}</td></tr>`
          : `<tr class="${row[5] === "mine" ? "mine" : ""}"><td>${row[5] === "mine" ? "★ " : ""}${esc(row[0])}</td><td>${esc(row[1])}</td><td>${esc(row[2])}</td><td>${esc(row[3])}</td><td>${esc(row[4])}</td></tr>`,
      )
      .join("");
    return `<div class="sub"><b>Your players</b> · 🔒 Only you can see this</div>${yours}<table class="bx"><tr><th>Player</th><th>TOI</th><th>G</th><th>A</th><th>SOG</th></tr>${table}</table><div class="sub" style="margin-top:6px">Shot map · SAMPLE</div>${rinkSvg(game.id)}<div class="fgl"><span><b style="color:#e04a5a">MTL</b> 2 G · 24 SOG</span><span><b style="color:#5aa9ff">WSH</b> 1 G · 19 SOG</span></div>`;
  }
  const headers = game.league === "NHL" ? ["Player", "TOI", "G", "A", "SOG"] : ["Player", "MIN", "PTS", "REB", "AST", "3PM"];
  const sample =
    game.league === "NHL"
      ? [
          [game.away, "16:10", String(game.awayScore), "0", "3"],
          [game.home, "15:40", String(game.homeScore), "1", "2"],
        ]
      : [
          [game.away + " starter", "28", String(game.awayScore ? 18 : 0), "4", "5", "2"],
          [game.home + " starter", "30", String(game.homeScore ? 16 : 0), "6", "3", "1"],
        ];
  const body = sample
    .map((row, index) => `<tr class="${index === 0 ? "mine" : ""}"><td>${index === 0 ? "★ " : ""}${esc(row[0])}</td>${row.slice(1).map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`)
    .join("");
  return `<div class="sub"><b>Your players</b> · 🔒 Only you can see this</div>${yours}<table class="bx"><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr>${body}</table><p class="empty">Other box-score lines are SAMPLE placeholders.</p>`;
}

function vsBody(game: LiveGame): string {
  if (game.id === "phi-cha") {
    const rows = [
      ["⚔️ Off. rating", "21", "103.2", "r", "10", "115.0", "g"],
      ["🛡️ Def. rating", "16", "117.5", "a", "28", "109.9", "r"],
      ["⚔️ Points/gm", "27", "112.2", "r", "24", "115.3", "r"],
      ["🛡️ Pts allowed/gm", "26", "110.2", "r", "9", "109.2", "g"],
    ];
    return vsTable(game, "30", rows);
  }
  const stats = game.league === "NHL" ? ["⚔️ Goals/gm", "🛡️ GA/gm", "⚔️ SOG/gm", "🛡️ SOG allowed/gm"] : ["⚔️ Off. rating", "🛡️ Def. rating", "⚔️ Points/gm", "🛡️ Pts allowed/gm"];
  const n = game.league === "NHL" ? 32 : 30;
  const rows = stats.map((stat, index) => {
    const left = ((game.away.charCodeAt(0) + index * 5) % n) + 1;
    const right = ((game.home.charCodeAt(0) + index * 7) % n) + 1;
    const tone = (rank: number) => (rank <= n / 3 ? "g" : rank <= (2 * n) / 3 ? "a" : "r");
    const val = (rank: number) => (game.league === "NHL" ? (2.4 + (rank % 10) / 10).toFixed(1) : (100 + (rank % 20)).toFixed(1));
    return [stat, String(left), val(left), tone(left), String(right), val(right), tone(right)];
  });
  return vsTable(game, String(n), rows);
}

function vsTable(game: LiveGame, n: string, rows: string[][]): string {
  const body = rows
    .map(
      (row) =>
        `<tr><td>${esc(row[0])}</td><td><div class="rk ${row[3]}">#${esc(row[1])}<small>/${n}</small></div><div class="val">${esc(row[2])}</div></td><td><div class="rk ${row[6]}">#${esc(row[4])}<small>/${n}</small></div><div class="val">${esc(row[5])}</div></td></tr>`,
    )
    .join("");
  return `<div class="sub">⚔️ Off #1 = most · 🛡️ Def #1 = fewest allowed · SAMPLE</div><div class="vsh"><b>${esc(game.away)} <span class="sub">vs</span> ${esc(game.home)}</b></div><div class="sub">${esc(game.awayName)} ${esc(game.awaySide.record)} @ ${esc(game.homeName)} ${esc(game.homeSide.record)}</div><table class="vst"><tr><th>Stat</th><th>${esc(game.away)}</th><th>${esc(game.home)}</th></tr>${body}</table><div class="sub" style="margin-top:6px"><span class="g">green</span> top third · <span class="a">amber</span> middle · <span class="r">red</span> bottom third</div>`;
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
  return `<h1 style="font-size:1.75rem">Live</h1><div class="sub">Your legs in games now · settles from play-by-play · ${esc(board.liveUpdated)}</div><div class="mood">${mascot("sweat", 64)}<div><b>Sweating</b><div class="sub">4 legs still alive · 1 dead</div></div></div><div class="sweatbox"><div><b class="W">3</b>hit</div><div><b class="a">4</b>alive</div><div><b class="L">1</b>dead</div></div><section class="game"><div class="sub"><b>Tickets</b></div>${bars}</section>${games}<div class="sub" style="margin:4px 0">${esc(board.liveNote)}</div><button type="button" class="linkrow" data-act="standings" data-from="live">Standings · NBA · NHL · NFL ›</button>`;
}

function results(state: AppState, board: Board): string {
  const cards = board.results
    .map((ticket) => {
      const legs = ticket.legs
        .map(
          (leg) =>
            `<div class="leg"><div><b>${esc(leg.name)}</b><div class="sub">${esc(leg.stat)}</div><div><span class="grade">${esc(leg.grade)}</span>${esc(leg.note)}</div><div class="sub clv ${leg.beatClose ? "W" : "L"}">${leg.beatClose ? "✓ Beat close" : "✗ Missed close"}</div></div><span class="res ${leg.result}">${leg.result}</span></div>`,
        )
        .join("");
      return `<section class="ticket"><header><div style="display:flex;gap:12px"><div class="thumb">Ticket<br>photo</div><div><h3>${esc(ticket.title)}</h3><div class="sub">${esc(ticket.meta)}</div></div></div><span style="display:flex;align-items:center;gap:6px">${mascot(ticket.mood, 40)}<span class="res ${ticket.result}" style="font-size:1.375rem">${ticket.result === "W" ? "Won" : "Lost"}</span></span></header>${legs}<div class="tfoot"><button type="button" class="btn share" data-act="share" data-id="${esc(ticket.id)}" data-settled="1">Share as image</button></div></section>`;
    })
    .join("");
  const dates = edgeDates(board.edgePicks);
  const feed = dates
    .map((date) => {
      const day = board.edgePicks.filter((pick) => pick.date === date);
      const record = tallyEdge(day);
      const open = state.openDates.has(date);
      const plays = open ? `<div style="margin-top:8px">${renderFeedPlays(day, state)}</div>` : "";
      return `<section class="ticket"><header><div><h3>${esc(date)}</h3><div class="sub">${record.wins}-${record.losses}${record.voids || record.pushes ? ` · ${record.voids + record.pushes} void/push` : ""} · ${day.length} plays · fixture</div></div><button type="button" class="btn share" data-act="toggle-date" data-date="${esc(date)}">${open ? "Hide" : "Show"} plays</button></header>${plays}</section>`;
    })
    .join("");
  return `<h1 style="font-size:1.75rem">Last night</h1><div class="sub" style="margin-bottom:8px">Tue, Nov 3 · 7 won · 4 lost · letter = Nightly Review grade</div><div class="priv">🔒 Only you can see this</div>${cards}<h2 class="grouph">Edge feed grades</h2><div class="sub">From the fixture. Flat 1u is on Stats, not here, and never on a share image.</div>${feed}`;
}

function renderFeedPlays(picks: EdgePick[], state: AppState): string {
  return picks
    .slice()
    .sort((a, b) => a.sport.localeCompare(b.sport) || a.rank - b.rank)
    .map((pick) => renderPlay(presentEdgePick(pick), state.book, state.selected))
    .join("");
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
  return `<h1 style="font-size:1.75rem">Cappers</h1><div class="sub" style="margin-bottom:8px">All 5 tracked · every play stays · ${bookName(state.book)} view</div>${bookToggle(state.book)}${group("Heist cappers", board.cappers.filter((capper) => capper.group === "heist"))}<div class="sub" style="margin-top:8px">Action Network cappers · tracked, not in THE HEIST unless you approve</div>${group("Action Network", board.cappers.filter((capper) => capper.group === "an"))}`;
}

function stats(state: AppState, board: Board): string {
  const windowed = sliceSeries(board.series, state.profitRange);
  const rings = board.rings.map((ring) => ringSvg(ring.pct, ring.label)).join("");
  const record = tallyEdge(board.edgePicks);
  const graded = record.wins + record.losses;
  const hit = graded ? Math.round((record.wins / graded) * 100) : 0;
  const bySport = new Map<string, EdgePick[]>();
  for (const pick of board.edgePicks) {
    const list = bySport.get(pick.sport) ?? [];
    list.push(pick);
    bySport.set(pick.sport, list);
  }
  const sportRows = [...bySport.entries()]
    .map(([sport, picks]) => {
      const row = tallyEdge(picks);
      return `<tr><td>${esc(sport)}</td><td class="sub">${row.wins}-${row.losses}</td><td>${gradedHit(row)}</td></tr>`;
    })
    .join("");
  const rangeButtons = (["7d", "30d", "season"] as const)
    .map((key) => `<button type="button" class="${state.profitRange === key ? "on" : ""}" data-act="range" data-key="${key}">${key === "7d" ? "7d" : key === "30d" ? "30d" : "Season"}</button>`)
    .join("");
  return `<div class="hdr"><h1 style="font-size:1.75rem">Stats</h1><button type="button" class="stdchip" data-act="standings" data-from="stats">📊 Standings</button></div><div class="priv">🔒 Only you can see this</div>
<div class="card"><div class="hdr"><h2>Profit</h2><div class="toggle">${rangeButtons}</div></div><div class="sub">${esc(windowed.headline)}</div><div class="sub">${esc(windowed.note)}</div>${chartSvg(windowed.points)}</div>
<div class="card"><h2><span class="tag of">OFFICIAL</span> Win rate by product</h2><div class="sub">Sample card · not the edge-picks fixture</div><div class="rings">${rings}</div></div>
<div class="card"><h2><span class="tag un">UNOFFICIAL</span> For fun · tracked only</h2><div class="sub">Never in the official record</div><table class="tbl"><tr><td>First Blood (tickets)</td><td class="sub">1-4</td><td>20%</td></tr><tr><td>First Blood (legs hit)</td><td class="sub">6-21</td><td>22%</td></tr><tr><td>TD City</td><td class="sub">1-2</td><td>33%</td></tr><tr><td>Cappers (raw lines)</td><td class="sub">see Cappers</td><td></td></tr></table></div>
<div class="card"><h2>Miss log · hit % by prop</h2><div class="sub">SAMPLE</div><table class="tbl"><tr><td>NHL SOG</td><td class="sub">17-7</td><td>71%</td></tr><tr><td>NBA Points</td><td class="sub">22-14</td><td>61%</td></tr><tr><td>NBA Rebounds</td><td class="sub">12-10</td><td>55%</td></tr><tr><td>NFL Anytime TD</td><td class="sub">5-6</td><td>45%</td></tr></table></div>
<div class="card"><h2>By prop type</h2><div class="sub">SAMPLE · from the approved categories card</div><table class="tbl"><tr><td>Shots on Goal</td><td class="sub">38-27-1</td><td class="W">+4.2u</td></tr><tr><td>Assists</td><td class="sub">41-36-2</td><td class="W">+1.1u</td></tr><tr><td>Points</td><td class="sub">22-19-0</td><td class="W">+0.6u</td></tr><tr><td>Goals</td><td class="sub">9-14-0</td><td class="L">−3.0u</td></tr><tr><td>Parlays</td><td class="sub">5-11-0</td><td class="L">−2.4u</td></tr></table></div>
<div class="card"><h2>Closing-line value</h2><div class="sub">SAMPLE</div><div class="split"><div><div class="big W" style="font-size:1.75rem">58%</div><div class="sub">beat the close</div></div><div><div class="big" style="font-size:1.75rem">+2.1%</div><div class="sub">avg price gain</div></div></div></div>
<div class="card"><h2>Green-circle backtest</h2><div class="sub">Oct 25 – Nov 3 · recomputed, not live · SAMPLE</div><table class="tbl"><tr><td>Green plays</td><td>28 of 111</td></tr><tr><td>Record</td><td>13-15 · 46%</td></tr><tr><td>Units</td><td class="W">+8.2u</td></tr></table></div>
<div class="card"><h2><span class="tag fx">FIXTURE</span> Edge feed record</h2><div class="priv">🔒 Only you can see this</div><div class="sub">Flat 1u at the Hard Rock price, summed from the fixture. Not the desk bankroll. ${board.edgeSkipped ? `${board.edgeSkipped} rows skipped.` : "No rows skipped."}</div><div class="big W" style="font-size:1.75rem">${formatSigned(record.units)}u</div><div class="sub">${record.wins}-${record.losses} · ${hit}% of graded plays · ${record.voids} void · ${record.pushes} push</div><table class="tbl">${sportRows}</table></div>`;
}

function gradedHit(record: { wins: number; losses: number }): string {
  const n = record.wins + record.losses;
  return n ? `${Math.round((record.wins / n) * 100)}%` : "—";
}

function standingsView(state: AppState, board: Board): string {
  const league = standings.leagues[state.league];
  const tabs = LEAGUES.map(
    (id) => `<button type="button" class="${id === state.league ? "on" : ""}" data-act="league" data-key="${id}">${id}</button>`,
  ).join("");
  const tables = (league?.groups ?? [])
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
  return `<button type="button" class="back" data-act="nav" data-view="${state.standingsFrom}">‹ Back</button><h1 style="font-size:1.75rem">Standings</h1><div class="sub">Six sports · ★ = team in one of your sample plays today · swipe tables sideways; team column stays put</div><div class="sub" style="margin-bottom:6px">${esc(league?.note ?? "")}</div><div class="lgtabs" role="tablist">${tabs}</div>${tables}`;
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
    return found ? shareFromSettled(found, "Tue Nov 3 · ParlayBOT") : null;
  }
  const ticket = board.tickets.find((item) => item.id === ticketId);
  return ticket ? shareFromPending(ticket, state.book, "Wed Nov 4 · ParlayBOT") : null;
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
${alertRow("Locks", "When today's tickets lock", state.alerts.locks, "locks")}
${alertRow("Finals", "When a ticket settles", state.alerts.finals, "finals")}
${alertRow("NFL red zone / TD", "Your TD legs in the red zone", state.alerts.redzone, "redzone")}
${alertRow("Price moves on locked picks", "Off until you turn it on", state.alerts.price, "price")}
<p class="sub">Saved on this phone. v1 has no push server, so these switches do not send alerts.</p>
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
