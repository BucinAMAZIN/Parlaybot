import type { BookId, LegPace, Mood, Play, SeriesPoint, WhyBlock } from "../data/types.ts";
import { esc } from "../lib/format.ts";
import { draftKingsLegLink, hardRockLegLink, type LinkPlay } from "../lib/links.ts";

export const PACE: Record<LegPace, { mood: Mood | null; color: string; label: string }> = {
  hit: { mood: "cash", color: "#76f53a", label: "✓ HIT · cashed" },
  on: { mood: "fire", color: "#ff8c28", label: "on fire · on pace" },
  behind: { mood: "sweat", color: "#ffcc46", label: "sweating · behind pace" },
  cold: { mood: "ice", color: "#78beff", label: "ice cold · way behind" },
  dead: { mood: "hook", color: "#dc323c", label: "✗ dead · on the hook" },
  pre: { mood: null, color: "#3a4452", label: "not started" },
};

const MOOD_LABEL: Record<Mood, string> = {
  ice: "Ice cold",
  sweat: "Sweating",
  fire: "On fire",
  cash: "Cashed",
  hook: "On the hook",
};

export function asset(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  return `${base}${path.replace(/^\//, "")}`;
}

export function mascot(mood: Mood, size: number): string {
  return `<span class="mascot ${mood}" style="width:${size}px;height:${size}px;--still:url(${asset(`mascot/e-${mood}-0.png`)})" role="img" aria-label="${MOOD_LABEL[mood]}"></span>`;
}

export function bookName(book: BookId): string {
  return book === "hr" ? "Hard Rock" : "DraftKings";
}

export function bookCode(book: BookId): "HR" | "DK" {
  return book === "hr" ? "HR" : "DK";
}

export function priceOn(play: Play, book: BookId): string | null {
  return book === "hr" ? play.hr : play.dk;
}

export function toLinkPlay(play: Play): LinkPlay {
  return { id: play.id, name: play.name, hrSid: play.hrSid, hrLink: play.hrLink, dkSid: play.dkSid, dkLink: play.dkLink };
}

export function canOpen(play: Play, book: BookId): boolean {
  const built = book === "hr" ? hardRockLegLink(toLinkPlay(play)) : draftKingsLegLink(toLinkPlay(play));
  return built.status === "ready";
}

/** Main list: a real selection id, or a blocked play that still has this book's price. */
export function listedOn(play: Play, book: BookId): boolean {
  if (play.blocked && priceOn(play, book)) return true;
  return canOpen(play, book);
}

export function renderWhy(block: WhyBlock): string {
  const tag = block.ours ? "Our read" : "Why";
  const ours = block.ours ? `<span class="ours">ours, not the capper's</span>` : "";
  return `<details class="why"><summary><b>${tag}:</b><span>${esc(block.line)}</span><span class="car">▾</span></summary><div class="wb"><h5 class="yes">${tag}${ours}</h5><ul>${block.why.map((item) => `<li>${esc(item)}</li>`).join("")}</ul><h5 class="no">Why not</h5><ul>${block.whyNot.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></div></details>`;
}

