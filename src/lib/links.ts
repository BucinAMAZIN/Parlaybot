/**
 * Sportsbook link builder.
 *
 * Legs are chosen on Hard Rock. DraftKings only re-prices a leg the feed already has.
 * This file is the only place that turns a play into a URL.
 *
 * TODO(hr): Confirm the Hard Rock Bet URL scheme. The edge-picks fixture carries
 * `hr_event` (event id) and `pin_id`, and the approved mockups render "Open in Hard Rock"
 * with no href. No host or path template was in the design bundle. Do not guess a host.
 *
 * TODO(dk-leg): Confirm the single-leg DraftKings URL. Florida DK Predictions prices
 * are a label in the card, not a link template.
 *
 * TODO(dk-slip): VISION.md says a DK "open selected" path (via dk.html) went live Nov 4.
 * The URL pattern was not in this bundle. Keep the slip builder separate from the
 * single-leg builder so one can be replaced without the other. Until that pattern is
 * confirmed, DK may need to open one leg at a time — this builder still describes the
 * whole selection in one result instead of dropping legs.
 */

export type LinkPlay = {
  id: string;
  name: string;
  hrEvent?: string;
  pinId?: number;
};

export type BuiltLink =
  | { status: "ready"; url: string }
  | { status: "todo"; detail: string };

function ids(plays: LinkPlay[]): string {
  if (!plays.length) return "no plays";
  return plays
    .map((play) => {
      const event = play.hrEvent ? `hr_event=${play.hrEvent}` : `id=${play.id}`;
      const pin = play.pinId != null ? ` pin_id=${play.pinId}` : "";
      return `${play.name} (${event}${pin})`;
    })
    .join("; ");
}

export function hardRockLegLink(play: LinkPlay): BuiltLink {
  return {
    status: "todo",
    detail: `Hard Rock link format is not confirmed yet. ${ids([play])}. See src/lib/links.ts.`,
  };
}

export function hardRockSlipLink(plays: LinkPlay[]): BuiltLink {
  return {
    status: "todo",
    detail: `Hard Rock multi-leg link format is not confirmed yet. One slip, ${plays.length} play${plays.length === 1 ? "" : "s"}: ${ids(plays)}. See src/lib/links.ts.`,
  };
}

export function draftKingsLegLink(play: LinkPlay): BuiltLink {
  return {
    status: "todo",
    detail: `DraftKings leg link format is not confirmed yet. ${ids([play])}. See src/lib/links.ts.`,
  };
}

export function draftKingsSlipLink(plays: LinkPlay[]): BuiltLink {
  return {
    status: "todo",
    detail: `DraftKings multi-leg link (dk.html) is not confirmed yet. One slip, ${plays.length} play${plays.length === 1 ? "" : "s"}: ${ids(plays)}. See src/lib/links.ts.`,
  };
}
