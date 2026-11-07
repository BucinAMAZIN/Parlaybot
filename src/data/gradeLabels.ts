/** Collapse the desk's messy prop strings. Does not invent a stat the row did not name. */

export function normSport(raw: string): string {
  const sport = raw.toUpperCase().replace(/\s+/g, " ").trim();
  if (sport.includes("NCAAM") || sport === "NCAAB") return "NCAAB";
  if (sport.includes("NCAA F") || sport === "NCAAF") return "NCAAF";
  if (sport === "BIG 4") return "Big 4";
  if (sport === "MLB") return "MLB";
  if (sport === "NFL") return "NFL";
  if (sport === "NASCAR") return "NASCAR";
  return raw.trim() || "Other";
}

export function sportTitle(sport: string): string {
  if (sport === "NHL") return "🏒 NHL";
  if (sport === "NBA") return "🏀 NBA";
  if (sport === "NFL") return "🏈 NFL";
  if (sport === "NCAAF") return "NCAA 🏈";
  if (sport === "NCAAB" || sport === "NCAAM") return "NCAA 🏀";
  if (sport === "MLB") return "⚾ MLB";
  if (sport === "NASCAR") return "🏁 NASCAR";
  return sport;
}

const SPORT_ORDER = ["NHL", "NBA", "NFL", "NCAAF", "NCAAB", "MLB", "NASCAR", "WNBA", "Big 4", "UFC", "Tennis"];

export function sportRank(sport: string): number {
  const index = SPORT_ORDER.indexOf(sport);
  return index === -1 ? SPORT_ORDER.length : index;
}

export function capperOf(text: string): string {
  const names = [...new Set([...text.matchAll(/@([a-z0-9_]+)/gi)].map((match) => `@${match[1]}`))];
  return names.join(", ");
}

/** Read a stat the leg actually names. Empty when the text does not name one. */
function propFromText(text: string): string {
  const blob = text.toUpperCase();
  if (/\bP\s*\+\s*R\b|\bPTS\+REB\b|\bPR\b/.test(blob)) return "Pts+Reb";
  if (/\bP\s*\+\s*A\b|\bPTS\+AST\b|\bPA\b/.test(blob)) return "Pts+Ast";
  if (/\bR\s*\+\s*A\b|\bREB\+AST\b|\bRA\b/.test(blob)) return "Reb+Ast";
  if (/\bPRA\b|\bPTS\+REB\+AST\b/.test(blob)) return "PRA";
  if (/\b3PM\b|\bTHREES?\b/.test(blob)) return "3PM";
  if (/\bSOG\b|\bSHOTS?\s+ON\s+GOAL\b/.test(blob)) return "SOG";
  if (/\bREBOUNDS?\b|\bREBS?\b/.test(blob)) return "Rebounds";
  if (/\bASSISTS?\b|\bASTS?\b/.test(blob)) return "Assists";
  if (/\bPOINTS?\b|\bPTS\b/.test(blob)) return "Player points";
  if (/FIRST BLOOD/.test(blob)) return "First Blood";
  return "";
}

function badLabel(name: string): boolean {
  const text = name.trim();
  if (!text || text.toLowerCase() === "other") return true;
  if (text.startsWith("@")) return true;
  if (/alt line/i.test(text)) return true;
  return false;
}

export function normProp(fam: string, prop: string, pick = "", stat = ""): string {
  const famProp = `${fam} ${prop}`.toLowerCase();
  if (/anytime|touchdown|\btd\b/.test(famProp)) return "Anytime TD";
  if (/shots? on goal|\bsog\b/.test(famProp)) return "SOG";
  const cleanFam = fam.trim();
  if (cleanFam && cleanFam.toLowerCase() !== "other" && !badLabel(cleanFam)) return cleanFam;
  const named = propFromText(`${stat} ${pick} ${prop}`);
  if (named && !badLabel(named)) return named;
  return "Misc";
}

export function normSide(pick: string, prop: string, alt: boolean): "over" | "under" | "alt" | "other" {
  const text = `${pick} ${prop}`;
  if (alt || /\(alt\)|\balt(?:ernative)? line\b|→/.test(text)) return "alt";
  if (/\(under\)|\bunder\b|\bu\d/i.test(text)) return "under";
  if (/\(over\)|\bover\b|\bo\d|\d+(?:\.\d+)?\s*\+/i.test(text)) return "over";
  return "other";
}

/** User-facing section name. The desk file still says LEG DAY. */
export function displayCat(cat: string): string {
  const name = cat.trim();
  if (/^leg\s*day$/i.test(name)) return "Props";
  if (name === "Parlay +100") return "+100";
  return cat;
}

export function sectionMatch(cat: string | { cat: string; cats?: string[]; ticketKey?: string; side?: string }, section: string): boolean {
  if (cat && typeof cat === "object") {
    if (!section || section === "all") return true;
    if (section === "plus100") {
      if (cat.ticketKey === "alt100" || cat.ticketKey === "alt250") return false;
      const names = cat.cats?.length ? cat.cats : [cat.cat];
      return names.some((name) => sectionMatch(name, section)) || cat.ticketKey === "parlay100";
    }
    if (section === "plus250") return cat.ticketKey === "alt250" || sectionMatch(cat.cat, section) || (cat.cats ?? []).some((name) => sectionMatch(name, section));
    if (section === "cappers" && cat.side === "alt") return false;
    if (section === "heistalt") {
      const names = cat.cats?.length ? cat.cats : [cat.cat];
      return names.some((name) => /alt lines/i.test(name)) || (cat.side === "alt" && names.some((name) => /heist/i.test(name)));
    }
    if (section === "safe") {
      if (cat.ticketKey === "alt100" || cat.ticketKey === "alt250") return false;
      const names = cat.cats?.length ? cat.cats : [cat.cat];
      return names.some((name) => sectionMatch(name, section));
    }
    const names = cat.cats?.length ? cat.cats : [cat.cat];
    return names.some((name) => sectionMatch(name, section));
  }
  if (!section || section === "all") return true;
  const name = cat.toLowerCase();
  if (section === "plus100") return cat.trim() === "+100" || cat.trim() === "Parlay +100" || name === "parlay100";
  if (section === "plus250") return cat.trim() === "+250";
  if (section === "heistalt") return name.includes("alt lines");
  if (section === "heist") return name.includes("heist");
  if (section === "safe") return name.includes("safe");
  if (section === "edge") return name === "edge" || name.startsWith("edge ");
  if (section === "cappers") return name.includes("capper");
  if (section === "legday") return name.includes("leg day");
  return true;
}
