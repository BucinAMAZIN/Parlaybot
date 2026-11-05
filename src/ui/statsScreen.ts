import type { Board } from "../data/board.ts";
import { sectionMatch, sportRank, sportTitle } from "../data/gradeLabels.ts";
import type { GradeMark } from "../data/types.ts";
import { prettyDay, windowGrades } from "../lib/history.ts";
import { esc, formatSigned } from "../lib/format.ts";
import { ringSvg } from "./bits.ts";
import type { AppState } from "./state.ts";

function monthName(iso: string): string {
  const [year, month] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function dayMap(grades: GradeMark[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const grade of grades) map.set(grade.date, (map.get(grade.date) ?? 0) + grade.units);
  return map;
}

function monthHtml(isoMonth: string, tint: Map<string, number>, from: string, to: string, mode: AppState["statsMode"]): string {
  const [year, month] = isoMonth.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: string[] = [];
  for (let i = 0; i < first.getUTCDay(); i++) cells.push(`<i class="calday e"></i>`);
  for (let day = 1; day <= days; day++) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const units = tint.get(iso);
    const tone = units == null ? "n" : units > 0 ? "w" : units < 0 ? "l" : "n";
    const on = iso >= from && iso <= to ? " on" : "";
    cells.push(`<button type="button" class="calday ${tone}${on}" data-act="cal-day" data-date="${iso}">${day}</button>`);
  }
  const weeks: string[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    const chunk = cells.slice(i, i + 7);
    const dates = chunk.map((cell) => cell.match(/data-date="(\d{4}-\d{2}-\d{2})"/)?.[1]).filter(Boolean) as string[];
    const selected = mode === "week" && dates.some((date) => date >= from && date <= to);
    weeks.push(`<div class="calweek${selected ? " wsel" : ""}">${chunk.join("")}</div>`);
  }
  return `<div class="mon"><div class="mh"><b>${esc(monthName(isoMonth))}</b></div><div class="caldows"><i>S</i><i>M</i><i>T</i><i>W</i><i>T</i><i>F</i><i>S</i></div>${weeks.join("")}</div>`;
}

function monthsBetween(from: string, to: string): string[] {
  if (!from || !to) return [];
  const out: string[] = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  const end = to.slice(0, 7);
  for (let i = 0; i < 18; i++) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    out.push(key);
    if (key >= end) break;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return out;
}

function calendar(state: AppState, grades: GradeMark[], from: string, to: string): string {
  const label = from && to ? `${prettyDay(from)} – ${prettyDay(to)}` : "Pick dates";
  const modes = (["day", "week", "range"] as const)
    .map((mode) => `<button type="button" class="${state.statsMode === mode ? "on" : ""}" data-act="cal-mode" data-key="${mode}">${mode === "day" ? "Day" : mode === "week" ? "Week" : "Range"}</button>`)
    .join("");
  const head = `<div class="calhead"><button type="button" class="caltoggle" data-act="cal-toggle">📅 <b>${esc(label)}</b> <span class="car">${state.statsCalOpen ? "▴" : "▾"}</span></button><div class="ranges calmode">${modes}</div></div>`;
  if (!state.statsCalOpen || !to) return `<div class="card cal">${head}</div>`;
  const tint = dayMap(grades);
  const picked = [state.statsAnchor, state.statsDraft].filter(Boolean).sort();
  const hiFrom = picked[0] || from;
  const hiTo = picked[1] || picked[0] || to;
  const applyLabel = hiFrom && hiTo ? `${prettyDay(hiFrom)} – ${prettyDay(hiTo)}` : label;
  const grids = monthsBetween(from, to).map((month) => monthHtml(`${month}-01`, tint, hiFrom, hiTo, state.statsMode)).join("");
  return `<div class="card cal">${head}${grids}<div class="lgd"><span><i class="w"></i>Win day</span><span><i class="l"></i>Loss day</span><span><i class="n"></i>No bets</span></div><p class="sub">Tap a day. In Week, that selects the whole week. In Range, tap the first day and the last.</p><div class="row2"><button type="button" class="btn share" data-act="cal-clear">Clear</button><button type="button" class="btn hr" data-act="cal-apply">Apply ${esc(applyLabel)}</button></div></div>`;
}

