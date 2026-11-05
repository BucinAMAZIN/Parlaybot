/** Last successful data.json, under a ParlayBOT storage key. */

const KEY = "parlaybot-desk";

export type DeskCache = { savedAt: string; raw: unknown };

export function readDeskCache(): DeskCache | null {
  try {
    const text = localStorage.getItem(KEY);
    if (!text) return null;
    const parsed = JSON.parse(text) as DeskCache;
    if (!parsed || typeof parsed.savedAt !== "string" || parsed.raw == null || typeof parsed.raw !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeDeskCache(raw: unknown, savedAt: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ savedAt, raw }));
  } catch {
    /* the copy stays in memory when storage is full */
  }
}

export function cacheClock(iso: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "";
  const text = when.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${text} ET`;
}

export function offlineBanner(savedAt: string | null): string {
  const when = savedAt ? cacheClock(savedAt) : "";
  return when ? `Can't reach your data, retrying… Last copy ${when}.` : "Can't reach your data, retrying…";
}
