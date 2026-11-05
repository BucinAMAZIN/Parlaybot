/** Collapse the desk's messy prop strings. Does not invent a stat the row did not name. */

export function normSport(raw: string): string {
  const sport = raw.toUpperCase().replace(/\s+/g, " ").trim();
  if (sport.includes("NCAAM") || sport === "NCAAB") return "NCAAB";
  if (sport.includes("NCAA F") || sport === "NCAAF") return "NCAAF";
  if (sport === "BIG 4") return "Big 4";
  return raw.trim() || "Other";
}

export function sportTitle(sport: string): string {
  if (sport === "NHL") return "🏒 NHL";
  if (sport === "NBA") return "🏀 NBA";
  if (sport === "NFL") return "🏈 NFL";
  if (sport === "NCAAF") return "NCAA 🏈";
  if (sport === "NCAAB") return "NCAA 🏀";
  if (sport === "MLB") return "⚾ MLB";
  if (sport === "NASCAR") return "🏁 NASCAR";
  return sport;
}

const SPORT_ORDER = ["NHL", "NBA", "NFL", "NCAAF", "NCAAB", "MLB", "NASCAR", "WNBA", "Big 4", "UFC", "Tennis"];

export function sportRank(sport: string): number {
  const index = SPORT_ORDER.indexOf(sport);
  return index === -1 ? SPORT_ORDER.length : index;
}

export function normProp(fam: string, prop: string): string {
  const blob = `${fam} ${prop}`.toLowerCase();
  if (/anytime|touchdown|\btd\b/.test(blob)) return "Anytime TD";
  if (/shots? on goal|\bsog\b/.test(blob)) return "SOG";
  const cleanFam = fam.trim();
  if (cleanFam && cleanFam.toLowerCase() !== "other") return cleanFam;
  const stripped = prop.replace(/^(nhl|nba|nfl|mlb|ncaaf|ncaab|wnba|nascar)\s+/i, "").replace(/\s+/g, " ").trim();
  return stripped || "Other";
}

export function normSide(pick: string, prop: string, alt: boolean): "over" | "under" | "alt" | "other" {
  if (alt || /\(alt\)|\balt(?:ernative)? line\b/i.test(`${pick} ${prop}`)) return "alt";
  const text = `${pick} ${prop}`.toLowerCase();
  if (/\(under\)|\bunder\b/.test(text)) return "under";
  if (/\(over\)|\bover\b/.test(text)) return "over";
  return "other";
}

export function sectionMatch(cat: string, section: string): boolean {
  if (!section || section === "all") return true;
  const name = cat.toLowerCase();
  if (section === "heist") return name.includes("heist");
  if (section === "safe") return name.includes("safe");
  if (section === "edge") return name === "edge" || name.startsWith("edge ");
  if (section === "cappers") return name.includes("capper");
  if (section === "legday") return name.includes("leg day");
  return true;
}
