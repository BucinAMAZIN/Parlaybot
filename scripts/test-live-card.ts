import assert from "node:assert/strict";
import { absorbLiveLeg, abbrsMatch, box, firstBloodLeg, formatRankValue, liveTitle, mergeTags, propOf, readStat, teamStatsFor, trackPlayOnBoard } from "../src/data/espn.ts";
import { adaptDesk } from "../src/data/desk.ts";
import { PACE, mascot, renderPlay } from "../src/ui/bits.ts";
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
const pbodyEnd = html.indexOf(`</div><div class="ptrack">`);
const pbody = html.slice(html.indexOf(`<div class="pbody">`), pbodyEnd);
assert.match(html, /<div class="btns">[\s\S]*<\/div><\/div><div class="ptrack">bar<\/div><\/div>$/);
assert.equal(pbody.includes("ptrack"), false);
assert.equal(label.includes("ptrack"), false);

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
assert.equal(safeBoard.tickets.some((item) => item.plays.some((play) => play.tags?.includes("+100 ALT"))), true);
assert.equal(safeBoard.tickets.some((item) => item.plays.some((play) => play.tags?.includes("+100 ALT · NHL"))), true);
assert.equal(safeBoard.notices.some((note) => /No qualifying Alt Parlay/.test(note.text)), true);

console.log("live card tests ok");
