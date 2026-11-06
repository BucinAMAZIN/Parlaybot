import type { Board } from "../data/board.ts";
import { sectionMatch } from "../data/gradeLabels.ts";
import type { Play, Ticket, WhyBlock } from "../data/types.ts";
import { esc, formatSigned } from "../lib/format.ts";
import { DK_MULTI_NOTE, hardRockSlipLink } from "../lib/links.ts";

/**
 * Layout-only specs for the two tickets that will replace Safe +100.
 * These are not data.json keys. The backend owns eligibility and will name
 * the feed fields later. Do not map Safe +100 grades onto either ticket.
 */
export const ALT_TICKET_SPECS = [
  {
    id: "alt-100",
    title: "Alt +100",
    target: "+100 to +150",
    legs: "2–3 legs",
    buildNote: "",
  },
  {
    id: "alt-250",
    title: "Alt +250",
    target: "+200 to +325",
    legs: "2–4 legs",
    buildNote: "Two legs are tried first.",
  },
] as const;

export const SAFE_RETIRED_ON = "Nov 6, 2026";

const EMPTY_WHY: WhyBlock = { ours: false, line: "", why: [], whyNot: [] };

const HR_A = "9100000000000000101";
const HR_B = "9100000000000000102";
const HR_C = "9100000000000000103";
const HR_D = "9100000000000000104";

function dkLink(sid: string): string {
  return `https://sportsbook.draftkings.com/event/9100100?outcomes=${encodeURIComponent(sid)}`;
}

function samplePlay(partial: Omit<Play, "why" | "source">): Play {
  return { ...partial, why: EMPTY_WHY, showWhy: false, source: "sample" };
}

function withSlip(ticket: Ticket): Ticket {
  const built = hardRockSlipLink(ticket.plays.map((play) => ({ id: play.id, name: play.name, hrSid: play.hrSid, hrLink: play.hrLink })));
  const dkReady = ticket.plays.filter((play) => play.dkSid && play.dkLink).length;
  return {
    ...ticket,
    hrSlip: built.status === "ready" ? built.url : undefined,
    slipLabel: built.status === "ready" ? "Whole ticket in Hard Rock" : undefined,
    slipNote: built.status === "ready" ? built.detail : undefined,
    dkSlipNote: dkReady > 1 ? DK_MULTI_NOTE : undefined,
  };
}

/** Preview cards only. Not added to the desk board or Today. */
export function altPreviewTickets(): Ticket[] {
  const both = (id: string, hrSid: string, dkSid: string, name: string): Play =>
    samplePlay({
      id,
      name,
      detail: "PREVIEW SAMPLE · not a posted play",
      sport: "NHL",
      hr: "−280",
      dk: "−275",
      hrSid,
      dkSid,
      dkLink: dkLink(dkSid),
      alt: { before: "Over 2.5 shots +110", after: "Over 1.5 shots −280" },
      altTag: true,
      books: { hr: true, dk: true },
      status: { label: "Active", reportedAt: "Sample", tone: "quiet" },
    });
  const hrOnly = samplePlay({
    id: "preview-alt100-b",
    name: "Sample leg B",
    detail: "PREVIEW SAMPLE · on Hard Rock, not on DraftKings",
    sport: "NBA",
    hr: "−310",
    dk: null,
    hrSid: HR_B,
    dkAbsent: true,
    books: { hr: true, dk: false },
    status: { label: "Questionable", reportedAt: "Sample", tone: "warn" },
  });
  const unverified = samplePlay({
    id: "preview-alt100-c",
    name: "Sample leg C",
    detail: "PREVIEW SAMPLE · availability note, not a verified slip leg",
    sport: "NHL",
    hr: "−250",
    dk: "−250",
    hrUnverified: "Unverified HR link — held",
    dkSid: "0QAPREVIEWSAMPLE100C",
    dkLink: dkLink("0QAPREVIEWSAMPLE100C"),
    books: { hr: false, dk: true },
    slip: false,
  });
  const plus100 = withSlip({
    id: "preview-alt-100",
    productKey: "preview-alt-100",
    title: "Alt +100",
    meta: "PREVIEW SAMPLE · target +100 to +150 · 2–3 legs",
    badge: "fixture",
    share: false,
    group: "official",
    stamp: "Sample legs for layout only. Not today's board.",
    warnings: ["No +500 ticket. This card is not wired to the feed."],
    rules: [
      "Layout preview for Alt +100.",
      "Target price is +100 to +150.",
      "The ticket holds 2–3 legs.",
      "Sample legs are not posted plays. Eligibility stays on the backend.",
    ],
    plays: [both("preview-alt100-a", HR_A, "0QAPREVIEWSAMPLE100A", "Sample leg A"), hrOnly, unverified],
  });
  const plus250 = withSlip({
    id: "preview-alt-250",
    productKey: "preview-alt-250",
    title: "Alt +250",
    meta: "PREVIEW SAMPLE · target +200 to +325 · 2–4 legs",
    badge: "fixture",
    share: false,
    group: "official",
    stamp: "Sample legs for layout only. Not today's board.",
    warnings: ["Two legs are tried first. Legs 3 and 4 are not filled in with sample picks.", "No +500 ticket. This card is not wired to the feed."],
    rules: [
      "Layout preview for Alt +250.",
      "Target price is +200 to +325.",
      "The ticket holds 2–4 legs. Two legs are tried first.",
      "Sample legs are not posted plays. Eligibility stays on the backend.",
    ],
    plays: [
      both("preview-alt250-a", HR_C, "0QAPREVIEWSAMPLE250A", "Sample leg A"),
      both("preview-alt250-b", HR_D, "0QAPREVIEWSAMPLE250B", "Sample leg B"),
    ],
  });
  return [plus100, plus250];
}

