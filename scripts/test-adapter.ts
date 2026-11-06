import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { adaptEdgePicks, flatUnitResult, gradeResult, inStarBand } from "../src/data/adaptEdgePicks.ts";
import { edgeFeedTicket, presentEdgePick, tallyEdge } from "../src/data/presentEdgeFeed.ts";
import { draftKingsLegLink, draftKingsSlipLink, hardRockLegLink, hardRockSlipLink, HR_MISMATCH_NOTE, isBlockedHrSid } from "../src/lib/links.ts";
import { propLine } from "../src/lib/propLine.ts";
import { movedAltLine, readHrLive, verifiedLegSid } from "../src/data/heist.ts";
import { renderPage, sportsFor, visibleTickets } from "../src/ui/views.ts";
import { noteVisible } from "../src/lib/cardFilter.ts";
import { fileBounds, historyScope, sliceHistory } from "../src/lib/history.ts";
import { matchingPlays } from "../src/ui/statsScreen.ts";
import { altPreviewTickets } from "../src/ui/altLayout.ts";
import { knownView, viewFromHash, type AppState } from "../src/ui/state.ts";
import { dedupePlays, playKey } from "../src/data/dedupePlays.ts";
import { isTicketRow, ticketParts } from "../src/data/ticketLegs.ts";
import { normProp, normSide, normSport, sectionMatch } from "../src/data/gradeLabels.ts";
import { classifySport, sportLabel } from "../src/lib/sport.ts";
import { adaptClv } from "../src/data/adaptClv.ts";
import { adaptDeskStandings } from "../src/data/adaptStandings.ts";
import { adaptDesk, gradeOf, showsPreparedBoard } from "../src/data/desk.ts";
import { builtLabel, clockEt, heistLabel, injuryLabel, lockLabel, standingsLabel, uiBuildLabel, updatedLabel } from "../src/lib/stamps.ts";
import { shareCardIsPrivate, shareFromPending, shareFromSettled } from "../src/lib/shareCard.ts";
import { results, rings, sampleTickets } from "../src/data/sampleBoard.ts";
import { bookButton, listedOn, renderPlay, winRateBand } from "../src/ui/bits.ts";

const raw = JSON.parse(readFileSync(new URL("../fixtures/edge-picks-sample.json", import.meta.url), "utf8"));
const adapted = adaptEdgePicks(raw);
assert.equal(adapted.skipped.length, 0);
assert.equal(adapted.picks.length, 351);

const nov4 = adapted.picks.filter((pick) => pick.date === "2026-11-04");
assert.equal(nov4.length, 14);
const stenberg = nov4.find((pick) => pick.pick.startsWith("Ivar Stenberg"));
assert.ok(stenberg);
assert.equal(stenberg.grade, "win");
assert.equal(stenberg.hr, "+350");
assert.ok(Math.abs(stenberg.edge - 0.122) < 0.001);

const voided = adapted.picks.find((pick) => pick.grade === "void");
assert.ok(voided);
const pushed = adapted.picks.find((pick) => pick.grade === "push");
assert.ok(pushed);
assert.equal(gradeResult(null), "pending");
assert.equal(gradeResult("Loss (0 AST)"), "loss");

const rawNov4 = (raw as { date: string }[]).filter((row) => row.date === "2026-11-04");
const bad = adaptEdgePicks([{ pick: "Nope" }, rawNov4[0]]);
assert.equal(bad.skipped.length, 1);
assert.equal(bad.picks.length, 1);
assert.throws(() => adaptEdgePicks({ picks: [] }), /JSON array/);

const presented = presentEdgePick(stenberg);
assert.equal(presented.dk, null, "the feed has no DraftKings price");
assert.equal(presented.source, "edge-feed");
assert.equal(presented.blocked, "graded");
assert.equal(presented.hrEvent, stenberg.hrEvent);
assert.ok(!presented.status, "player status is not in the feed");
assert.ok(presented.why.why.some((line) => line.includes(stenberg.fair)));
assert.ok(presented.why.whyNot.length >= 1);

const starPick = adapted.picks.find((pick) => inStarBand(pick.edge));
assert.ok(starPick);
assert.ok(presentEdgePick(starPick).markers?.some((mark) => mark.kind === "star"));
const outside = adapted.picks.find((pick) => pick.edge > 0.08);
assert.ok(outside);
assert.equal(presentEdgePick(outside).markers?.some((mark) => mark.kind === "star"), false);
const sog = nov4.find((pick) => pick.marketTags.includes("sog"));
if (sog) {
  const row = presentEdgePick(sog);
  assert.ok(row.markers?.some((mark) => mark.kind === "sog"));
}
const assist = nov4.find((pick) => pick.marketTags.includes("assist"));
assert.ok(assist);
assert.ok(presentEdgePick(assist).markers?.some((mark) => mark.kind === "assist"));

const ticket = edgeFeedTicket(adapted.picks);
assert.equal(ticket.plays.length, 14);
assert.ok(ticket.plays.every((play) => play.dk === null));
const record = tallyEdge(nov4);
assert.equal(record.wins, 4);
assert.equal(record.losses, 10);
assert.equal(flatUnitResult("+200", "win"), 2);
assert.equal(flatUnitResult("−110", "loss"), -1);
assert.equal(flatUnitResult("+100", "void"), 0);
assert.equal(flatUnitResult("+100", "pending"), null);

const hrSid = "5027401214267097513";
const hr = hardRockLegLink({ id: "x", name: "Test", hrSid });
assert.equal(hr.status, "ready");
if (hr.status === "ready") {
  assert.equal(hr.url, `https://share.hardrock.bet/Pt0T/bet?deep_link_value=hardrock://betslip/${hrSid}`);
}
const hrStored = hardRockLegLink({
  id: "x",
  name: "Test",
  hrSid,
  hrLink: `https://share.hardrock.bet/Pt0T/bet?deep_link_value=hardrock://betslip/${hrSid}`,
});
assert.equal(hrStored.status, "ready");
assert.equal(hardRockLegLink({ id: "x", name: "No id", hrSid: "not-a-sid" }).status, "missing");
const slip = hardRockSlipLink([
  { id: "a", name: "A", hrSid: "111" },
  { id: "b", name: "B", hrSid: "222" },
  { id: "c", name: "C" },
]);
assert.equal(slip.status, "ready");
if (slip.status === "ready") {
  assert.equal(slip.url, "https://share.hardrock.bet/Pt0T/bet?deep_link_value=hardrock://betslip/111,222");
  assert.match(slip.detail ?? "", /Not on HR/);
}
const wrongSid = "1051261159191216543";
const wrong = hardRockLegLink({
  id: "mcneese",
  name: "McNeese Cowboys ML (vs UNT; CBB free play)",
  hrSid: wrongSid,
  hrLink: `https://share.hardrock.bet/Pt0T/bet?deep_link_value=hardrock://betslip/${wrongSid}`,
});
assert.equal(wrong.status, "mismatch");
if (wrong.status === "mismatch") assert.equal(wrong.detail, HR_MISMATCH_NOTE);
assert.equal(JSON.stringify(wrong).includes(wrongSid), false);
const mixed = hardRockSlipLink([
  { id: "ok", name: "Other play", hrSid: "111" },
  { id: "mcneese", name: "McNeese Cowboys ML (vs UNT; CBB free play)", hrSid: wrongSid },
]);
assert.equal(mixed.status, "ready");
if (mixed.status === "ready") {
  assert.equal(mixed.url.includes(wrongSid), false);
  assert.match(mixed.url, /betslip\/111$/);
  assert.match(mixed.detail ?? "", /Not launched/);
}
const onlyWrong = hardRockSlipLink([{ id: "mcneese", name: "McNeese Cowboys ML", hrSid: wrongSid }]);
assert.equal(onlyWrong.status, "mismatch");
const capperBoard = adaptDesk(
  {
    today: { date: "2026-11-05", tickets: [], sports: {} },
    cappers: [{
      name: "@showtimepicks2",
      today: [
        { sport: "NCAAB", pick: "McNeese Cowboys ML (vs UNT; CBB free play)", odds: "-142", hr_sid: wrongSid, hr_link: `https://share.hardrock.bet/Pt0T/bet?deep_link_value=hardrock://betslip/${wrongSid}`, game: "MCN @ UNT" },
        { sport: "Tennis", pick: "Tomas Martin Etcheverry ML (rare tennis play)", odds: "-135" },
      ],
    }],
    results_v2: { rows: [] },
  },
  { note: "", columns: [], groups: [] },
);
const showtime = capperBoard.tickets.find((item) => item.productKey === "cappers")?.plays ?? [];
assert.equal(showtime[0]?.name.includes("McNeese"), true);
assert.equal(showtime[0]?.hrSid, wrongSid);
assert.equal(showtime[1]?.name.includes("Etcheverry"), true);
assert.equal(showtime[1]?.hrSid, undefined);
assert.equal(hardRockLegLink({ id: showtime[0].id, name: showtime[0].name, hrSid: showtime[0].hrSid, hrLink: showtime[0].hrLink }).status, "mismatch");
const unverified = adaptDesk(
  {
    today: { date: "2026-11-05", tickets: [], sports: {} },
    cappers: [{
      name: "@showtimepicks2",
      today: [
        { sport: "NCAAB", pick: "McNeese Cowboys ML (vs UNT; CBB free play)", odds: "-142", hr_why: "Unverified link: Hard Rock selection could not be verified for this NCAAB game" },
        { sport: "Tennis", pick: "Tomas Martin Etcheverry ML (rare tennis play)", odds: "-135", hr_why: "no Hard Rock event found for this player/team", hr_absent: false },
      ],
    }],
    results_v2: { rows: [] },
  },
  { note: "", columns: [], groups: [] },
).tickets.find((item) => item.productKey === "cappers")?.plays ?? [];
assert.match(unverified[0]?.hrUnverified ?? "", /Unverified link/);
assert.equal(unverified[0]?.hrSid, undefined);
assert.equal(unverified[1]?.hrUnverified, undefined);
assert.equal(unverified[1]?.name.includes("Etcheverry"), true);

