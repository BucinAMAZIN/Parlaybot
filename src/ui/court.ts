import type { FootballSpot } from "../data/gamecast.ts";

/** Real court feet. The basket is 5.25 ft from the baseline, and the lane is 19 ft deep. */

export function threePointPath(isLeft: boolean, nba: boolean): string {
  const bx = isLeft ? 5.25 : 88.75;
  const b0 = isLeft ? 0 : 94;
  const sgn = isLeft ? 1 : -1;
  const r3 = nba ? 23.75 : 22.15;
  const cz = nba ? 3 : 3.35;
  const cyy = Math.sqrt(Math.max(0, r3 * r3 - (25 - cz) * (25 - cz)));
  const ax = bx + sgn * cyy;
  return `M ${b0} ${cz} L ${ax.toFixed(2)} ${cz} A ${r3} ${r3} 0 0 ${isLeft ? 1 : 0} ${ax.toFixed(2)} ${(50 - cz).toFixed(2)} L ${b0} ${(50 - cz).toFixed(2)}`;
}

/** 200×85 NHL rink. Lines use their own colors so they stay visible on the ice. */
export function nhlRink(logo = "", clipId = "rink-ice"): string {
  const safe = /^https:\/\//i.test(logo) ? logo : "";
  const mark = safe ? `<image href="${safe}" x="-11" y="-11" width="22" height="22" opacity="0.16"/>` : "";
  const circles = [
    [-69, -22],
    [-69, 22],
    [69, -22],
    [69, 22],
  ]
    .map(([x, y]) => {
      const hashes = [-2, 2]
        .flatMap((dx) =>
          [15, -15].map((edge) => {
            const y1 = y + edge;
            const y2 = y + (edge > 0 ? 17 : -17);
            return `<line x1="${x + dx}" y1="${y1}" x2="${x + dx}" y2="${y2}" stroke="#c8102e" stroke-width="0.45"/>`;
          }),
        )
        .join("");
      return `<circle cx="${x}" cy="${y}" r="15" fill="none" stroke="#c8102e" stroke-width="0.55"/>${hashes}<circle cx="${x}" cy="${y}" r="1.1" fill="#c8102e"/>`;
    })
    .join("");
  const neutrals = [
    [-20, -22],
    [-20, 22],
    [20, -22],
    [20, 22],
  ]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.1" fill="#c8102e"/>`)
    .join("");
  return `<defs><clipPath id="${clipId}"><rect x="-100" y="-42.5" width="200" height="85" rx="28" ry="28"/></clipPath></defs><rect class="rink-ice" x="-100" y="-42.5" width="200" height="85" rx="28" ry="28" stroke="#4a607a" stroke-width="1.2"/><g clip-path="url(#${clipId})">${mark}<circle cx="0" cy="0" r="15" fill="none" stroke="#1d5bbf" stroke-width="0.7"/><line x1="0" y1="-42.5" x2="0" y2="42.5" stroke="#c8102e" stroke-width="1.05"/><circle cx="0" cy="0" r="1.1" fill="#1d5bbf"/><line x1="-25" y1="-42.5" x2="-25" y2="42.5" stroke="#1d5bbf" stroke-width="1.2"/><line x1="25" y1="-42.5" x2="25" y2="42.5" stroke="#1d5bbf" stroke-width="1.2"/><line x1="-89" y1="-42.5" x2="-89" y2="42.5" stroke="#c8102e" stroke-width="0.65"/><line x1="89" y1="-42.5" x2="89" y2="42.5" stroke="#c8102e" stroke-width="0.65"/><path d="M -89 -6 A 6 6 0 0 1 -89 6 Z" fill="#7cc4f8" fill-opacity="0.55" stroke="#c8102e" stroke-width="0.55"/><path d="M 89 -6 A 6 6 0 0 0 89 6 Z" fill="#7cc4f8" fill-opacity="0.55" stroke="#c8102e" stroke-width="0.55"/><rect x="-93" y="-3.2" width="4" height="6.4" rx="0.8" fill="#ffffffb3" stroke="#4a607a" stroke-width="0.6"/><rect x="89" y="-3.2" width="4" height="6.4" rx="0.8" fill="#ffffffb3" stroke="#4a607a" stroke-width="0.6"/>${circles}${neutrals}</g>`;
}

