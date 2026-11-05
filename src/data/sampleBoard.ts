import type {
  Capper,
  LiveGame,
  LiveLeg,
  LiveTicket,
  Play,
  Recap,
  SeriesPoint,
  SettledTicket,
  TeamSide,
  Ticket,
  WhyBlock,
} from "./types.ts";

/**
 * Approved round-3 card. Every number in this file is sample layout data
 * from the mockups, not a live grade. The edge-picks fixture is separate.
 */

const TEAMS: Record<string, TeamSide> = {
  ATL: { abbr: "ATL", record: "4-4", standing: "2nd SE" },
  NYK: { abbr: "NYK", record: "3-4", standing: "4th Atl" },
  BOS: { abbr: "BOS", record: "5-2", standing: "2nd Atl" },
  MIL: { abbr: "MIL", record: "1-6", standing: "5th Cen" },
  PHI: { abbr: "PHI", record: "7-1", standing: "1st Atl" },
  CHA: { abbr: "CHA", record: "3-5", standing: "3rd SE" },
  OKC: { abbr: "OKC", record: "5-2", standing: "2nd NW" },
  DEN: { abbr: "DEN", record: "3-3", standing: "4th NW" },
  PHX: { abbr: "PHX", record: "1-4", standing: "3rd Pac" },
  COL: { abbr: "COL", record: "9-6-1", standing: "4th Cen" },
  DAL: { abbr: "DAL", record: "9-5-1", standing: "3rd Cen" },
  MTL: { abbr: "MTL", record: "9-3-3", standing: "2nd Atl" },
  WSH: { abbr: "WSH", record: "8-6-0", standing: "4th Metro" },
  SEA: { abbr: "SEA", record: "8-5-1", standing: "3rd Pac" },
  VGK: { abbr: "VGK", record: "10-5-2", standing: "2nd Pac" },
};

function vs(away: string, home: string, rankChip?: string): Play["matchup"] {
  return { away: TEAMS[away], home: TEAMS[home], rankChip };
}

function why(line: string, bullets: string[], risks: string[], ours = false): WhyBlock {
  return { ours, line, why: bullets, whyNot: risks };
}

const LOCK = "Locked 6:58 PM";

const HEIST_RULES = [
  "Every straight play from the 5 Heist cappers is a leg; nobody is removed.",
  "Main Heist uses the capper's line at Hard Rock's live price.",
  "Buy-down ticket moves each leg to the alt rung nearest −325 (−250 to −425); threes drop one line. No rung in range = flagged, not swapped.",
  "Rebuilt at 7 AM, 10 AM, 12:30 and 4 PM; final after 4 PM. Each leg locks at its game start.",
  "Tallied as 1u alt props.",
];

function basePlay(partial: Play): Play {
  return partial;
}