const dkSid = "0QA385792709#2349946626_13L42648Q1-1115091407Q20";
const dkLink = `https://sportsbook.draftkings.com/event/34937000?outcomes=${encodeURIComponent(dkSid)}`;
const dkOne = draftKingsLegLink({ id: "d", name: "Davion", dkSid, dkLink });
assert.equal(dkOne.status, "ready");
if (dkOne.status === "ready") assert.equal(dkOne.url, dkLink);
assert.equal(draftKingsLegLink({ id: "d", name: "No id" }).status, "missing");
const dkTwoSid = "0QA385795123#2349948751_13L42648Q1-1318291850Q20";
const dkTwoLink = `https://sportsbook.draftkings.com/event/34937000?outcomes=${encodeURIComponent(dkTwoSid)}`;
const dk = draftKingsSlipLink([
  { id: "a", name: "One", dkSid, dkLink },
  { id: "b", name: "Two", dkSid: dkTwoSid, dkLink: dkTwoLink },
]);
assert.equal(dk.status, "legs");
if (dk.status === "legs") {
  assert.equal(dk.urls.length, 2);
  assert.equal(dk.urls[0].url, dkLink);
  assert.equal(dk.urls[1].url, dkTwoLink);
  assert.match(dk.detail, /each leg opens on its own/i);
  assert.ok(dk.urls.every((leg) => !leg.url.includes("dk.html") && !leg.url.startsWith("dksb:")));
}

const desk = JSON.parse(readFileSync(new URL("../fixtures/desk-standings.json", import.meta.url), "utf8"));
const sampleNcaab = {
  note: "NCAAB by conference · SAMPLE DATA",
  columns: ["Conf", "Overall"],
  groups: [{ name: "Big Ten", columns: ["Conf", "Overall"], rows: [] }],
};
const tables = adaptDeskStandings(desk, sampleNcaab);
const count = (league: string) => tables.leagues[league].groups.reduce((sum, group) => sum + group.rows.length, 0);
assert.equal(count("NHL"), 32);
assert.equal(count("NFL"), 32);
assert.equal(count("NBA"), 30);
assert.ok(tables.leagues.NCAAB.note.includes("SAMPLE"));
const withCollege = adaptDeskStandings(
  {
    updated: "2026-11-05 08:43 AM ET",
    leagues: {
      NCAAB: {
        games: [{ a: "WAKE", h: "VAN", st: "11/5 - 6:00 PM EST" }],
        groups: [
          { name: "AP Top 25", rows: [{ t: "1. Florida", ab: "FLA", rec: "0-0" }] },
          { name: "Big Ten Conference", rows: [{ t: "Bryant Bulldogs", ab: "BRY", rec: "1-0", pct: "1.000", gb: "-", home: "1-0", road: "0-0", strk: "W1", div: "0-0", diff: "+5", seed: "1" }] },
        ],
      },
    },
  },
  sampleNcaab,
);
assert.equal(withCollege.leagues.NCAAB.groups[0].name, "AP Top 25");
assert.equal(withCollege.leagues.NCAAB.groups[0].rows[0].label, "Florida");
assert.equal(withCollege.leagues.NCAAB.groups[1].rows[0].cells[0], "1-0");
assert.equal(withCollege.leagues.NCAAB.groups[1].columns.includes("PCT"), true);
assert.equal(withCollege.leagues.NCAAB.games?.[0].away, "WAKE");
assert.ok(!withCollege.leagues.NCAAB.note.includes("SAMPLE"));
const clv = adaptClv({
  built: "2026-11-05T08:43:22-05:00",
  error: null,
  plays: [
    { pick_id: "2026-11-04|potd|NHL|seth jones over 0.5 assists|x", pick: "Seth Jones Over 0.5 Assists", section: "Play of the Day", date: "2026-11-04", posted_odds: "-120", close_odds: "-110", posted_line: 0.5, close_line: 0.5, clv_pct: 1.16 },
  ],
  by_section: { "Play of the Day": { count: 1, avg_clv: 1.16, beat_close: 1, beat_close_pct: 100 } },
  totals: { count: 1, avg_clv: 1.16, beat_close: 1, beat_close_pct: 100 },
});
assert.equal(clv?.built, "8:43 AM ET");
assert.equal(clv?.stale, false);
assert.equal(clv?.beatPct, 100);
assert.equal(adaptClv(null), null);
assert.equal(adaptClv({ plays: [], totals: {}, by_section: {} }), null);
const stale = adaptClv({ error: "late", plays: [{ pick: "A Over 1", date: "2026-11-04", clv_pct: -1, posted_odds: "-110", close_odds: "-120" }], totals: { count: 1, avg_clv: -1, beat_close: 0, beat_close_pct: 0 } });
assert.equal(stale?.stale, true);
assert.equal(classifySport("NCAA F"), "NCAAF");
assert.equal(classifySport("NCAAM"), "NCAAB");
assert.equal(classifySport("College Hockey"), "Other");
assert.equal(sportLabel("NCAAF"), "NCAA 🏈");
assert.equal(sportLabel("NCAAB"), "NCAA 🏀");
const safeNote = { text: "Safe +100 / Alt Parlay: builds at the 10 AM window", section: "parlay", sport: null };
const heistNote = { text: "Not enough bought-down legs", section: "heist", sport: null };
assert.equal(noteVisible(safeNote, "parlay", "NCAAF"), true);
assert.equal(noteVisible(heistNote, "parlay", "NCAAF"), false);
assert.equal(noteVisible(heistNote, null, "NCAAF"), false);
assert.equal(noteVisible(heistNote, null, "All"), true);
const history = [
  { day: "10/12", iso: "2026-10-12", profit: 1, winRate: 50 },
  { day: "10/22", iso: "2026-10-22", profit: 2, winRate: 50 },
  { day: "11/04", iso: "2026-11-04", profit: -111, winRate: 40 },
];
const twoWeeks = sliceHistory(history, "14d");
assert.deepEqual(twoWeeks.points.map((point) => point.iso), ["2026-10-22", "2026-11-04"]);
assert.equal(twoWeeks.starts, null);
const month = sliceHistory(history, "30d");
assert.equal(month.points.length, 3);
assert.equal(month.starts, "Oct 12");
assert.equal(sliceHistory(history, "all").starts, null);
assert.equal(normProp("SOG", "NHL shots on goal"), "SOG");
assert.equal(normProp("", "anytime td"), "Anytime TD");
assert.equal(normProp("Other", "NBA alt line · o4.5 → 4+ · @austinsprops", "Christian Braun 4+ Rebs", "0 REB"), "Rebounds");
assert.equal(normProp("Other", "@austinsprops · Other", "Nolan Traore 4+ Asts", "6 AST"), "Assists");
assert.equal(normProp("Other", "@panpotd · Other", "Mario Hezonja 11+ PR", "20 P+R"), "Pts+Reb");
assert.equal(normProp("Other", "@panpotd · Other", "Kasparas Jakucionis o10.5 PA", "12 P+A"), "Pts+Ast");
assert.equal(normProp("Other", "@austinsprops · Other", "Josh Hart o12.5 RA", "11 R+A"), "Reb+Ast");
assert.equal(normProp("Other", "First Blood", "First Blood 7-leg", ""), "First Blood");
assert.equal(normProp("Other", "mystery market", "some pick", ""), "Misc");
assert.equal(normSide("Franz Wagner Over 0.5", "points", true), "alt");
assert.equal(normSide("Christian Braun 4+ Rebs", "@austinsprops · Other", false), "over");
assert.equal(normSide("Josh Giddey o7.5 Asts", "@austinsprops · Other", false), "over");
assert.equal(normSide("Kevin Durant o5.5 Rebs", "@austinsprops · Other", false), "over");
assert.equal(normSide("Davion Mitchell o19.5 PA", "@panpotd · Other", false), "over");
const braunAlt = { date: "2026-10-28", sport: "NBA", cat: "Alt lines", pick: "Christian Braun 4+ Rebs", stat: "0 REB", prop: "NBA alt line · o4.5 → 4+ · @austinsprops", res: "L", uu: -1, leg: false, alt: true };
const braunHeist = { date: "2026-10-28", sport: "NBA", cat: "The Heist", pick: "Christian Braun 4+ Rebs", stat: "0 REB", prop: "@austinsprops · Other", res: "L", uu: -1, leg: false, alt: true };
const braunOver = { date: "2026-10-28", sport: "NBA", cat: "Cappers", pick: "Christian Braun o4.5 Rebs (Nuggets vs Pelicans)", stat: "L (0 REB)", prop: "@austinsprops · NBA rebounds (over)", res: "L", uu: -1, leg: false, alt: false };
const packersA = { date: "2026-10-18", sport: "NFL", cat: "Cappers", pick: "Green Bay Packers ML", stat: "W (DAL 13-23 GB)", prop: "@showtimepicks2 · NFL ML", res: "W", uu: 0.93, leg: false };
const packersB = { date: "2026-10-18", sport: "NFL", cat: "Cappers", pick: "Green Bay Packers ML", stat: "W (DAL 13-23 GB)", prop: "@alexcaruso · NFL ML", res: "W", uu: 0, leg: false };
assert.equal(playKey(braunAlt), playKey(braunHeist));
assert.notEqual(playKey(braunAlt), "");
assert.notEqual(playKey(braunAlt), playKey(braunOver));
assert.equal(playKey(packersA), playKey(packersB));
const deduped = dedupePlays([braunAlt, braunHeist, braunOver, packersA, packersB]);
assert.equal(deduped.rows.length, 3);
assert.equal(deduped.droppedUnits.get("2026-10-18"), 0);
assert.equal(deduped.droppedUnits.has("2026-10-28"), false);
assert.match(String(deduped.rows.find((row) => row.cat === "Cappers" && String(row.pick).includes("Packers"))?.prop), /@showtimepicks2/);
assert.match(String(deduped.rows.find((row) => row.cat === "Cappers" && String(row.pick).includes("Packers"))?.prop), /@alexcaruso/);
const braunKept = deduped.rows.find((row) => String(row.pick).includes("4+"));
assert.equal(braunKept?.alt, true);
assert.deepEqual(braunKept?.cats, ["Alt lines", "The Heist"]);
assert.equal(normSide("Cameron Boozer o24.5 PR", "@austinsprops · Other", false), "over");
assert.equal(normSport("NCAAM"), "NCAAB");
const blood = adaptDesk(
  {
    today: { date: "2026-11-05", tickets: [], sports: {} },
    first_blood: {
      date: "2026-11-04",
      name: "First Blood",
      rolled_off: "First Blood · Wed Nov 4 moved to Results",
      legs: [{ player: "Old Player", odds: "+400", hr_sid: "1", why: "old" }],
    },
    results_v2: { rows: [] },
  },
  [],
);
assert.equal(blood.tickets.some((ticket) => ticket.productKey === "first"), false);
assert.equal(blood.notices.some((note) => /moved to Results/.test(note.text)), false);
const todayBlood = adaptDesk(
  {
    today: { date: "2026-11-05", tickets: [], sports: {} },
    first_blood: {
      date: "2026-11-05",
      name: "First Blood",
      sport: "NBA",
      label: "Thin slate",
      final: true,
      locked_at: "Thu Nov 5, 10:10 AM ET",
      odds: "~+4,588",
      odds_note: "Estimated from single-leg Hard Rock prices",
      legs: [{ player: "Example Player", team: "ORL", market: "First Player To Score", odds: "+525", score: 12.68, hr_sid: "615", hr_link: "https://share.hardrock.bet/Pt0T/bet?deep_link_value=hardrock://betslip/615", dk_absent: true, why: "Volume: shot share\nMatchup: tip", why_not: "Plus money." }],
    },
    results_v2: { rows: [] },
  },
  [],
);
const fb = todayBlood.tickets.find((ticket) => ticket.productKey === "first");
assert.equal(fb?.plays[0].name, "Example Player");
assert.equal(fb?.plays[0].hr, "+525");
assert.equal(fb?.plays[0].dk, null);
assert.match(fb?.plays[0].detail ?? "", /12\.7%/);
assert.match(fb?.plays[0].detail ?? "", /Not on DK/);
assert.match(fb?.stamp ?? "", /Locked · final/);
assert.match(fb?.stamp ?? "", /Thin slate/);
assert.match(fb?.meta ?? "", /Estimated/);
assert.equal(fb?.plays[0].why.line.startsWith("Volume"), true);
assert.ok(fb?.plays[0].why.why.some((line) => line.startsWith("Matchup")));
const phi = tables.leagues.NBA.groups.find((group) => group.name === "Atlantic")?.rows.find((row) => row.abbr === "PHI");
assert.equal(phi?.cells[0], "7-1");
assert.ok(tables.leagues.NHL.groups.every((group) => group.columns[0] === "W-L-OTL" && group.columns.includes("PTS")));
assert.ok(!tables.leagues.NFL.note.toLowerCase().includes("omitted"));

