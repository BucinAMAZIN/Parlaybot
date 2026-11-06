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

/** Keys, free-throw circles, backboards, rims, and both 3-point lines. */
export function courtHardware(nba: boolean, logo = ""): string {
  const paint = nba ? 16 : 12;
  const y = 25 - paint / 2;
  const left = threePointPath(true, nba);
  const right = threePointPath(false, nba);
  const mark = logo ? `<image href="${logo}" x="41" y="19" width="12" height="12" opacity="0.14"/>` : "";
  return `<path class="court-line" d="${left}" fill="none"/><path class="court-line" d="${right}" fill="none"/><rect class="court-paint" x="0" y="${y}" width="19" height="${paint}"/><rect class="court-paint" x="75" y="${y}" width="19" height="${paint}"/><rect class="court-line" x="0" y="${y}" width="19" height="${paint}" fill="none"/><rect class="court-line" x="75" y="${y}" width="19" height="${paint}" fill="none"/><circle class="court-line" cx="19" cy="25" r="6" fill="none"/><circle class="court-line" cx="75" cy="25" r="6" fill="none"/><line class="court-line" x1="4" y1="22" x2="4" y2="28"/><line class="court-line" x1="90" y1="22" x2="90" y2="28"/><circle class="court-rim" cx="5.25" cy="25" r="0.75"/><circle class="court-rim" cx="88.75" cy="25" r="0.75"/>${mark}`;
}