function safeText(value: string): string {
  return value.replace(/[<>&"]/g, "").slice(0, 8);
}

/** Live football field. x 10–110 is the 0–100 playing field between the end zones. */
export function footballField(spot: FootballSpot): string {
  const fx = (yard: number) => (10 + Math.max(0, Math.min(100, yard))).toFixed(2);
  const stripes = Array.from({ length: 20 }, (_, index) => `<rect x="${10 + index * 5}" y="8" width="5" height="36" fill="${index % 2 ? "#187a3a" : "#146b32"}"/>`).join("");
  let lines = "";
  for (let yard = 5; yard < 100; yard += 5) {
    const mid = yard === 50;
    const ten = yard % 10 === 0;
    lines += `<line x1="${10 + yard}" y1="8" x2="${10 + yard}" y2="44" stroke="${mid ? "#ffffffd0" : "#ffffff66"}" stroke-width="${mid ? 0.7 : ten ? 0.38 : 0.2}"/>`;
  }
  let hashes = "";
  for (let yard = 1; yard < 100; yard += 1) {
    if (yard % 5 === 0) continue;
    const x = 10 + yard;
    hashes += `<line x1="${x}" y1="17" x2="${x}" y2="19.2" stroke="#ffffff73" stroke-width="0.18"/><line x1="${x}" y1="32.8" x2="${x}" y2="35" stroke="#ffffff73" stroke-width="0.18"/>`;
  }
  const labels = [10, 20, 30, 40, 50, 40, 30, 20, 10];
  const numbers = labels
    .map((label, index) => {
      const yard = (index + 1) * 10;
      const x = 10 + yard;
      const arrow = label === 50 ? "" : yard < 50
        ? `<polygon points="${x - 3.2},3.2 ${x - 1.6},2.2 ${x - 1.6},4.2" fill="#ffffffb3"/>`
        : `<polygon points="${x + 3.2},3.2 ${x + 1.6},2.2 ${x + 1.6},4.2" fill="#ffffffb3"/>`;
      const bottom = label === 50 ? "" : yard < 50
        ? `<polygon points="${x - 3.2},52.8 ${x - 1.6},51.8 ${x - 1.6},53.8" fill="#ffffffb3"/>`
        : `<polygon points="${x + 3.2},52.8 ${x + 1.6},51.8 ${x + 1.6},53.8" fill="#ffffffb3"/>`;
      return `<text x="${x}" y="4.6" text-anchor="middle" fill="#ffffffd9" font-size="2.5" font-weight="700">${label}</text>${arrow}<text x="${x}" y="54.2" text-anchor="middle" fill="#ffffffd9" font-size="2.5" font-weight="700">${label}</text>${bottom}`;
    })
    .join("");
  const awayColor = spot.awayColor || "#0c2340";
  const homeColor = spot.homeColor || "#003366";
  const ball = fx(spot.yard);
  const first = spot.first == null ? "" : `<line x1="${fx(spot.first)}" y1="8" x2="${fx(spot.first)}" y2="44" stroke="#facc15" stroke-width="0.7"/>`;
  const prev = spot.prevYard == null ? "" : `<line x1="${fx(spot.prevYard)}" y1="26" x2="${ball}" y2="26" stroke="${spot.possessionColor || "#ffffff"}" stroke-width="0.55" stroke-dasharray="1.1 0.7"/>`;
  const start = spot.driveStart;
  const bandColor = spot.homePossession ? spot.homeColor || spot.possessionColor || "#ffffff" : spot.awayColor || spot.possessionColor || "#ffffff";
  const band = start == null
    ? ""
    : `<rect x="${fx(Math.min(start, spot.yard))}" y="8" width="${Math.abs(spot.yard - start).toFixed(2)}" height="36" fill="${bandColor}" opacity="0.38"/>`;
  const dir = spot.homePossession ? -1 : 1;
  const arrowX = Number(ball);
  const chevron = `<polygon points="${(arrowX + dir * 1.6).toFixed(2)},24 ${(arrowX + dir * 3.4).toFixed(2)},26 ${(arrowX + dir * 1.6).toFixed(2)},28" fill="${bandColor}"/>`;
  const red = spot.redZone
    ? `<rect x="${spot.homePossession ? 10 : 90}" y="8" width="20" height="36" fill="none" stroke="#ff5c5c" stroke-width="0.7"/>`
    : "";
  const awayName = safeText(spot.awayAbbr || "");
  const homeName = safeText(spot.homeAbbr || "");
  return `<svg class="field" viewBox="0 0 120 56" role="img" aria-label="Field position"><rect x="0" y="8" width="10" height="36" fill="${awayColor}"/><rect x="110" y="8" width="10" height="36" fill="${homeColor}"/>${stripes}<line x1="10" y1="8" x2="10" y2="44" stroke="#fff" stroke-width="0.45"/><line x1="110" y1="8" x2="110" y2="44" stroke="#fff" stroke-width="0.45"/>${lines}${hashes}${numbers}<text fill="#fff" font-size="4" font-weight="800" text-anchor="middle" dominant-baseline="middle" transform="rotate(-90 5 26)">${awayName}</text><text fill="#fff" font-size="4" font-weight="800" text-anchor="middle" dominant-baseline="middle" transform="rotate(90 115 26)">${homeName}</text>${band}${red}${prev}${first}<line x1="${ball}" y1="8" x2="${ball}" y2="44" stroke="#38bdf8" stroke-width="0.85"/>${chevron}<g transform="translate(${ball} 26) rotate(-28)"><ellipse cx="0" cy="0" rx="1.45" ry="0.85" fill="#6b3a1f" stroke="#fff" stroke-width="0.2"/><line x1="-0.45" y1="0" x2="0.45" y2="0" stroke="#fff" stroke-width="0.18"/></g></svg>`;
}

/** Keys, free-throw circles, backboards, rims, and both 3-point lines. */
export function courtHardware(nba: boolean, logo = ""): string {
  const paint = nba ? 16 : 12;
  const y = 25 - paint / 2;
  const left = threePointPath(true, nba);
  const right = threePointPath(false, nba);
  const mark = logo ? `<image href="${logo}" x="41" y="19" width="12" height="12" opacity="0.14"/>` : "";
  return `<path class="court-line" d="${left}" fill="none"/><path class="court-line" d="${right}" fill="none"/><rect class="court-paint" x="0" y="${y}" width="19" height="${paint}"/><rect class="court-paint" x="75" y="${y}" width="19" height="${paint}"/><rect class="court-line" x="0" y="${y}" width="19" height="${paint}" fill="none"/><rect class="court-line" x="75" y="${y}" width="19" height="${paint}" fill="none"/><circle class="court-line" cx="19" cy="25" r="6" fill="none"/><circle class="court-line" cx="75" cy="25" r="6" fill="none"/><line class="court-line" x1="4" y1="22" x2="4" y2="28"/><line class="court-line" x1="90" y1="22" x2="90" y2="28"/><circle class="court-rim" cx="5.25" cy="25" r="0.75"/><circle class="court-rim" cx="88.75" cy="25" r="0.75"/>${mark}`;
}
