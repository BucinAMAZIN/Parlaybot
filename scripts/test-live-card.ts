import assert from "node:assert/strict";
import { box, firstBloodLeg, formatRankValue, teamStatsFor, trackPlayOnBoard } from "../src/data/espn.ts";
import { reactionOf } from "../src/ui/bits.ts";
import { renderPlay } from "../src/ui/bits.ts";
import type { LiveGame, LiveLeg, Play, WhyBlock } from "../src/data/types.ts";

const why: WhyBlock = { ours: false, line: "", why: [], whyNot: [] };

function leg(partial: Partial<LiveLeg> & Pick<LiveLeg, "pace" | "current" | "line">): LiveLeg {
  return { name: "Play", unit: "", source: "ESPN", why, ...partial };
}

assert.equal(reactionOf(leg({ pace: "hit", current: 7, line: 6.5 })).emoji, "💰");
assert.equal(reactionOf(leg({ pace: "on", current: 4, line: 6.5 })).emoji, "🔥");
assert.equal(reactionOf(leg({ pace: "behind", current: 2, line: 6.5 })).emoji, "😓");
assert.equal(reactionOf(leg({ pace: "cold", current: 0, line: 6.5 })).emoji, "🥶");
assert.equal(reactionOf(leg({ pace: "dead", current: 6, line: 6.5 })).emoji, "🪝");
assert.equal(reactionOf(leg({ pace: "dead", current: 2, line: 6.5 })).emoji, "❌");
assert.equal(Math.abs(6 - 6.5) === 0.5, true);

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
assert.match(html, /class="ptrack"/);
assert.equal(label.includes("ptrack"), false);

console.log("live card tests ok");
