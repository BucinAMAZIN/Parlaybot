/**
 * Sportsbook link builder. This is the only place that turns a play into a URL.
 *
 * Formats are the ones the live desk uses at
 * https://bucinamazin.github.io/desk-dashboard/parlay/ (read from that page, not changed there).
 *
 * Hard Rock, single and multi-leg, from HRB / HRBAR / HRTK0:
 *   https://share.hardrock.bet/Pt0T/bet?deep_link_value=hardrock://betslip/{sid}
 *   several legs: the same URL with sids joined by commas.
 *   A link is only built from a numeric hr_sid, or from an hr_link on that host.
 *
 * DraftKings single, from DKB (phone-tested web link):
 *   https://sportsbook.draftkings.com/event/{eventId}?outcomes={encodeURIComponent(dk_sid)}
 *   dk_sid matches 0QA… and the stored dk_link must end with outcomes= that encoding.
 *
 * DraftKings multi-leg on that page is dk.html?ids=a+b, which opens
 * dksb://sb/addbet/<id>+<id>. Two-leg links did not open on the phone, so this
 * builder does not emit that URL. Two or more DK legs come back as separate
 * single-leg links plus a note. A play with no id is not given a link.
 */

export type LinkPlay = {
  id: string;
  name: string;
  hrSid?: string;
  hrLink?: string;
  dkSid?: string;
  dkLink?: string;
};

export type BuiltLink =
  | { status: "ready"; url: string; detail?: string }
  | { status: "legs"; urls: { name: string; url: string }[]; detail: string }
  | { status: "missing"; detail: string };

const HR_ORIGIN = "https://share.hardrock.bet/";
const HR_SLIP = "https://share.hardrock.bet/Pt0T/bet?deep_link_value=hardrock://betslip/";
const DK_LINK = /^https:\/\/sportsbook\.draftkings\.com\/event\/\d+\?outcomes=[\w%.-]+$/;
const DK_SID = /^0QA[0-9A-Za-z#_-]+$/;

export const DK_MULTI_NOTE =
  "DraftKings two-leg links (dk.html to dksb://sb/addbet) did not open on this phone, so each leg opens on its own. DK slip keeps earlier picks, so clear it first.";

function hrSidOf(play: LinkPlay): string {
  if (play.hrSid && /^\d+$/.test(play.hrSid)) return play.hrSid;
  const link = play.hrLink ?? "";
  if (!link.startsWith(HR_ORIGIN)) return "";
  const match = /betslip\/([\d,]+)$/.exec(link);
  if (!match || match[1].includes(",")) return "";
  return match[1];
}

function hrUrl(sid: string): string {
  return `${HR_SLIP}${sid}`;
}

export function hardRockLegLink(play: LinkPlay): BuiltLink {
  const sid = hrSidOf(play);
  if (!sid) return { status: "missing", detail: `Not on HR. ${play.name} has no Hard Rock selection id.` };
  const stored = play.hrLink ?? "";
  if (stored.startsWith(HR_ORIGIN) && stored.endsWith(`/betslip/${sid}`)) return { status: "ready", url: stored };
  return { status: "ready", url: hrUrl(sid) };
}

export function hardRockSlipLink(plays: LinkPlay[]): BuiltLink {
  const sids: string[] = [];
  const missing: string[] = [];
  for (const play of plays) {
    const sid = hrSidOf(play);
    if (!sid) missing.push(play.name);
    else if (!sids.includes(sid)) sids.push(sid);
  }
  if (!sids.length) return { status: "missing", detail: "Not on HR. None of these plays have a Hard Rock selection id." };
  const url = hrUrl(sids.join(","));
  if (missing.length) return { status: "ready", url, detail: `Not on HR: ${missing.join(", ")}.` };
  return { status: "ready", url };
}

function dkUrl(play: LinkPlay): string {
  const sid = play.dkSid ?? "";
  const link = play.dkLink ?? "";
  if (!DK_SID.test(sid) || !DK_LINK.test(link)) return "";
  if (!link.endsWith(`outcomes=${encodeURIComponent(sid)}`)) return "";
  return link;
}

export function draftKingsLegLink(play: LinkPlay): BuiltLink {
  const url = dkUrl(play);
  if (!url) return { status: "missing", detail: `Not on DK. ${play.name} has no DraftKings Predictions id.` };
  return { status: "ready", url };
}

export function draftKingsSlipLink(plays: LinkPlay[]): BuiltLink {
  const urls: { name: string; url: string }[] = [];
  const missing: string[] = [];
  for (const play of plays) {
    const built = draftKingsLegLink(play);
    if (built.status === "ready") urls.push({ name: play.name, url: built.url });
    else missing.push(play.name);
  }
  if (!urls.length) return { status: "missing", detail: "Not on DK. None of these plays have a DraftKings Predictions id." };
  if (urls.length === 1 && !missing.length) return { status: "ready", url: urls[0].url };
  const skipped = missing.length ? ` Not on DK: ${missing.join(", ")}.` : "";
  return { status: "legs", urls, detail: `${DK_MULTI_NOTE}${skipped}` };
}
