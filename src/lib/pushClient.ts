export type PushKind = "picks" | "locks";
export type PushDelivery = "unknown" | "on" | "off" | "unsupported" | "standalone" | "denied" | "unavailable";

export const DEFAULT_PUSH_PUBLIC_KEY = "BKeQLo-ZG4jIvM9Jb4vFUVTV80i4gN1xgNyYWytAtiCus45KVbsRAlR42SKAGR1sRRwQL8HL-86HdZDPdrGBu8w";
export const DEFAULT_NTFY_TOPIC_URL = "https://ntfy.sh/parlaydesk-subs-b6deb43b1b7c16b4";

function vite(name: "VITE_PUSH_PUBLIC_KEY" | "VITE_PUSH_URL" | "VITE_PUSH_NTFY_URL" | "BASE_URL"): string {
  try {
    const value = {
      VITE_PUSH_PUBLIC_KEY: import.meta.env.VITE_PUSH_PUBLIC_KEY,
      VITE_PUSH_URL: import.meta.env.VITE_PUSH_URL,
      VITE_PUSH_NTFY_URL: import.meta.env.VITE_PUSH_NTFY_URL,
      BASE_URL: import.meta.env.BASE_URL,
    }[name];
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

export const PUSH_PUBLIC_KEY = vite("VITE_PUSH_PUBLIC_KEY") || DEFAULT_PUSH_PUBLIC_KEY;
export const PUSH_URL = vite("VITE_PUSH_URL") || "";
export const NTFY_TOPIC_URL = vite("VITE_PUSH_NTFY_URL") || DEFAULT_NTFY_TOPIC_URL;

type Want = { picks: boolean; locks: boolean };

function scope(): string {
  return vite("BASE_URL") || "/";
}

export function pushEnvironment(): "ok" | "unsupported" | "standalone" {
  if (!window.isSecureContext || !("serviceWorker" in navigator)) return "unsupported";
  const standalone = window.matchMedia("(display-mode: standalone)").matches || ("standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true);
  if (!("Notification" in window) || !("PushManager" in window)) return standalone ? "unsupported" : "standalone";
  return "ok";
}

export function keyBytes(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded + "===".slice((padded.length + 3) % 4));
  const out = new ArrayBuffer(bin.length);
  const bytes = new Uint8Array(out);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return out;
}

export function ntfySubBody(sub: unknown, ua: string, t: number) {
  return { sub, ua, app: "parlaybot", t };
}

export function ntfyUnsubBody(endpoint: string, t: number) {
  return { unsub: endpoint, t };
}

/** Notification tap target. Red-zone and TD tags open Live. Finals and tickets open Results. */
export function alertRoute(tag: string): "#live" | "#results" | "#today" {
  if (/^(rz|td)/i.test(tag)) return "#live";
  if (/^(final|ticket|spr|ut)/i.test(tag)) return "#results";
  return "#today";
}

function relayReady(): boolean {
  return !!PUSH_PUBLIC_KEY && (!!PUSH_URL || !!NTFY_TOPIC_URL);
}

async function postNtfy(body: unknown): Promise<boolean> {
  const response = await fetch(NTFY_TOPIC_URL, { method: "POST", body: JSON.stringify(body) });
  return response.ok;
}

function sameKey(subscription: PushSubscription, publicKey: string): boolean {
  const raw = subscription.options?.applicationServerKey;
  if (!raw) return true;
  const have = new Uint8Array(raw);
  const want = new Uint8Array(keyBytes(publicKey));
  if (have.length !== want.length) return false;
  return have.every((byte, index) => byte === want[index]);
}

async function freshSubscription(registration: ServiceWorkerRegistration): Promise<PushSubscription> {
  const existing = await registration.pushManager.getSubscription();
  if (existing && !sameKey(existing, PUSH_PUBLIC_KEY)) await existing.unsubscribe();
  const current = await registration.pushManager.getSubscription();
  if (current) return current;
  return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUSH_PUBLIC_KEY) });
}

export async function readPushDelivery(want: Want, ack: boolean): Promise<PushDelivery> {
  const env = pushEnvironment();
  if (env !== "ok") return env;
  if (Notification.permission === "denied") return "denied";
  if (!relayReady()) return "unavailable";
  if (!want.picks && !want.locks) return "off";
  const registration = await navigator.serviceWorker.getRegistration(scope());
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription || !ack) return "off";
  return "on";
}

export async function subscribePush(want: Want): Promise<{ delivery: PushDelivery; ack: boolean }> {
  const env = pushEnvironment();
  if (env !== "ok") return { delivery: env, ack: false };
  if (!relayReady()) return { delivery: "unavailable", ack: false };
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { delivery: "denied", ack: false };
  if (!want.picks && !want.locks) return disablePush();
  const registration = await navigator.serviceWorker.register(`${scope()}sw.js`, { scope: scope() });
  await navigator.serviceWorker.ready;
  const subscription = await freshSubscription(registration);
  if (!PUSH_URL) {
    const ok = await postNtfy(ntfySubBody(subscription.toJSON(), navigator.userAgent, Date.now())).catch(() => false);
    if (!ok) return { delivery: "unavailable", ack: false };
    return { delivery: "on", ack: true };
  }
  const response = await fetch(`${PUSH_URL.replace(/\/$/, "")}/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint, keys: subscription.toJSON().keys, alerts: want }),
  });
  if (!response.ok) return { delivery: "unavailable", ack: false };
  return { delivery: "on", ack: true };
}

export async function disablePush(): Promise<{ delivery: PushDelivery; ack: boolean }> {
  const registration = await navigator.serviceWorker.getRegistration(scope());
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription && !PUSH_URL) {
    await postNtfy(ntfyUnsubBody(subscription.endpoint, Date.now())).catch(() => false);
    await subscription.unsubscribe();
  } else if (subscription && PUSH_URL) {
    await fetch(`${PUSH_URL.replace(/\/$/, "")}/unsubscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        keys: subscription.toJSON().keys ?? { p256dh: "aaaaaaaaaaaaaaaaaaaa", auth: "aaaaaaaaaaaaaaaaaaaa" },
        alerts: { picks: false, locks: false },
      }),
    }).catch(() => undefined);
    await subscription.unsubscribe();
  }
  return { delivery: "off", ack: false };
}

/** Re-post the current subscription so the relay can send its confirmation alert. */
export async function resyncPush(): Promise<boolean> {
  const registration = await navigator.serviceWorker.ready.catch(() => navigator.serviceWorker.getRegistration(scope()));
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return false;
  if (!PUSH_URL) return postNtfy(ntfySubBody(subscription.toJSON(), navigator.userAgent, Date.now())).catch(() => false);
  const response = await fetch(`${PUSH_URL.replace(/\/$/, "")}/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint, keys: subscription.toJSON().keys, alerts: { picks: true, locks: true } }),
  }).catch(() => null);
  return !!response?.ok;
}