export function renderPlay(play: Play, book: BookId, selected: Set<string>, off = false): string {
  const offered = priceOn(play, book);
  const odds = off ? play.hr ?? play.dk ?? "—" : offered ?? "—";
  const blocked = !off && play.blocked;
  const check = !off && !blocked && canOpen(play, book);
  const checked = check && selected.has(play.id) ? "checked" : "";
  const fee = book === "dk" && !off && offered ? `<div class="feeline">DK price incl. fee</div>` : "";
  const ctx = play.matchup
    ? `<div class="ctx"><span class="tm"><b>${esc(play.matchup.away.abbr)}</b> ${esc(play.matchup.away.record)} · ${esc(play.matchup.away.standing)}</span><span class="vs">vs</span><span class="tm"><b>${esc(play.matchup.home.abbr)}</b> ${esc(play.matchup.home.record)} · ${esc(play.matchup.home.standing)}</span></div>`
    : "";
  const rank = play.matchup?.rankChip ? `<div class="chips"><span class="chip mr">📊 ${esc(play.matchup.rankChip)}</span></div>` : "";
  const alt = play.alt
    ? `<div class="bd"><span class="tag">Alt line</span><s>${esc(play.alt.before)}</s><span class="arrow">→</span><b>${esc(play.alt.after)}</b></div>`
    : "";
  const marks = play.markers?.length
    ? `<div class="mks">${play.markers.map((mark) => `<span class="mk ${mark.kind === "assist" ? "warn" : mark.kind}">${esc(mark.label)}</span>`).join("")}</div>`
    : "";
  const chips: string[] = [];
  if (play.lock) chips.push(`<span class="chip ok">🔒 ${esc(play.lock)}</span>`);
  if (play.lateInjury) chips.push(`<span class="chip warn">⚠ Late injury</span>`);
  if (play.blocked === "started") chips.push(`<span class="chip bad">⛔ Game started (blocked)</span>`);
  if (play.status) {
    const tone = play.status.tone === "bad" ? "bad" : play.status.tone === "warn" ? "warn" : "q";
    const when = play.status.reportedAt ? ` · ${esc(play.status.reportedAt)}` : "";
    chips.push(`<span class="chip st ${tone}" title="Player status, reported before the game. Display only, the play stays.">🩺 ${esc(play.status.label)}${when}</span>`);
  }
  if (play.goalieConfirmed) chips.push(`<span class="chip q">🥅 Goalie · Confirmed</span>`);
  const chipRow = chips.length ? `<div class="chips">${chips.join("")}</div>` : "";
  const grade = play.gradeNote ? `<div class="sub ${play.gradeNote.tone}">${esc(play.gradeNote.text)}</div>` : "";
  let button: string;
  if (off || (!blocked && !canOpen(play, book))) button = `<span class="na">Not on ${bookCode(book)}</span>`;
  else if (play.blocked === "started") button = `<span class="na">Blocked: game started</span>`;
  else if (play.blocked === "graded") button = `<span class="na">Graded · game over</span>`;
  else button = `<button type="button" class="btn ${book}" data-act="open" data-scope="leg" data-id="${esc(play.id)}" data-book="${book}">Open in ${bookName(book)}</button>`;
  const box = check
    ? `<label class="chk"><input type="checkbox" data-id="${esc(play.id)}" ${checked} aria-label="Select ${esc(play.name)}"></label>`
    : "";
  return `<div class="play">${box}<div class="pbody"><div class="prow"><b>${esc(play.name)}</b><span class="odds">${esc(odds)}</span></div><div class="sub">${esc(play.detail)}</div>${fee}${ctx}${rank}${alt}${marks}${chipRow}${grade}${renderWhy(play.why)}<div class="btns">${button}</div></div></div>`;
}

/** >=55 green, 50–54.9 yellow, 40–49.9 orange, under 40 red. */
export function winRateBand(pct: number): "good" | "mid" | "low" | "bad" {
  if (pct >= 55) return "good";
  if (pct >= 50) return "mid";
  if (pct >= 40) return "low";
  return "bad";
}

export function ringSvg(pct: number, label: string): string {
  const c = 2 * Math.PI * 34;
  const dash = ((c * pct) / 100).toFixed(1);
  const band = winRateBand(pct);
  return `<div class="ring"><svg viewBox="0 0 84 84" width="84" height="84" aria-label="${esc(label)} ${pct} percent"><circle class="ring-track" cx="42" cy="42" r="34" stroke-width="9" fill="none"/><circle class="ring-arc wr-${band}" cx="42" cy="42" r="34" stroke-width="9" fill="none" stroke-dasharray="${dash} ${c.toFixed(1)}" transform="rotate(-90 42 42)" stroke-linecap="butt"/><text x="42" y="48" text-anchor="middle" font-size="18" font-weight="700" fill="currentColor">${pct}%</text></svg><div>${esc(label)}</div></div>`;
}