const heist = sampleTickets.find((item) => item.id === "heist");
assert.ok(heist);
const pendingCard = shareFromPending(heist, "hr", "Wed Nov 4 · ParlayBOT");
assert.equal(shareCardIsPrivate(pendingCard), true);
assert.equal(pendingCard.odds, "+190");
assert.equal(pendingCard.legs.length, 3);
for (const settled of results) {
  const card = shareFromSettled(settled, "Tue Nov 3 · ParlayBOT");
  assert.equal(shareCardIsPrivate(card), true, settled.id);
  assert.ok(!JSON.stringify(card).includes("+3.4"));
  assert.ok(!JSON.stringify(card).includes("+2.1"));
}

const alt = heist.plays[0];
assert.ok(alt.alt);
assert.match(alt.alt.before, /9\.5/);
assert.match(alt.alt.after, /7\.5/);
assert.equal(sampleTickets.find((item) => item.productKey === "cappers"), undefined);
assert.equal(heist.plays.some((play) => play.status?.label === "Out"), false);

assert.equal(winRateBand(55), "good");
assert.equal(winRateBand(54.9), "mid");
assert.equal(winRateBand(50), "mid");
assert.equal(winRateBand(49.9), "low");
assert.equal(winRateBand(40), "low");
assert.equal(winRateBand(39.9), "bad");
assert.deepEqual(rings.map((ring) => winRateBand(ring.pct)), ["good", "bad", "low", "mid", "mid", "good", "mid", "good"]);

const ncaab = { note: "NCAAB SAMPLE", columns: [], groups: [] };
const liveDesk = adaptDesk(
  {
    generated: 1793880835,
    today: {
      date: "2026-11-05",
      tickets: [
        { name: "POTD", pick: "Brandin Podziemski Over 16.5 Points", odds: "-105", hr_sid: "5029125622698475931", hr_link: "https://share.hardrock.bet/Pt0T/bet?deep_link_value=hardrock://betslip/5029125622698475931", dk_sid: "0QA1", dk_link: "nope" },
        { name: "Safe +100 / Alt Parlay", pick: "builds at the 10 AM window, not at 7 AM.", legs: [] },
      ],
      sports: {},
    },
    heist: { status: "thin", msg: "Not enough bought-down legs yet", legs: [] },
    edge: { picks: [{ sport: "NHL", pick: "Anton Frondell Over 0.5 Assists", hr: "+275", hr_sid: "4589013658088112520", hr_link: "https://share.hardrock.bet/Pt0T/bet?deep_link_value=hardrock://betslip/4589013658088112520", hr_state: "open", dk: { odds: "+178", na: false }, dk_sid: "0QA386239029#2351687617_13L42133Q1", dk_link: "https://sportsbook.draftkings.com/event/34951598?outcomes=0QA386239029%232351687617_13L42133Q1", result: "Pending" }] },
    legday: { board: [{ sport: "NBA", pick: "Bam Adebayo Under 14.5 Reb + Ast", odds: "-130", hr_sid: "7863240223742886304", hr_link: "https://share.hardrock.bet/Pt0T/bet?deep_link_value=hardrock://betslip/7863240223742886304", dk: { na: true, odds: null }, dk_absent: true }] },
    cappers: [
      { name: "@showtimepicks2", w: 1, l: 2, pct: 33, today: [{ sport: "TENNIS", pick: "Tomas Martin Etcheverry ML", odds: "-120", dk_absent: true }] },
      { name: "@nickm_hockey", w: 2, l: 1, pct: 67, today: [] },
    ],
    results_v2: {
      rows: [
        { date: "2026-11-04", cat: "POTD", pick: "Davion Mitchell Over 11.5 Points", odds: "-125", res: "L", stat: "11 PTS", uu: -1, leg: false },
        { date: "2026-11-04", cat: "Edge", pick: "One Over 1.5", odds: "-110", res: "W", stat: "2", uu: 0.91, leg: false },
      ],
      summary: { F: { tickets: { w: 0, l: 5, units: -5 } }, T: { tickets: { w: 0, l: 3, units: -3 } } },
    },
    record: { chart: [["11/04", -111]], props: [{ prop: "NHL SOG", w: 47, l: 37, pct: 56 }] },
    edge_record: { overall: { w: 124, l: 213, p: 2, pct: 37, units: -8.27, pending: 25 } },
    standings: { updated: "2026-11-05", leagues: {} },
  },
  ncaab,
);
assert.equal(liveDesk.feedMode, "live");
assert.equal(liveDesk.banner, null);
assert.equal(liveDesk.tickets.some((ticket) => ticket.productKey === "heist"), false);
assert.ok(liveDesk.notices.some((note) => note.section === "heist" && /bought-down|HEIST|legs/i.test(note.text)));
assert.ok(liveDesk.notices.some((note) => note.section === "parlay" && /10 AM/.test(note.text)));
const frondell = liveDesk.tickets.flatMap((ticket) => ticket.plays).find((play) => /Frondell/.test(play.name));
assert.ok(frondell?.hrSid);
assert.equal(frondell?.dk, "+178");
const bam = liveDesk.tickets.flatMap((ticket) => ticket.plays).find((play) => /Adebayo/.test(play.name));
assert.equal(bam?.dk, null);
assert.equal(bam?.dkSid, undefined);
const show = liveDesk.cappers.find((capper) => capper.name === "@showtimepicks2");
assert.equal(show?.plays.length, 1);
assert.equal(show?.plays[0].hrSid, undefined);
assert.equal(liveDesk.cappers.find((capper) => capper.name === "@nickm_hockey")?.plays.length, 0);
assert.equal(liveDesk.recap.units, "-0.09u");
assert.equal(liveDesk.rings.find((ring) => ring.label === "POTD")?.pct, 0);
assert.equal(liveDesk.rings.find((ring) => ring.label === "Edge")?.pct, 100);
assert.equal(liveDesk.privateStats?.edgeUnits, "-8.27u");
assert.match(liveDesk.standings.leagues.NCAAB.note, /SAMPLE/);
assert.equal(liveDesk.results[0].legs[0].beatClose, null);

