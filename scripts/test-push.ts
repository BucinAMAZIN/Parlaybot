import assert from "node:assert/strict";
import { diffFeed, payloadIsPrivate, type Baseline } from "../push/diff.ts";
import { allowRate, parseSubscription } from "../push/http.ts";
import { handleRequest, handleSchedule } from "../push/worker.ts";

const desk = {
  today: { date: "2026-11-05", tickets: [] },
  heist: { final: false, legs: [{ player: "Franz Wagner", market: "Points", hr_sid: "111122223333", odds: "+525" }] },
  edge: { picks: [] },
  cappers: [{ name: "@austinsprops", today: [{ player: "Stephen Curry", market: "Assists", hr_sid: "999888777666", odds: "-110" }] }],
  first_blood: { date: "2026-11-05", final: false, legs: [] },
};

const first = diffFeed(null, desk);
assert.equal(first.events.length, 0);
assert.equal(first.next.bootstrapped, true);
assert.ok(first.next.picks.includes("hr:111122223333"));
assert.equal(first.next.locks["ticket:heist"], false);

const reordered = diffFeed(first.next, {
  ...desk,
  heist: { final: false, legs: [{ odds: "+400", hr_sid: "111122223333", market: "Points", player: "Franz Wagner" }] },
  cappers: [{ name: "@austinsprops", today: [{ odds: "-105", market: "Assists", player: "Stephen Curry", hr_sid: "999888777666" }] }],
});
assert.equal(reordered.events.length, 0);

const priced = diffFeed(first.next, {
  ...desk,
  heist: { final: false, legs: [{ player: "Franz Wagner", market: "Points", hr_sid: "111122223333", odds: "-150" }] },
});
assert.equal(priced.events.length, 0);

const added = diffFeed(priced.next, {
  ...desk,
  edge: { picks: [{ player: "Cale Makar", market: "SOG", hr_sid: "555444333222" }] },
});
assert.equal(added.events.length, 1);
assert.equal(added.events[0].kind, "pick");
assert.equal(added.events[0].title, "New pick");
assert.match(added.events[0].body, /Cale Makar/);
assert.equal(payloadIsPrivate(added.events[0]), false);
const again = diffFeed(added.next, {
  ...desk,
  edge: { picks: [{ player: "Cale Makar", market: "SOG", hr_sid: "555444333222" }] },
});
assert.equal(again.events.length, 0);

const locked = diffFeed(again.next, { ...desk, heist: { ...desk.heist, final: true } });
assert.equal(locked.events.length, 1);
assert.equal(locked.events[0].kind, "lock");
assert.equal(locked.events[0].body, "THE HEIST");
assert.equal(payloadIsPrivate(locked.events[0]), false);
assert.equal(diffFeed(locked.next, { ...desk, heist: { ...desk.heist, final: true } }).events.length, 0);

const capper = diffFeed(locked.next, {
  ...desk,
  heist: { ...desk.heist, final: true },
  cappers: [{ name: "@panpotd", today: [{ player: "Josh Hart", prop: "Rebounds", hr_sid: "121212121212" }] }],
});
assert.equal(capper.events.length, 1);
assert.match(capper.events[0].body, /Josh Hart/);
assert.equal(payloadIsPrivate(capper.events[0]), false);

const already: Baseline = { bootstrapped: true, picks: [], locks: { "ticket:first": true }, sent: [] };
assert.equal(diffFeed(already, { ...desk, first_blood: { date: "2026-11-05", final: true, full_locked: true, legs: [] } }).events.filter((event) => event.kind === "lock").length, 0);

assert.equal(parseSubscription("not json"), null);
assert.equal(parseSubscription(JSON.stringify({ endpoint: "http://evil.test", keys: { p256dh: "a".repeat(20), auth: "b".repeat(20) }, alerts: { picks: true, locks: false } })), null);
const ok = parseSubscription(JSON.stringify({
  endpoint: "https://web.push.apple.com/test-endpoint",
  keys: { p256dh: "A".repeat(80), auth: "B".repeat(20) },
  alerts: { picks: true, locks: true },
}));
assert.ok(ok);
assert.equal(parseSubscription(`${JSON.stringify(ok)}${"x".repeat(5000)}`), null);