export const sampleTickets: Ticket[] = [
  {
    id: "heist",
    productKey: "heist",
    title: "THE HEIST",
    meta: "Buy-down ticket · ALT LINE · cappers · 3 legs · +190 · 1u",
    badge: "official",
    share: true,
    ticketOdds: "+190",
    group: "main",
    rules: HEIST_RULES,
    plays: [
      basePlay({
        id: "heist-trae",
        name: "Trae Young Over 7.5 ast",
        detail: "@alexcaruso · ATL vs NYK 7:00 PM",
        sport: "NBA",
        hr: "−320",
        dk: "−305",
        alt: { before: "Over 9.5 ast +105", after: "Over 7.5 ast −320" },
        lock: LOCK,
        status: { label: "Active", reportedAt: "6:30 PM", tone: "quiet" },
        matchup: vs("ATL", "NYK", "Opp D ranks 24th vs AST"),
        why: why("Opp D ranks 24th vs AST, hit 7 of last 10", ["Opp D ranks 24th vs AST", "Hit 7 of last 10", "Edge +5.3% vs fair price", "Capper 28-17 on this type"], ["Low volume market"], true),
        source: "sample",
      }),
      basePlay({
        id: "heist-celtics",
        name: "Celtics −0.5",
        detail: "@panpotd · BOS vs MIL 7:30 PM",
        sport: "NBA",
        hr: "−330",
        dk: "−318",
        alt: { before: "−1.5 +120", after: "−0.5 −330" },
        lock: LOCK,
        matchup: vs("BOS", "MIL", "MIL D ranks 19th vs PTS"),
        why: why("MIL D ranks 19th vs PTS, covered 7 of last 10", ["MIL D ranks 19th vs PTS", "Covered 7 of last 10", "Edge +4.4% vs fair spread", "Capper 20-12 on this type"], ["Back-to-back, minutes may dip"], true),
        source: "sample",
      }),
      basePlay({
        id: "heist-mccain",
        name: "Jared McCain Over 2.5 reb",
        detail: "@austinsprops · PHI vs CHA 7:00 PM",
        sport: "NBA",
        hr: "−325",
        dk: null,
        alt: { before: "Over 3.5 reb +110", after: "Over 2.5 reb −325" },
        lock: LOCK,
        status: { label: "Minutes limit", reportedAt: "7:02 PM", tone: "warn" },
        matchup: vs("PHI", "CHA", "Opp D ranks 27th vs REB"),
        why: why("Opp D ranks 27th vs REB, hit 6 of last 10", ["Opp D ranks 27th vs REB", "Hit 6 of last 10", "Edge +4.1% vs fair price", "Capper 18-8 on this type"], ["Minutes limit flagged on report", "Alt line priced worse vs fair"], true),
        source: "sample",
      }),
    ],
  },
  {
    id: "safe",
    productKey: "safe",
    title: "Safe +100",
    meta: "Official · 3 legs · +118 · sample card",
    badge: "official",
    share: true,
    ticketOdds: "+118",
    group: "official",
    rules: ["Safe +100 is an official ticket.", "This card is sample data. Legs are picked on Hard Rock. DK only re-prices a leg the book actually offers."],
    plays: [
      basePlay({
        id: "safe-brunson",
        name: "Jalen Brunson Over 19.5 pts",
        detail: "Knicks vs Hawks · 7:00 PM",
        sport: "NBA",
        hr: "−300",
        dk: "−300",
        lock: LOCK,
        status: { label: "Active", reportedAt: "5:40 PM", tone: "quiet" },
        matchup: vs("NYK", "ATL", "ATL D ranks 26th vs PTS"),
        why: why("ATL D ranks 26th vs PTS, hit 7 of last 10", ["ATL D ranks 26th vs PTS", "Hit 7 of last 10", "Edge +4.8% vs fair price"], ["Blowout risk (spread 9+)"]),
        source: "sample",
      }),
      basePlay({
        id: "safe-jokic",
        name: "Nikola Jokic Over 7.5 reb",
        detail: "Nuggets vs Suns · 9:00 PM",
        sport: "NBA",
        hr: "−410",
        dk: "−410",
        lock: LOCK,
        status: { label: "Questionable", reportedAt: "4:15 PM", tone: "warn" },
        matchup: vs("DEN", "PHX", "Opp D 26th vs rebounds"),
        why: why("Opp D 26th vs rebounds, hit 9 of last 10", ["Opp D 26th vs rebounds", "Hit 9 of last 10", "Edge +3.0% vs fair price"], ["Blowout risk (spread 9+)"]),
        source: "sample",
      }),
      basePlay({
        id: "safe-booker",
        name: "Devin Booker Over 14.5 pts",
        detail: "Suns vs Nuggets · 9:00 PM",
        sport: "NBA",
        hr: null,
        dk: "−280",
        lock: LOCK,
        status: { label: "GTD", reportedAt: "6:05 PM", tone: "warn" },
        matchup: vs("PHX", "DEN", "Opp D 29th vs points"),
        why: why("Opp D 29th vs points, hit 6 of last 10", ["Opp D 29th vs points", "Hit 6 of last 10", "Edge +6.0% vs fair price"], ["Minutes limit flagged on report", "Alt line priced worse vs fair"]),
        source: "sample",
      }),
    ],
  },
  {
    id: "potd",
    productKey: "potd",
    title: "POTD",
    meta: "Official · 1 play · driver finish",
    badge: "official",
    share: true,
    ticketOdds: "−180",
    group: "official",
    rules: ["Play of the day. NASCAR POTD in this sample is a Top 10 finish.", "H2H and Top 3/5/10 only. Display only."],
    plays: [
      basePlay({
        id: "potd-larson",
        name: "Kyle Larson Top 10",
        detail: "POTD · 8/10 hit · model agrees · Proj P2 · Qual P4",
        sport: "NASCAR",
        hr: "−180",
        dk: "−170",
        lock: LOCK,
        why: why("Avg finish 9 at flat 1-mile tracks, top-10 in 6 of last 10 here", ["Avg finish 9 at flat 1-mile tracks", "Top-10 in 6 of last 10 here", "Edge +3.4% vs fair price"], ["Low volume market"]),
        source: "sample",
      }),
    ],
  },
  {
    id: "parlay",
    productKey: "parlay",
    title: "Parlay +100",
    meta: "Official · 2 legs · H2H and Top 5",
    badge: "official",
    share: true,
    group: "official",
    rules: ["Parlay +100. NASCAR legs in this sample are Top 5 and a head-to-head.", "Whole-ticket button shows only when every leg is on the active book."],
    plays: [
      basePlay({
        id: "parlay-hamlin",
        name: "Denny Hamlin Top 5",
        detail: "Parlay +100 leg · 7/10 · model agrees · Proj P5 · Qual P6",
        sport: "NASCAR",
        hr: "+140",
        dk: null,
        lock: LOCK,
        why: why("Avg finish 11 at flat 1-mile tracks, top-10 in 7 of last 10 here", ["Avg finish 11 at flat 1-mile tracks", "Top-10 in 7 of last 10 here", "Edge +5.2% vs fair price"], ["Blowout risk (spread 9+)"]),
        source: "sample",
      }),
      basePlay({
        id: "parlay-elliott",
        name: "Chase Elliott over Briscoe",
        detail: "Parlay +100 leg · H2H · 7/10 · Proj P8 · Qual P8",
        sport: "NASCAR",
        hr: "−115",
        dk: "−112",
        lock: LOCK,
        why: why("Avg finish 8 at flat 1-mile tracks, top-10 in 6 of last 10 here", ["Avg finish 8 at flat 1-mile tracks", "Top-10 in 6 of last 10 here", "Edge +7.3% vs fair price"], ["Back-to-back, minutes may dip"]),
        source: "sample",
      }),
    ],
  },
  {
    id: "edge",
    productKey: "edge",
    title: "Edge",
    meta: "4 plays · all sports · starred first · sample card",
    badge: "official",
    share: false,
    group: "edge",
    rules: [
      "Stars mark a 6–8% edge. The green chip is the matchup, then SOG target and assist risk.",
      "The Edge feed ticket under this one is the attached JSON. It is not this sample card.",
      "A game that has already started is blocked. The play stays on the card with no button.",
    ],
    plays: [
      basePlay({
        id: "edge-makar",
        name: "★ Cale Makar Over 2.5 SOG",
        detail: "NHL · Edge 7.1% · fair −160 · COL vs DAL 9:00 PM",
        sport: "NHL",
        hr: "−125",
        dk: "−118",
        markers: [
          { kind: "star", label: "★ 6–8% edge" },
          { kind: "green", label: "● Good matchup" },
          { kind: "sog", label: "◎ SOG target" },
        ],
        lock: LOCK,
        goalieConfirmed: true,
        status: { label: "Active", reportedAt: "8:15 PM", tone: "quiet" },
        matchup: vs("COL", "DAL", "DAL allows 8th-most SOG"),
        why: why("DAL allows 8th-most SOG, hit 9 of last 10", ["DAL allows 8th-most SOG", "Hit 9 of last 10", "Edge +7.1% vs fair price"], ["Low volume market", "Alt line priced worse vs fair"]),
        source: "sample",
      }),
      basePlay({
        id: "edge-suzuki",
        name: "Nick Suzuki Over 0.5 ast",
        detail: "NHL · Edge 5.4% · MTL vs WSH 7:00 PM",
        sport: "NHL",
        hr: "+105",
        dk: null,
        markers: [{ kind: "assist", label: "! Assist risk" }],
        lock: LOCK,
        goalieConfirmed: true,
        status: { label: "GTD", reportedAt: "5:30 PM", tone: "warn" },
        matchup: vs("MTL", "WSH", "WSH ranks 22nd vs AST"),
        why: why("WSH ranks 22nd vs AST, hit 9 of last 10", ["WSH ranks 22nd vs AST", "Hit 9 of last 10", "Edge +3.0% vs fair price"], ["Back-to-back, minutes may dip", "Alt line priced worse vs fair"]),
        source: "sample",
      }),
      basePlay({
        id: "edge-jalen",
        name: "Jalen Williams Over 22.5 pts",
        detail: "NBA · Edge 4.6% · OKC vs DEN 9:30 PM",
        sport: "NBA",
        hr: "−110",
        dk: "−104",
        lock: LOCK,
        status: { label: "Out", reportedAt: "4:10 PM", tone: "bad" },
        matchup: vs("OKC", "DEN", "Opp D ranks 27th vs PTS"),
        why: why("Opp D ranks 27th vs PTS, hit 8 of last 10", ["Opp D ranks 27th vs PTS", "Hit 8 of last 10", "Edge +4.7% vs fair price"], ["Blowout risk (spread 9+)"]),
        source: "sample",
      }),
      basePlay({
        id: "edge-ovi",
        name: "Alex Ovechkin Over 3.5 SOG",
        detail: "NHL · Edge 4.2% · WSH vs MTL 7:00 PM",
        sport: "NHL",
        hr: "+120",
        dk: null,
        markers: [
          { kind: "green", label: "● Good matchup" },
          { kind: "sog", label: "◎ SOG target" },
        ],
        blocked: "started",
        goalieConfirmed: true,
        status: { label: "Active", reportedAt: "6:20 PM", tone: "quiet" },
        matchup: vs("WSH", "MTL", "MTL allows 5th-most SOG"),
        why: why("MTL allows 5th-most SOG, hit 8 of last 10", ["MTL allows 5th-most SOG", "Hit 8 of last 10", "Edge +2.7% vs fair price"], ["Blowout risk (spread 9+)", "Alt line priced worse vs fair"]),
        source: "sample",
      }),
    ],
  },
  {
    id: "legday",
    productKey: "legday",
    title: "LEG DAY",
    meta: "Official · 4 props · SAMPLE · no LEG DAY feed in v1",
    badge: "official",
    share: false,
    group: "official",
    rules: ["LEG DAY is official.", "These four props are sample layout data. There is no LEG DAY feed in this build."],
    plays: [
      basePlay({
        id: "leg-maxey",
        name: "Tyrese Maxey Over 22.5 pts",
        detail: "LEG DAY · PHI vs CHA 7:00 PM · SAMPLE",
        sport: "NBA",
        hr: "−125",
        dk: "−125",
        lock: LOCK,
        lateInjury: true,
        status: { label: "Questionable", reportedAt: "6:12 PM", tone: "warn" },
        matchup: vs("PHI", "CHA", "Opp D 27th vs points"),
        why: why("Opp D 27th vs points, hit 9 of last 10", ["Opp D 27th vs points", "Hit 9 of last 10", "Edge +5.8% vs fair price"], ["Low volume market"]),
        source: "sample",
      }),
      basePlay({
        id: "leg-jj",
        name: "Jalen Johnson Over 8.5 reb",
        detail: "LEG DAY · ATL vs NYK 7:00 PM · SAMPLE",
        sport: "NBA",
        hr: "−110",
        dk: "−110",
        lock: LOCK,
        status: { label: "Active", reportedAt: "6:30 PM", tone: "quiet" },
        matchup: vs("ATL", "NYK", "Opp D 28th vs rebounds"),
        why: why("Opp D 28th vs rebounds, hit 9 of last 10", ["Opp D 28th vs rebounds", "Hit 9 of last 10", "Edge +7.2% vs fair price"], ["Blowout risk (spread 9+)"]),
        source: "sample",
      }),
      basePlay({
        id: "leg-brown",
        name: "Jaylen Brown Over 24.5 pts",
        detail: "LEG DAY · BOS vs MIL 7:30 PM · SAMPLE",
        sport: "NBA",
        hr: "+105",
        dk: "+105",
        lock: LOCK,
        status: { label: "GTD", reportedAt: "5:55 PM", tone: "warn" },
        matchup: vs("BOS", "MIL", "Opp D 29th vs points"),
        why: why("Opp D 29th vs points, hit 6 of last 10", ["Opp D 29th vs points", "Hit 6 of last 10", "Edge +5.9% vs fair price"], ["Back-to-back, minutes may dip"]),
        source: "sample",
      }),
      basePlay({
        id: "leg-murray",
        name: "Jamal Murray Over 21.5 pts",
        detail: "LEG DAY · DEN vs PHX 9:00 PM · SAMPLE",
        sport: "NBA",
        hr: "−140",
        dk: "−140",
        lock: LOCK,
        status: { label: "Minutes limit", reportedAt: "7:40 PM", tone: "warn" },
        matchup: vs("DEN", "PHX", "Opp D 29th vs points"),
        why: why("Opp D 29th vs points, hit 7 of last 10", ["Opp D 29th vs points", "Hit 7 of last 10", "Edge +6.4% vs fair price"], ["Back-to-back, minutes may dip", "Alt line priced worse vs fair"]),
        source: "sample",
      }),
    ],
  },
  {
    id: "first",
    productKey: "first",
    title: "First Blood",
    meta: "For fun · 5 plays · not in the official record · SAMPLE",
    badge: "fun",
    share: true,
    group: "fun",
    rules: ["First Blood is for fun. It never mixes into the official record.", "TD City has no plays today, so that product stays hidden.", "These five plays are sample layout data."],
    plays: [
      funPlay("fb-suzuki", "Nick Suzuki first goal", "MTL", "WSH", "NHL", "+450", "+440"),
      funPlay("fb-ovi", "Alex Ovechkin first goal", "WSH", "MTL", "NHL", "+380", null),
      funPlay("fb-makar", "Cale Makar first goal", "COL", "DAL", "NHL", "+420", "+410"),
      funPlay("fb-trae", "Trae Young first basket", "ATL", "NYK", "NBA", "+600", "+580"),
      funPlay("fb-brunson", "Jalen Brunson first basket", "NYK", "ATL", "NBA", "+550", "+540"),
    ],
  },
  {
    id: "props",
    productKey: "props",
    title: "Prop Scout",
    meta: "2 props · sample card",
    share: true,
    group: "props",
    rules: ["Prop Scout lists props beside the official tickets.", "This pair is sample data. A missing book says Not on HR or Not on DK."],
    plays: [
      basePlay({
        id: "prop-ant",
        name: "Anthony Edwards Over 2.5 threes",
        detail: "Prop Scout · 8/10 L10 · MIN vs LAL · SAMPLE",
        sport: "NBA",
        hr: "−135",
        dk: "−135",
        lock: LOCK,
        status: { label: "Active", reportedAt: "7:12 PM", tone: "quiet" },
        why: why("Opp D 29th vs threes, hit 7 of last 10", ["Opp D 29th vs threes", "Hit 7 of last 10", "Edge +5.3% vs fair price"], ["Minutes limit flagged on report", "Alt line priced worse vs fair"]),
        source: "sample",
      }),
      basePlay({
        id: "prop-paolo",
        name: "Paolo Banchero Over 8.5 reb",
        detail: "Prop Scout · 7/10 L10 · ORL vs DET · SAMPLE",
        sport: "NBA",
        hr: "+110",
        dk: null,
        lock: LOCK,
        lateInjury: true,
        status: { label: "Minutes limit", reportedAt: "6:48 PM", tone: "warn" },
        why: why("Opp D 25th vs rebounds, hit 7 of last 10", ["Opp D 25th vs rebounds", "Hit 7 of last 10", "Edge +6.1% vs fair price"], ["Back-to-back, minutes may dip", "Alt line priced worse vs fair"]),
        source: "sample",
      }),
    ],
  },
];