assert.equal(clockEt(1793883413.5), "7:56 AM ET");
assert.equal(clockEt("2026-11-05 07:13 AM ET"), "7:13 AM ET");
assert.equal(clockEt("2026-11-05 16:45 ET"), "4:45 PM ET");
assert.equal(clockEt("4:45 PM"), "4:45 PM ET");
assert.equal(updatedLabel(undefined), null);
const afternoon = Date.UTC(2026, 10, 5, 20, 0, 0);
const fresh = updatedLabel(afternoon / 1000 - 20 * 60, afternoon);
assert.equal(fresh?.stale, false);
assert.match(fresh?.text ?? "", /^Updated /);
const old = updatedLabel(afternoon / 1000 - 120 * 60, afternoon);
assert.equal(old?.stale, true);
const night = Date.UTC(2026, 10, 5, 7, 0, 0);
assert.equal(updatedLabel(night / 1000 - 120 * 60, night)?.stale, false);
assert.equal(heistLabel(null), null);
assert.equal(heistLabel({ final: false }), "Building…");
assert.equal(heistLabel({ final: "4:45 PM" }), "Final 4:45 PM ET");
assert.equal(heistLabel({ final: true }), "Final");
assert.equal(builtLabel({}), null);
assert.equal(builtLabel({ built: "2026-11-05 10:12 AM ET" }), "Built 10:12 AM ET");
assert.equal(injuryLabel({ checked_et: "2026-11-05 08:20 AM ET", stage: "10am" }), "Injury check 8:20 AM ET · 10am");
assert.equal(injuryLabel({ checked_et: "2026-11-05 08:20 AM ET" }), "Injury check 8:20 AM ET");
assert.equal(lockLabel({}), null);
assert.equal(lockLabel({ checked_et: "2026-11-05 07:57 AM ET" }), "Lock check 7:57 AM ET");
assert.equal(standingsLabel({ updated: "2026-11-05 07:56 AM ET" }), "Updated 7:56 AM ET");
assert.equal(uiBuildLabel("1793870900"), "UI build · 4:28 AM ET");
assert.equal(uiBuildLabel(undefined), null);
const stamped = adaptDesk(
  {
    generated: 1793883413,
    ui_build: "1793870900",
    today: { date: "2026-11-05", tickets: [], sports: {} },
    heist: { final: false, legs: [], msg: "Not enough bought-down legs yet" },
    edge: { built: "2026-11-05 10:12 AM", picks: [{ sport: "NHL", pick: "Anton Frondell Over 0.5 Assists", hr: "+275", result: "Pending" }] },
    safe100: {},
    dk: { fetched: "2026-11-05 09:58 ET" },
    late_injury: { checked_et: "2026-11-05 08:20 AM ET", stage: "10am" },
    lock_check: { checked_et: "2026-11-05 07:57 AM ET" },
    standings: { updated: "2026-11-05 07:56 AM ET", leagues: {} },
    results_v2: { rows: [] },
  },
  ncaab,
);
assert.equal(stamped.updated?.text, "Updated 7:56 AM ET");
assert.equal(stamped.heistStamp, "Building…");
assert.equal(stamped.tickets.find((item) => item.productKey === "edge")?.stamp, "Built 10:12 AM ET");
assert.equal(stamped.tickets.find((item) => item.productKey === "safe"), undefined);
assert.equal(stamped.dkPrices, "DK prices 9:58 AM ET");
assert.equal(stamped.injuryCheck, "Injury check 8:20 AM ET · 10am");
assert.equal(stamped.lockCheck, "Lock check 7:57 AM ET");
assert.equal(stamped.standingsUpdated, "Updated 7:56 AM ET");
assert.equal(stamped.uiBuild, "UI build · 4:28 AM ET");

assert.equal(viewFromHash("#stats"), "results");
assert.equal(viewFromHash("#results"), "results");
assert.equal(knownView("#nope"), null);
assert.equal(viewFromHash(""), "today");
const scopeAll = historyScope({ fileFirst: "2026-10-12", fileLast: "2026-11-04", from: "2026-10-12", to: "2026-11-04", range: "all", custom: false, clippedLabel: null });
assert.match(scopeAll, /Oct 12 through Nov 4/);
assert.match(scopeAll, /not in the feed/);
const scope14 = historyScope({ fileFirst: "2026-10-12", fileLast: "2026-11-04", from: "2026-10-22", to: "2026-11-04", range: "14d", custom: false, clippedLabel: null });
assert.match(scope14, /14D is Oct 22 through Nov 4/);
assert.match(scope14, /All dates shows the whole file/);
const graded = adaptDesk(
  {
    today: { date: "2026-11-05", tickets: [], sports: {} },
    results_v2: { rows: [braunAlt, braunHeist, braunOver, packersA, packersB] },
    record: { chart: [["10/18", 1], ["10/28", 2], ["11/04", 3]] },
  },
  ncaab,
);
assert.equal(graded.grades.length, 3);
assert.equal(graded.grades.filter((row) => row.play === "Christian Braun 4+ Rebs").length, 1);
const braunRows = graded.grades.filter((row) => row.prop === "Rebounds");
const regular = matchingPlays(graded.grades, "NBA", "Rebounds", false);
const alts = matchingPlays(graded.grades, "NBA", "Rebounds", true);
assert.equal(regular.length + alts.length, braunRows.length);
assert.equal(new Set([...regular, ...alts]).size, braunRows.length);
assert.equal(alts.length, 1);
assert.equal(regular.length, 1);
assert.deepEqual([...(alts[0].cats ?? [])].sort(), ["Alt lines", "The Heist"]);
const bounds = fileBounds(graded.grades, graded.series, "all");
assert.equal(bounds.first <= "2026-10-18" && bounds.last >= "2026-11-04", true);
const nbaUnits = braunRows.reduce((sum, row) => sum + row.units, 0);
const splitUnits = [...regular, ...alts].reduce((sum, row) => sum + row.units, 0);
assert.equal(nbaUnits, splitUnits);

const safeParent = { date: "2026-11-04", cat: "Safe +100 (Alt Parlay)", pick: "Safe +100 3-leg", leg: false, tid: "2026-11-04|NBA|10:19 AM ET|3-leg", res: "W" };
const safeLeg = { date: "2026-11-04", cat: "Safe +100 (Alt Parlay)", pick: "Jalen Brunson 20+ pts", leg: true, tid: safeParent.tid, prop: "NBA pts", odds: "-325", res: "W", stat: "33 PTS", gm: "NYK game" };
const otherSafe = { date: "2026-11-04", cat: "Safe +100 (Alt Parlay)", pick: "Jack Quinn 2+ SOG", leg: true, tid: "2026-11-04|Today|10:19 AM ET|3-leg", res: "L", stat: "1 SOG" };
const todayCard = { date: "2026-11-05", cat: "Safe +100 (Alt Parlay)", pick: "Today only", leg: true, tid: safeParent.tid, res: "W", stat: "99 PTS" };
const safeParts = ticketParts(safeParent, [safeParent, safeLeg, otherSafe, todayCard]);
assert.equal(safeParts?.length, 1);
assert.equal(safeParts?.[0].name, "Jalen Brunson 20+ pts");
assert.equal(safeParts?.[0].score, "33 PTS");
assert.match(safeParts?.[0].market ?? "", /-325/);
assert.equal(isTicketRow({ pick: "Trae Young 9+ Assists", leg: false }), false);
const nested = ticketParts({ date: "2026-10-13", cat: "Parlay +100", pick: "2-leg", leg: false, legs: [{ pick: "Alex DeBrincat u1.5 Points", result: "L", stat: "2G 1A" }] }, []);
assert.equal(nested?.length, 1);
assert.equal(nested?.[0].result, "L");
const bloodParent = { date: "2026-11-04", cat: "First Blood", pick: "First Blood 8-leg", leg: false };
const bloodLeg = { date: "2026-11-04", cat: "First Blood", pick: "Shai Gilgeous-Alexander first point scorer", leg: true, res: "L", stat: "First point: Kenrich Williams", prop: "First Point Scorer", odds: "+475" };
const otherNight = { date: "2026-11-03", cat: "First Blood", pick: "Someone else", leg: true, res: "W" };
assert.equal(ticketParts(bloodParent, [bloodParent, bloodLeg, otherNight])?.length, 1);
const heistTicket = { date: "2026-11-04", cat: "Heist tickets", pick: "The Heist 12-leg", leg: false };
const heistSingle = { date: "2026-11-04", cat: "The Heist", pick: "Trae Young 9+ Assists", leg: false, res: "L" };
assert.deepEqual(ticketParts(heistTicket, [heistTicket, heistSingle]), []);
assert.equal(ticketParts({ date: "2026-10-18", cat: "Cappers", pick: "NFL 2-leg parlay: A + B", leg: false }, [])?.length, 0);
const counted = adaptDesk(
  {
    today: { date: "2026-11-05", tickets: [], sports: {} },
    results_v2: { rows: [safeParent, safeLeg, otherSafe, { ...safeParent, pick: "Safe +100 3-leg", res: "L", tid: otherSafe.tid, uu: -1, leg: false }] },
  },
  ncaab,
);
assert.equal(counted.grades.length, 2);
assert.equal(counted.results.find((ticket) => ticket.title.includes("Safe"))?.legs.filter((leg) => leg.ticket).length, 2);
assert.equal(counted.results.find((ticket) => ticket.title.includes("Safe"))?.legs.find((leg) => leg.result === "W")?.parts?.length, 1);

assert.equal(showsPreparedBoard("ALL", "All"), true);
assert.equal(showsPreparedBoard("ALL", "NHL"), false);
assert.equal(showsPreparedBoard("ALL", "Big 4"), false);
assert.equal(showsPreparedBoard("BIG4", "Big 4"), true);
assert.equal(showsPreparedBoard("BIG4", "All"), false);
assert.equal(showsPreparedBoard("ALL_AND_BIG4", "All"), true);
assert.equal(showsPreparedBoard("ALL_AND_BIG4", "Big 4"), true);
assert.equal(showsPreparedBoard("ALL_AND_BIG4", "NHL"), false);
assert.equal(showsPreparedBoard("NHL", "NHL"), true);
assert.equal(showsPreparedBoard("NHL", "All"), false);
assert.equal(showsPreparedBoard(undefined, "NHL"), true);
const prepared = adaptDesk(
  {
    today: {
      date: "2026-11-05",
      tickets: [
        { name: "POTD", pick: "Official Player Over 1.5 Points", odds: "-110", hr_sid: "111" },
        { name: "+100 ticket", odds: "+130", legs: [
          { pick: "Overall One Over 0.5 Points", odds: "-150", hr_sid: "222", ctx: { record: { A: "1-2-3", B: "4-5-6" } } },
          { pick: "Overall Two Over 1.5 Shots", odds: "-200", hr_sid: "333", ctx: { record: { A: "1-2-3", B: "4-5-6" } } },
        ] },
      ],
      sports: {
        NHL: {
          potd: { pick: "Sport Player Over 0.5 Points", sport: "NHL", odds: "-115", hr_sid: "444" },
          parlay: { pick: "2-leg", odds: "+135", legs: [
            { pick: "Leg A Over 0.5 Points", odds: "-185", hr_sid: "555" },
            { pick: "Leg B Over 0.5 Assists", odds: "-190", hr_sid: "666" },
          ] },
        },
        NBA: { potd: { pick: "Official Player Over 1.5 Points", sport: "NBA", odds: "-110", hr_sid: "111" } },
        ALL: { potd: { pick: "All Board Player Over 0.5 Points", odds: "-125", hr_sid: "777", ctx: { record: { C: "9-6-1", D: "6-4-5" } } } },
      },
    },
    results_v2: { rows: [] },
  },
  ncaab,
);
const potdBoards = prepared.tickets.filter((item) => item.productKey === "potd");
assert.deepEqual(potdBoards.map((item) => item.board), ["BIG4", "NHL", "NBA", "ALL"]);
assert.deepEqual(potdBoards.find((item) => item.board === "NHL")?.plays.map((play) => play.name), ["Sport Player Over 0.5 Points"]);
assert.equal(potdBoards.filter((item) => item.board === "ALL").flatMap((item) => item.plays).some((play) => play.name.includes("All Board")), true);
assert.equal(potdBoards.filter((item) => item.board === "ALL").flatMap((item) => item.plays).some((play) => play.name.includes("Official")), false);
assert.equal(potdBoards.find((item) => item.board === "BIG4")?.plays.some((play) => play.name.includes("Official")), true);
const nhlParlay = prepared.tickets.find((item) => item.id === "parlay-NHL");
const allParlay = prepared.tickets.find((item) => item.board === "ALL_AND_BIG4" && item.productKey === "parlay");
assert.deepEqual(nhlParlay?.plays.map((play) => play.name), ["Leg A Over 0.5 Points", "Leg B Over 0.5 Assists"]);
assert.equal(allParlay?.plays.some((play) => play.name.includes("Overall")), true);
assert.equal(nhlParlay?.plays.some((play) => play.name.includes("Overall")), false);
assert.equal(allParlay?.plays.some((play) => play.name.includes("Leg A")), false);

