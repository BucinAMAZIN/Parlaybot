import type { Board } from "../data/board.ts";
import { propFace, type HeistPrep, type PrepCount } from "../data/heistContract.ts";
import { sectionMatch, sportRank, sportTitle } from "../data/gradeLabels.ts";
import type { GradeMark } from "../data/types.ts";
import { fileBounds, prettyDay, windowGrades } from "../lib/history.ts";
import { SPORT_ORDER } from "../lib/sport.ts";
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

function calendar(state: AppState, grades: GradeMark[], from: string, to: string, gridFrom: string, gridTo: string): string {
  const label = from && to ? `${prettyDay(from)} – ${prettyDay(to)}` : "Pick dates";
  const modes = (["day", "week", "range"] as const)
    .map((mode) => `<button type="button" class="${state.statsMode === mode ? "on" : ""}" data-act="cal-mode" data-key="${mode}">${mode === "day" ? "Day" : mode === "week" ? "Week" : "Range"}</button>`)
    .join("");
  const head = `<div class="calhead"><button type="button" class="caltoggle" data-act="cal-toggle" aria-expanded="${state.statsCalOpen}">📅 <b>${esc(label)}</b> <span class="car">${state.statsCalOpen ? "▴" : "▾"}</span></button><div class="ranges calmode">${modes}</div></div>`;
  if (!state.statsCalOpen || !gridTo) return `<div class="card cal">${head}</div>`;
  const tint = dayMap(grades);
  const picked = [state.statsAnchor, state.statsDraft].filter(Boolean).sort();
  const hiFrom = picked[0] || from;
  const hiTo = picked[1] || picked[0] || to;
  const applyLabel = hiFrom && hiTo ? `${prettyDay(hiFrom)} – ${prettyDay(hiTo)}` : label;
  const grids = monthsBetween(gridFrom || from, gridTo || to).map((month) => monthHtml(`${month}-01`, tint, hiFrom, hiTo, state.statsMode)).join("");
  return `<div class="card cal">${head}${grids}<div class="lgd"><span><i class="w"></i>Win day</span><span><i class="l"></i>Loss day</span><span><i class="n"></i>No bets</span></div><p class="sub">Only days in this file are on the calendar. Tap a day. In Week, that selects the whole week. In Range, tap the first day and the last.</p><div class="row2"><button type="button" class="btn share" data-act="cal-clear">Clear</button><button type="button" class="btn hr" data-act="cal-apply">Apply ${esc(applyLabel)}</button></div></div>`;
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

export function propOpenKey(sport: string, prop: string, alt: boolean): string {
  return `${sport}|${prop}|${alt ? "alt" : "reg"}`;
}

function weekdayLabel(iso: string): string {
  const [year, month, date] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

const PROP_SECTIONS = ["all", "heist", "heistalt", "safe", "plus100", "plus250", "edge", "cappers", "legday"] as const;

function sectionLabel(key: (typeof PROP_SECTIONS)[number]): string {
  if (key === "all") return "All sections";
  if (key === "legday") return "Props";
  if (key === "safe") return "Safe +100";
  if (key === "plus100") return "+100";
  if (key === "heistalt") return "Heist Alt";
  if (key === "plus250") return "+250";
  return key[0].toUpperCase() + key.slice(1);
}

function propSectionNav(rows: GradeMark[], active: string, propKey: string): string {
  const keys = PROP_SECTIONS.filter((key) => key === "all" || rows.some((row) => sectionMatch(row, key)));
  const buttons = keys
    .map((key) => `<button type="button" class="${active === key ? "on" : ""}" data-act="prop-section" data-key="${key}" data-prop="${esc(propKey)}">${sectionLabel(key)}</button>`)
    .join("");
  return `<nav class="scroller sport wrap propsecs" aria-label="Section">${buttons}</nav>`;
}

function propDrawer(sport: string, prop: string, alt: boolean, rows: GradeMark[], state: AppState, playsFor: GradePlays): string {
  const propKey = propOpenKey(sport, prop, alt);
  const chosen = state.propSection[propKey] ?? "all";
  const active = chosen !== "all" && rows.some((row) => sectionMatch(row, chosen)) ? chosen : "all";
  const shown = rows.filter((row) => sectionMatch(row, active));
  const byDate = new Map<string, GradeMark[]>();
  for (const row of shown) {
    const list = byDate.get(row.date) ?? [];
    list.push(row);
    byDate.set(row.date, list);
  }
  const groups = [...byDate.keys()]
    .sort()
    .reverse()
    .map((date) => {
      const list = byDate.get(date) ?? [];
      const dayWins = list.filter((row) => row.win).length;
      const dateKey = `${propKey}|${date}`;
      const open = state.openResultDates.has(dateKey);
      const items = open ? playsFor(list, dateKey) : "";
      return `<section class="dategrp"><button type="button" class="datehead" data-act="result-date" data-key="${esc(dateKey)}" aria-expanded="${open}"><b>${esc(weekdayLabel(date))}</b><span>${dayWins}-${list.length - dayWins}</span><span class="car">${open ? "▾" : "▸"}</span></button>${items}</section>`;
    })
    .join("");
  const body = groups || `<p class="empty">No graded plays for this prop in these dates.</p>`;
  return `<div class="propdrawer" data-prop-drawer="${esc(propKey)}">${propSectionNav(rows, active, propKey)}${body}</div>`;
}

type GradePlays = (rows: GradeMark[], prefix: string) => string;

function sportCards(grades: GradeMark[], state: AppState, playsFor: GradePlays): string {
  const bySport = new Map<string, GradeMark[]>();
  for (const grade of grades) {
    const list = bySport.get(grade.sport) ?? [];
    list.push(grade);
    bySport.set(grade.sport, list);
  }
  const sports = [...bySport.keys()]
    .filter((sport) => (bySport.get(sport) ?? []).length)
    .sort((a, b) => (state.statsSport === a ? -1 : state.statsSport === b ? 1 : sportRank(a) - sportRank(b)));
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
      const expanded = state.statsSport === sport;
      const props = expanded ? propBlock(rows, sport, state, playsFor) : "";
      return `<section class="card sp${expanded ? " ex" : ""}"><button type="button" class="sprow" data-act="stats-sport" data-key="${esc(sport)}" aria-expanded="${expanded}">${ringSvg(pct, "")}<span class="spn"><b>${esc(sportTitle(sport))}</b><span class="sub">${wins}-${losses} · <b class="${units > 0 ? "W" : units < 0 ? "L" : ""}">${formatSigned(units, 2)}u</b></span></span>${spark(line)}<span class="car">${expanded ? "▴" : "▾"}</span></button>${props}</section>`;
    })
    .join("");
}

