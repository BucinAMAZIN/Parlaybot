/**
 * Cloudflare Worker source for ParlayBOT push.
 * Do not put VAPID private keys or subscription endpoints in this file.
 * Deploy only after the operator creates the account, KV namespace, and secrets.
 */
import { diffFeed, type AlertEvent, type Baseline } from "./diff.ts";
import { allowRate, corsHeaders, parseSubscription, type SubscriptionInput } from "./http.ts";
import { encryptPayload, vapidAuthorization } from "./webpush.ts";

type Env = {
  SUBS?: { get(key: string): Promise<string | null>; put(key: string, value: string): Promise<void>; delete(key: string): Promise<void> };
  DESK_URL?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
};

const DESK = "https://bucinamazin.github.io/desk-dashboard/parlay/data.json";
const MAX_SUBS = 200;
const hits = new Map<string, { n: number; reset: number }>();

type StoredSub = SubscriptionInput;

async function readJson<T>(env: Env, key: string): Promise<T | null> {
  const text = await env.SUBS?.get(key);
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function json(body: unknown, origin: string | null, status = 200): Response {
  const headers = corsHeaders(origin);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { status, headers });
}

function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") || "local";
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (!origin || !corsHeaders(origin).has("Access-Control-Allow-Origin")) return json({ ok: false }, origin, 403);
  const url = new URL(request.url);
  if (request.method !== "POST" || (url.pathname !== "/subscribe" && url.pathname !== "/unsubscribe")) return json({ ok: false }, origin, 404);
  if (!allowRate(hits, clientIp(request), Date.now())) return json({ ok: false }, origin, 429);
  const body = await request.text();
  const parsed = parseSubscription(body);
  if (!parsed) return json({ ok: false }, origin, 400);
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return json({ ok: false, delivery: "unavailable" }, origin, 503);
  const subs = (await readJson<StoredSub[]>(env, "subs")) ?? [];
  const rest = subs.filter((item) => item.endpoint !== parsed.endpoint);
  if (url.pathname === "/unsubscribe" || (!parsed.alerts.picks && !parsed.alerts.locks)) {
    await env.SUBS?.put("subs", JSON.stringify(rest));
    return json({ ok: true, delivery: "off" }, origin);
  }
  if (rest.length >= MAX_SUBS) return json({ ok: false }, origin, 429);
  await env.SUBS?.put("subs", JSON.stringify([...rest, parsed]));
  return json({ ok: true, delivery: "on" }, origin);
}

export async function handleSchedule(env: Env, fetchDesk: (url: string) => Promise<unknown> = defaultFetch): Promise<void> {
  if (!env.SUBS) return;
  const deskUrl = env.DESK_URL || DESK;
  let raw: unknown;
  try {
    raw = await fetchDesk(deskUrl);
  } catch {
    return;
  }
  const state = await readJson<Baseline>(env, "baseline");
  const { events, next } = diffFeed(state, raw);
  await env.SUBS.put("baseline", JSON.stringify(next));
  if (!events.length || !env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY || !env.VAPID_SUBJECT) return;
  const subs = (await readJson<StoredSub[]>(env, "subs")) ?? [];
  const keep: StoredSub[] = [];
  for (const sub of subs) {
    const mine = events.filter((event) => (event.kind === "pick" && sub.alerts.picks) || (event.kind === "lock" && sub.alerts.locks));
    if (!mine.length) {
      keep.push(sub);
      continue;
    }
    let expired = false;
    for (const event of mine) {
      const status = await sendOne(env, sub, event);
      if (status === 404 || status === 410) expired = true;
    }
    if (!expired) keep.push(sub);
  }
  await env.SUBS.put("subs", JSON.stringify(keep));
}

async function defaultFetch(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("desk");
  return response.json();
}

async function sendOne(env: Env, sub: StoredSub, event: AlertEvent): Promise<number> {
  if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY || !env.VAPID_SUBJECT) return 503;
  const payload = JSON.stringify({ title: event.title, body: event.body, url: event.url, tag: event.tag });
  if (payload.length > 800) return 400;
  try {
    const body = await encryptPayload(payload, sub.keys.p256dh, sub.keys.auth);
    const authorization = await vapidAuthorization(sub.endpoint, env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    const response = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: "86400",
      },
      body,
    });
    return response.status;
  } catch {
    return 503;
  }
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
  scheduled(_event: unknown, env: Env): Promise<void> {
    return handleSchedule(env);
  },
};
