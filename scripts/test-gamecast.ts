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
import { courtHardware, footballField, nhlRink, threePointPath } from "../src/ui/court.ts";
import { footballTitle } from "../src/data/gamecast.ts";
import { buildNumber, newerBuild } from "../src/lib/buildWatch.ts";
import { absorbLiveLeg, cleanLiveTitle, findLiveLeg, liveLegKey, overallRecord, standingLabel } from "../src/data/espn.ts";
import type { LiveGame, LiveLeg, WhyBlock } from "../src/data/types.ts";

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

const utsa = parseCast({
  header: { competitions: [{ status: { type: { state: "in", shortDetail: "14:55 - 2nd" } }, competitors: [
    { homeAway: "away", score: "0", team: { id: "2636", abbreviation: "UTSA", color: "0c2340", logos: [{ href: "https://example.test/utsa.png" }] } },
    { homeAway: "home", score: "7", team: { id: "2226", abbreviation: "FAU", color: "003366" } },
  ] }] },
  winprobability: [{ playId: "rush-1", homeWinPercentage: 0.5919 }],
  drives: {
    previous: [{ id: "drive-1", team: { id: "2636" }, plays: [{ id: "old", type: { text: "Rush" }, text: "(1:00) earlier rush", statYardage: 2, period: { number: 1 }, clock: { displayValue: "1:00" }, start: { down: 1, distance: 10, yardsToEndzone: 75, downDistanceText: "1st & 10 at UTSA 25", team: { id: "2636" } }, end: { down: 2, distance: 8, yardsToEndzone: 73, team: { id: "2636" } } }] }],
    current: {
      id: "drive-1",
      description: "5 plays, 39 yards, 1:20",
      offensivePlays: 5,
      yards: 39,
      timeElapsed: { displayValue: "1:20" },
      team: { id: "2636" },
      start: { yardLine: 75, text: "UTSA 25" },
      plays: [
        { id: "end-q", type: { text: "End Period" }, text: "End of 1st quarter.", period: { number: 1 }, clock: { displayValue: "0:00" } },
        { id: "rush-1", type: { text: "Rush" }, text: "(14:55) No Huddle #1 W.Henderson III rush left for 28 yards gain to the FAU36, 1ST DOWN", statYardage: 28, scoringPlay: false, period: { number: 2 }, clock: { displayValue: "14:55" }, awayScore: "0", homeScore: "7", start: { down: 2, distance: 10, yardsToEndzone: 64, downDistanceText: "2nd & 10 at UTSA 36", team: { id: "2636" } }, end: { down: 1, distance: 10, yardsToEndzone: 36, downDistanceText: "1st & 10 at FAU 36", team: { id: "2636" } } },
      ],
    },
  },
}, "NCAAF");
assert.equal(utsa?.plays.length, 2);
assert.equal(utsa?.plays[0]?.title, "Rush +28 yds");
assert.equal(utsa?.plays[0]?.badge, "1ST DOWN");
assert.equal(utsa?.plays[0]?.spot, "2nd & 10 · UTSA 36");
assert.equal(utsa?.plays[0]?.when, "Q2 · 14:55");
assert.equal(/\(14:55\)/.test(utsa?.plays[0]?.text ?? ""), false);
assert.match(utsa?.plays[0]?.win ?? "", /FAU, 59\.2/);
assert.equal(utsa?.football?.yard, 64);
assert.equal(utsa?.football?.first, 74);
assert.equal(utsa?.football?.driveStart, 25);
assert.match(utsa?.football?.down ?? "", /UTSA ball · 1st & 10/);
assert.match(utsa?.football?.drive ?? "", /5 plays, 39 yds · 1:20/);
assert.equal(utsa?.callout, "RUSH +28 YDS");
assert.deepEqual(utsa?.periods, ["Q1", "Q2", "Q3", "Q4"]);
const field = footballField(utsa?.football ?? { yard: 64, down: "", drive: "", redZone: false, first: 74, awayAbbr: "UTSA", homeAbbr: "FAU", awayColor: "#0c2340", homeColor: "#003366" });
assert.match(field, /UTSA/);
assert.match(field, /FAU/);
assert.match(field, /#38bdf8/);
assert.match(field, /#facc15/);
assert.equal(footballTitle("Pass Incompletion", "pass incomplete", 0, false).title, "Incomplete Pass");
assert.equal(footballTitle("Passing Touchdown", "touchdown", 12, true).title, "TOUCHDOWN");

const pat = parseCast({
  header: { competitions: [{ status: { type: { state: "in", shortDetail: "0:12 - 2nd" } }, competitors: [
    { homeAway: "away", score: "6", team: { id: "1", abbreviation: "BAL", color: "241773" } },
    { homeAway: "home", score: "7", team: { id: "2", abbreviation: "JAX", color: "006778" } },
  ] }] },
  drives: { current: { id: "pat", team: { id: "2" }, plays: [
    { id: "td", type: { text: "Passing Touchdown" }, text: "(0:18) touchdown", scoringPlay: true, statYardage: 8, period: { number: 2 }, clock: { displayValue: "0:18" }, start: { down: 1, distance: 8, yardsToEndzone: 8, team: { id: "2" } }, end: { down: -1, yardsToEndzone: 35, downDistanceText: "& Goal at JAX 35", team: { id: "2" } } },
    { id: "admin", type: { text: "Timeout" }, text: "Official Timeout", period: { number: 2 }, clock: { displayValue: "0:12" } },
  ] } },
}, "NFL");
assert.match(pat?.football?.down ?? "", /Kickoff \/ PAT at JAX 35/);
assert.equal(pat?.football?.yard, 35);
assert.match(pat?.callout ?? "", /TIMEOUT · TOUCHDOWN/);
assert.equal(pat?.plays[0]?.title, "Official Timeout");

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
assert.equal(total.unit, "PTS");
assert.equal(total.pace, "on");
const cashed = gradeTeamBet({ kind: "total", line: 145.5, under: false }, 80, 70, null, "post");
assert.equal(cashed.pace, "hit");
const under = gradeTeamBet({ kind: "total", line: 145.5, under: true }, 80, 70, null, "post");
assert.equal(under.pace, "dead");
const nhlCold = gradeTeamBet({ kind: "total", line: 5.5, under: false }, 0, 0, null, "in", "NHL", 0.37);
assert.equal(nhlCold.unit, "G");
assert.equal(nhlCold.current, 0);
assert.equal(nhlCold.pace, "cold");
const nhlCash = gradeTeamBet({ kind: "total", line: 5.5, under: false }, 3, 3, null, "in", "NHL", 0.5);
assert.equal(nhlCash.pace, "hit");
assert.equal(nhlCash.unit, "G");
const nhlBust = gradeTeamBet({ kind: "total", line: 5.5, under: true }, 4, 3, null, "in", "NHL", 0.4);
assert.equal(nhlBust.pace, "dead");
const nhlSweat = gradeTeamBet({ kind: "total", line: 5.5, under: true }, 3, 1, null, "in", "NHL", 0.5);
assert.equal(nhlSweat.pace, "behind");
const nhlEarly = gradeTeamBet({ kind: "total", line: 5.5, under: false }, 0, 0, null, "in", "NHL", 0.02);
assert.equal(nhlEarly.pace, "on");
const mlbTotal = gradeTeamBet({ kind: "total", line: 8.5, under: false }, 1, 0, null, "in", "MLB", 0.2);
assert.equal(mlbTotal.unit, "R");

const ncaamLeft = threePointPath(true, false);
const ncaamRight = threePointPath(false, false);
const nbaLeft = threePointPath(true, true);
const nbaRight = threePointPath(false, true);
assert.match(ncaamLeft, /L 9\.93 3\.35/);
assert.match(ncaamRight, /L 84\.07 3\.35/);
assert.match(nbaLeft, /L 14\.20 3 /);
assert.match(nbaRight, /L 79\.80 3 /);
const college = courtHardware(false);
const pro = courtHardware(true);
for (const svg of [college, pro]) {
  assert.match(svg, /cx="19" cy="25" r="6"/);
  assert.match(svg, /cx="75" cy="25" r="6"/);
  assert.match(svg, /cx="5\.25" cy="25" r="0\.75"/);
  assert.match(svg, /cx="88\.75" cy="25" r="0\.75"/);
}
assert.match(college, /L 9\.93 3\.35/);
assert.match(pro, /L 14\.20 3 /);
assert.doesNotMatch(college, /M 0 3\.48/);
assert.doesNotMatch(pro, /A 23\.75 23\.75 0 0 1 0 /);

assert.equal(buildNumber('<meta name="parlaybot-build" content="27" />'), "27");
assert.equal(buildNumber('<meta content="28" name="parlaybot-build">'), "28");
assert.equal(buildNumber("<html></html>"), "");
assert.equal(newerBuild("26", "27"), true);
assert.equal(newerBuild("27", "27"), false);
assert.equal(newerBuild("28", "27"), false);
assert.equal(newerBuild("", "27"), false);

const mcneese = { away: { abbr: "MCN", names: ["mcn", "mcneese", "mcneese cowboys"] }, home: { abbr: "UNT", names: ["unt", "north texas"] } };
const mlKey = liveLegKey("McNeese Cowboys ML", "NCAAB", mcneese);
assert.equal(mlKey, liveLegKey("McNeese Cowboys ML (vs UNT; CBB free play)", "NCAAB", mcneese));
assert.equal(mlKey, "ml:away");
assert.equal(cleanLiveTitle("McNeese Cowboys ML (vs UNT; CBB free play)"), "McNeese Cowboys ML");
const emptyWhy: WhyBlock = { ours: false, line: "", why: [], whyNot: [] };
const capperWhy: WhyBlock = { ours: false, line: "Posted as a free play", why: ["Posted as a free play"], whyNot: [] };
const blankLeg: LiveLeg = { name: "McNeese Cowboys ML", current: 48, line: 53, unit: "", pace: "behind", source: "ESPN score", why: emptyWhy, label: "Trailing 48–53", key: mlKey };
const notedLeg: LiveLeg = { ...blankLeg, name: "McNeese Cowboys ML (vs UNT; CBB free play)", why: capperWhy };
const merged = absorbLiveLeg(blankLeg, notedLeg);
assert.equal(merged.name, "McNeese Cowboys ML");
assert.equal(merged.why.why[0], "Posted as a free play");
const game = { league: "NCAAB", away: "MCN", home: "UNT", awayName: "McNeese", homeName: "North Texas", legs: [merged] } as LiveGame;
assert.equal(findLiveLeg("McNeese Cowboys ML", game)?.label, "Trailing 48–53");
assert.equal(findLiveLeg("McNeese Cowboys ML (vs UNT; CBB free play)", game)?.key, mlKey);
assert.notEqual(liveLegKey("Justice Hill Over 2.5 Receptions", "NFL"), liveLegKey("Justice Hill Over 1.5 Receptions", "NFL"));
assert.equal(liveLegKey("Mikhail Sergachev o0.5 Points", "NHL"), liveLegKey("Mikhail Sergachev Over 0.5 Points (via @capper)", "NHL"));
const mccain = liveLegKey("Jared McCain 3+ Rebounds", "NBA");
assert.equal(mccain, liveLegKey("Jared McCain o2.5 Rebounds", "NBA"));
assert.equal(mccain, "prop:jared mccain:rebounds:over:2.5");
assert.equal(liveLegKey("Justice Hill Over 2.5 Receptions", "NFL"), liveLegKey("Justice Hill o2.5 Receptions", "NFL"));
assert.notEqual(liveLegKey("Josh Cuevas Over 2.5 Receptions", "NFL"), liveLegKey("Josh Cuevas 1+ Receptions", "NFL"));
assert.equal(liveLegKey("Josh Cuevas 1+ Receptions", "NFL"), "prop:josh cuevas:receptions:over:0.5");
assert.equal(liveLegKey("Trae Young 9+ Assists", "NBA"), "prop:trae young:assists:over:8.5");
assert.notEqual(liveLegKey("Trae Young 9+ Assists", "NBA"), liveLegKey("Trae Young Over 9.5 Assists", "NBA"));
assert.equal(liveLegKey("Rashod Bateman 5+ Rec Yards", "NFL"), "prop:rashod bateman:receivingYards:over:4.5");
assert.notEqual(liveLegKey("Rashod Bateman 5+ Rec Yards", "NFL"), liveLegKey("Rashod Bateman Over 13.5 Rec Yards", "NFL"));

assert.equal(gcHum("Face Off", "William Karlsson faceoff won against Emmitt Finnie", true, false, false, "hockey"), "Faceoff");
assert.equal(gcHum("Stoppage", "Goalie Stopped", true, false, false, "hockey"), "Stoppage");
assert.equal(gcHum("Period Start", "Start of 1st Period", true, false, false, "hockey"), "Period Start");
assert.equal(gcHum("shot-on-goal", "Moritz Seider Snap Shot saved by Carter Hart", true, false, false, "hockey"), "Shot on Goal");
assert.equal(gcHum("shot-missed", "Jack Eichel missed the net", true, false, false, "hockey"), "Missed Shot");
assert.equal(gcHum("shot-blocked", "Alex DeBrincat shot blocked by Ivan Barbashev", true, false, false, "hockey"), "Blocked Shot");
assert.equal(gcHum("goal", "Jack Eichel goal", true, true, false, "hockey"), "Goal");
assert.equal(gcHum("Rush", "Player rushes for 4 yards", true, false, false, "football"), "Rush");
assert.equal(gcHum("Hit", "Player hit", true, false, false, "hockey"), "Hit");
assert.equal(/missed/i.test(gcHum("Face Off", "faceoff won", true, false, false, "hockey")), false);
assert.equal(calloutOf("19:24 - 1st", { type: "faceoff", text: "faceoff won", abbr: "VGK", shooting: true, made: false, freeThrow: false }, "hockey"), "FACEOFF");
assert.equal(calloutOf("19:24 - 1st", { type: "shot-on-goal", text: "Snap Shot saved", abbr: "DET", shooting: true, made: false, freeThrow: false }, "hockey"), "SHOT SAVED");
assert.equal(calloutOf("19:24 - 1st", { type: "goal", text: "goal", abbr: "VGK", shooting: true, made: true, freeThrow: false }, "hockey"), "VGK GOAL");
assert.equal(calloutOf("", { type: "stoppage", text: "Goalie Stopped", abbr: "", shooting: true, made: false, freeThrow: false }, "hockey"), "STOPPAGE");

const nhl = parseCast(
  {
    header: {
      competitions: [
        {
          status: { type: { state: "in", shortDetail: "19:24 - 1st" } },
          competitors: [
            { homeAway: "away", score: "0", team: { id: "1", abbreviation: "VGK", color: "b4975a", alternateColor: "333f42", logos: [{ href: "https://a.espncdn.com/vgk.png" }] } },
            { homeAway: "home", score: "0", team: { id: "2", abbreviation: "DET", color: "ce1126", alternateColor: "ffffff" } },
          ],
        },
      ],
    },
    plays: [
      { text: "Start of 1st Period", type: { text: "Period Start", abbreviation: "period-start" }, shootingPlay: true, period: { number: 1, displayValue: "1st" }, clock: { displayValue: "0:00" } },
      { text: "William Karlsson faceoff won against Emmitt Finnie", type: { text: "Face Off", abbreviation: "faceoff" }, shootingPlay: true, team: { id: "1" }, period: { number: 1 }, clock: { displayValue: "0:36" } },
      { text: "Goalie Stopped", type: { text: "Stoppage", abbreviation: "stoppage" }, shootingPlay: true, period: { number: 1 }, clock: { displayValue: "0:36" } },
      { text: "Moritz Seider Snap Shot saved by Carter Hart", type: { text: "Shot", abbreviation: "shot-on-goal" }, shootingPlay: true, team: { id: "2" }, coordinate: { x: 50, y: 10 }, period: { number: 1 }, clock: { displayValue: "0:34" } },
      { text: "Alex DeBrincat shot blocked by Ivan Barbashev", type: { text: "Blocked Shot", abbreviation: "shot-blocked" }, shootingPlay: true, team: { id: "1" }, coordinate: { x: -40, y: 5 }, period: { number: 1 }, clock: { displayValue: "0:20" } },
      { text: "Jack Eichel missed the net", type: { text: "Missed Shot", abbreviation: "shot-missed" }, shootingPlay: true, team: { id: "1" }, coordinate: { x: 70, y: -10 }, period: { number: 1 }, clock: { displayValue: "0:10" } },
      { text: "Jack Eichel goal", type: { text: "Goal", abbreviation: "goal" }, shootingPlay: true, scoringPlay: true, team: { id: "1" }, coordinate: { x: 80, y: 2 }, period: { number: 1 }, clock: { displayValue: "0:05" } },
    ],
  },
  "NHL",
);
assert.ok(nhl);
assert.equal(nhl?.callout, "VGK GOAL");
assert.equal(nhl?.plays.some((play) => /missed/i.test(play.title) && play.title !== "Missed Shot"), false);
assert.deepEqual(
  nhl?.plays.map((play) => play.title),
  ["Goal", "Missed Shot", "Blocked Shot", "Shot on Goal", "Stoppage", "Faceoff", "Period Start"],
);
assert.equal(nhl?.plays.find((play) => play.title === "Period Start")?.abbr, "");
assert.equal(nhl?.rink.find((mark) => mark.cx === -40)?.abbr, "DET");
assert.equal(nhl?.rink.find((mark) => mark.cx === 50)?.sog, true);
assert.equal(nhl?.rink.find((mark) => mark.cx === 50)?.goal, false);
assert.equal(nhl?.rink.find((mark) => mark.goal)?.abbr, "VGK");
const rink = nhlRink("https://a.espncdn.com/det.png", "rink-vgk");
assert.match(rink, /viewBox|-100/);
assert.match(rink, /stroke="#c8102e" stroke-width="1.05"/);
assert.match(rink, /x1="-25"/);
assert.match(rink, /x1="25"/);
assert.match(rink, /x1="-89"/);
assert.match(rink, /x1="89"/);
assert.match(rink, /M -89 -6 A 6 6 0 0 1 -89 6 Z/);
assert.match(rink, /M 89 -6 A 6 6 0 0 0 89 6 Z/);
assert.match(rink, /x="-93"/);
assert.match(rink, /x="89" y="-3.2"/);
assert.match(rink, /cx="-69" cy="-22" r="15"/);
assert.match(rink, /cx="69" cy="22" r="15"/);
assert.match(rink, /cx="-20" cy="-22" r="1.1"/);
assert.match(rink, /cx="20" cy="22" r="1.1"/);
assert.match(rink, /opacity="0.16"/);
assert.equal(overallRecord([{ type: "total", name: "overall", summary: "10-5-2" }, { type: "home", summary: "6-2-1" }]), "10-5-2");
assert.equal(
  standingLabel(
    { source: "desk", leagues: { NHL: { note: "", columns: [], groups: [{ name: "Pacific", columns: [], rows: [{ rank: 1, abbr: "VGK", label: "", cells: [], starred: false }] }] } } },
    "NHL",
    "VGK",
  ),
  "1st Pac",
);

console.log("gamecast tests ok");