function propRow(sport: string, prop: string, name: string, list: GradeMark[], splits: string, note: string, alt: boolean, state: AppState, playsFor: GradePlays): string {
  if (!list.length) return "";
  const wins = list.filter((row) => row.win).length;
  const units = list.reduce((sum, row) => sum + row.units, 0);
  const pct = Math.round((wins / list.length) * 100);
  const open = state.openProps.has(propOpenKey(sport, prop, alt));
  const drawer = open ? propDrawer(sport, prop, alt, list, state, playsFor) : "";
  return `<div class="propnest${alt ? " alt" : ""}"><button type="button" class="pr" data-act="results-prop" data-sport="${esc(sport)}" data-prop="${esc(prop)}" data-alt="${alt ? "1" : "0"}" aria-expanded="${open}" aria-label="${esc(name)}, ${wins}-${list.length - wins}"><span class="prt"><b>${esc(name)}</b><span class="sub">${wins}-${list.length - wins}</span><span class="${units > 0 ? "W" : units < 0 ? "L" : ""}">${formatSigned(units, 2)}u</span><span class="pct">${pct}%</span><span class="car">${open ? "▾" : "▸"}</span></span>${splits ? `<div class="splits">${splits}</div>` : ""}${note}</button>${drawer}</div>`;
}

