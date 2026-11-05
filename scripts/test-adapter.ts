import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { adaptEdgePicks, flatUnitResult, gradeResult, inStarBand } from "../src/data/adaptEdgePicks.ts";
import { edgeFeedTicket, presentEdgePick, tallyEdge } from "../src/data/presentEdgeFeed.ts";
import { draftKingsLegLink, draftKingsSlipLink, hardRockLegLink, hardRockSlipLink } from "../src/lib/links.ts";
import { adaptDeskStandings } from "../src/data/adaptStandings.ts";
import { shareCardIsPrivate, shareFromPending, shareFromSettled } from "../src/lib/shareCard.ts";
import { results, sampleTickets } from "../src/data/sampleBoard.ts";

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

console.log("adapter tests ok", adapted.picks.length, "picks");
