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

/** Keys, free-throw circles, backboards, rims, and both 3-point lines. */
export function courtHardware(nba: boolean, logo = ""): string {
  const paint = nba ? 16 : 12;
  const y = 25 - paint / 2;
  const left = threePointPath(true, nba);
  const right = threePointPath(false, nba);
  const mark = logo ? `<image href="${logo}" x="41" y="19" width="12" height="12" opacity="0.14"/>` : "";
  return `<path class="court-line" d="${left}" fill="none"/><path class="court-line" d="${right}" fill="none"/><rect class="court-paint" x="0" y="${y}" width="19" height="${paint}"/><rect class="court-paint" x="75" y="${y}" width="19" height="${paint}"/><rect class="court-line" x="0" y="${y}" width="19" height="${paint}" fill="none"/><rect class="court-line" x="75" y="${y}" width="19" height="${paint}" fill="none"/><circle class="court-line" cx="19" cy="25" r="6" fill="none"/><circle class="court-line" cx="75" cy="25" r="6" fill="none"/><line class="court-line" x1="4" y1="22" x2="4" y2="28"/><line class="court-line" x1="90" y1="22" x2="90" y2="28"/><circle class="court-rim" cx="5.25" cy="25" r="0.75"/><circle class="court-rim" cx="88.75" cy="25" r="0.75"/>${mark}`;
}