function propBlock(rows: GradeMark[], sport: string, state: AppState, playsFor: GradePlays): string {
  const groups = new Map<string, GradeMark[]>();
  for (const row of rows) {
    const list = groups.get(row.prop) ?? [];
    list.push(row);
    groups.set(row.prop, list);
  }
  const body = [...groups.entries()]
    .sort((a, b) => (a[0] === "Misc" ? 1 : b[0] === "Misc" ? -1 : b[1].length - a[1].length))
    .map(([prop, list]) => {
      const regular = list.filter((row) => row.side !== "alt");
      const alts = list.filter((row) => row.side === "alt");
      const splits = (["over", "under"] as const)
        .map((side) => {
          const subset = regular.filter((row) => row.side === side);
          if (!subset.length) return "";
          const wins = subset.filter((row) => row.win).length;
          const label = side === "over" ? "Over" : "Under";
          return `<span>${label} ${wins}-${subset.length - wins}</span>`;
        })
        .filter(Boolean)
        .join("");
      const viaNote = (side: GradeMark[]) => {
        const names = [...new Set(side.flatMap((row) => (row.capper ?? "").split(",").map((name) => name.trim()).filter(Boolean)))];
        return names.length ? `<div class="via">via ${names.map((name) => esc(name)).join(", ")}</div>` : "";
      };
      return `${propRow(sport, prop, prop, regular, splits, viaNote(regular), false, state, playsFor)}${propRow(sport, prop, `${prop} Alt`, alts, "", viaNote(alts), true, state, playsFor)}`;
    })
    .join("");
  return `<div class="props">${body}</div>`;
}

export function matchingPlays(grades: GradeMark[], sport: string, prop: string, alt: boolean): GradeMark[] {
  return grades.filter((grade) => grade.sport === sport && grade.prop === prop && (alt ? grade.side === "alt" : grade.side !== "alt"));
}

export function statsCalendar(state: AppState, board: Board, from: string | null, to: string | null): string {
  const grades = board.grades.filter((grade) => sectionMatch(grade, state.statsSection));
  const span = fileBounds(board.grades, board.series, state.statsSection);
  return calendar(state, grades, from ?? "", to ?? "", span.first || from || "", span.last || to || "");
}

export function statsSections(state: AppState): string {
  return (["all", "heist", "heistalt", "safe", "plus100", "plus250", "edge", "cappers", "legday"] as const)
    .map((key) => {
      const label = key === "all" ? "All sections" : key === "legday" ? "Props" : key === "safe" ? "Safe +100" : key === "plus100" ? "+100" : key === "plus250" ? "+250" : key === "heistalt" ? "Heist Alt" : key === "heist" ? "Heist" : key[0].toUpperCase() + key.slice(1);
      return `<button type="button" class="${state.statsSection === key ? "on" : ""}" data-act="stats-section" data-key="${key}" aria-label="${label}">${label}</button>`;
    })
    .join("");
}

function sameCapper(grade: GradeMark, handle: string): boolean {
  const want = handle.toLowerCase().replace(/^@/, "");
  return (grade.capper ?? "")
    .toLowerCase()
    .split(",")
    .map((name) => name.trim().replace(/^@/, ""))
    .includes(want);
}

function profileLine(node: { profileW: number | null; profileL: number | null; profileP: number | null }): string {
  if (node.profileW == null && node.profileL == null) return "No profile";
  return `${node.profileW ?? 0}-${node.profileL ?? 0}${node.profileP ? `-${node.profileP}` : ""}`;
}

function rowLine(counts: PrepCount): string {
  return `${counts.w}-${counts.l}${counts.p ? `-${counts.p}` : ""}`;
}

function coverage(node: { profileW: number | null; profileL: number | null; profileP: number | null; counts: PrepCount; dropped: boolean }): { short: string; detail: string } | null {
  const counts = node.counts;
  const profile = profileLine(node);
  const graded = rowLine(counts);
  const mismatch = node.profileW != null && (node.profileW !== counts.w || node.profileL !== counts.l || (node.profileP ?? 0) !== counts.p);
  const extras = [
    counts.voided ? `${counts.voided} void` : "",
    counts.pending ? `${counts.pending} pending` : "",
    counts.unavailable ? `${counts.unavailable} unavailable` : "",
  ].filter(Boolean);
  const accounted = counts.w + counts.l + counts.p + counts.voided + counts.pending + counts.unavailable;
  const gap = counts.rows !== accounted;
  if (!mismatch && !extras.length && !gap && !node.dropped) return null;
  const short = node.dropped && !mismatch && !extras.length && !gap ? "History only" : mismatch ? `Profile ${profile} · rows ${graded}` : extras.join(" · ") || `${counts.rows} rows`;
  const detail = [
    node.dropped ? "Dropped from current originals. Past plays stay." : "",
    `Profile ${profile}.`,
    `Graded rows ${graded}.`,
    counts.voided ? `Void ${counts.voided}.` : "",
    counts.pending ? `Pending ${counts.pending} ${counts.pending === 1 ? "is" : "are"} outside the circle.` : "",
    counts.unavailable ? `Unavailable ${counts.unavailable}.` : "",
    `${counts.rows} rows.`,
    mismatch ? "Profile and graded rows differ." : "",
    gap ? "Row count does not equal the graded, void, pending, and unavailable marks." : "",
  ].filter(Boolean).join(" ");
  return { short, detail };
}