export function findAltPreviewPlay(id: string): Play | undefined {
  for (const ticket of altPreviewTickets()) {
    const play = ticket.plays.find((item) => item.id === id);
    if (play) return play;
  }
  return undefined;
}

export function findAltPreviewTicket(id: string): Ticket | undefined {
  return altPreviewTickets().find((ticket) => ticket.id === id);
}

function recordShell(title: string, tone: string, body: string): string {
  return `<section class="ticket ${tone}"><header><div><h3>${esc(title)}</h3></div></header>${body}</section>`;
}

function safeHistory(board: Board): string {
  const rows = board.grades.filter((grade) => sectionMatch(grade, "safe")).slice().sort((a, b) => b.date.localeCompare(a.date));
  const shown = rows.slice(0, 8);
  const list = shown.length
    ? shown
        .map((row) => {
          const units = `${formatSigned(row.units, 2)}u`;
          const name = row.play || row.detail || row.prop || "Graded play";
          return `<article class="hit"><span class="res ${row.win ? "W" : "L"}">${row.win ? "Won" : "Lost"}</span><div><b>${esc(name)}</b><div class="sub">${esc(row.date)} · Safe +100 · ${esc(units)}</div></div></article>`;
        })
        .join("")
    : `<p class="empty">No Safe +100 grades in this file.</p>`;
  const more = rows.length > shown.length ? `<p class="sub">Showing ${shown.length} of ${rows.length} Safe +100 grades.</p>` : "";
  return recordShell(
    "Safe +100",
    "retired",
    `<p class="stamp">Retired ${esc(SAFE_RETIRED_ON)}</p><p class="sub">This history stays on Safe +100. It is not the Alt +100 record and it is not the Alt +250 record.</p>${list}${more}`,
  );
}

function waitingRecord(spec: (typeof ALT_TICKET_SPECS)[number]): string {
  const note = spec.buildNote ? ` ${spec.buildNote}` : "";
  return recordShell(
    spec.title,
    "recordwait",
    `<p class="stamp">Record not wired</p><div class="altband"><span>${esc(spec.target)}</span><span>${esc(spec.legs)}</span></div><p class="sub">Waiting for the feed schema.${esc(note)} Safe +100 grades are not copied here. No record is filled in.</p><p class="empty">No graded ticket yet.</p>`,
  );
}

export function altRecordLayout(board: Board): string {
  return `<h2 class="grouph">Records</h2><p class="sub">Three separate records. Safe +100 stays visible after it retires. The new tickets do not inherit that record.</p>${safeHistory(board)}${ALT_TICKET_SPECS.map(waitingRecord).join("")}`;
}
