import type { LegPace } from "./types.ts";

/** In progress, then not started, then final. Inside a state, earlier start, then sport. */
export function sortLiveGames<T extends { pre: boolean; final: boolean; start?: string; league: string; id: string }>(games: T[]): T[] {
  const sport = ["NHL", "NBA", "NFL", "NCAAF", "NCAAB", "MLB", "WNBA"];
  const rank = (game: T) => (!game.pre && !game.final ? 0 : game.pre ? 1 : 2);
  return [...games].sort((a, b) => {
    const state = rank(a) - rank(b);
    if (state) return state;
    const start = (a.start || "9999").localeCompare(b.start || "9999");
    if (start) return start;
    const league = sport.indexOf(a.league) - sport.indexOf(b.league);
    if (league) return league;
    return a.id.localeCompare(b.id);
  });
}

export type TeamBet =
  | { kind: "ml"; team: string }
  | { kind: "spread"; team: string; spread: number }
  | { kind: "total"; line: number; under: boolean };

/** Moneyline, spread, or game total. Player props stay with the prop parser. */
export function teamBet(name: string): TeamBet | null {
  const text = name.replace(/\s*\(.*$/, "").replace(/[−–]/g, "-").replace(/\s+/g, " ").trim();
  const ml = text.match(/^(.+?)\s+(?:ml|moneyline)$/i);
  if (ml) return { kind: "ml", team: ml[1].trim() };
  const spread = text.match(/^(.+?)\s+([+-])\s*(\d+(?:\.\d+)?)(?:\s+spread)?$/i);
  if (spread && !/^(over|under)$/i.test(spread[1])) return { kind: "spread", team: spread[1].trim(), spread: Number(`${spread[2]}${spread[3]}`) };
  const total = text.match(/^(?:.*\b)?(over|under)\s+(\d+(?:\.\d+)?)(?:\s+(?:total|points?|goals?|runs?))?$/i);
  if (!total) return null;
  const prefix = text.slice(0, text.toLowerCase().indexOf(total[1].toLowerCase())).trim();
  if (prefix && !/total|game|@| vs /i.test(prefix) && prefix.split(" ").length >= 2) return null;
  return { kind: "total", line: Number(total[2]), under: /^under/i.test(total[1]) };
}

export type TeamGrade = {
  pace: LegPace;
  current: number;
  line: number;
  unit: string;
  label: string;
  source: string;
};

function scoreText(team: number, opp: number): string {
  const word = team > opp ? "Leading" : team < opp ? "Trailing" : "Tied";
  return `${word} ${team}–${opp}`;
}

/**
 * Grade a team bet from the live score.
 * In progress stays alive. The final score decides hit, dead, or push.
 */
export function gradeTeamBet(bet: TeamBet, awayScore: number, homeScore: number, side: "away" | "home" | null, state: "pre" | "in" | "post"): TeamGrade {
  const source = state === "pre" ? "Not started · ESPN" : state === "post" ? "ESPN final" : "ESPN score";
  if (bet.kind === "total") {
    const sum = awayScore + homeScore;
    let pace: LegPace = "pre";
    if (state === "in") pace = "on";
    if (state === "post") {
      if (sum === bet.line) pace = "on";
      else pace = bet.under ? (sum < bet.line ? "hit" : "dead") : sum > bet.line ? "hit" : "dead";
    }
    return { pace, current: sum, line: bet.line, unit: "PTS", label: "", source };
  }
  const teamScore = side === "home" ? homeScore : awayScore;
  const oppScore = side === "home" ? awayScore : homeScore;
  if (bet.kind === "ml") {
    let pace: LegPace = "pre";
    if (state === "in") pace = teamScore < oppScore ? "behind" : "on";
    if (state === "post") pace = teamScore > oppScore ? "hit" : teamScore < oppScore ? "dead" : "on";
    const label = state === "post" && teamScore === oppScore ? `Push ${teamScore}–${oppScore}` : scoreText(teamScore, oppScore);
    return { pace, current: teamScore, line: Math.max(teamScore, oppScore, 1), unit: "", label, source };
  }
  const covered = teamScore + bet.spread - oppScore;
  let pace: LegPace = "pre";
  if (state === "in") pace = covered < 0 ? "behind" : "on";
  if (state === "post") pace = covered > 0 ? "hit" : covered < 0 ? "dead" : "on";
  const sign = bet.spread > 0 ? `+${bet.spread}` : `${bet.spread}`;
  const word = state === "post" && covered === 0 ? "push" : covered > 0 ? "covering" : "not covering";
  return { pace, current: Math.max(0, teamScore + bet.spread), line: Math.max(oppScore, 1), unit: "", label: `${sign} · ${word}`, source };
}
