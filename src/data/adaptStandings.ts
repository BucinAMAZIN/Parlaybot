import type { StandingGroup, StandingLeague, StandingRow, StandingsFile } from "./types.ts";

/**
 * Desk standings snapshot (NBA, NHL, NFL, MLB, NCAAF).
 * Row shape from data.json standings.leagues: t, ab, rec, pct, gb, pts, home, road, l10, strk, diff, div.
 * NCAAB is not in that file and stays the labeled sample league passed in.
 */

export type DeskRow = {
  t?: string | null;
  ab?: string | null;
  rec?: string | null;
  pct?: string | null;
  gb?: string | null;
  pts?: string | null;
  home?: string | null;
  road?: string | null;
  l10?: string | null;
  strk?: string | null;
  diff?: string | null;
  div?: string | null;
};

export type DeskGroup = { name?: string; rows?: DeskRow[] };

export type DeskStandings = {
  updated?: string;
  leagues?: Record<string, { groups?: DeskGroup[]; note?: string }>;
};

const NBA_COLS = ["W-L", "PCT", "GB", "Home", "Away", "L10", "Strk", "Diff", "Div"];
const NHL_COLS = ["W-L-OTL", "PTS", "GB", "Home", "Away", "L10", "Strk", "Diff", "Div"];
const MLB_COLS = ["W", "L", "PCT", "GB", "Home", "Away", "L10", "Strk", "Diff"];
const NCAAF_AP_COLS = ["Overall", "AP"];
const NCAAF_CONF_COLS = ["Conf", "Overall", "Home", "Away", "Strk", "Diff"];

function text(value: unknown, empty = "–"): string {
  if (value == null || String(value).trim() === "") return empty;
  return String(value);
}

function parts(rec: string): number[] | null {
  if (!/^\d+(?:-\d+)+$/.test(rec)) return null;
  return rec.split("-").map((part) => Number(part));
}

function addRec(home?: string | null, road?: string | null): string | null {
  if (!home || !road) return null;
  const a = parts(home);
  const b = parts(road);
  if (!a || !b || a.length !== b.length) return null;
  return a.map((n, i) => String(n + (b[i] ?? 0))).join("-");
}

function wl(row: DeskRow): string {
  if (row.rec && String(row.rec).trim()) return String(row.rec);
  return addRec(row.home, row.road) ?? "–";
}

function proRow(row: DeskRow, index: number, cells: string[]): StandingRow {
  return { rank: index + 1, abbr: text(row.ab, "?"), label: "", cells, starred: false };
}

function nbaNfl(groups: DeskGroup[]): StandingGroup[] {
  return groups.map((group) => ({
    name: group.name || "Division",
    columns: NBA_COLS,
    rows: (group.rows ?? []).map((row, index) =>
      proRow(row, index, [wl(row), text(row.pct), text(row.gb, "-"), text(row.home), text(row.road), text(row.l10), text(row.strk), text(row.diff), text(row.div)]),
    ),
  }));
}

function nhl(groups: DeskGroup[]): StandingGroup[] {
  return groups.map((group) => ({
    name: group.name || "Division",
    columns: NHL_COLS,
    rows: (group.rows ?? []).map((row, index) =>
      proRow(row, index, [wl(row), text(row.pts), text(row.gb, "-"), text(row.home), text(row.road), text(row.l10), text(row.strk), text(row.diff), text(row.div)]),
    ),
  }));
}

function mlb(groups: DeskGroup[]): StandingGroup[] {
  return groups.map((group) => ({
    name: group.name || "Division",
    columns: MLB_COLS,
    rows: (group.rows ?? []).map((row, index) => {
      const rec = wl(row).split("-");
      const wins = rec.length >= 2 ? rec[0] : "–";
      const losses = rec.length >= 2 ? rec[1] : "–";
      return proRow(row, index, [wins, losses, text(row.pct), text(row.gb, "-"), text(row.home), text(row.road), text(row.l10), text(row.strk), text(row.diff)]);
    }),
  }));
}

function ncaaf(groups: DeskGroup[]): StandingGroup[] {
  return groups.map((group) => {
    const ap = (group.name || "").startsWith("AP");
    return {
      name: group.name || "NCAAF",
      columns: ap ? NCAAF_AP_COLS : NCAAF_CONF_COLS,
      rows: (group.rows ?? []).map((row, index) => {
        const title = String(row.t || row.ab || "");
        const match = /^(\d+)\.\s*(.*)$/.exec(title);
        if (ap) {
          const rank = match ? Number(match[1]) : index + 1;
          const name = match ? match[2] : title;
          return { rank, abbr: text(row.ab, "?"), label: name, cells: [text(row.rec), match ? `#${match[1]}` : "–"], starred: false };
        }
        return {
          rank: index + 1,
          abbr: text(row.ab, "?"),
          label: title,
          cells: [text(row.div), text(row.rec), text(row.home), text(row.road), text(row.strk), text(row.diff)],
          starred: false,
        };
      }),
    };
  });
}

function league(note: string, columns: string[], groups: StandingGroup[]): StandingLeague {
  return { note, columns, groups };
}

export function adaptDeskStandings(raw: DeskStandings, ncaab: StandingLeague): StandingsFile {
  const leagues = raw.leagues ?? {};
  const when = raw.updated ? `Desk snapshot ${raw.updated}.` : "Desk standings snapshot.";
  const nba = nbaNfl(leagues.NBA?.groups ?? []);
  const nfl = nbaNfl(leagues.NFL?.groups ?? []);
  const hockey = nhl(leagues.NHL?.groups ?? []);
  const baseball = mlb(leagues.MLB?.groups ?? []);
  const college = ncaaf(leagues["NCAA F"]?.groups ?? []);
  const mlbNote = leagues.MLB?.note ? `${leagues.MLB.note}. ` : "";
  return {
    source: "desk-standings",
    leagues: {
      NBA: league(`${when} NBA by division. W-L is home plus away when the snapshot leaves the season record blank.`, NBA_COLS, nba),
      NHL: league(`${when} NHL by division. All teams in the snapshot.`, NHL_COLS, hockey),
      NFL: league(`${when} NFL by division. L10 is blank in this snapshot.`, NBA_COLS, nfl),
      MLB: league(`${when} ${mlbNote}RS and RA are not in the snapshot, so those columns are omitted.`, MLB_COLS, baseball),
      NCAAF: league(`${when} NCAAF. AP Top 25 is overall record and rank only. Conference tables use the snapshot's div, home, away, streak, and diff. PF and PA are not in the file.`, NCAAF_AP_COLS, college),
      NCAAB: ncaab,
    },
  };
}
