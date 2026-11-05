import {
  flatUnitResult,
  inStarBand,
  latestEdgeDate,
  type EdgeGrade,
  type EdgePick,
} from "./adaptEdgePicks.ts";
import { edgePercent } from "../lib/format.ts";
import { sportLabel } from "../lib/sport.ts";
import type { Marker, Play, Sport, Ticket, WhyBlock } from "./types.ts";

const SPORTS = new Set(["NHL", "NBA", "NFL", "NCAAF", "NCAAB", "NASCAR", "MLB", "WNBA", "Tennis"]);

function asSport(sport: string): Sport {
  if (sport === "NCAA F" || sport === "NCAAF") return "NCAAF";
  if (sport === "NCAAM" || sport === "NCAAB") return "NCAAB";
  if (SPORTS.has(sport)) return sport as Sport;
  return "NHL";
}

function tone(grade: EdgeGrade): "W" | "L" | "V" {
  if (grade === "win") return "W";
  if (grade === "loss") return "L";
  return "V";
}

function markers(pick: EdgePick): Marker[] {
  const list: Marker[] = [];
  if (inStarBand(pick.edge)) list.push({ kind: "star", label: "★ 6–8% edge" });
  if (pick.marketTags.includes("sog")) list.push({ kind: "sog", label: "◎ SOG target" });
  if (pick.marketTags.includes("assist")) list.push({ kind: "assist", label: "! Assist risk" });
  return list;
}

function whyFor(pick: EdgePick): WhyBlock {
  const pct = edgePercent(pick.edge);
  const bullets = [
    `Edge ${pct} vs fair price ${pick.fair}`,
    `Hard Rock ${pick.hr}`,
    `Rank ${pick.rank} on the ${pick.date} ${sportLabel(pick.sport)} board`,
  ];
  if (pick.result) bullets.push(`Graded: ${pick.result}`);
  return {
    ours: false,
    line: `Edge ${pct} vs fair ${pick.fair}, rank ${pick.rank} on the ${sportLabel(pick.sport)} board`,
    why: bullets,
    whyNot: ["No risk notes in the edge-picks feed"],
  };
}

export function presentEdgePick(pick: EdgePick): Play {
  const pct = edgePercent(pick.edge);
  const settled = pick.grade !== "pending";
  return {
    id: `feed-${pick.date}-${pick.sport}-${pick.rank}-${slug(pick.pick)}`,
    name: pick.pick,
    detail: `${sportLabel(asSport(pick.sport))} · Edge ${pct} · fair ${pick.fair} · ${pick.game}`,
    sport: asSport(pick.sport),
    hr: pick.hr,
    dk: null,
    markers: markers(pick),
    blocked: settled ? "graded" : undefined,
    why: whyFor(pick),
    source: "edge-feed",
    hrEvent: pick.hrEvent || undefined,
    pinId: pick.pinId,
    gradeNote: pick.result ? { text: pick.result, tone: tone(pick.grade) } : undefined,
  };
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

export type EdgeRecord = {
  wins: number;
  losses: number;
  voids: number;
  pushes: number;
  pending: number;
  unknown: number;
  /** Flat 1u at the Hard Rock price. Null when a row has no settled price. */
  units: number;
  unitRows: number;
};

export function tallyEdge(picks: EdgePick[]): EdgeRecord {
  const record: EdgeRecord = { wins: 0, losses: 0, voids: 0, pushes: 0, pending: 0, unknown: 0, units: 0, unitRows: 0 };
  for (const pick of picks) {
    if (pick.grade === "win") record.wins += 1;
    else if (pick.grade === "loss") record.losses += 1;
    else if (pick.grade === "void") record.voids += 1;
    else if (pick.grade === "push") record.pushes += 1;
    else if (pick.grade === "pending") record.pending += 1;
    else record.unknown += 1;
    const units = flatUnitResult(pick.hr, pick.grade);
    if (units != null) {
      record.units += units;
      record.unitRows += 1;
    }
  }
  return record;
}

export function edgeFeedTicket(picks: EdgePick[]): Ticket {
  const date = latestEdgeDate(picks);
  const day = picks.filter((pick) => pick.date === date).sort((a, b) => a.sport.localeCompare(b.sport) || a.rank - b.rank);
  const record = tallyEdge(day);
  return {
    id: "edge-feed",
    productKey: "edge",
    title: "Edge feed",
    meta: `${date || "no date"} · ${record.wins}-${record.losses} · ${day.length} plays · Hard Rock prices from the fixture · DK is not in this feed`,
    badge: "fixture",
    plays: day.map(presentEdgePick),
    share: true,
    rules: [
      "These rows are the attached edge-picks fixture. Prices, edge, fair price, and grades are copied from that file.",
      "DraftKings prices are not in the file, so the DK view says Not on DK instead of inventing a number.",
      "A settled play is blocked. The app does not re-grade it.",
      "Why / Why not uses only fields on the row. There is no matchup rank in the feed, so none is shown.",
    ],
    group: "edge",
  };
}

export function edgeDates(picks: EdgePick[]): string[] {
  return [...new Set(picks.map((pick) => pick.date))].sort((a, b) => (a < b ? 1 : -1));
}
