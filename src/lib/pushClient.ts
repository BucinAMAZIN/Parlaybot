export type PushKind = "picks" | "locks";
export type PushDelivery = "unknown" | "on" | "off" | "unsupported" | "standalone" | "denied" | "unavailable";

export const PUSH_PUBLIC_KEY = import.meta.env.VITE_PUSH_PUBLIC_KEY || "";
export const PUSH_URL = import.meta.env.VITE_PUSH_URL || "";

type Want = { picks: boolean; locks: boolean };

function scope(): string {
  return import.meta.env.BASE_URL || "/";
}

export function pushEnvironment(): "ok" | "unsupported" | "standalone" {
  if (!window.isSecureContext || !("serviceWorker" in navigator)) return "unsupported";
  const standalone = window.matchMedia("(display-mode: standalone)").matches || ("standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true);
  if (!("Notification" in window) || !("PushManager" in window)) return standalone ? "unsupported" : "standalone";
  return "ok";
}

function keyBytes(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded + "===".slice((padded.length + 3) % 4));
  const out = new ArrayBuffer(bin.length);
  const bytes = new Uint8Array(out);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return out;
}

export async function readPushDelivery(want: Want, ack: boolean): Promise<PushDelivery> {
  const env = pushEnvironment();
  if (env !== "ok") return env;
  if (Notification.permission === "denied") return "denied";
  if (!PUSH_PUBLIC_KEY || !PUSH_URL) return "unavailable";
  if (!want.picks && !want.locks) return "off";
  const registration = await navigator.serviceWorker.getRegistration(scope());
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription || !ack) return "off";
  return "on";
}

export async function subscribePush(want: Want): Promise<{ delivery: PushDelivery; ack: boolean }> {
  const env = pushEnvironment();
  if (env !== "ok") return { delivery: env, ack: false };
  if (!PUSH_PUBLIC_KEY || !PUSH_URL) return { delivery: "unavailable", ack: false };
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { delivery: "denied", ack: false };
  if (!want.picks && !want.locks) return disablePush();
  const registration = await navigator.serviceWorker.register(`${scope()}sw.js`, { scope: scope() });
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUSH_PUBLIC_KEY) }));
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
  if (subscription && PUSH_URL) {
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