const hits = new Map<string, { n: number; reset: number }>();
for (let i = 0; i < 20; i++) assert.equal(allowRate(hits, "1.2.3.4", 1_000), true);
assert.equal(allowRate(hits, "1.2.3.4", 1_000), false);

function memoryStore() {
  const data = new Map<string, string>();
  return {
    async get(key: string) { return data.get(key) ?? null; },
    async put(key: string, value: string) { data.set(key, value); },
    async delete(key: string) { data.delete(key); },
  };
}

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
const jwk = await crypto.subtle.exportKey("jwk", keys.privateKey);
const pub = new Uint8Array(await crypto.subtle.exportKey("raw", keys.publicKey));
const publicKey = b64url(pub);
const privateKey = jwk.d || "";
const subscriber = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
const subscriberPub = b64url(new Uint8Array(await crypto.subtle.exportKey("raw", subscriber.publicKey)));
const auth = b64url(crypto.getRandomValues(new Uint8Array(16)));
const sub = {
  endpoint: "https://example.push.apple.com/device",
  keys: { p256dh: subscriberPub, auth },
  alerts: { picks: true, locks: true },
};

const store = memoryStore();
await store.put("subs", JSON.stringify([sub]));
const env = { SUBS: store, VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey, VAPID_SUBJECT: "mailto:alerts@example.com" };
const calls: Array<{ url: string; headers: Headers; body: Uint8Array }> = [];
const original = globalThis.fetch;
let status = 201;
globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  calls.push({ url: request.url, headers: request.headers, body: new Uint8Array(await request.arrayBuffer()) });
  return new Response(null, { status });
};
try {
  await handleSchedule(env, async () => desk);
  assert.equal(calls.length, 0);
  const baseline = JSON.parse((await store.get("baseline")) || "{}") as Baseline;
  assert.equal(baseline.bootstrapped, true);
  await handleSchedule(env, async () => ({ ...desk, edge: { picks: [{ player: "Cale Makar", market: "SOG", hr_sid: "555444333222" }] } }));
  assert.equal(calls.length, 1);
  assert.match(calls[0].headers.get("Authorization") || "", /^vapid t=/);
  assert.equal(calls[0].headers.get("Content-Encoding"), "aes128gcm");
  assert.equal(Buffer.from(calls[0].body).toString("utf8").includes("Cale Makar"), false);
  assert.equal(calls[0].headers.get("Authorization")?.includes(privateKey), false);
  await handleSchedule(env, async () => ({ ...desk, edge: { picks: [{ player: "Cale Makar", market: "SOG", hr_sid: "555444333222" }] } }));
  assert.equal(calls.length, 1);
  status = 410;
  await handleSchedule(env, async () => ({ ...desk, heist: { ...desk.heist, final: true }, edge: { picks: [{ player: "Cale Makar", market: "SOG", hr_sid: "555444333222" }] } }));
  assert.equal(calls.length, 2);
  assert.equal(JSON.parse((await store.get("subs")) || "[]").length, 0);
} finally {
  globalThis.fetch = original;
}

const bare = memoryStore();
await handleSchedule({ SUBS: bare }, async () => desk);
const bareBase = JSON.parse((await bare.get("baseline")) || "{}") as Baseline;
assert.equal(bareBase.bootstrapped, true);
assert.ok(bareBase.picks.includes("hr:111122223333"));

const denied = await handleRequest(new Request("https://push.example/subscribe", {
  method: "POST",
  headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
  body: "{}",
}), env);
assert.equal(denied.status, 403);
const pending = await handleRequest(new Request("https://push.example/subscribe", {
  method: "POST",
  headers: { Origin: "https://bucinamazin.github.io", "Content-Type": "application/json" },
  body: JSON.stringify(sub),
}), { SUBS: memoryStore() });
assert.equal(pending.status, 503);
assert.equal((await pending.json()).delivery, "unavailable");

console.log("push tests ok");
