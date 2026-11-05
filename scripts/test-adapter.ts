import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { adaptEdgePicks, flatUnitResult, gradeResult, inStarBand } from "../src/data/adaptEdgePicks.ts";
import { edgeFeedTicket, presentEdgePick, tallyEdge } from "../src/data/presentEdgeFeed.ts";
import { draftKingsLegLink, draftKingsSlipLink, hardRockLegLink, hardRockSlipLink } from "../src/lib/links.ts";
import { adaptDeskStandings } from "../src/data/adaptStandings.ts";
import { adaptDesk } from "../src/data/desk.ts";
import { builtLabel, clockEt, heistLabel, injuryLabel, lockLabel, standingsLabel, uiBuildLabel, updatedLabel } from "../src/lib/stamps.ts";
import { shareCardIsPrivate, shareFromPending, shareFromSettled } from "../src/lib/shareCard.ts";
import { results, rings, sampleTickets } from "../src/data/sampleBoard.ts";
import { winRateBand } from "../src/ui/bits.ts";

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
assert.ok(liveDesk.notices.some((note) => /HEIST/.test(note)));
assert.ok(liveDesk.notices.some((note) => /10 AM/.test(note)));
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

console.log("adapter tests ok", adapted.picks.length, "picks");
