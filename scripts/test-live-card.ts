import assert from "node:assert/strict";
import { absorbLiveLeg, abbrsMatch, box, firstBloodLeg, formatRankValue, liveTitle, liveWindowET, mergeTags, propOf, readStat, samePlayer, situationOf, slateLabel, teamStatsFor, trackPlayOnBoard } from "../src/data/espn.ts";
import { adaptDesk, readSlateCache, rememberSlate, replayTag, replayYesterday, writeSlateCache } from "../src/data/desk.ts";
import { emptyBoard } from "../src/data/board.ts";
import { PACE, altAfter, mascot, renderPlay } from "../src/ui/bits.ts";
import { renderPage, renderSheet } from "../src/ui/views.ts";
import type { AppState } from "../src/ui/state.ts";
import type { LiveGame, LiveLeg, Play, WhyBlock } from "../src/data/types.ts";

const why: WhyBlock = { ours: false, line: "", why: [], whyNot: [] };

function leg(partial: Partial<LiveLeg> & Pick<LiveLeg, "pace" | "current" | "line">): LiveLeg {
  return { name: "Play", unit: "", source: "ESPN", why, ...partial };
}

assert.equal(PACE.hit.mood, "cash");
assert.equal(PACE.on.mood, "fire");
assert.equal(PACE.behind.mood, "sweat");
assert.equal(PACE.cold.mood, "ice");
assert.equal(PACE.dead.mood, "hook");
assert.match(mascot("cash", 36), /class="mascot cash"/);
assert.match(mascot("fire", 36), /class="mascot fire"/);
assert.match(mascot("sweat", 36), /class="mascot sweat"/);
assert.match(mascot("ice", 36), /class="mascot ice"/);
assert.match(mascot("hook", 36), /class="mascot hook"/);
assert.match(mascot("sweat", 36), /background-image:url\(/);
assert.equal(/😓|🔥|💰|🥵|🥶/.test(mascot("sweat", 36) + mascot("fire", 36) + mascot("cash", 36) + mascot("ice", 36) + mascot("hook", 36)), false);
assert.equal(altAfter("UTSA Roadrunners -7", "UTSA Roadrunners -1.5"), "-1.5");

const athletes = Array.from({ length: 12 }, (_, index) => ({
  athlete: { displayName: `Skater ${index + 1}` },
  stats: ["1", "2", "3"],
}));
const boxed = box(
  { boxscore: { players: [{ team: { abbreviation: "VGK" }, statistics: [{ labels: ["G", "A", "SOG"], athletes }] }] } },
  ["Skater 12"],
);
assert.equal(boxed.rows.filter((row) => row.cells[0]?.startsWith("Skater")).length, 12);
assert.equal(boxed.rows.find((row) => row.cells[0] === "Skater 12")?.mine, true);

const heist = leg({ name: "Justice Hill Over 4.5 Receptions", key: "prop:justice hill:receptions:over:4.5", pace: "on", current: 2, line: 4.5, unit: "REC" });
const alt = leg({ name: "Justice Hill o2.5 Receptions", key: "prop:justice hill:receptions:over:2.5", pace: "hit", current: 3, line: 2.5, unit: "REC" });
const game = {
  id: "1",
  league: "NFL",
  away: "BAL",
  home: "JAX",
  awayName: "Baltimore",
  homeName: "Jacksonville",
  awayScore: 10,
  homeScore: 7,
  clock: "12:00 - 2nd",
  pre: false,
  final: false,
  awaySide: { abbr: "BAL", record: "5-3", standing: "" },
  homeSide: { abbr: "JAX", record: "4-4", standing: "" },
  legs: [heist, alt],
  liveFeed: { pbp: [], box: { headers: [], rows: [] }, teamStats: [], real: true },
} as LiveGame;
const play = (name: string, extra: Partial<Play> = {}): Play =>
  ({
    id: name,
    name,
    detail: "NFL · BAL vs JAX",
    sport: "NFL",
    hr: "-110",
    dk: null,
    why,
    source: "desk",
    gameText: "BAL vs JAX",
    ...extra,
  }) as Play;
const board = { liveGames: [game], tickets: [], cappers: [] } as unknown as Parameters<typeof trackPlayOnBoard>[1];
const straight = trackPlayOnBoard(play("Justice Hill Over 4.5 Receptions"), board, "hr");
const bought = trackPlayOnBoard(play("Justice Hill o2.5 Receptions", { dkName: "Justice Hill o2.5 Receptions" }), board, "dk");
assert.equal(straight?.leg?.line, 4.5);
assert.equal(bought?.leg?.line, 2.5);
assert.notEqual(straight?.leg?.key, bought?.leg?.key);

const ml = {
  ...game,
  league: "NCAAB",
  away: "MCN",
  home: "UNT",
  awayName: "McNeese",
  homeName: "North Texas",
  legs: [leg({ name: "McNeese Cowboys ML", key: "ml:away", pace: "behind", current: 38, line: 0, label: "Trailing 38–43" })],
} as LiveGame;
const mlBoard = { liveGames: [ml] } as unknown as Parameters<typeof trackPlayOnBoard>[1];
assert.equal(trackPlayOnBoard(play("McNeese Cowboys ML", { sport: "NCAAB", gameText: "McNeese vs North Texas", detail: "NCAAB" }), mlBoard, "hr")?.leg?.label, "Trailing 38–43");

assert.equal(firstBloodLeg("Franz Wagner", {}, "pre", 0, 0), null);
const waiting = firstBloodLeg("Franz Wagner", { plays: [] }, "in", 0, 0);
assert.match(waiting?.label ?? "", /Waiting on 1st score/);
const hit = firstBloodLeg(
  "Franz Wagner",
  { plays: [{ sequenceNumber: 4, scoringPlay: true, scoreValue: 2, clock: { displayValue: "11:02" }, period: { displayValue: "1st" }, participants: [{ athlete: { displayName: "Franz Wagner" } }] }] },
  "in",
  2,
  0,
);
assert.equal(hit?.pace, "hit");
assert.match(hit?.label ?? "", /HIT · 1st point: Franz Wagner/);
const miss = firstBloodLeg(
  "Franz Wagner",
  { plays: [{ sequenceNumber: 1, scoringPlay: true, scoreValue: 2, clock: { displayValue: "11:40" }, period: { displayValue: "1st" }, participants: [{ athlete: { displayName: "Paolo Banchero" } }] }] },
  "in",
  2,
  0,
);
assert.equal(miss?.pace, "dead");
assert.match(miss?.label ?? "", /MISS · 1st point: Paolo Banchero/);

const teamVs = {
  built: "Built Thu",
  sports: {
    NBA: {
      stats: [{ key: "ortg", label: "Off. rating", side: "off", src: "TeamRankings", as_of: "2026-11-05" }],
      games: [{ teams: [{ ab: "UTA", name: "Utah Jazz", v: { ortg: { val: 1.0398, rank: 25, n: 30 } } }, { ab: "GSW", name: "Golden State Warriors", v: { ortg: { val: 1.15, rank: 4, n: 30 } } }] }],
    },
    NCAAM: {
      stats: [{ key: "pts_o", label: "Points / gm", side: "off", src: "KenPom", as_of: "2026-11-05" }],
      games: [{ teams: [{ ab: "MCN", name: "McNeese Cowboys", v: { pts_o: { val: 78.2, rank: 40, n: 360 } } }, { ab: "UNT", name: "North Texas Mean Green", v: { pts_o: { val: 74.1, rank: 120, n: 360 } } }] }],
    },
  },
};
const liveSummary = { boxscore: { teams: [{ statistics: [{ name: "giveaways", displayValue: "4" }] }] } };
const nba = teamStatsFor(liveSummary, teamVs, "NBA", "UTAH", "Utah Jazz", "GS", "Golden State");
assert.equal(nba.rows[0]?.away, "104.0");
assert.equal(nba.rows[0]?.awayRank, "#25");
assert.equal(nba.rows[0]?.awayOf, "/30");
assert.equal(nba.rows.some((row) => /giveaway/i.test(row.name)), false);
assert.match(nba.rows[0]?.name ?? "", /Off\. rating/);
const college = teamStatsFor(liveSummary, teamVs, "NCAAB", "MCN", "McNeese", "UNT", "North Texas");
assert.equal(college.rows[0]?.away, "78.2");
assert.equal(formatRankValue("ortg", 1.0398), "104.0");
assert.notEqual(formatRankValue("ortg", 1.0398), "1.0");

const html = renderPlay(play("Justice Hill Over 4.5 Receptions"), "hr", new Set(), false, `<div class="ptrack">bar</div>`);
const label = html.match(/<label[\s\S]*?<\/label>/)?.[0] ?? "";
const pbodyEnd = html.indexOf(`</div><div class="btns">`);
const pbody = html.slice(html.indexOf(`<div class="pbody">`), pbodyEnd);
assert.match(html, /<\/div><div class="btns">[\s\S]*<\/div><div class="ptrack">bar<\/div><\/div>$/);
assert.ok(html.indexOf('class="btns"') < html.indexOf('class="ptrack"'));
assert.equal(pbody.includes("ptrack"), false);
assert.equal(pbody.includes("btns"), false);
assert.equal(label.includes("ptrack"), false);
const altHtml = renderPlay(
  play("UTSA Roadrunners -1.5", { alt: { before: "UTSA Roadrunners -7", after: "UTSA Roadrunners -1.5" }, altTag: true, hrHold: "Unverified HR link — held" }),
  "hr",
  new Set(),
  false,
  `<div class="ptrack">live</div>`,
);
assert.equal(altHtml.split("UTSA Roadrunners -1.5").length - 1, 1);
assert.match(altHtml, /<s>UTSA Roadrunners -7<\/s><span class="arrow">→<\/span><b>-1\.5<\/b>/);
assert.ok(altHtml.indexOf("Unverified HR link") < altHtml.indexOf('class="ptrack"'));

assert.equal(propOf("A. Johnson u5.5 tackles + assists", "NFL")?.key, "totalTackles");
assert.equal(propOf("Jase Richardson Under 11.5 Pts + Reb", "NBA")?.key, "points+rebounds");
assert.equal(propOf("Player Over 22.5 Pass Attempts", "NFL")?.key, "passingAttempts");
assert.equal(propOf("Player Over 12.5 Rush Atts", "NFL")?.key, "rushingAttempts");
assert.equal(propOf("Player Over 6.5 Rec Targets", "NFL")?.key, "receivingTargets");
assert.equal(abbrsMatch("JAC", "JAX"), true);
assert.equal(liveTitle("Under 74.5", "UTSA", "FAU"), "UTSA/FAU Under 74.5");
const merged = absorbLiveLeg(
  { name: "David Pastrnak Over 0.5 Assists", current: 0, line: 0.5, unit: "AST", pace: "on", source: "ESPN", why, tags: ["Props"], key: "a" },
  { name: "David Pastrnak Over 0.5 Assists", current: 0, line: 0.5, unit: "AST", pace: "on", source: "ESPN", why, tags: ["Edge", "@nickm_hockey"], key: "a" },
);
assert.deepEqual(mergeTags(merged.tags ?? []), ["Edge", "Props", "@nickm_hockey"]);
const heistTags = absorbLiveLeg(
  { name: "Play", current: 0, line: 1, unit: "", pace: "on", source: "ESPN", why, tags: ["Heist ALT", "@alexcaruso"] },
  { name: "Play", current: 0, line: 1, unit: "", pace: "on", source: "ESPN", why, tags: ["Heist"] },
);
assert.deepEqual(heistTags.tags, ["Heist", "Heist ALT", "@alexcaruso"]);
const attempts = readStat(
  { boxscore: { players: [{ statistics: [{ keys: ["completions/passingAttempts"], athletes: [{ athlete: { displayName: "Baker Mayfield" }, stats: ["18/27"] }] }] }] } },
  "Baker Mayfield",
  "passingAttempts",
);
assert.equal(attempts, 27);
const nhlBox = box(
  {
    boxscore: {
      players: [{
        team: { abbreviation: "VGK" },
        statistics: [
          { name: "forwards", keys: ["goals", "assists", "shotsTotal", "timeOnIce"], athletes: [{ athlete: { displayName: "Jack Eichel" }, stats: ["1", "1", "4", "18:00"] }] },
          { name: "defenses", keys: ["goals", "assists", "shotsTotal", "timeOnIce"], athletes: [{ athlete: { displayName: "Shea Theodore" }, stats: ["0", "1", "2", "20:00"] }] },
          { name: "goalies", keys: ["saves", "shotsAgainst", "goalsAgainst", "savePct", "timeOnIce"], athletes: [{ athlete: { displayName: "Carter Hart" }, stats: ["20", "22", "2", ".909", "60:00"] }] },
        ],
      }],
    },
  },
  ["Shea Theodore"],
  "NHL",
);
assert.match(nhlBox.rows.map((row) => row.cells.join(" ")).join("|"), /G/);
assert.equal(nhlBox.rows.some((row) => row.cells[0] === "Shea Theodore" && row.mine), true);
assert.equal(nhlBox.rows.some((row) => String(row.header).includes("Goalies")), true);
const nbaBox = box(
  { boxscore: { players: [{ team: { abbreviation: "GSW" }, statistics: [{ name: "stats", keys: ["minutes", "points", "rebounds", "assists", "threePointFieldGoalsMade-threePointFieldGoalsAttempted"], athletes: [{ athlete: { displayName: "Stephen Curry" }, stats: ["32", "28", "5", "6", "6-12"] }] }] }] } },
  ["Stephen Curry"],
  "NBA",
);
assert.match(nbaBox.rows[0]?.cells.join(" ") ?? "", /REB/);
assert.match(nbaBox.rows[0]?.cells.join(" ") ?? "", /AST/);
const nflBox = box(
  {
    boxscore: {
      players: [{
        team: { abbreviation: "JAX" },
        statistics: [
          { name: "passing", keys: ["completions/passingAttempts", "passingYards", "passingTouchdowns", "interceptions"], athletes: [{ athlete: { displayName: "Trevor Lawrence" }, stats: ["18/27", "220", "2", "0"] }] },
          { name: "rushing", keys: ["rushingAttempts", "rushingYards", "rushingTouchdowns", "longRushing"], athletes: [{ athlete: { displayName: "Travis Etienne" }, stats: ["12", "54", "1", "18"] }] },
          { name: "receiving", keys: ["receptions", "receivingYards", "receivingTouchdowns", "receivingTargets"], athletes: [{ athlete: { displayName: "Christian Kirk" }, stats: ["5", "60", "0", "8"] }] },
          { name: "defensive", keys: ["totalTackles", "soloTackles", "sacks", "passesDefended"], athletes: [{ athlete: { displayName: "Foyesade Oluokun" }, stats: ["8", "5", "1", "0"] }] },
        ],
      }],
    },
  },
  ["Christian Kirk"],
  "NFL",
);
assert.equal(nflBox.rows.filter((row) => row.header).length, 4);
assert.equal(nflBox.rows.some((row) => row.cells[0] === "Christian Kirk" && row.mine), true);
const safeBoard = adaptDesk(
  {
    today: { date: "2026-11-06", tickets: [{ name: "+100 ticket", pick: "2-leg +131 (1u) — Void (goalie re-check)", odds: "+131", legs: [{ pick: "Neal Pionk Over 1.5 Shots", sport: "NHL" }] }], sports: {} },
    safe100: {
      sports: { TODAY: { legs: [{ pick: "Alt Skater Over 0.5 Points", sport: "NHL" }] }, NHL: { legs: [{ pick: "Alt Goalie Under 2.5 Goals", sport: "NHL" }] } },
      notes: { NBA: "No qualifying Alt Parlay today (NBA)." },
    },
    results_v2: { rows: [] },
  },
  { note: "", columns: [], groups: [] },
);
assert.equal(safeBoard.tickets.find((item) => item.productKey === "parlay")?.plays[0]?.tags?.[0], "+100 · Void");
assert.equal(safeBoard.tickets.find((item) => item.productKey === "parlay")?.plays[0]?.blocked, "graded");
assert.equal(safeBoard.tickets.find((item) => item.productKey === "parlay")?.title, "Parlay +100");
assert.equal(safeBoard.tickets.some((item) => item.plays.some((play) => /Alt Skater|Alt Goalie/.test(play.name))), false);
assert.equal(safeBoard.notices.some((note) => /No qualifying Alt Parlay/.test(note.text)), false);

const morning = liveWindowET(new Date("2026-11-06T14:30:00Z"));
assert.equal(morning.hourET, 9);
assert.equal(morning.todayET, "2026-11-06");
assert.equal(morning.yesterdayET, "2026-11-05");
assert.equal(morning.defaultSlate, "2026-11-05");
const ten = liveWindowET(new Date("2026-11-06T15:00:00Z"));
assert.equal(ten.hourET, 10);
assert.equal(ten.defaultSlate, "2026-11-06");
const late = liveWindowET(new Date("2026-11-06T04:30:00Z"));
assert.equal(late.hourET, 23);
assert.equal(late.todayET, "2026-11-05");
assert.equal(late.defaultSlate, "2026-11-05");
assert.equal(slateLabel("2026-11-05"), "Nov 5");
assert.deepEqual(situationOf({ situation: { possession: "33", awayTimeouts: 2, homeTimeouts: 3 } }), { possessionId: "33", awayTimeouts: 2, homeTimeouts: 3 });
assert.equal(situationOf({}), null);
assert.equal(samePlayer("Zay Flowers", "Zay Flowers"), true);

const kept = rememberSlate(
  [{ slateDate: "2026-11-03", tickets: [{ id: "a", plays: [{ id: "p" }] } as never], cappers: [], teamVs: null, teamBuilt: null }],
  { slateDate: "2026-11-04", tickets: [], cappers: [{ id: "c", name: "@a", group: "heist", record: "", plays: [{ id: "p" } as never] }], teamVs: { built: "Thu" }, teamBuilt: "Built Thu" },
);
const two = rememberSlate(kept, { slateDate: "2026-11-05", tickets: [{ id: "b", plays: [{ id: "q" } as never] } as never], cappers: [], teamVs: null, teamBuilt: null });
assert.deepEqual(two.map((item) => item.slateDate), ["2026-11-05", "2026-11-04"]);
assert.equal(rememberSlate(two, { slateDate: "2026-11-06", tickets: [], cappers: [], teamVs: null, teamBuilt: null }).length, 2);
const memory = { jar: new Map<string, string>(), getItem(key: string) { return this.jar.get(key) ?? null; }, setItem(key: string, value: string) { this.jar.set(key, value); } };
writeSlateCache(memory, two);
assert.equal(readSlateCache(memory)[0]?.slateDate, "2026-11-05");

assert.equal(replayTag({ cat: "POTD", grp: "O" }), "POTD");
assert.equal(replayTag({ cat: "Parlay +100", grp: "O" }), "+100");
assert.equal(replayTag({ cat: "Edge", grp: "E" }), "Edge");
assert.equal(replayTag({ cat: "LEG DAY", grp: "O" }), "Props");
assert.equal(replayTag({ cat: "LEG DAY", grp: "O", alt: true }), "Props ALT");
assert.equal(replayTag({ cat: "The Heist", grp: "O", alt: true, prop: "@showtimepicks2 · Spread" }), "Heist ALT");
assert.equal(replayTag({ cat: "First Blood", grp: "F", leg: true }), "First Blood");
assert.equal(replayTag({ cat: "Cappers", grp: "C", prop: "@austinsprops · NFL receptions (over)" }), "@austinsprops");
const rebuilt = replayYesterday({
  heist: { date: "2026-11-05", legs: [{ pick: "UTSA Roadrunners -1.5", sport: "NCAAF", odds: "-110", why: "Road spot" }] },
  results_v2: { rows: [
    { date: "2026-11-05", pick: "First Blood 8-leg", cat: "First Blood", grp: "F", prop: "First Blood", fam: "Parlay", sport: "NBA", leg: false },
    { date: "2026-11-05", pick: "Franz Wagner first point scorer", cat: "First Blood", grp: "F", prop: "First Point Scorer", sport: "NBA", leg: true },
    { date: "2026-11-05", pick: "2-leg", cat: "Parlay +100", grp: "O", sub: "Mikhail Sergachev Over 0.5 Points + Neal Pionk Over 1.5 Shots On Goal", prop: "Big 4 parlay", sport: "Big 4", leg: false },
    { date: "2026-11-05", pick: "Zay Flowers Over 48.5 Receiving Yards", cat: "POTD", grp: "O", prop: "NFL receiving yards", sport: "NFL", leg: false },
    { date: "2026-11-04", pick: "Old play Over 1.5 Points", cat: "Edge", grp: "E", sport: "NHL", leg: false },
    { date: "2026-11-05", pick: "Justice Hill Over 2.5 Receptions", cat: "Cappers", grp: "C", prop: "@alexcaruso · NFL receptions (over)", sport: "NFL", leg: false },
  ] },
}, "2026-11-05");
const names = [...rebuilt.tickets.flatMap((ticket) => ticket.plays), ...rebuilt.cappers.flatMap((capper) => capper.plays)].map((play) => play.name);
assert.equal(names.includes("First Blood 8-leg"), false);
assert.equal(names.includes("Franz Wagner first point scorer"), true);
assert.equal(names.includes("Mikhail Sergachev Over 0.5 Points"), true);
assert.equal(names.includes("Neal Pionk Over 1.5 Shots On Goal"), true);
assert.equal(names.includes("Zay Flowers Over 48.5 Receiving Yards"), true);
assert.equal(names.includes("Old play Over 1.5 Points"), false);
assert.equal(names.includes("UTSA Roadrunners -1.5"), true);
assert.equal(rebuilt.cappers[0]?.name, "@alexcaruso");
assert.equal(rebuilt.tickets.find((ticket) => ticket.title === "POTD")?.plays[0]?.name, "Zay Flowers Over 48.5 Receiving Yards");
assert.equal(rebuilt.tickets.find((ticket) => ticket.plays.some((play) => play.name.includes("UTSA")))?.plays[0]?.why.why[0], "Road spot");

const liveState = {
  view: "live",
  book: "hr",
  liveNight: null,
  snapPreview: {},
  snapGen: {},
  openGames: new Set<string>(),
  gamePanel: {},
  feedFull: new Set<string>(),
  feedFilter: {},
  sheet: null,
} as AppState;
const card = emptyBoard();
card.liveGames = [{
  id: "g1",
  league: "NCAAF",
  away: "UTSA",
  home: "FAU",
  awayName: "UTSA",
  homeName: "FAU",
  awayScore: 7,
  homeScore: 10,
  clock: "8:00 - 2nd",
  pre: false,
  final: false,
  possessionSide: "away",
  awayTimeouts: 2,
  homeTimeouts: 3,
  awaySide: { abbr: "UTSA", record: "5-3", standing: "" },
  homeSide: { abbr: "FAU", record: "4-4", standing: "" },
  legs: [],
  liveFeed: { pbp: [], box: { headers: [], rows: [] }, teamStats: [], real: true },
} as LiveGame];
const liveHtml = renderPage(liveState, card);
assert.match(liveHtml, /class="poss-ball"/);
assert.match(liveHtml, /aria-label="UTSA 2 timeouts remaining"/);
assert.match(liveHtml, /aria-label="FAU 3 timeouts remaining"/);
assert.match(liveHtml, /2 TO/);
assert.match(liveHtml, /3 TO/);
assert.match(liveHtml, /#facc15|#9a4f24/);
const settings = renderSheet({ ...liveState, sheet: { kind: "settings" }, pushDelivery: "on", pushWant: { picks: true, locks: true }, text: "md", theme: "night" } as AppState, card);
assert.match(settings, /Phone alerts/);
assert.match(settings, /Ticket locks, final grades &amp; live NFL red-zone \/ TD alerts/);
assert.match(settings, /Send test \/ re-sync/);
assert.match(settings, /data-act="push-test"/);
assert.doesNotMatch(settings, /Saved on this phone only/);
assert.doesNotMatch(settings, /do not send notifications/);
const iphone = renderSheet({ ...liveState, sheet: { kind: "settings" }, pushDelivery: "standalone", pushWant: { picks: false, locks: false }, text: "md", theme: "night" } as AppState, card);
assert.match(iphone, /Home Screen/);

console.log("live card tests ok");
