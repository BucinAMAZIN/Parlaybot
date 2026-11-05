/** Times already stored on the desk file, shown in Eastern Time. Missing fields stay hidden. */

const ET = "America/New_York";

function isRow(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function formatHour(hour24: number, minute: number): string | null {
  if (hour24 < 0 || hour24 > 23 || minute < 0 || minute > 59) return null;
  const suffix = hour24 < 12 ? "AM" : "PM";
  let hour = hour24 % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${String(minute).padStart(2, "0")} ${suffix} ET`;
}

function formatInstant(ms: number): string | null {
  if (!Number.isFinite(ms)) return null;
  const when = new Date(ms);
  if (Number.isNaN(when.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h12",
  }).formatToParts(when);
  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;
  const day = parts.find((part) => part.type === "dayPeriod")?.value?.toUpperCase();
  if (!hour || !minute || (day !== "AM" && day !== "PM")) return null;
  return `${Number(hour)}:${minute} ${day} ET`;
}

function epochMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value > 1e12 ? value : value * 1000;
  if (typeof value === "string" && /^\d{9,}(\.\d+)?$/.test(value.trim())) return epochMs(Number(value.trim()));
  return null;
}

/** A clock already on the payload, normalized to 'h:mm AM ET'. */
export function clockEt(value: unknown): string | null {
  const instant = epochMs(value);
  if (instant != null) return formatInstant(instant);
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    const ms = Date.parse(text);
    if (!Number.isNaN(ms)) return formatInstant(ms);
  }
  const meridiem = text.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\b/i);
  if (meridiem) {
    let hour = Number(meridiem[1]) % 12;
    if (meridiem[3].toUpperCase() === "PM") hour += 12;
    return formatHour(hour, Number(meridiem[2]));
  }
  const plain = text.match(/\b(\d{1,2}):(\d{2})\b/);
  if (!plain) return null;
  return formatHour(Number(plain[1]), Number(plain[2]));
}

export function updatedLabel(generated: unknown, now = Date.now()): { text: string; stale: boolean } | null {
  const clock = clockEt(generated);
  if (!clock) return null;
  const ms = epochMs(generated);
  let stale = false;
  if (ms != null) {
    const hour = Number(
      new Intl.DateTimeFormat("en-US", { timeZone: ET, hour: "numeric", hourCycle: "h23" }).format(new Date(now)),
    );
    const duringDay = hour >= 7 && hour < 22;
    stale = duringDay && now - ms > 90 * 60 * 1000;
  }
  return { text: `Updated ${clock}`, stale };
}

/** Heist is Building until `heist.final` carries a time. Absent heist object stays hidden. */
export function heistLabel(heist: unknown): string | null {
  if (!isRow(heist)) return null;
  const final = heist.final;
  if (final == null || final === false || final === "") return "Building…";
  if (final === true) return "Final";
  const clock = clockEt(final);
  return clock ? `Final ${clock}` : "Final";
}

export function builtLabel(section: unknown): string | null {
  if (!isRow(section) || !("built" in section)) return null;
  const clock = clockEt(section.built);
  return clock ? `Built ${clock}` : null;
}

export function injuryLabel(late: unknown): string | null {
  if (!isRow(late)) return null;
  const clock = clockEt(late.checked_et);
  if (!clock) return null;
  const stage = typeof late.stage === "string" ? late.stage.trim() : "";
  return stage ? `Injury check ${clock} · ${stage}` : `Injury check ${clock}`;
}

export function lockLabel(lock: unknown): string | null {
  if (!isRow(lock)) return null;
  const clock = clockEt(lock.checked_et);
  return clock ? `Lock check ${clock}` : null;
}

export function dkLabel(dk: unknown): string | null {
  if (!isRow(dk)) return null;
  const clock = clockEt(dk.fetched);
  return clock ? `DK prices ${clock}` : null;
}

export function standingsLabel(standings: unknown): string | null {
  if (!isRow(standings)) return null;
  const clock = clockEt(standings.updated);
  return clock ? `Updated ${clock}` : null;
}

export function uiBuildLabel(value: unknown): string | null {
  if (value == null || value === "") return null;
  const clock = clockEt(value);
  if (clock) return `UI build · ${clock}`;
  return typeof value === "string" && value.trim() ? `UI build · ${value.trim()}` : null;
}
