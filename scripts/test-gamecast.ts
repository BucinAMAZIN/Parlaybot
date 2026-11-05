import assert from "node:assert/strict";
import { displayCat } from "../src/data/gradeLabels.ts";
import {
  calloutOf,
  courtPoint,
  filterShots,
  fgLine,
  gcHum,
  parseCast,
  readableColor,
  winLine,
} from "../src/data/gamecast.ts";
import { gradeTeamBet, sortLiveGames, teamBet } from "../src/data/liveCard.ts";

const away = courtPoint(16, 24, false);
assert.ok(away);
assert.equal(away.cx, 5.25 + 24);
assert.equal(away.cy, 16);
const home = courtPoint(16, 24, true);
assert.ok(home);
assert.equal(home.cx, 94 - 5.25 - 24);
assert.equal(home.cy, 50 - 16);
assert.equal(courtPoint(16, 90, false), null);
assert.equal(courtPoint(-1, 10, false), null);

assert.equal(gcHum("JumpShot", "makes a jumper", true, true, false), "Jump Shot made");
assert.equal(gcHum("JumpShot", "misses a jumper", true, false, false), "Jump Shot missed");
assert.equal(gcHum("Defensive Rebound", "defensive rebound", false, false, false), "Defensive Rebound");
assert.equal(gcHum("Play", "Alier Maluk makes free throw 1 of 1", true, true, true), "Free Throw");
assert.equal(gcHum("", "Reece Robinson misses 26-foot three point jumper", true, false, false), "Three Point Jumper missed");
assert.equal(gcHum("Play", "Dellquan Warren subbing out for McNeese", false, false, false), "Substitution");
assert.equal(/play/i.test(gcHum("Play", "something happened", false, false, false)), false);
assert.equal(calloutOf("Halftime", null), "HALFTIME");
assert.equal(calloutOf("7:05 - 1st", { type: "JumpShot", text: "misses 26-foot three", abbr: "MCN", shooting: true, made: false, freeThrow: false }), "MISSED SHOT");
assert.equal(calloutOf("", { type: "JumpShot", text: "makes 26-foot three point jumper", abbr: "MCN", shooting: true, made: true, freeThrow: false }), "MCN THREE");
assert.equal(winLine(0.681, "MCN", "UNT"), "Win %: UNT, 68.1");
assert.equal(winLine(0.2, "MCN", "UNT"), "Win %: MCN, 80.0");
assert.equal(winLine(0.5, "MCN", "UNT"), "");

const summary = {
  header: {
    competitions: [{
      status: { type: { state: "in", shortDetail: "4:05 - 1st" } },
      competitors: [
        { homeAway: "away", score: "25", team: { id: "2377", abbreviation: "MCN", color: "00529C", alternateColor: "ffd204", logos: [{ href: "https://example.test/mcn.png" }] } },
        { homeAway: "home", score: "19", team: { id: "249", abbreviation: "UNT", color: "068f33", logo: "https://example.test/unt.png" } },
      ],
    }],
  },
  winprobability: [{ homeWinPercentage: 0.42, playId: "p2" }],
  plays: [
    { id: "p1", text: "makes layup", type: { text: "LayUpShot" }, shootingPlay: true, scoringPlay: true, team: { id: "2377" }, coordinate: { x: 10, y: 4 }, awayScore: 2, homeScore: 0, scoreValue: 2, clock: { displayValue: "18:00" }, period: { number: 1, displayValue: "1st Half" } },
    { id: "p2", text: "misses 26-foot three point jumper", type: { text: "Play" }, shootingPlay: true, scoringPlay: false, team: { id: "249" }, coordinate: { x: 20, y: 22 }, awayScore: 2, homeScore: 0, scoreValue: 0, clock: { displayValue: "17:40" }, period: { number: 1, displayValue: "1st Half" } },
    { id: "ft", text: "makes free throw", type: { text: "MadeFreeThrow" }, shootingPlay: true, scoringPlay: true, team: { id: "2377" }, coordinate: { x: 25, y: 0 }, awayScore: 3, homeScore: 0, scoreValue: 1, clock: { displayValue: "17:20" }, period: { number: 1, displayValue: "1st Half" } },
  ],
};
const cast = parseCast(summary, "NCAAB");
assert.ok(cast);
assert.equal(cast.away.abbr, "MCN");
assert.equal(cast.home.score, "19");
assert.equal(cast.away.logo, "https://example.test/mcn.png");
assert.equal(cast.shots.length, 2);
const three = cast.plays.find((play) => play.text.includes("three"));
assert.equal(three?.title.includes("Three Point Jumper missed"), true);
assert.equal(three?.awayScore, "2");
assert.equal(three?.homeScore, "0");
assert.equal(cast.plays[0].text.includes("free throw"), true);
assert.equal(cast.plays[0].win, "Win %: MCN, 58.0");
assert.equal(JSON.stringify(cast.plays).includes('"scoreValue"'), false);
assert.equal(cast.plays.some((play) => play.title === "Play"), false);
const onlyAway = filterShots(cast.shots, "MCN", "1H");
assert.equal(onlyAway.length, 1);
assert.equal(onlyAway[0].made, true);
assert.equal(fgLine(onlyAway, "MCN"), "MCN 1/1 FG");
assert.equal(filterShots(cast.shots, "All", "2H").length, 0);
assert.deepEqual(cast.periods, ["1H", "2H"]);
assert.equal(displayCat("LEG DAY"), "Props");
assert.equal(displayCat("Leg Day"), "Props");
assert.equal(displayCat("The Heist"), "The Heist");
assert.notEqual(readableColor("00529C", "ffd204"), "#00529c");