const blocked = new Set(["1051261159191216543"]);
const unverifiedIds = new Set(["8468082854109249946"]);
assert.equal(verifiedLegSid({ hr_sid: "6868061461558722991" }, unverifiedIds, blocked), true);
assert.equal(verifiedLegSid({ hr_sid: "8468082854109249946" }, unverifiedIds, blocked), false);
assert.equal(verifiedLegSid({ hr_sid: "1051261159191216543" }, unverifiedIds, blocked), false);
assert.equal(verifiedLegSid({ hr_sid: "111", hr_why: "could not read the leg text" }, unverifiedIds, blocked), false);
assert.equal(verifiedLegSid({}, unverifiedIds, blocked), false);
assert.equal(isBlockedHrSid("6868061461558722991"), false);
assert.equal(isBlockedHrSid("1051261159191216543"), true);
assert.equal(isBlockedHrSid("McNeese Cowboys ML"), false);
const numberLive = readHrLive(-130);
assert.equal(numberLive.kind, "number");
if (numberLive.kind === "number") assert.equal(numberLive.price, "−130");
const textLive = readHrLive("-115");
assert.equal(textLive.kind, "number");
if (textLive.kind === "number") assert.equal(textLive.price, "−115");
const objectLive = readHrLive({ label: "Live HR price -240 as of 17:26 ET (game started; posted odds unchanged)", price: "-240", at: "2026-11-05T17:26:15-05:00" });
assert.equal(objectLive.kind, "object");
if (objectLive.kind === "object") {
  assert.match(objectLive.label, /Live HR price -240/);
  assert.equal(objectLive.price, "−240");
  assert.equal(objectLive.at, "2026-11-05T17:26:15-05:00");
}
assert.equal(readHrLive(null).kind, "empty");
assert.equal(movedAltLine({ hr_pick: "Rashod Bateman 5+ Rec Yards", pick: "Rashod Bateman Over 13.5 Rec Yards (BAL vs JAX)", hr: "5+ -325", bd_flag: null }, new Set()), true);
assert.equal(movedAltLine({ hr_pick: "Josh Cuevas 1+ Receptions", pick: "Josh Cuevas 1.5 Receptions O", hr: "1+ -300" }, new Set()), true);
assert.equal(movedAltLine({ hr_pick: "Justice Hill o2.5 Receptions", pick: "Justice Hill Over 2.5 Receptions", hr: "original line kept · no buy-down in range", bd_flag: "no buy-down in range" }, new Set(["Justice Hill o2.5 Receptions"])), false);
assert.equal(movedAltLine({ hr_pick: "Player 4+ Receptions", pick: "Player Over 9.5 Receptions", hr: "original line kept", bd_flag: null }, new Set()), false);
assert.equal(movedAltLine({ hr_pick: "Justice Hill o2.5 Receptions", pick: "Justice Hill Over 9.5 Receptions", hr: "o2.5 -130" }, new Set(["Justice Hill o2.5 Receptions"])), false);
const five = propLine("Rashod Bateman 5+ Rec Yards");
assert.equal(five?.plus, true);
assert.equal(five?.line, 5);
const kept = propLine("Justice Hill o2.5 Receptions");
assert.equal(kept?.plus, false);
assert.equal(kept?.line, 2.5);
const quoted = propLine('Zay Flowers 4.5 Receptions "O"');
assert.equal(quoted?.line, 4.5);
assert.equal(quoted?.under, false);
const pa = propLine("Anthony Black 16+ PA");
assert.equal(pa?.plus, true);
assert.equal(pa?.line, 16);
assert.equal(pa?.market, "PA");