function funPlay(id: string, name: string, away: string, home: string, sport: "NHL" | "NBA", hr: string, dk: string | null): Play {
  return {
    id,
    name,
    detail: `For fun · ${away} vs ${home} · SAMPLE`,
    sport,
    hr,
    dk,
    lock: LOCK,
    status: { label: "Active", reportedAt: "6:00 PM", tone: "quiet" },
    matchup: vs(away, home, "First-score market · sample"),
    why: why(
      "For fun only, same game as another leg on this card",
      ["For fun · not in the official record", "Same teams as a leg already on this sample card", "Display only"],
      ["First-score markets are high variance", "No first-blood feed in this build"],
    ),
    source: "sample",
  };
}

export const cappers: Capper[] = [
  cap("@alexcaruso", "heist", "24-15 · 62% wins · +6.8u", capPlay("cap-alex", "Trae Young O9.5 ast", "−110", "−105", "ATL", "NYK", "NBA", "Opp D ranks 24th vs AST", why("Opp D ranks 24th vs AST, hit 7 of last 10", ["Opp D ranks 24th vs AST", "Hit 7 of last 10", "Edge +4.4% vs fair price"], ["Low volume market"], true), { label: "Questionable", reportedAt: "6:41 PM", tone: "warn" })),
  cap("@panpotd", "heist", "19-17 · 53% wins · +0.9u", capPlay("cap-pan", "Celtics −1.5", "−110", "−105", "BOS", "MIL", "NBA", "MIL D ranks 19th vs PTS", why("MIL D ranks 19th vs PTS, covered 6 of last 10", ["MIL D ranks 19th vs PTS", "Covered 6 of last 10", "Edge +4.8% vs fair spread"], ["Low volume market", "Alt line priced worse vs fair"], true))),
  cap("@austinsprops", "heist", "15-18 · 45% wins · −3.1u", capPlay("cap-austin", "McCain O3.5 reb", "−110", "−105", "PHI", "CHA", "NBA", "Opp D ranks 27th vs REB", why("Opp D ranks 27th vs REB, hit 7 of last 10", ["Opp D ranks 27th vs REB", "Hit 7 of last 10", "Edge +4.7% vs fair price"], ["Low volume market"], true), { label: "Not starting", reportedAt: "6:55 PM", tone: "warn" })),
  cap("@showtimepicks2", "heist", "12-10 · 55% wins · +1.6u", capPlay("cap-show", "Hawks +4.5", "−110", "−105", "ATL", "NYK", "NBA", "NYK D ranks 11th vs PTS", why("NYK D ranks 11th vs PTS, covered 9 of last 10", ["NYK D ranks 11th vs PTS", "Covered 9 of last 10", "Edge +6.1% vs fair spread"], ["Low volume market", "Alt line priced worse vs fair"], true))),
  cap("@bigmikepickz", "heist", "9-11 · 45% wins · −2.4u", capPlay("cap-mike", "Under 228.5 BOS/MIL", null, "−108", "BOS", "MIL", "NBA", "Pace ranks 6th combined", why("Pace ranks 6th combined, total stayed under in 7 of last 10", ["Pace ranks 6th combined", "Total stayed under in 7 of last 10", "Edge +3.3% vs fair total"], ["Back-to-back, minutes may dip", "Alt line priced worse vs fair"], true), undefined, false)),
  cap("Jim Turvey", "an", "NBA props · from AN picks", capPlay("cap-turvey", "Jalen Brunson O6.5 ast", "+100", "−102", "NYK", "ATL", "NBA", "ATL D ranks 26th vs AST", why("ATL D ranks 26th vs AST, hit 9 of last 10", ["ATL D ranks 26th vs AST", "Hit 9 of last 10", "Edge +7.5% vs fair price"], ["Back-to-back, minutes may dip", "Alt line priced worse vs fair"], true), { label: "Not starting", reportedAt: "6:55 PM", tone: "warn" }, false)),
  cap("Nick Martin", "an", "NHL · from AN picks", capPlay("cap-martin", "Kraken ML", "−120", null, "SEA", "VGK", "NHL", "VGK ranks 9th GA/G", why("VGK ranks 9th GA/G, covered 8 of last 10", ["VGK ranks 9th GA/G", "Covered 8 of last 10", "Edge +6.4% vs fair spread"], ["Blowout risk (spread 9+)", "Alt line priced worse vs fair"], true), undefined, false)),
  { id: "cap-koerner", name: "Koerner", group: "an", record: "Action Network · tracked", plays: [], note: "No play in this sample card." },
  { id: "cap-marchio", name: "Marchio", group: "an", record: "Action Network · tracked", plays: [], note: "No play in this sample card." },
];