const football = parseCast({
  header: { competitions: [{ status: { type: { state: "in", shortDetail: "12:04 - 1st" } }, competitors: [
    { homeAway: "away", score: "7", team: { id: "1", abbreviation: "BAL", color: "241773" } },
    { homeAway: "home", score: "3", team: { id: "2", abbreviation: "JAX", color: "006778" } },
  ] }] },
  situation: { yardLine: 72, distance: 8, shortDownDistanceText: "2nd & 8", isRedZone: true, possessionText: "BAL 28" },
  drives: { current: { description: "6 plays, 34 yards" } },
  plays: [],
}, "NFL");
assert.equal(football?.football?.yard, 72);
assert.equal(football?.football?.first, 80);
assert.equal(football?.football?.redZone, true);
assert.match(football?.football?.drive ?? "", /6 plays/);

const quiet = parseCast({
  header: { competitions: [{ status: { type: { state: "pre", shortDetail: "8:15 PM" } }, competitors: [
    { homeAway: "away", score: "0", team: { id: "1", abbreviation: "BAL" } },
    { homeAway: "home", score: "0", team: { id: "2", abbreviation: "JAX" } },
  ] }] },
  plays: [],
}, "NFL");
assert.equal(quiet?.football, null);

const games = [
  { id: "late", pre: true, final: false, start: "2026-11-05T22:00:00Z", league: "NBA" },
  { id: "done", pre: false, final: true, start: "2026-11-05T17:00:00Z", league: "NCAAB" },
  { id: "live", pre: false, final: false, start: "2026-11-05T22:00:00Z", league: "NCAAB" },
  { id: "early", pre: true, final: false, start: "2026-11-05T20:00:00Z", league: "NHL" },
];
assert.deepEqual(sortLiveGames(games).map((game) => game.id), ["live", "early", "late", "done"]);

assert.deepEqual(teamBet("McNeese Cowboys ML"), { kind: "ml", team: "McNeese Cowboys" });
assert.deepEqual(teamBet("Celtics -3.5"), { kind: "spread", team: "Celtics", spread: -3.5 });
assert.deepEqual(teamBet("Over 145.5"), { kind: "total", line: 145.5, under: false });
assert.equal(teamBet("Justice Hill Over 2.5 Receptions"), null);

const trailing = gradeTeamBet({ kind: "ml", team: "McNeese Cowboys" }, 38, 43, "away", "in");
assert.equal(trailing.label, "Trailing 38–43");
assert.equal(trailing.pace, "behind");
const leading = gradeTeamBet({ kind: "ml", team: "North Texas" }, 38, 43, "home", "in");
assert.equal(leading.label, "Leading 43–38");
assert.equal(leading.pace, "on");
const won = gradeTeamBet({ kind: "ml", team: "North Texas" }, 38, 43, "home", "post");
assert.equal(won.pace, "hit");
const lost = gradeTeamBet({ kind: "ml", team: "McNeese Cowboys" }, 38, 43, "away", "post");
assert.equal(lost.pace, "dead");
const tied = gradeTeamBet({ kind: "ml", team: "McNeese Cowboys" }, 40, 40, "away", "in");
assert.equal(tied.label, "Tied 40–40");

const covering = gradeTeamBet({ kind: "spread", team: "McNeese", spread: 6.5 }, 38, 43, "away", "in");
assert.equal(covering.pace, "on");
assert.match(covering.label, /\+6\.5 · covering/);
const short = gradeTeamBet({ kind: "spread", team: "McNeese", spread: 4 }, 38, 43, "away", "post");
assert.equal(short.pace, "dead");
const push = gradeTeamBet({ kind: "spread", team: "McNeese", spread: 5 }, 38, 43, "away", "post");
assert.equal(push.pace, "on");
assert.match(push.label, /push/);

const total = gradeTeamBet({ kind: "total", line: 145.5, under: false }, 38, 43, null, "in");
assert.equal(total.current, 81);
assert.equal(total.line, 145.5);
assert.equal(total.pace, "on");
const cashed = gradeTeamBet({ kind: "total", line: 145.5, under: false }, 80, 70, null, "post");
assert.equal(cashed.pace, "hit");
const under = gradeTeamBet({ kind: "total", line: 145.5, under: true }, 80, 70, null, "post");
assert.equal(under.pace, "dead");

console.log("gamecast tests ok");
