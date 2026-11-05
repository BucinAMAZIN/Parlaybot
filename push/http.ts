/** Request checks for the push worker. No subscription secrets are logged. */

export const ALLOWED_ORIGINS = new Set([
  "https://bucinamazin.github.io",
  "http://localhost:4173",
  "http://localhost:5173",
]);

const ENDPOINT_HOST = /\.push\.apple\.com$|\.googleapis\.com$|\.mozilla\.com$|\.mozaws\.net$/i;

export type Alerts = { picks: boolean; locks: boolean };

export type SubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  alerts: Alerts;
};

export function corsHeaders(origin: string | null): Headers {
  const headers = new Headers();
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
  }
  return headers;
}

function b64url(value: string): boolean {
  return value.length >= 16 && value.length <= 200 && /^[A-Za-z0-9_-]+$/.test(value);
}

export function parseSubscription(body: string): SubscriptionInput | null {
  if (body.length > 4096) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;
  const endpoint = record.endpoint;
  const keys = record.keys;
  const alerts = record.alerts;
  if (typeof endpoint !== "string" || endpoint.length > 500) return null;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || !ENDPOINT_HOST.test(url.hostname)) return null;
  if (!keys || typeof keys !== "object") return null;
  const keyRecord = keys as Record<string, unknown>;
  if (typeof keyRecord.p256dh !== "string" || typeof keyRecord.auth !== "string") return null;
  if (!b64url(keyRecord.p256dh) || !b64url(keyRecord.auth)) return null;
  if (!alerts || typeof alerts !== "object") return null;
  const alertRecord = alerts as Record<string, unknown>;
  if (typeof alertRecord.picks !== "boolean" || typeof alertRecord.locks !== "boolean") return null;
  return {
    endpoint,
    keys: { p256dh: keyRecord.p256dh, auth: keyRecord.auth },
    alerts: { picks: alertRecord.picks, locks: alertRecord.locks },
  };
}

export function allowRate(hits: Map<string, { n: number; reset: number }>, ip: string, now: number): boolean {
  const row = hits.get(ip);
  if (!row || now > row.reset) {
    hits.set(ip, { n: 1, reset: now + 60 * 60 * 1000 });
    return true;
  }
  row.n += 1;
  return row.n <= 20;
}