function cap(name: string, group: Capper["group"], record: string, play: Play): Capper {
  return { id: play.id, name, group, record, plays: [play] };
}

function capPlay(
  id: string,
  name: string,
  hr: string | null,
  dk: string | null,
  away: string,
  home: string,
  sport: "NBA" | "NHL",
  chip: string,
  block: WhyBlock,
  status?: Play["status"],
  lock = true,
): Play {
  return {
    id,
    name,
    detail: "Today · " + sport,
    sport,
    hr,
    dk,
    lock: lock && hr ? LOCK : undefined,
    status,
    matchup: vs(away, home, chip),
    why: block,
    source: "sample",
  };
}

export function capperTicket(list: Capper[]): Ticket {
  return {
    id: "cappers",
    productKey: "cappers",
    title: "Cappers",
    meta: "All 5 Heist cappers · every play stays · AN tracked, not in THE HEIST",
    badge: "cappers",
    share: true,
    group: "cappers",
    rules: [
      "Every Heist capper play stays on the card. None are removed for the player-status chip.",
      "Action Network cappers (Turvey, Martin, Koerner, Marchio) are tracked. They are not in THE HEIST unless you approve.",
      "Our read is our take, not the capper's writeup.",
    ],
    plays: list.flatMap((item) => item.plays),
  };
}