function spark(values: number[]): string {
  if (values.length < 2) return "";
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high === low ? 1 : high - low;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 78;
      const y = 36 - ((value - low) / span) * 32;
      return `${x.toFixed(0)},${y.toFixed(0)}`;
    })
    .join(" ");
  const up = values[values.length - 1] >= values[0];
  return `<svg width="80" height="40" class="spk ${up ? "pos" : "neg"}" aria-hidden="true"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
}

function sportCards(grades: GradeMark[], open: string): string {
  const bySport = new Map<string, GradeMark[]>();
  for (const grade of grades) {
    const list = bySport.get(grade.sport) ?? [];
    list.push(grade);
    bySport.set(grade.sport, list);
  }
  const sports = [...bySport.keys()].filter((sport) => (bySport.get(sport) ?? []).length).sort((a, b) => sportRank(a) - sportRank(b));
  return sports
    .map((sport) => {
      const rows = bySport.get(sport) ?? [];
      const wins = rows.filter((row) => row.win).length;
      const losses = rows.length - wins;
      const units = rows.reduce((sum, row) => sum + row.units, 0);
      const pct = rows.length ? Math.round((wins / rows.length) * 100) : 0;
      const byDay = new Map<string, number>();
      for (const row of rows) byDay.set(row.date, (byDay.get(row.date) ?? 0) + row.units);
      let running = 0;
      const line = [...byDay.keys()].sort().map((date) => (running += byDay.get(date) ?? 0));
      const expanded = open === sport;
      const props = expanded ? propBlock(rows) : "";
      return `<section class="card sp${expanded ? " ex" : ""}"><button type="button" class="sprow" data-act="stats-sport" data-key="${esc(sport)}">${ringSvg(pct, "")}<span class="spn"><b>${esc(sportTitle(sport))}</b><span class="sub">${wins}-${losses} · <b class="${units > 0 ? "W" : units < 0 ? "L" : ""}">${formatSigned(units, 2)}u</b></span></span>${spark(line)}<span class="car">${expanded ? "▴" : "▾"}</span></button>${props}</section>`;
    })
    .join("");
}

function propBlock(rows: GradeMark[]): string {
  const groups = new Map<string, GradeMark[]>();
  for (const row of rows) {
    const list = groups.get(row.prop) ?? [];
    list.push(row);
    groups.set(row.prop, list);
  }
  const body = [...groups.entries()]
    .sort((a, b) => (a[0] === "Misc" ? 1 : b[0] === "Misc" ? -1 : b[1].length - a[1].length))
    .map(([prop, list]) => {
      const wins = list.filter((row) => row.win).length;
      const units = list.reduce((sum, row) => sum + row.units, 0);
      const pct = list.length ? Math.round((wins / list.length) * 100) : 0;
      const splits = (["over", "under", "alt"] as const)
        .map((side) => {
          const subset = list.filter((row) => row.side === side);
          if (!subset.length) return "";
          const w = subset.filter((row) => row.win).length;
          const label = side === "over" ? "Over" : side === "under" ? "Under" : "Alt line";
          const via = [...new Set(subset.filter((row) => row.detail && row.capper).map((row) => row.capper as string))];
          const note = side === "alt" && via.length ? ` <span class="via">via ${via.map((name) => esc(name)).join(", ")}</span>` : "";
          return `<span class="${side === "alt" ? "alt" : ""}">${label} ${w}-${subset.length - w}${note}</span>`;
        })
        .filter(Boolean)
        .join("");
      return `<div class="pr"><div class="prt"><b>${esc(prop)}</b><span class="sub">${wins}-${list.length - wins}</span><span class="${units > 0 ? "W" : units < 0 ? "L" : ""}">${formatSigned(units, 2)}u</span><span class="pct">${pct}%</span></div><div class="splits">${splits}</div></div>`;
    })
    .join("");
  return `<div class="props">${body}</div>`;
}

export function statsCalendar(state: AppState, board: Board, from: string | null, to: string | null): string {
  const grades = board.grades.filter((grade) => sectionMatch(grade.cat, state.statsSection));
  return calendar(state, grades, from ?? "", to ?? "");
}

export function statsSections(state: AppState): string {
  return (["all", "heist", "safe", "edge", "cappers", "legday"] as const)
    .map((key) => `<button type="button" class="${state.statsSection === key ? "on" : ""}" data-act="stats-section" data-key="${key}">${key === "all" ? "All" : key === "legday" ? "LEG DAY" : key[0].toUpperCase() + key.slice(1)}</button>`)
    .join("");
}

export function statsSports(state: AppState, board: Board, from: string | null, to: string | null): string {
  const grades = windowGrades(board.grades, from, to).filter((grade) => sectionMatch(grade.cat, state.statsSection));
  return `<h2 class="grouph">By sport</h2>${sportCards(grades, state.statsSport) || `<p class="empty">No graded tickets in this range.</p>`}`;
}
