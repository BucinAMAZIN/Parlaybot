/** Web Push request builder. The private key is an argument, never stored here. */

function bytesToB64url(bytes: Uint8Array): string {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded + "===".slice((padded.length + 3) % 4));
  return Uint8Array.from(bin, (char) => char.charCodeAt(0));
}

function concat(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, data));
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const prk = await hmac(salt, ikm);
  const okm = await hmac(prk, concat([info, new Uint8Array([1])]));
  return okm.slice(0, length);
}

export async function vapidAuthorization(endpoint: string, subject: string, publicKey: string, privateKey: string, exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60): Promise<string> {
  const pub = b64urlToBytes(publicKey);
  const priv = b64urlToBytes(privateKey);
  const header = bytesToB64url(new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const audience = new URL(endpoint).origin;
  const body = bytesToB64url(new TextEncoder().encode(JSON.stringify({ aud: audience, exp, sub: subject })));
  const unsigned = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x: bytesToB64url(pub.slice(1, 33)), y: bytesToB64url(pub.slice(33, 65)), d: bytesToB64url(priv) },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(unsigned)));
  return `vapid t=${unsigned}.${bytesToB64url(signature)}, k=${publicKey}`;
}

export async function encryptPayload(payload: string, p256dh: string, authSecret: string): Promise<Uint8Array> {
  const subscriber = b64urlToBytes(p256dh);
  const auth = b64urlToBytes(authSecret);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const local = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const localPub = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const remote = await crypto.subtle.importKey("raw", subscriber, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: remote }, local.privateKey, 256));
  const ikm = await hkdf(auth, shared, concat([new TextEncoder().encode("WebPush: info\0"), subscriber, localPub]), 32);
  const keyBytes = await hkdf(salt, ikm, new TextEncoder().encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, new TextEncoder().encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const padded = concat([new TextEncoder().encode(payload), new Uint8Array([2])]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, padded));
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat([salt, rs, new Uint8Array([localPub.length]), localPub, cipher]);
}