export const recap: Recap = {
  when: "Last night · Tue, Nov 3",
  units: "+3.4u",
  summary: "7 won · 4 lost",
  rows: [
    { name: "THE HEIST", text: "W · +2.1u", win: true },
    { name: "Safe +100", text: "W · +1.2u", win: true },
    { name: "POTD", text: "L · −1.0u", win: false },
    { name: "NHL Edge", text: "4-2 · +1.4u", win: true },
    { name: "Cappers", text: "3-3 · −0.3u", win: false },
  ],
};

const PROFIT = [0, 1.2, 0.4, 2.1, 3.0, 2.2, 3.8, 5.1, 4.3, 5.9, 7.2, 6.5, 8.0, 9.4];
const WR = [50, 55, 52, 56, 58, 55, 57, 59, 57, 58, 60, 59, 61, 62];
const DAYS = ["10/22", "", "", "10/25", "", "", "10/28", "", "", "10/31", "", "", "11/3", "11/4"];

export const series: SeriesPoint[] = PROFIT.map((profit, i) => ({ day: DAYS[i], profit, winRate: WR[i] }));

export const rings: { pct: number; label: string }[] = [
  { pct: 60, label: "THE HEIST" },
  { pct: 26, label: "Safe +100" },
  { pct: 45, label: "NHL Edge" },
  { pct: 54, label: "Cappers" },
  { pct: 50, label: "POTD" },
  { pct: 58, label: "LEG DAY" },
  { pct: 52, label: "Parlay +100" },
  { pct: 57, label: "NCAAM" },
];

