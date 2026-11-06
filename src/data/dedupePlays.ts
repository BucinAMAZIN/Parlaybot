/**
 * One posted play counts once across Cappers, The Heist, and Alt lines
 * when the date, sport, player or team, stat, and line are the same.
 * POTD, Safe, Edge, First Blood, and other products stay separate.
 * A different date or a different line stays separate.
 * Integer N+ is the same threshold as Over (N − 0.5): 3+ is o2.5, and 9+ is o8.5.
 */

import { normSport } from "./gradeLabels.ts";
import { isTicketRow } from "./ticketLegs.ts";

type Row = Record<string, unknown>;

const SINGLE = /^(cappers?|the heist|alt lines)$/i;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function units(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function playerToken(pick: string): string {
  let name = pick.toLowerCase().replace(/\([^)]*\)/g, " ").replace(/^\s*#\d+\s*/, "");
  name = name.replace(/\bsafe\s*\+\s*100\b/g, " ");
  name = name.replace(/\b\d+\s*-?\s*leg\b/g, " ");
  name = name.replace(/\bfirst blood\b/g, " ");
  name = name.replace(/\bparlay\b/g, " ");
  name = name.replace(/\b(?:over|under)\s+\d+(?:\.\d+)?\b/g, " ");
  name = name.replace(/\b[ou]\s*\d+(?:\.\d+)?\b/g, " ");
  name = name.replace(/\b\d+(?:\.\d+)?\s*\+/g, " ");
  name = name.replace(/[+-]\s*\d+(?:\.\d+)?/g, " ");
  name = name.replace(/\b(rebounds?|rebs?|assists?|asts?|points?|pts|3pm|threes?|sog|goals?|blocks?|steals?|moneyline)\b/g, " ");
  name = name.replace(/\b(pass(?:ing)?(?: yards| yds)?|rush(?:ing)?(?: yards| yds)?|rec(?:eiving|eptions?)?(?: yards| yds)?|receptions?|longest reception)\b/g, " ");
  name = name.replace(/\b(spread|total|over|under|vs|at|ml)\b/g, " ");
  name = name.replace(/\b(pra|pr|pa|ra)\b/g, " ");
  name = name.replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  if (name.length < 3) return "";
  return name;
}

/** Integer N+ (N >= 1) is Over (N − 0.5). 4+ is o3.5, which does not match o4.5. */
function lineToken(pick: string): string {
  const clean = pick.replace(/\([^)]*\)/g, " ").replace(/−/g, "-");
  const plus = clean.match(/(\d+(?:\.\d+)?)\s*\+/);
  if (plus) {
    const n = Number(plus[1]);
    if (Number.isInteger(n) && n >= 1) return `o${n - 0.5}`;
    return `${plus[1]}+`;
  }
  const ou = clean.match(/\b([ou])\s*(\d+(?:\.\d+)?)/i);
  if (ou) return `${ou[1].toLowerCase()}${ou[2]}`;
  const word = clean.match(/\b(over|under)\s+(\d+(?:\.\d+)?)/i);
  if (word) return `${word[1].toLowerCase().startsWith("u") ? "u" : "o"}${word[2]}`;
  const spread = clean.match(/([+-])\s*(\d+(?:\.\d+)?)/);
  if (spread) return `${spread[1]}${spread[2]}`;
  if (/\bml\b|moneyline/i.test(clean)) return "ml";
  return "";
}

function statToken(stat: string, pick: string, prop = ""): string {
  const blob = `${stat} ${pick} ${prop}`.toUpperCase();
  if (/\bPRA\b|\bPTS\s*\+\s*REB\s*\+\s*AST/.test(blob)) return "PRA";
  if (/\bP\s*\+\s*R\b|\bPTS\s*\+\s*REB\b|\bPR\b/.test(blob)) return "PR";
  if (/\bP\s*\+\s*A\b|\bPTS\s*\+\s*AST\b|\bPA\b/.test(blob)) return "PA";
  if (/\bR\s*\+\s*A\b|\bREB\s*\+\s*AST\b|\bRA\b/.test(blob)) return "RA";
  const pickBlob = pick.toUpperCase();
  if (/LONGEST/.test(blob) && /REC/.test(blob)) return "LONGEST_REC";
  if (/\bPASS/.test(blob)) return "PASS";
  if (/\bRUSH/.test(blob)) return "RUSH";
  if (/REC(?:EIVING|EPTION)/.test(blob) || /\bRECS?\b/.test(blob)) return "REC";
  if (/\bTD\b|\bTOUCHDOWNS?\b/.test(blob)) return "TD";
  if (/\bSOG\b|\bSHOTS?\s+ON\s+GOAL\b/.test(blob)) return "SOG";
  if (/\bGOALS?\b/.test(blob)) return "GOALS";
  if (/\b3PM\b|\bTHREES?\b/.test(blob)) return "3PM";
  if (/\bREBOUNDS?\b|\bREBS?\b/.test(blob)) return "REB";
  if (/\bASTS?\b|\bASSISTS?\b/.test(blob)) return "AST";
  if (/\bPTS\b|\bPOINTS?\b/.test(blob)) return "PTS";
  if (/\bBLK\b|\bBLOCKS?\b/.test(blob)) return "BLK";
  if (/\bSTL\b|\bSTEALS?\b/.test(blob)) return "STL";
  if (/\bML\b|\bMONEYLINE\b/.test(blob)) return "ML";
  if (/\bSPREAD\b/.test(blob) || /[+-]\s*\d/.test(pickBlob)) return "SPREAD";
  if (/\bTOTAL\b/.test(blob) || /\b(?:OVER|UNDER)\s+\d/.test(pickBlob)) return "TOTAL";
  return "";
}

