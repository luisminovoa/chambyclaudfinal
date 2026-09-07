// FASE P1-B2.2 — Web Push (RFC 8291: cifrado aes128gcm del mensaje;
// RFC 8292: VAPID) implementado ÚNICAMENTE con Web Crypto API estándar
// (`crypto.subtle`, `crypto.getRandomValues`) y `fetch` — sin ninguna
// dependencia externa.
//
// Se revisó primero si el repo ya tenía alguna dependencia Web Push/VAPID
// (package.json, deno.json/deno.jsonc, supabase/functions existentes,
// imports relacionados): no existe ninguna, y no se agregó ninguna nueva.
// Deno (runtime real de esta función) y Node ≥19 (usado por vitest en
// este entorno, que no tiene el runtime Deno instalado) exponen Web
// Crypto de forma nativa — suficiente para implementar el protocolo
// completo. Por eso este archivo, a propósito, NO importa nada de Deno:
// es portable entre ambos runtimes, lo que permite probarlo de verdad con
// vitest en esta fase (ver webpush.test.ts) en vez de dejarlo sin probar.

const textEncoder = new TextEncoder();

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (padded.length % 4)) % 4);
  const binary = atob(padded + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function splitUncompressedPoint(raw: Uint8Array): { x: Uint8Array; y: Uint8Array } {
  if (raw.length !== 65 || raw[0] !== 0x04) {
    throw new Error("clave pública EC con formato inesperado (se esperaba un punto sin comprimir de 65 bytes)");
  }
  return { x: raw.slice(1, 33), y: raw.slice(33, 65) };
}

/** HKDF (RFC 5869) completo — extract + expand en una sola llamada nativa de Web Crypto. */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8);
  return new Uint8Array(bits);
}

/**
 * Cifra el payload según RFC 8291 (Web Push Message Encryption,
 * content-encoding aes128gcm). `uaPublicRaw`/`authSecret` son las claves
 * publicadas por el navegador al suscribirse (`p256dh`/`auth`,
 * `push_subscriptions`, 0057). Genera un par de claves ECDH efímero
 * NUEVO en cada llamada — nunca se reutiliza entre mensajes ni entre
 * suscripciones.
 */
export async function encryptPayload(params: {
  uaPublicRaw: Uint8Array;
  authSecret: Uint8Array;
  payload: Uint8Array;
}): Promise<Uint8Array> {
  const { uaPublicRaw, authSecret, payload } = params;

  const uaPublicKey = await crypto.subtle.importKey(
    "raw",
    uaPublicRaw,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  const ephemeral = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey));

  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaPublicKey }, ephemeral.privateKey, 256)
  );

  // RFC 8291 §3.4 — combina el secreto ECDH con el `auth` secret propio
  // de la suscripción antes de derivar CEK/nonce.
  const keyInfo = concatBytes(textEncoder.encode("WebPush: info\0"), uaPublicRaw, asPublicRaw);
  const ikm = await hkdf(authSecret, sharedSecret, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, textEncoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, textEncoder.encode("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // 0x02 = delimitador de "único/último registro" (RFC 8188 §2). Un solo
  // registro alcanza: el payload de Chamby (título/cuerpo/jobId) nunca se
  // acerca al límite de tamaño de un mensaje Web Push (~4KB).
  const plaintext = concatBytes(payload, new Uint8Array([2]));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plaintext));

  // Header RFC 8188 §2.1: salt(16) || rs(4, big-endian) || idlen(1) || keyid(asPublicRaw).
  const recordSize = 4096;
  const header = new Uint8Array(16 + 4 + 1 + asPublicRaw.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, recordSize, false);
  header[20] = asPublicRaw.length;
  header.set(asPublicRaw, 21);

  return concatBytes(header, ciphertext);
}

/** Construye el header Authorization VAPID (RFC 8292), firmado con ES256. */
export async function buildVapidAuthHeader(params: {
  endpoint: string;
  subject: string;
  vapidPublicKeyRaw: Uint8Array;
  vapidPrivateKeyRaw: Uint8Array;
}): Promise<string> {
  const { endpoint, subject, vapidPublicKeyRaw, vapidPrivateKeyRaw } = params;

  const aud = new URL(endpoint).origin;
  const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60;
  const header = { typ: "JWT", alg: "ES256" };
  const claims = { aud, exp, sub: subject };

  const encodedHeader = base64UrlEncode(textEncoder.encode(JSON.stringify(header)));
  const encodedClaims = base64UrlEncode(textEncoder.encode(JSON.stringify(claims)));
  const signingInput = `${encodedHeader}.${encodedClaims}`;

  const { x, y } = splitUncompressedPoint(vapidPublicKeyRaw);
  const jwk = {
    kty: "EC",
    crv: "P-256",
    d: base64UrlEncode(vapidPrivateKeyRaw),
    x: base64UrlEncode(x),
    y: base64UrlEncode(y),
    ext: true,
  };
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  // Web Crypto devuelve la firma ECDSA en formato IEEE P1363 (r||s, 64
  // bytes) — exactamente lo que exige JWS ES256, sin conversión DER.
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, textEncoder.encode(signingInput))
  );

  const jwt = `${signingInput}.${base64UrlEncode(signature)}`;
  return `vapid t=${jwt}, k=${base64UrlEncode(vapidPublicKeyRaw)}`;
}

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export interface SendWebPushParams {
  endpoint: string;
  p256dh: string;
  auth: string;
  payload: { title: string; body: string; jobId: string | null };
  vapid: VapidConfig;
}

/**
 * Envía un único mensaje Web Push a una suscripción. No captura errores
 * de red ni de respuesta no-2xx — el llamador (index.ts) decide cómo
 * tratar cada suscripción sin abortar las demás (Promise.allSettled).
 */
export async function sendWebPush(params: SendWebPushParams): Promise<Response> {
  const { endpoint, p256dh, auth, payload, vapid } = params;

  const uaPublicRaw = base64UrlDecode(p256dh);
  const authSecret = base64UrlDecode(auth);
  const vapidPublicKeyRaw = base64UrlDecode(vapid.publicKey);
  const vapidPrivateKeyRaw = base64UrlDecode(vapid.privateKey);

  const body = await encryptPayload({
    uaPublicRaw,
    authSecret,
    payload: textEncoder.encode(JSON.stringify(payload)),
  });

  const authorization = await buildVapidAuthHeader({
    endpoint,
    subject: vapid.subject,
    vapidPublicKeyRaw,
    vapidPrivateKeyRaw,
  });

  return fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      TTL: "86400",
      Authorization: authorization,
    },
    body,
  });
}