export const results: SettledTicket[] = [
  {
    id: "res-heist",
    title: "THE HEIST",
    meta: "3 legs · +190",
    result: "W",
    ticketOdds: "+190",
    mood: "cash",
    legs: [
      { name: "Trae Young O7.5 ast", stat: "11 ast", result: "W", grade: "A", note: "Hit by halftime; 38 min, usage held.", beatClose: true },
      { name: "Celtics −0.5", stat: "Won 112–104", result: "W", grade: "B", note: "Led all 4th; late Bucks run made it close.", beatClose: true },
      { name: "Jared McCain O2.5 reb", stat: "5 reb", result: "W", grade: "A", note: "Cleared by 2.5 in 31 min.", beatClose: false },
    ],
  },
  {
    id: "res-potd",
    title: "POTD",
    meta: "1 play · −125",
    result: "L",
    ticketOdds: "−125",
    mood: "hook",
    legs: [{ name: "Davion Mitchell O11.5 pts", stat: "9 pts", result: "L", grade: "C", note: "Foul trouble: 22 min vs 30 avg.", beatClose: false }],
  },
  {
    id: "res-edge",
    title: "Edge",
    meta: "6 plays · 4 hit",
    result: "W",
    mood: "cash",
    legs: [
      { name: "★ Makar O2.5 SOG", stat: "4 shots", result: "W", grade: "A", note: "6 attempts by 2nd; goalie confirmed.", beatClose: true },
      { name: "Ovechkin O3.5 SOG", stat: "2 shots", result: "L", grade: "D", note: "Short TOI (16:40); PP cut.", beatClose: false },
    ],
  },
];