function capperRow(row: Row): boolean {
  return /^cappers?$/i.test(text(row.cat));
}

function singlePlay(row: Row): boolean {
  return SINGLE.test(text(row.cat));
}

function catsOf(row: Row): string[] {
  const listed = Array.isArray(row.cats) ? row.cats.map(text) : [];
  const cat = text(row.cat);
  return [...new Set([cat, ...listed].filter(Boolean))];
}

/** Empty unless this single play can match another Cappers, Heist, or Alt lines row. */
export function playKey(row: Row): string {
  if (row.leg === true || isTicketRow(row) || !singlePlay(row)) return "";
  const res = text(row.res);
  if (res !== "W" && res !== "L" && res !== "V" && res !== "P") return "";
  const date = text(row.date);
  const pick = text(row.pick);
  const player = playerToken(pick);
  const line = lineToken(pick);
  const stat = statToken(text(row.stat), pick, text(row.prop));
  if (!date || !player || !line || !stat) return "";
  return `${date}|${normSport(text(row.sport)).toUpperCase()}|${player}|${stat}|${line}`;
}

function handles(value: string): string[] {
  return [...value.matchAll(/@([a-z0-9_]+)/gi)].map((match) => `@${match[1]}`);
}

function rank(row: Row): number {
  const cat = text(row.cat).toLowerCase();
  if (cat === "the heist") return 0;
  if (cat === "alt lines") return 1;
  return 2;
}

/** Keep the Heist price when the capper posted 0u. Otherwise keep the larger stake, then the official row. */
function prefer(kept: Row, row: Row): Row {
  const keptCap = capperRow(kept);
  const rowCap = capperRow(row);
  const keptU = units(kept.uu);
  const rowU = units(row.uu);
  if (keptCap && keptU === 0 && !rowCap) return row;
  if (rowCap && rowU === 0 && !keptCap) return kept;
  if (Math.abs(rowU) > Math.abs(keptU)) return row;
  if (Math.abs(keptU) > Math.abs(rowU)) return kept;
  return rank(row) < rank(kept) ? row : kept;
}

export type DedupedPlays = { rows: Row[]; droppedUnits: Map<string, number> };

function chartDays(chart: unknown): Set<string> | null {
  if (chart == null) return null;
  const days = new Set<string>();
  if (!Array.isArray(chart)) return days;
  for (const pair of chart) {
    if (Array.isArray(pair) && typeof pair[0] === "string") days.add(pair[0]);
  }
  return days;
}

/** The desk chart is a daily total. A date on that list is the only sign the dropped stake was inside it. */
function onChart(days: Set<string> | null, iso: string): boolean {
  if (days == null) return true;
  const parts = iso.split("-");
  if (parts.length !== 3) return false;
  return days.has(`${Number(parts[1])}/${Number(parts[2])}`) || days.has(iso);
}

/**
 * One row per play. Handles from every copy stay on `prop`.
 * `alt` stays true only when a source row was a real alt line.
 * A dropped capper copy is subtracted from the desk chart only when that
 * chart already lists the day. Heist and Alt lines mirrors are the same
 * official play, so their units are not subtracted again.
 */
export function dedupePlays(rows: Row[], chart?: unknown): DedupedPlays {
  const keptAt = new Map<string, number>();
  const out: Row[] = [];
  const droppedUnits = new Map<string, number>();
  const days = chartDays(chart);
  for (const row of rows) {
    const key = playKey(row);
    if (!key) {
      out.push(row);
      continue;
    }
    const index = keptAt.get(key);
    if (index == null) {
      keptAt.set(key, out.length);
      out.push({ ...row, cats: catsOf(row) });
      continue;
    }
    const kept = out[index];
    const winner = prefer(kept, row);
    const loser = winner === row ? kept : row;
    if (capperRow(winner) && capperRow(loser)) {
      const date = text(loser.date);
      if (onChart(days, date)) droppedUnits.set(date, (droppedUnits.get(date) ?? 0) + units(loser.uu));
    }
    const names = [...new Set([...handles(text(kept.prop)), ...handles(text(row.prop))])];
    let prop = text(winner.prop);
    for (const name of names) if (!prop.includes(name)) prop = `${prop} ${name}`.trim();
    const cats = [...new Set([...catsOf(kept), ...catsOf(row)])];
    const alt = kept.alt === true || row.alt === true;
    out[index] = { ...winner, prop, cats, alt };
  }
  return { rows: out, droppedUnits };
}