function contractCappers(state: AppState, prep: HeistPrep): string {
  const cards = prep.tree
    .map((node) => {
      const ring = node.pct == null ? `<span class="sub">—</span>` : ringSvg(node.pct, "");
      const expanded = state.statsSport === node.capperId;
      const note = coverage(node);
      const cover = note ? `<details class="cover"><summary>${esc(note.short)}</summary><p class="sub">${esc(note.detail)}</p></details>` : "";
      const props = expanded
        ? node.props
            .map((prop) => {
              const open = state.openProps.has(propOpenKey(node.capperId, prop.propId, false));
              const face = propFace(prop.prop);
              const extra = [
                prop.counts.voided ? `${prop.counts.voided} void` : "",
                prop.counts.pending ? `${prop.counts.pending} pending` : "",
                prop.counts.unavailable ? `${prop.counts.unavailable} unavailable` : "",
              ].filter(Boolean).join(" · ");
              const days = open
                ? prop.days
                    .map((day) => {
                      const dateKey = `${propOpenKey(node.capperId, prop.propId, false)}|${day.date}`;
                      const dateOpen = state.openResultDates.has(dateKey);
                      const plays = dateOpen
                        ? day.plays
                            .map((play) => `<article class="hit" data-record="${esc(play.recordId)}" data-original-id="${esc(play.originalId)}"><div><b>${esc(play.pick)}</b><div class="sub">${esc(day.date)}${play.odds ? ` · ${esc(play.odds)}` : ""}${play.detail ? ` · ${esc(play.detail)}` : ""}</div></div><span class="res">${esc(play.grade || "—")}</span></article>`)
                            .join("")
                        : "";
                      return `<section class="dategrp"><button type="button" class="datehead" data-act="result-date" data-key="${esc(dateKey)}" aria-expanded="${dateOpen}"><b>${esc(weekdayLabel(day.date))}</b><span>${day.count}</span><span class="car">${dateOpen ? "▾" : "▸"}</span></button>${plays}</section>`;
                    })
                    .join("")
                : "";
              return `<div class="propnest"><button type="button" class="pr orig" data-act="results-prop" data-sport="${esc(node.capperId)}" data-prop="${esc(prop.propId)}" data-alt="0" aria-expanded="${open}"><span class="propface"><span class="propsport">${esc(face.sport)}</span><b>${esc(face.market)}</b>${extra ? `<span class="sub">${esc(extra)}</span>` : ""}</span><b class="proprec">${esc(rowLine(prop.counts))}</b><span class="car">${open ? "▾" : "▸"}</span></button>${days}</div>`;
            })
            .join("")
        : "";
      return `<section class="card sp${expanded ? " ex" : ""}" data-capper="${esc(node.capperId)}"><button type="button" class="sprow" data-act="stats-sport" data-key="${esc(node.capperId)}" aria-expanded="${expanded}">${ring}<span class="spn"><b>${esc(node.capperId)}</b><span class="sub">${esc(profileLine(node))}</span></span><span class="car">${expanded ? "▴" : "▾"}</span></button>${cover}${props}</section>`;
    })
    .join("");
  return `<h2 class="grouph">By capper</h2>${cards || `<p class="empty">No capper history in this payload.</p>`}`;
}