export const nascar = {
  when: "Sun, Nov 8 · Phoenix · 3:00 PM",
  rows: [
    ["1. Larson", "Qual P4", "28%"],
    ["2. Hamlin", "Qual P2", "22%"],
    ["3. Byron", "Qual P7", "15%"],
    ["4. Bell", "Qual P1", "12%"],
    ["5. Blaney", "Qual P9", "9%"],
  ] as [string, string, string][],
};

const liveWhy = {
  trae: why("Opp D ranks 24th vs AST, hit 8 of last 10", ["Opp D ranks 24th vs AST", "Hit 8 of last 10", "Edge +6.1% vs fair −290", "34+ min in 9 straight"], ["Blowout risk if NYK runs away", "Alt O9.5 priced worse for the edge"]),
  traePts: why("Opp D ranks 24th vs AST, hit 9 of last 10", ["Opp D ranks 24th vs AST", "Hit 9 of last 10", "Edge +7.2% vs fair price", "Capper 12-8 on this type"], ["Minutes limit flagged on report"], true),
  mccain: why("Opp D ranks 27th vs REB, hit 7 of last 10", ["Opp D ranks 27th vs REB", "Hit 7 of last 10", "Fair −160 vs −140 offered"], ["Bench role: 24–28 min", "Low volume: 4.1 REB avg"]),
  spread: why("Net rating gap: 2 pts per 100, covered 7 of last 10", ["Net rating gap: 2 pts per 100", "Covered 7 of last 10", "Edge +6.9% vs fair spread"], ["Low volume market"]),
  suzuki: why("WSH ranks 22nd vs AST, hit 9 of last 10", ["WSH ranks 22nd vs AST", "Hit 9 of last 10", "Edge +3.0% vs fair price"], ["Back-to-back, minutes may dip"]),
  ovi: why("MTL allows 5th-most SOG, hit 8 of last 10", ["MTL allows 5th-most SOG", "Hit 8 of last 10", "Edge +2.7% vs fair price"], ["Shot volume down 3 straight"]),
  under: why("Pace ranks 6th combined, total stayed under in 7 of last 10", ["Pace ranks 6th combined", "Total stayed under in 7 of last 10", "Edge +3.3% vs fair total"], ["Low volume market"]),
  celtics: why("MIL D ranks 19th vs PTS, covered 7 of last 10", ["MIL D ranks 19th vs PTS", "Covered 7 of last 10", "Edge +4.4% vs fair spread"], ["Back-to-back, minutes may dip"]),
  total: why("Pace ranks 6th combined, total stayed under in 7 of last 10", ["Pace ranks 6th combined", "Total stayed under in 7 of last 10"], ["Back-to-back, minutes may dip"]),
  jalen: why("Opp D ranks 27th vs PTS, hit 8 of last 10", ["Opp D ranks 27th vs PTS", "Hit 8 of last 10", "Edge +4.7% vs fair price"], ["Blowout risk (spread 9+)"]),
  makar: why("DAL allows 8th-most SOG, hit 9 of last 10", ["DAL allows 8th-most SOG", "Hit 9 of last 10", "Edge +7.1% vs fair price"], ["Low volume market"]),
};

function leg(name: string, current: number, line: number, unit: string, pace: LiveLeg["pace"], source: string, block: WhyBlock): LiveLeg {
  return { name, current, line, unit, pace, source, why: block };
}