export function chartSvg(points: SeriesPoint[]): string {
  const w = 340;
  const h = 150;
  if (points.length < 2) return `<p class="empty">Not enough chart points in this file.</p>`;
  const profit = points.map((point) => point.profit);
  const mx = Math.max(...profit);
  const mn = Math.min(...profit);
  const span = mx === mn ? 1 : mx - mn;
  const n = points.length;
  const xy = points.map((point, i) => {
    const x = 10 + (i * (w - 20)) / (n - 1);
    const y = h - 20 - ((point.profit - mn) / span) * (h - 40);
    return [x, y] as const;
  });
  const line = "M" + xy.map(([x, y]) => `${x.toFixed(0)},${y.toFixed(0)}`).join(" L");
  const area = `${line} L${xy[xy.length - 1][0].toFixed(0)},${h - 20} L${xy[0][0].toFixed(0)},${h - 20} Z`;
  const rates = points.map((point) => point.winRate).filter((rate): rate is number => rate != null);
  const wide = rates.some((rate) => rate < 40 || rate > 70);
  const lo = wide ? 0 : 45;
  const hi = wide ? 100 : 65;
  const wr = points
    .flatMap((point, i) => {
      if (point.winRate == null) return [];
      const x = 10 + (i * (w - 20)) / (n - 1);
      const y = h - 20 - ((point.winRate - lo) / (hi - lo)) * (h - 40);
      return [`${x.toFixed(0)},${y.toFixed(0)}`];
    })
    .join(" ");
  const step = n <= 6 ? 1 : Math.ceil(n / 5);
  const labels = points
    .map((point, i) => {
      if (!point.day || (i !== 0 && i !== n - 1 && i % step !== 0)) return "";
      const x = 10 + (i * (w - 20)) / (n - 1);
      return `<text x="${x.toFixed(0)}" y="${h - 4}" font-size="11" fill="currentColor" text-anchor="middle">${esc(point.day)}</text>`;
    })
    .join("");
  return `<svg viewBox="0 0 ${w} ${h}" class="chart" role="img" aria-label="Profit and win rate"><path d="${area}" fill="#76f53a" opacity=".15"/><path d="${line}" fill="none" stroke="#76f53a" stroke-width="3"/><polyline points="${wr}" fill="none" stroke="#7aa7ff" stroke-width="2" stroke-dasharray="5 4"/>${labels}</svg><div class="legend"><span><i style="background:#76f53a"></i>Profit (units)</span><span><i style="background:#7aa7ff"></i>Win rate</span></div>`;
}

function rng(seedText: string) {
  let seed = 2166136261;
  for (let i = 0; i < seedText.length; i++) seed = Math.imul(seed ^ seedText.charCodeAt(i), 16777619);
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function courtSvg(seedText: string): string {
  const rand = rng(seedText);
  const parts = [
    `<svg class="court" viewBox="0 0 300 160" role="img" aria-label="Sample shot chart"><rect x="2" y="2" width="296" height="156" fill="none" stroke="#2c3644"/><line x1="150" y1="2" x2="150" y2="158" stroke="#2c3644"/><circle cx="150" cy="80" r="16" fill="none" stroke="#2c3644"/>`,
  ];
  for (const side of [0, 1]) {
    const col = side === 0 ? "#5aa9ff" : "#ff8c28";
    for (let i = 0; i < 28; i++) {
      const dist = rand() < 0.45 ? 8 + rand() * 28 : 40 + rand() * 40;
      const ang = (rand() - 0.5) * 2.4;
      const dir = side === 0 ? 1 : -1;
      const x = (side === 0 ? 18 : 282) + dir * dist * Math.cos(ang);
      const y = 80 + dist * Math.sin(ang) * 0.7;
      if (rand() < 0.48) parts.push(`<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="3" fill="${col}"/>`);
      else parts.push(`<path d="M${(x - 3).toFixed(0)} ${(y - 3).toFixed(0)} l6 6 m0-6 l-6 6" stroke="${col}" stroke-width="1.4"/>`);
    }
  }
  parts.push(`<circle cx="250" cy="28" r="6" fill="none" stroke="#fff"/><path d="M247 25 l6 6 m0-6 l-6 6" stroke="#ff8c28" stroke-width="1.4"/></svg>`);
  return parts.join("");
}

export function rinkSvg(seedText: string): string {
  const rand = rng(seedText + "rink");
  const parts = [
    `<svg class="court" viewBox="0 0 300 140" role="img" aria-label="Sample shot map"><rect x="2" y="2" width="296" height="136" rx="40" fill="none" stroke="#2c3644"/><line x1="150" y1="2" x2="150" y2="138" stroke="#c0392b" stroke-opacity=".7"/><line x1="100" y1="2" x2="100" y2="138" stroke="#2f6fb5"/><line x1="200" y1="2" x2="200" y2="138" stroke="#2f6fb5"/>`,
  ];
  for (const side of [0, 1]) {
    const col = side === 0 ? "#e04a5a" : "#5aa9ff";
    for (let i = 0; i < 18; i++) {
      const x = side === 0 ? 30 + rand() * 70 : 200 + rand() * 70;
      const y = 70 + (rand() - 0.5) * 80;
      if (i < (side === 0 ? 2 : 1)) parts.push(`<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="4.5" fill="#ffcc46" stroke="#111"/>`);
      else parts.push(`<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="2.6" fill="${col}"/>`);
    }
  }
  parts.push(`</svg>`);
  return parts.join("");
}