const hillDk = "0QA385138139#2346933658_13L88808Q1-1278560502Q20";
const hillDkLink = `https://sportsbook.draftkings.com/event/34118164?outcomes=${encodeURIComponent(hillDk)}`;
const heistBoard = adaptDesk(
  {
    today: { date: "2026-11-05", tickets: [], sports: {} },
    player_status: { players: [{ key: "justice hill", label: "Questionable", posted: "4:45 PM ET" }] },
    heist: {
      status: "live",
      final: true,
      stake: "1u",
      odds: 13670,
      hr_ticket: {
        n: 4,
        of: 8,
        link: "https://share.hardrock.bet/Pt0T/bet?deep_link_value=hardrock://betslip/1224216296611250609,289795581415653771,3115191231613895049,7257196704145998232",
        unverified: ["8468082854109249946"],
      },
      legs: [
        { capper: "@alexcaruso", sport: "NFL", pick: "Justice Hill Over 2.5 Receptions", orig: "Justice Hill Over 2.5 Receptions", orig_odds: -130, odds: -130, game: "BAL vs JAX; NFL Play of the Day", start: "2026-11-05 20:15", hr_sid: "1224216296611250609", hr_link: "https://share.hardrock.bet/Pt0T/bet?deep_link_value=hardrock://betslip/1224216296611250609", hr_live: -130, dk_sid: hillDk, dk_link: hillDkLink, dk_live: "-150" },
        { capper: "@alexcaruso", sport: "NBA", pick: "Wendell Carter Over 11.5 Points", orig: "Wendell Carter Over 11.5 Points", orig_odds: -145, odds: -145, game: "ORL @ PHX", start: "2026-11-05 21:00", hr_sid: "289795581415653771", hr_live: -145 },
        { capper: "@alexcaruso", sport: "NFL", pick: "Rashod Bateman Over 13.5 Rec Yards", orig: "Rashod Bateman Over 13.5 Rec Yards", orig_odds: -115, odds: -115, game: "BAL vs JAX", start: "2026-11-05 20:15", hr_sid: "3115191231613895049", hr_live: "-115", why: "Target share up" },
        { capper: "@austinsprops", sport: "NFL", pick: 'Zay Flowers 4.5 Receptions "O"', orig: 'Zay Flowers 4.5 Receptions "O"', orig_odds: 133, odds: -120, game: "BAL vs JAX", start: "2026-11-05 20:15", hr_why: "could not read the leg text" },
        { capper: "@austinsprops", sport: "NBA", pick: 'Anthony Black 18.5 PA "O"', odds: -140, game: "ORL @ PHX", start: "2026-11-05 21:00", hr_why: "could not read the leg text" },
        { capper: "@austinsprops", sport: "NBA", pick: "Anthony Black 14.5 Pts O", odds: -130, game: "ORL @ PHX", start: "2026-11-05 21:00", hr_sid: "7257196704145998232", hr_live: -130 },
        { capper: "@austinsprops", sport: "NFL", pick: "Josh Cuevas 1.5 Receptions O", odds: 160, game: "BAL vs JAX", start: "2026-11-05 20:15", hr_sid: "8468082854109249946", hr_why: "Unverified link: mismatch: stat targets vs market rec (Receptions)" },
        { capper: "@showtimepicks2", sport: "NCAAB", pick: "McNeese Cowboys ML", odds: -142, game: "vs UNT; CBB free play", start: "2026-11-05 17:00", hr_sid: "6868061461558722991", hr_why: null, hr_live: { label: "Live HR price -240 as of 17:26 ET (game started; posted odds unchanged)", price: "-240", at: "2026-11-05T17:26:15-05:00" } },
      ],
      skipped: [{ capper: "@alexcaruso", why: "n/a at Hard Rock (exact line, no buy-down rung)", pick: "James Cameron 10+ Rec Yards" }],
      conv: [
        { capper: "@alexcaruso", sport: "NFL", pick: "Rashod Bateman Over 13.5 Rec Yards (BAL vs JAX)", hr_pick: "Rashod Bateman 5+ Rec Yards", hr: "5+ -325", hr_odds: -325, grade_odds: -325, bd: true, hr_sid: "2796913401698320777", game: "JAX @ BAL", kick: "8:15 PM ET", start: "2026-11-05 20:15", dk: "n/a at DK (no exact DK line at HR rung 5+)", dk_absent: true },
        { capper: "@alexcaruso", sport: "NFL", pick: "Justice Hill Over 2.5 Receptions (BAL vs JAX)", hr_pick: "Justice Hill o2.5 Receptions", hr: "original line kept · no buy-down in range (no HR alt in -250..-425)", hr_odds: null, grade_odds: -130, bd: false, bd_flag: "no buy-down in range", hr_sid: "922756596554138013", game: "JAX @ BAL", kick: "8:15 PM ET", dk_pick: "Justice Hill o2.5 Receptions", dk_sid: hillDk, dk_link: hillDkLink, dk_live: "-150" },
        { capper: "@alexcaruso", sport: "NBA", pick: "Wendell Carter Over 11.5 Points (ORL @ PHX)", hr_pick: "Wendell Carter 9+ Points", hr: "9+ -350", grade_odds: -350, bd: true, hr_sid: "8680423899671953803", game: "ORL @ PHX", kick: "9:00 PM ET" },
        { capper: "@austinsprops", sport: "NFL", pick: "Josh Cuevas 1.5 Receptions O (BAL vs JAX)", hr_pick: "Josh Cuevas 1+ Receptions", hr: "1+ -300", grade_odds: -300, bd: false, hr_sid: "4554454777924288922", game: "JAX @ BAL", kick: "8:15 PM ET", dk_pick: "Josh Cuevas 1+ Receptions", dk_sid: "0QA385508152#2348847953_13L88808Q1794588810Q20", dk_link: "https://sportsbook.draftkings.com/event/34118164?outcomes=0QA385508152%232348847953_13L88808Q1794588810Q20", dk_live: "-300" },
        { capper: "@austinsprops", sport: "NFL", pick: 'Zay Flowers 4.5 Receptions "O" (BAL vs JAX)', hr_pick: "Zay Flowers 4+ Receptions", hr: "4+ -260", grade_odds: -260, bd: false, hr_sid: "4320493816986599819", game: "JAX @ BAL", kick: "8:15 PM ET" },
        { capper: "@austinsprops", sport: "NBA", pick: "Anthony Black 14.5 Pts O (ORL @ PHX)", hr_pick: "Anthony Black 12+ Pts", hr: "12+ -275", grade_odds: -275, bd: false, hr_sid: "4914480472983208344", game: "ORL @ PHX", kick: "9:00 PM ET" },
        { capper: "@austinsprops", sport: "NBA", pick: 'Anthony Black 18.5 PA "O" (ORL @ PHX)', hr_pick: "Anthony Black 16+ PA", hr: "16+ -300", grade_odds: -300, bd: false, hr_sid: "3959915023555494311", game: "ORL @ PHX", kick: "9:00 PM ET" },
        { capper: "@showtimepicks2", sport: "NCAAB", pick: "McNeese Cowboys ML (vs UNT)", hr_pick: null, excluded: "ML (not a prop)", hr: "not convertible (parlay/TD/ML: original kept)" },
      ],
      bd_ticket: { legs: 7, odds: 898, bought: 6, flagged: ["Justice Hill o2.5 Receptions"], band: [-425, -250], target: -325 },
    },
    legday: { board: [{ sport: "NBA", pick: "Bam Adebayo Under 1.5 Rebounds", odds: "-130" }] },
    first_blood: { date: "2026-11-05", title: "First Blood", legs: [{ player: "Sample Skater", team: "TBL", market: "First goal", odds: "+500", sport: "NHL" }] },
    results_v2: { rows: [] },
  },
  ncaab,
);
const mainHeist = heistBoard.tickets.find((item) => item.id === "heist");
const altHeist = heistBoard.tickets.find((item) => item.id === "heist-alt");
assert.ok(mainHeist && altHeist);
assert.equal(mainHeist.plays.length, 8);
assert.equal(altHeist.plays.length, 7);
assert.equal(mainHeist.meta.includes("+13670"), true);
assert.equal(mainHeist.meta.includes("1u"), true);
assert.equal(mainHeist.stamp, "Final");
assert.equal(altHeist.meta.includes("+898"), true);
assert.match(altHeist.meta, /6 of 7 legs on an Alt line near −325/);
assert.equal(altHeist.plays.filter((play) => play.altTag).length, 6);
const hillAlt = altHeist.plays.find((play) => play.name.includes("Justice Hill"));
assert.equal(hillAlt?.altTag, false);
assert.match(hillAlt?.flagNote ?? "", /No alt line in −250 to −425 — original line kept/);
assert.equal(/buy-down/i.test(hillAlt?.flagNote ?? ""), false);
const hillHtml = renderPlay(hillAlt!, "hr", new Set());
assert.equal(hillHtml.includes('class="tag">Alt line'), false);
assert.match(hillHtml, /Questionable/);
assert.match(hillHtml, /4:45 PM ET/);
const batemanAlt = altHeist.plays.find((play) => play.name.includes("5+"));
assert.equal(batemanAlt?.altTag, true);
assert.equal(batemanAlt?.hr, "−325");
assert.equal(batemanAlt?.id.startsWith("heist-alt-"), true);
const batemanMain = mainHeist.plays.find((play) => play.name.includes("Bateman"));
assert.notEqual(batemanMain?.id, batemanAlt?.id);
assert.notEqual(batemanMain?.hrSid, batemanAlt?.hrSid);
assert.match(renderPlay(batemanAlt!, "hr", new Set()), /Over 13\.5 Rec Yards/);
assert.match(renderPlay(batemanAlt!, "dk", new Set()), /Not on DK/);
const cuevasAlt = altHeist.plays.find((play) => play.name.includes("1+"));
assert.match(renderPlay(cuevasAlt!, "dk", new Set()), /1\+ Receptions/);
assert.match(renderPlay(cuevasAlt!, "dk", new Set()), /class="tag">Alt line/);
const flowers = mainHeist.plays.find((play) => play.name.includes("Flowers"));
assert.match(flowers?.posted ?? "", /\+133/);
assert.equal(flowers?.hr, "−120");
assert.match(flowers?.hrHold ?? "", /HR link unavailable: could not read the leg text/);
const cuevas = mainHeist.plays.find((play) => play.name.includes("Cuevas"));
assert.equal(cuevas?.hrSid, undefined);
assert.equal(cuevas?.slip, false);
assert.equal(cuevas?.hrHold, "Unverified HR link — held");
const mcneese = mainHeist.plays.find((play) => play.name.includes("McNeese"));
assert.equal(mcneese?.hrSid, "6868061461558722991");
assert.equal(mcneese?.slip, true);
assert.equal(mcneese?.hr, "−142");
assert.match(mcneese?.liveNote ?? "", /Live HR price -240/);
assert.equal(hardRockLegLink({ id: mcneese!.id, name: mcneese!.name, hrSid: mcneese!.hrSid, hrLink: mcneese!.hrLink }).status, "ready");
const slipIds = (mainHeist.hrSlip ?? "").split("betslip/")[1]?.split(",") ?? [];
assert.deepEqual(slipIds, ["1224216296611250609", "289795581415653771", "3115191231613895049", "7257196704145998232", "6868061461558722991"]);
assert.equal(slipIds.includes("8468082854109249946"), false);
assert.equal(slipIds.includes("1051261159191216543"), false);
assert.equal(mainHeist.slipLabel, "Whole Heist in Hard Rock (5 of 8 verified legs)");
const builtSlip = hardRockSlipLink(mainHeist.plays.filter((play) => play.slip !== false).map((play) => ({ id: play.id, name: play.name, hrSid: play.hrSid, hrLink: play.hrLink })));
assert.equal(builtSlip.status, "ready");
if (builtSlip.status === "ready") assert.equal(builtSlip.url, mainHeist.hrSlip);
const altIds = (altHeist.hrSlip ?? "").split("betslip/")[1]?.split(",") ?? [];
assert.equal(altIds.length, 7);
assert.equal(altIds.includes("1224216296611250609"), false);
assert.equal(altHeist.slipLabel, "Whole Heist Alt in Hard Rock (all 7 legs)");
assert.equal(mainHeist.plays.some((play) => play.id.startsWith("heist-alt-")), false);
assert.match(mainHeist.skips?.[0]?.reason ?? "", /no Alt line rung/);
assert.equal(/buy-down/i.test(mainHeist.skips?.[0]?.reason ?? ""), false);
assert.match(altHeist.excluded?.[0]?.reason ?? "", /ML \(not a prop\)/);
const blank = (): AppState => ({
  view: "today", book: "hr", sport: "All", product: null, selected: new Set(), text: "md", theme: "night",
  alerts: { locks: false, finals: false, redzone: false, price: false }, pushWant: { picks: false, locks: false }, pushAck: false, pushDelivery: "off",
  sheet: null, league: "NBA", standingsFrom: "today", gamePanel: {}, openGames: new Set(), gamesOpen: false, gamesSport: "All", feedFilter: {}, openPlayTracks: new Set(), playPanel: {}, castTeam: {}, castPeriod: {}, feedFull: new Set(), liveDismissed: new Set(),
  profitRange: "14d", openDates: new Set(), conference: "", statsFrom: "", statsTo: "", statsCalOpen: false, statsMode: "range", statsSection: "all",
  statsSport: "", statsAnchor: "", statsDraft: "", nightOpen: false, openProps: new Set(), propSection: {}, openResultDates: new Set(), openTickets: new Set(),
});
assert.equal(knownView("#alt-layout"), "alt-layout");
assert.equal(viewFromHash("#alt-layout"), "alt-layout");
const preview = renderPage({ ...blank(), view: "alt-layout" }, heistBoard);
assert.match(preview, /Layout preview/);
assert.match(preview, /<h3>\+100 /);
assert.match(preview, /<h3>\+250 /);
assert.equal(preview.includes("Alt +100"), false);
assert.equal(preview.includes("Alt +250"), false);
assert.match(preview, /not Official Parlay \+100/);
assert.match(preview, /Alt-line plays are allowed, not required/);
assert.match(preview, /Retired Nov 6, 2026/);
assert.match(preview, /Record not wired/);
assert.match(preview, /not the \+100 record/);
assert.match(preview, /PREVIEW SAMPLE/);
assert.match(preview, /Open in Hard Rock/);
assert.match(preview, /no \+500 ticket/i);
assert.equal(/<h3>[^<]*\+500/.test(preview), false);
assert.equal(preview.includes("12-4"), false);
assert.equal(altPreviewTickets().some((ticket) => ticket.plays.some((play) => play.source !== "sample")), false);
const page = renderPage(blank(), heistBoard);
assert.equal(page.includes("Layout preview"), false);
assert.equal(page.includes("preview-plus-250"), false);
assert.equal(page.includes("Layout preview"), false);
assert.equal(page.indexOf('id="ticket-heist"') < page.indexOf('id="ticket-heist-alt"'), true);
assert.match(page, /Heist Alt/);
assert.match(page, /Whole Heist in Hard Rock \(5 of 8 verified legs\)/);
assert.match(page, /Whole Heist Alt in Hard Rock \(all 7 legs\)/);
assert.match(page, /Unverified HR link — held/);
assert.equal(/buy-down/i.test(page), false);
assert.equal(/ALT PROPS TRACKED/i.test(page), false);
assert.match(page, /Props/);
assert.match(page, /First Blood/);
const nfl = renderPage({ ...blank(), sport: "NFL" }, heistBoard);
assert.match(nfl, /Showing 4 of 8 legs for NFL/);
assert.match(nfl, /Showing 4 of 7 legs for NFL/);
assert.match(nfl, /all 7 legs/);
assert.match(nfl, /5 of 8 verified legs/);
const dkPage = renderPage({ ...blank(), book: "dk" }, heistBoard);
assert.match(dkPage, /DraftKings opens each leg on its own/);
assert.equal(dkPage.includes("Whole Heist in Hard Rock"), false);
assert.equal(dkPage.includes("Whole Heist Alt in Hard Rock"), false);
assert.equal(visibleTickets(heistBoard, { ...blank(), sport: "NCAAB" }).some((ticket) => ticket.id === "heist-alt"), false);
assert.equal(visibleTickets(heistBoard, { ...blank(), sport: "NCAAB" }).find((ticket) => ticket.id === "heist")?.plays.length, 1);