export const liveTickets: LiveTicket[] = [
  { name: "THE HEIST", legs: ["hit", "behind", "hit"], pace: "behind", note: "McCain needs 2 REB" },
  { name: "Parlay +100", legs: ["on", "on"], pace: "on", note: "both legs on pace" },
  { name: "Edge", legs: ["hit", "cold", "pre", "pre"], pace: "cold", note: "Ovi 0 SOG in 2nd" },
  { name: "Cappers · @bigmikepickz", legs: ["hit"], pace: "hit", note: "Under 228.5 cashed" },
  { name: "Cappers · Jim Turvey", legs: ["dead"], pace: "dead", note: "Brunson 4/6.5 AST" },
];

export const liveGames: LiveGame[] = [
  {
    id: "atl-nyk",
    league: "NBA",
    away: "ATL",
    home: "NYK",
    awayName: "Atlanta Hawks",
    homeName: "New York Knicks",
    awayScore: 88,
    homeScore: 91,
    clock: "Q3 4:12",
    pre: false,
    final: false,
    awaySide: TEAMS.ATL,
    homeSide: TEAMS.NYK,
    legs: [
      leg("Trae Young O7.5 AST", 9, 7.5, "AST", "hit", "THE HEIST", liveWhy.trae),
      leg("Trae Young O24.5 PTS", 18, 24.5, "PTS", "on", "@alexcaruso", liveWhy.traePts),
    ],
  },
  {
    id: "phi-cha",
    league: "NBA",
    away: "PHI",
    home: "CHA",
    awayName: "Philadelphia 76ers",
    homeName: "Charlotte Hornets",
    awayScore: 61,
    homeScore: 55,
    clock: "Half",
    pre: false,
    final: false,
    awaySide: TEAMS.PHI,
    homeSide: TEAMS.CHA,
    legs: [
      leg("Jared McCain O2.5 REB", 1, 2.5, "REB", "behind", "THE HEIST", liveWhy.mccain),
      leg("76ers −3.5", 6, 3.5, "margin", "on", "Parlay +100", liveWhy.spread),
    ],
  },
  {
    id: "mtl-wsh",
    league: "NHL",
    away: "MTL",
    home: "WSH",
    awayName: "Montréal Canadiens",
    homeName: "Washington Capitals",
    awayScore: 2,
    homeScore: 1,
    clock: "2nd 11:40",
    pre: false,
    final: false,
    awaySide: TEAMS.MTL,
    homeSide: TEAMS.WSH,
    legs: [
      leg("Nick Suzuki O0.5 AST", 1, 0.5, "AST", "hit", "Edge", liveWhy.suzuki),
      leg("Alex Ovechkin O3.5 SOG", 0, 3.5, "SOG", "cold", "Edge", liveWhy.ovi),
      leg("Under 6.5 goals", 3, 6.5, "goals", "on", "Safe +100", liveWhy.under),
    ],
  },
  {
    id: "bos-mil",
    league: "NBA",
    away: "BOS",
    home: "MIL",
    awayName: "Boston Celtics",
    homeName: "Milwaukee Bucks",
    awayScore: 112,
    homeScore: 104,
    clock: "Final",
    pre: false,
    final: true,
    awaySide: TEAMS.BOS,
    homeSide: TEAMS.MIL,
    legs: [
      leg("Celtics −0.5", 8, 0.5, "margin", "hit", "THE HEIST", liveWhy.celtics),
      leg("Under 228.5", 216, 228.5, "pts", "hit", "@bigmikepickz", liveWhy.total),
    ],
  },
  {
    id: "okc-den",
    league: "NBA",
    away: "OKC",
    home: "DEN",
    awayName: "Oklahoma City Thunder",
    homeName: "Denver Nuggets",
    awayScore: 0,
    homeScore: 0,
    clock: "Starts 9:30 PM",
    pre: true,
    final: false,
    awaySide: TEAMS.OKC,
    homeSide: TEAMS.DEN,
    legs: [leg("Jalen Williams O22.5 PTS", 0, 22.5, "PTS", "pre", "Edge", liveWhy.jalen)],
  },
  {
    id: "col-dal",
    league: "NHL",
    away: "COL",
    home: "DAL",
    awayName: "Colorado Avalanche",
    homeName: "Dallas Stars",
    awayScore: 0,
    homeScore: 0,
    clock: "Starts 9:00 PM",
    pre: true,
    final: false,
    awaySide: TEAMS.COL,
    homeSide: TEAMS.DAL,
    legs: [leg("★ Cale Makar O2.5 SOG", 0, 2.5, "SOG", "pre", "Edge", liveWhy.makar)],
  },
];

export const CARD_DATE = "Wednesday, Nov 4";
export const LIVE_UPDATED = "updated 8:44 PM";
export const LIVE_NOTE = "1 dead leg: Brunson O6.5 AST finished 4/6.5 (NYK–ATL early game). Dead legs stay listed.";
