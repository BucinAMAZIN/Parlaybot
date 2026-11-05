/**
 * Only capper rows collapse. The same capper's pick posted twice counts once,
 * and the same pick posted by two cappers counts once.
 * Heist, Alt lines, POTD, Safe, Edge, First Blood, and a capper row of the same leg stay separate.
 * A different date or line stays separate.
 */

type Row = Record<string, unknown>;

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
  name = name.replace(/\b[ou]\s*\d+(?:\.\d+)?\b/g, " ");
  name = name.replace(/\b\d+(?:\.\d+)?\s*\+/g, " ");
  name = name.replace(/[+-]\s*\d+(?:\.\d+)?/g, " ");
  name = name.replace(/\b(rebounds?|rebs?|assists?|asts?|points?|pts|3pm|sog|receptions?|rec yds|rush(?:ing)? yds|rush yards|ml)\b/g, " ");
  name = name.replace(/\b(pr|pa|ra)\b/g, " ");
  name = name.replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  if (name.length < 3) return "";
  return name;
}

function lineToken(pick: string): string {
  const clean = pick.replace(/\([^)]*\)/g, " ");
  const plus = clean.match(/(\d+(?:\.\d+)?)\s*\+/);
  if (plus) return `${plus[1]}+`;
  const ou = clean.match(/\b([ou])\s*(\d+(?:\.\d+)?)/i);
  if (ou) return `${ou[1].toLowerCase()}${ou[2]}`;
  const spread = clean.match(/([+-])\s*(\d+(?:\.\d+)?)/);
  if (spread) return `${spread[1]}${spread[2]}`;
  if (/\bml\b/i.test(clean)) return "ml";
  return "";
}

function statToken(stat: string, pick: string): string {
  const blob = `${stat} ${pick}`.toUpperCase();
  if (/\bP\s*\+\s*R\b|\bPR\b/.test(blob)) return "PR";
  if (/\bP\s*\+\s*A\b|\bPA\b/.test(blob)) return "PA";
  if (/\bR\s*\+\s*A\b|\bRA\b/.test(blob)) return "RA";
  if (/\b3PM\b|\bTHREES?\b/.test(blob)) return "3PM";
  if (/\bSOG\b|\bSHOTS?\s+ON\s+GOAL\b/.test(blob)) return "SOG";
  if (/\bREB/.test(blob)) return "REB";
  if (/\bAST/.test(blob)) return "AST";
  if (/\bPTS\b|\bPOINTS?\b/.test(blob)) return "PTS";
  if (/\bRUSH/.test(blob)) return "RUSH";
  if (/\bREC/.test(blob)) return "REC";
  if (/\bML\b/.test(blob)) return "ML";
  return "";
}

function capperRow(row: Row): boolean {
  return /^cappers?$/i.test(text(row.cat));
}

/** Empty unless this is a capper row we can match to another capper row. */
export function playKey(row: Row): string {
  if (row.leg === true || !capperRow(row)) return "";
  const res = text(row.res);
  if (res !== "W" && res !== "L" && res !== "V" && res !== "P") return "";
  const date = text(row.date);
  const pick = text(row.pick);
  const player = playerToken(pick);
  const line = lineToken(pick);
  const stat = statToken(text(row.stat), pick);
  if (!date || !player || !line) return "";
  return `${date}|${text(row.sport).toUpperCase()}|${player}|${stat}|${line}`;
}

function handles(value: string): string[] {
  return [...value.matchAll(/@([a-z0-9_]+)/gi)].map((match) => `@${match[1]}`);
}

export type DedupedPlays = { rows: Row[]; droppedUnits: Map<string, number> };

/** One posting per key. A later copy is not added. If the prices differ, the larger stake is the one that counts, and an alt posting keeps the play on the alt row. */
export function dedupePlays(rows: Row[]): DedupedPlays {
  const keptAt = new Map<string, number>();
  const out: Row[] = [];
  const droppedUnits = new Map<string, number>();
  for (const row of rows) {
    const key = playKey(row);
    if (!key) {
      out.push(row);
      continue;
    }
    const index = keptAt.get(key);
    if (index == null) {
      keptAt.set(key, out.length);
      out.push(row);
      continue;
    }
    const kept = out[index];
    const keepNew = Math.abs(units(row.uu)) > Math.abs(units(kept.uu));
    const winner = keepNew ? row : kept;
    const loser = keepNew ? kept : row;
    const date = text(loser.date);
    droppedUnits.set(date, (droppedUnits.get(date) ?? 0) + units(loser.uu));
    const names = [...new Set([...handles(text(kept.prop)), ...handles(text(row.prop))])];
    let prop = text(winner.prop);
    for (const name of names) if (!prop.includes(name)) prop = `${prop} ${name}`.trim();
    out[index] = { ...winner, prop };
  }
  return { rows: out, droppedUnits };
}