const slate = adaptDesk(
  {
    today: { date: "2026-11-05", tickets: [], sports: {} },
    heist: {
      legs: [
        { pick: "McNeese Cowboys ML", sport: "NCAAB" },
        { pick: "Justice Hill Over 2.5 Receptions", sport: "NFL" },
        { pick: "Rashod Bateman Over 13.5 Rec Yards", sport: "NFL" },
      ],
      conv: [
        { hr_pick: "Justice Hill o2.5 Receptions", pick: "Justice Hill Over 2.5 Receptions", sport: "NFL", hr: "original line kept" },
        { hr_pick: "Rashod Bateman 5+ Rec Yards", pick: "Rashod Bateman Over 13.5 Rec Yards", sport: "NFL" },
      ],
    },
    cappers: [
      { name: "@showtimepicks2", today: [{ pick: "McNeese Cowboys ML (vs UNT; CBB free play)", sport: "NCAAB" }] },
      {
        name: "@alexcaruso",
        today: [
          { pick: "Justice Hill Over 2.5 Receptions (BAL vs JAX; NFL Play of the Day, POTD)", sport: "NFL" },
          { pick: "Rashod Bateman Over 13.5 Rec Yards (BAL vs JAX; NFL play)", sport: "NFL" },
        ],
      },
    ],
  },
  ncaab,
);
const allSports = sportsFor(slate, null);
assert.equal(allSports.find((row) => row.sport === "NCAAB")?.count, 1);
assert.equal(allSports.find((row) => row.sport === "NFL")?.count, 3);
assert.equal(sportsFor(slate, "heist").find((row) => row.sport === "NCAAB")?.count, 1);
assert.equal(sportsFor(slate, "cappers").find((row) => row.sport === "NCAAB")?.count, 1);
assert.equal(sportsFor(slate, "heist").find((row) => row.sport === "NFL")?.count, 2);
assert.equal(sportsFor(slate, "heist-alt").find((row) => row.sport === "NFL")?.count, 2);
assert.equal(sportsFor(slate, "cappers").find((row) => row.sport === "NFL")?.count, 2);
const slatePage = renderPage(blank(), slate);
assert.match(slatePage, /NCAA 🏀<i>1<\/i>/);
assert.match(slatePage, /NFL<i>3<\/i>/);
assert.match(slatePage, /Big 4<i>3<\/i>/);
const pots = adaptDesk(
  {
    today: {
      date: "2026-11-06",
      tickets: [
        { name: "POTD", pick: "Brandin Podziemski Over 16.5 Points", sport: "NBA", odds: "-110" },
        { name: "+100 ticket", odds: "+100", legs: [{ pick: "Shared Leg Over 0.5 Points", sport: "NHL", odds: "-120" }] },
      ],
      sports: {
        ALL: { potd: { pick: "Ryan O'Reilly Over 0.5 Points", sport: "NHL", odds: "-130" } },
        NBA: { potd: { pick: "Brandin Podziemski Over 16.5 Points", sport: "NBA", odds: "-110" } },
        NFL: { potd: { pick: "Zay Flowers Over 48.5 Receiving Yards", sport: "NFL", odds: "-115" } },
        NHL: { potd: { pick: "Brock Boeser Over 0.5 Points", sport: "NHL", odds: "-125" } },
      },
    },
    edge: {
      picks: [
        { pick: "College Over 1.5 Points", sport: "NCAA F" },
        { pick: "Skater Over 0.5 Points", sport: "NHL" },
        { pick: "Guard Over 1.5 Points", sport: "NBA" },
      ],
    },
    results_v2: { rows: [] },
  },
  ncaab,
);
const potdOn = (sport: "All" | "Big 4" | "NBA" | "NFL" | "NHL") => visibleTickets(pots, { ...blank(), product: "potd", sport }).flatMap((ticket) => ticket.plays.map((play) => play.name));
assert.deepEqual(potdOn("All"), ["Ryan O'Reilly Over 0.5 Points"]);
assert.deepEqual(potdOn("Big 4"), ["Brandin Podziemski Over 16.5 Points"]);
assert.deepEqual(potdOn("NBA"), ["Brandin Podziemski Over 16.5 Points"]);
assert.deepEqual(potdOn("NFL"), ["Zay Flowers Over 48.5 Receiving Yards"]);
assert.deepEqual(potdOn("NHL"), ["Brock Boeser Over 0.5 Points"]);
const potdPage = renderPage({ ...blank(), product: "potd", sport: "All" }, pots);
assert.match(potdPage, /All sports/);
assert.match(potdPage, /Big 4<i>1<\/i>/);
assert.match(potdPage, /POTD<i>1<\/i>/);
const edgeAll = visibleTickets(pots, { ...blank(), product: "edge", sport: "All" }).flatMap((ticket) => ticket.plays);
const edgeBig = visibleTickets(pots, { ...blank(), product: "edge", sport: "Big 4" }).flatMap((ticket) => ticket.plays);
assert.equal(edgeAll.length, 3);
assert.equal(edgeBig.length, 2);
assert.equal(edgeBig.some((play) => play.sport === "NCAAF"), false);
const shared = pots.tickets.find((ticket) => ticket.productKey === "parlay");
assert.equal(shared?.board, "ALL_AND_BIG4");
assert.equal(visibleTickets(pots, { ...blank(), product: "parlay", sport: "All" }).length, 1);
assert.equal(visibleTickets(pots, { ...blank(), product: "parlay", sport: "Big 4" }).length, 1);