function capperProfiles(state: AppState, board: Board, from: string | null, to: string | null, playsFor: GradePlays): string {
  if (board.preparation) return contractCappers(state, board.preparation);
  const fileGrades = board.grades.filter((grade) => sectionMatch(grade, "cappers"));
  const shown = windowGrades(board.grades, from, to).filter((grade) => sectionMatch(grade, "cappers"));
  const cards = [...board.cappers]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((capper) => {
      const fileRows = fileGrades.filter((grade) => sameCapper(grade, capper.name));
      const rows = shown.filter((grade) => sameCapper(grade, capper.name));
      const wins = fileRows.filter((row) => row.win).length;
      const losses = fileRows.length - wins;
      const profile = capper.profile;
      const ring = profile?.pct == null ? `<span class="sub">—</span>` : ringSvg(profile.pct, "");
      const fileLine = profile ? `${profile.w}-${profile.l}${profile.p ? `-${profile.p}` : ""}` : "No profile record in this file";
      const gap = profile && profile.w + profile.l !== fileRows.length ? `<div class="sub">File record ${fileLine}. Graded rows under this name: ${wins}-${losses}.</div>` : "";
      const expanded = state.statsSport === capper.name;
      const body = expanded ? (rows.length ? propBlock(rows, capper.name, state, playsFor) : `<p class="empty">No graded plays for ${esc(capper.name)} in these dates.</p>`) : "";
      return `<section class="card sp${expanded ? " ex" : ""}"><button type="button" class="sprow" data-act="stats-sport" data-key="${esc(capper.name)}" aria-expanded="${expanded}">${ring}<span class="spn"><b>${esc(capper.name)}</b><span class="sub">${esc(fileLine)}${profile?.pct == null ? "" : ` · ${profile.pct}%`}</span></span><span class="car">${expanded ? "▴" : "▾"}</span></button>${gap}${body}</section>`;
    })
    .join("");
  return `<h2 class="grouph">By capper</h2><p class="sub">The circle is the profile stored on the capper. It is not rebuilt from the rows below. Personal Heist Alt ownership is forward-only and is not applied to these rows. Open a capper for props, then a date, then the graded plays.</p>${cards || `<p class="empty">No capper profiles in this file.</p>`}`;
}

function sportNav(fileGrades: GradeMark[], shown: GradeMark[], state: AppState): string {
  const inFile = new Set(fileGrades.map((grade) => grade.sport));
  const inWindow = new Map<string, number>();
  for (const grade of shown) inWindow.set(grade.sport, (inWindow.get(grade.sport) ?? 0) + 1);
  const ordered: string[] = [...SPORT_ORDER];
  for (const sport of [...inFile].sort((a, b) => sportRank(a) - sportRank(b))) {
    if (!ordered.includes(sport)) ordered.push(sport);
  }
  const buttons = ordered
    .map((sport) => {
      const count = inWindow.get(sport) ?? 0;
      const on = state.statsSport === sport ? "on" : "";
      const dim = count === 0 ? " dim" : "";
      return `<button type="button" class="${on}${dim}" data-act="stats-sport" data-key="${esc(sport)}">${esc(sportTitle(sport))}<i>${count}</i></button>`;
    })
    .join("");
  return `<nav class="scroller sport wrap" aria-label="Sport">${buttons}</nav>`;
}

function missingSport(sport: string, fileGrades: GradeMark[]): string {
  const title = sportTitle(sport);
  const any = fileGrades.some((grade) => grade.sport === sport);
  const text = any ? `No graded plays for ${title} in these dates.` : `No graded plays for ${title} in this section.`;
  return `<p class="empty">${esc(text)}</p>`;
}

export function statsSports(state: AppState, board: Board, from: string | null, to: string | null, playsFor: GradePlays): string {
  if (state.statsSection === "cappers") return capperProfiles(state, board, from, to, playsFor);
  const fileGrades = board.grades.filter((grade) => sectionMatch(grade, state.statsSection));
  const grades = windowGrades(board.grades, from, to).filter((grade) => sectionMatch(grade, state.statsSection));
  const span = fileBounds(board.grades, board.series, state.statsSection);
  const empty = span.first ? `No graded plays in these dates. All dates still has this file, ${prettyDay(span.first)} through ${prettyDay(span.last)}.` : "No graded plays in this file.";
  const gap = state.statsSport && !grades.some((grade) => grade.sport === state.statsSport) ? missingSport(state.statsSport, fileGrades) : "";
  const cards = sportCards(grades, state, playsFor);
  return `<h2 class="grouph">By sport</h2><p class="sub">Every sport stays listed. A dim sport has no graded plays in these dates. Tap a sport for its props. Tap a prop for its dates, then a date for the graded plays. Regular and Alt stay separate.</p>${sportNav(fileGrades, grades, state)}${gap}${cards || `<p class="empty">${esc(empty)}</p>`}`;
}