const butlerCap = { date: "2026-11-04", sport: "NCAAB", cat: "Cappers", pick: "Butler Bulldogs -23.5 (vs FDU; early CBB play)", prop: "@showtimepicks2 · NCAAB spread", stat: "W (FDU 65-99 BTLR)", res: "W", uu: 0.91, leg: false, alt: false };
const butlerHeist = { date: "2026-11-04", sport: "NCAAB", cat: "The Heist", pick: "Butler Bulldogs -23.5", prop: "@showtimepicks2 · Spread", stat: "FDU 65-99 BTLR", res: "W", uu: 0.5, leg: false, alt: false };
const giddeyCap = { date: "2026-11-04", sport: "NBA", cat: "Cappers", pick: "Josh Giddey o7.5 Asts (CHI vs NYK; NBA #3)", prop: "@austinsprops · NBA assists (over)", stat: "L (6 AST)", res: "L", uu: -1, leg: false, alt: false };
const giddeyHeist = { date: "2026-11-04", sport: "NBA", cat: "The Heist", pick: "Josh Giddey o7.5 Asts", prop: "@austinsprops · Other", stat: "6 AST", res: "L", uu: -1, leg: false, alt: false };
const mccainCap = { date: "2026-11-04", sport: "NBA", cat: "Cappers", pick: "Jared McCain 3+ Rebounds (vs CLE; NBA Play of the Day)", prop: "@alexcaruso · NBA rebounds (over)", stat: "L (1 REB)", res: "L", uu: -1, leg: false, alt: false };
const mccainHeist = { date: "2026-11-04", sport: "NBA", cat: "The Heist", pick: "Jared McCain o2.5 Rebounds", prop: "@alexcaruso · Rebounds", stat: "1 REB", res: "L", uu: -1, leg: false, alt: false };
const traeAlt = { date: "2026-11-04", sport: "NBA", cat: "Alt lines", pick: "Trae Young 9+ Assists", prop: "NBA alt line · o9.5 → 9+ · @alexcaruso", stat: "6 AST", res: "L", uu: -1, leg: false, alt: true };
const traeHeist = { date: "2026-11-04", sport: "NBA", cat: "The Heist", pick: "Trae Young 9+ Assists", prop: "@alexcaruso · Assists", stat: "6 AST", res: "L", uu: -1, leg: false, alt: true };
const traeOver = { date: "2026-11-04", sport: "NBA", cat: "Cappers", pick: "Trae Young Over 9.5 Assists (vs ATL; NBA Play #1)", prop: "@alexcaruso · NBA assists (over)", stat: "L (6 AST)", res: "L", uu: -1, leg: false, alt: false };
const hezonjaAlt = { date: "2026-11-04", sport: "NBA", cat: "Alt lines", pick: "Mario Hezonja 11+ PR", prop: "NBA alt line · o13.5 → 11+ · @panpotd", stat: "20 P+R", res: "W", uu: 0.31, leg: false, alt: true };
const hezonjaHeist = { date: "2026-11-04", sport: "NBA", cat: "The Heist", pick: "Mario Hezonja 11+ PR", prop: "@panpotd · Other", stat: "20 P+R", res: "W", uu: 0.31, leg: false, alt: true };
const hezonjaOver = { date: "2026-11-04", sport: "NBA", cat: "Cappers", pick: "Mario Hezonja O 13.5 PR (vs OKC; NBA Wednesday Play #2)", prop: "@panpotd · NBA pts+reb (over)", stat: "W (20 P+R)", res: "W", uu: 0.95, leg: false, alt: false };
assert.equal(playKey(butlerCap), playKey(butlerHeist));
assert.equal(playKey(giddeyCap), playKey(giddeyHeist));
assert.equal(playKey(mccainCap), playKey(mccainHeist));
assert.equal(playKey(traeAlt), playKey(traeHeist));
assert.notEqual(playKey(traeAlt), playKey(traeOver));
assert.equal(playKey(hezonjaAlt), playKey(hezonjaHeist));
assert.notEqual(playKey(hezonjaAlt), playKey(hezonjaOver));
assert.match(playKey(mccainCap), /\|o2\.5$/);
assert.match(playKey(traeAlt), /\|o8\.5$/);
assert.match(playKey(traeOver), /\|o9\.5$/);
assert.match(playKey(braunAlt), /\|o3\.5$/);
assert.match(playKey(braunOver), /\|o4\.5$/);
const paired = adaptDesk(
  {
    today: { date: "2026-11-05", tickets: [], sports: {} },
    results_v2: { rows: [butlerCap, butlerHeist, giddeyCap, giddeyHeist, mccainCap, mccainHeist, traeAlt, traeHeist, traeOver, hezonjaAlt, hezonjaHeist, hezonjaOver, braunAlt, braunHeist, braunOver, packersA, packersB] },
    record: { chart: [["10/18", 1], ["10/28", 2], ["11/04", 3]] },
  },
  ncaab,
);
const once = (name: string) => paired.grades.filter((grade) => (grade.play ?? "").includes(name));
assert.equal(once("Butler").length, 1);
assert.equal(once("Giddey").length, 1);
assert.equal(once("McCain").length, 1);
assert.equal(once("9+").length, 1);
assert.equal(once("Over 9.5").length, 1);
assert.equal(once("11+").length, 1);
assert.equal(once("13.5").length, 1);
assert.equal(once("Butler")[0].units, 0.91);
assert.equal(once("Giddey")[0].side, "over");
assert.equal(once("McCain")[0].side, "over");
assert.equal(once("9+")[0].side, "alt");
assert.equal(once("Over 9.5")[0].side, "over");
assert.equal(once("11+")[0].side, "alt");
assert.equal(once("4+")[0].side, "alt");
assert.equal(once("o4.5")[0].side, "over");
for (const name of ["Butler", "Giddey", "McCain"]) {
  const grade = once(name)[0];
  assert.equal(sectionMatch(grade, "all"), true);
  assert.equal(sectionMatch(grade, "heist"), true);
  assert.equal(sectionMatch(grade, "cappers"), true);
}
assert.equal(sectionMatch(once("9+")[0], "heist"), true);
assert.equal(sectionMatch(once("9+")[0], "cappers"), false);
assert.equal(paired.grades.filter((grade) => sectionMatch(grade, "cappers") && (grade.play ?? "").includes("Packers")).length, 1);
const profit = (html: string) => html.match(/<h2>Profit<\/h2>[\s\S]*?<div class="sub">([^<]+)<\/div>/)?.[1] ?? "";
const todaySummary = renderPage({ ...blank(), view: "today" }, paired);
const resultsSummary = renderPage({ ...blank(), view: "results", statsSection: "all" }, paired);
assert.equal(profit(todaySummary), profit(resultsSummary));
assert.equal(profit(todaySummary), "-3.83u · 3-6 · 33% win rate");
const heistSummary = renderPage({ ...blank(), view: "results", statsSection: "heist" }, paired);
const capperSummary = renderPage({ ...blank(), view: "results", statsSection: "cappers" }, paired);
assert.notEqual(profit(heistSummary), profit(todaySummary));
assert.notEqual(profit(capperSummary), profit(todaySummary));

assert.equal(gradeOf({ result: "Void: rule change, pre-game (edgefilter1105)" }), "V");
assert.equal(gradeOf({ result: "Win by 2" }), "W");
assert.equal(gradeOf({ result: "Loss late" }), "L");
const edgeDesk = adaptDesk({
  updated: "2026-11-06 10:00 AM ET",
  today: {
    tickets: [
      { name: "Safe +100 / Alt Parlay", pick: "builds at the 10 AM window, not at 7 AM." },
      { name: "+100 ticket", legs: [{ pick: "Jack Quinn Over 1.5 SOG", odds: "+120", hr_sid: "123", sport: "NHL" }], desc: "2-leg" },
    ],
  },
  edge: {
    picks: [
      { sport: "NBA", pick: "Morgan Geekie Over 0.5 Assists", result: "Void: rule change, pre-game (edgefilter1105)", lock_why: "graded: Void: rule change, pre-game (edgefilter1105)", locked: true, hr_state: "open", hr: "+150", edge_single: true, edge: 0.07, fair: "+180", sog_agree: false, why_src: "Pinnacle no-vig fair +180", grade_why: "Recent form 8 of 10", gameday: ["Game day note"] },
      { sport: "NHL", pick: "Cale Makar Over 2.5 Shots on Goal", locked: true, lock_why: "game started", bk_started: true, hr_state: "open", hr: "-110", edge_single: true, edge: 0.05, hr_now: "-130", sog_agree: true, sog_l10: 3.4 },
      { sport: "NCAAF", kind: "total", pick: "Under 74.5", game: "UTSA Roadrunners @ Florida Atlantic Owls", ctx: { away: "UTSA", home: "FAU" }, hr_state: "absent", hr_why: "Hard Rock does not list this line", hr: "-120", edge_single: true, edge: 0.041 },
      { sport: "NBA", pick: "Jalen Duren Over 9.5 Rebounds", hr_state: "suspended", hr: "-115", edge_single: true, big_edge_assist: false },
    ],
  },
});
const edgeTicket = edgeDesk.tickets.find((ticket) => ticket.productKey === "edge");
const byName = (needle: string) => edgeTicket?.plays.find((play) => play.name.includes(needle));
const geekie = byName("Geekie");
const makar = byName("Makar");
const total = byName("Under 74.5");
const duren = byName("Duren");
assert.equal(geekie?.blocked, "graded");
assert.equal(geekie?.voidedPreGame, true);
assert.equal(geekie?.markers?.some((mark) => mark.label.includes("Assist")), false);
assert.equal(makar?.blocked, "started");
assert.equal(makar?.lockWhy, "game started");
assert.equal(makar?.markers?.some((mark) => mark.label.startsWith("Now ")), true);
assert.equal(makar?.markers?.some((mark) => mark.label.includes("SOG L10")), true);
assert.equal(total?.name, "UTSA @ FAU · Under 74.5");
assert.equal(total?.hrAbsent, true);
assert.equal(listedOn(geekie!, "hr"), true);
assert.equal(listedOn(makar!, "hr"), true);
assert.equal(listedOn(total!, "hr"), false);
assert.equal(listedOn(duren!, "hr"), true);
assert.match(bookButton(makar!, "hr"), /Live · locked at/);
assert.match(bookButton(duren!, "hr"), /On Hard Rock · suspended/);
assert.match(bookButton(total!, "hr"), /Not on HR/);
assert.equal(renderPlay(geekie!, "hr", new Set()).includes("checkbox"), false);
assert.match(renderPlay(geekie!, "hr", new Set()), /Voided pre-game · rule change/);
const edgePage = renderPage(blank(), edgeDesk);
assert.match(edgePage, /voided pre-game \(rule change\), tap to view/);
assert.equal(/10 AM window/.test(edgePage), false);
assert.equal(geekie?.why.why[0], "Pinnacle no-vig fair +180");
assert.equal(geekie?.why.why[1], "Recent form 8 of 10");
assert.equal(geekie?.why.why[2], "Game day note");
assert.equal(/Game started \(blocked\)/.test(renderPlay(makar!, "hr", new Set())), false);
const edgeCard = edgePage.slice(edgePage.indexOf('id="ticket-edge"'));
assert.equal(/No open legs|Whole ticket|Open ticket/.test(edgeCard), false);
edgeDesk.liveGames = [{
  id: "vgk-det",
  league: "NHL",
  away: "VGK",
  home: "DET",
  awayName: "Vegas Golden Knights",
  homeName: "Detroit Red Wings",
  awayScore: 0,
  homeScore: 0,
  clock: "17:59 - 2nd",
  pre: false,
  final: false,
  awaySide: { abbr: "VGK", record: "10-5-2", standing: "2nd Pac" },
  homeSide: { abbr: "DET", record: "7-6-3", standing: "8th Atl" },
  legs: [
    {
      name: "Vegas Golden Knights @ Detroit Red Wings Over 5.5",
      current: 0,
      line: 5.5,
      unit: "G",
      pace: "cold",
      source: "ESPN score",
      why: { ours: false, line: "fair", why: ["Pinnacle no-vig"], whyNot: [] },
      tags: ["Edge", "@nickm_hockey"],
      key: "total:o:5.5",
    },
    {
      name: "Jack Eichel Under 2.5 Shots On Goal",
      current: 3,
      line: 2.5,
      unit: "SOG",
      pace: "dead",
      source: "ESPN box score",
      why: { ours: false, line: "", why: [], whyNot: [] },
      tags: ["Props"],
      key: "sog",
    },
  ],
}];
const liveHtml = renderPage({ ...blank(), view: "live" }, edgeDesk);
const overAt = liveHtml.indexOf("Over 5.5");
const overTag = liveHtml.indexOf("ltag edge", overAt);
const overBar = liveHtml.indexOf("lv-bar", overAt);
const overWhy = liveHtml.indexOf("whychip", overAt);
assert.ok(overTag < overBar && overBar < overWhy);
assert.equal(liveHtml.includes("lv-foot"), false);
assert.match(liveHtml.slice(overAt, overAt + 700), /0\/5\.5 G/);
const sogAt = liveHtml.indexOf("Jack Eichel");
const sogTag = liveHtml.indexOf("ltag props", sogAt);
const sogBar = liveHtml.indexOf("lv-bar", sogAt);
assert.ok(sogTag < sogBar);

console.log("adapter tests ok", adapted.picks.length, "picks");
