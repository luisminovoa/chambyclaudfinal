import { describe, expect, it, vi, afterEach } from "vitest";
import { base64UrlEncode, base64UrlDecode, encryptPayload, buildVapidAuthHeader, sendWebPush } from "./webpush";

/**
 * FASE P1-B2.2 — cobertura de webpush.ts (RFC 8291 / RFC 8292). Corre
 * bajo vitest (Node ≥19, con Web Crypto nativo) porque este entorno no
 * tiene el runtime Deno instalado — webpush.ts se escribió sin ninguna
 * dependencia de Deno específicamente para que esto fuera posible.
 *
 * Esta suite no se limita a probar "la forma" del código: genera pares de
 * claves reales (ECDH y ECDSA P-256) con crypto.subtle, cifra/firma con
 * las funciones reales de este archivo, y luego DESCIFRA/VERIFICA con una
 * implementación independiente escrita aquí mismo en el test (espejo de
 * lo que haría un Service Worker real al recibir el push) para probar
 * que el protocolo está implementado correctamente de extremo a extremo
 * — no solo que "no lanza una excepción".
 */

async function generateFakeSubscriber() {
  const keyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ]);
  const publicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
  const authSecret = crypto.getRandomValues(new Uint8Array(16));
  return { keyPair, publicRaw, authSecret };
}

/** HKDF idéntico al de webpush.ts, reimplementado aquí para no depender
 * de un export interno — sirve como implementación independiente de
 * verificación, no como reutilización de código de producción. */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8);
  return new Uint8Array(bits);
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

/** Descifra un mensaje aes128gcm producido por encryptPayload() — espejo
 * independiente de RFC 8291/8188, escrito desde cero en el test (no
 * importa nada de webpush.ts salvo lo estrictamente necesario para
 * decodificar base64url de forma consistente). */
async function decryptForTest(
  body: Uint8Array,
  subscriberPrivateKey: CryptoKey,
  subscriberPublicRaw: Uint8Array,
  authSecret: Uint8Array
): Promise<Uint8Array> {
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0, false);
  const idlen = body[20];
  const asPublicRaw = body.slice(21, 21 + idlen);
  const ciphertext = body.slice(21 + idlen);
  expect(rs).toBe(4096);

  const asPublicKey = await crypto.subtle.importKey(
    "raw",
    asPublicRaw,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: asPublicKey }, subscriberPrivateKey, 256)
  );

  const textEncoder = new TextEncoder();
  const keyInfo = concatBytes(textEncoder.encode("WebPush: info\0"), subscriberPublicRaw, asPublicRaw);
  const ikm = await hkdf(authSecret, sharedSecret, keyInfo, 32);

  const cek = await hkdf(salt, ikm, textEncoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, textEncoder.encode("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const plaintextWithDelimiter = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, aesKey, ciphertext)
  );

  expect(plaintextWithDelimiter.at(-1)).toBe(2); // delimitador de "último registro"
  return plaintextWithDelimiter.slice(0, -1);
}

describe("base64UrlEncode / base64UrlDecode", () => {
  it("round-trip sin padding ni caracteres +/", () => {
    const original = crypto.getRandomValues(new Uint8Array(65));
    const encoded = base64UrlEncode(original);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(base64UrlDecode(encoded)).toEqual(original);
  });
});

describe("encryptPayload — round-trip RFC 8291 real (test #9)", () => {
  it("un payload cifrado se descifra exactamente al original con las claves correctas", async () => {
    const subscriber = await generateFakeSubscriber();
    const originalPayload = new TextEncoder().encode(
      JSON.stringify({ title: "Trabajo próximo", body: "Tu trabajo empieza en 1 hora.", jobId: "job-123" })
    );

    const body = await encryptPayload({
      uaPublicRaw: subscriber.publicRaw,
      authSecret: subscriber.authSecret,
      payload: originalPayload,
    });

    const decrypted = await decryptForTest(body, subscriber.keyPair.privateKey, subscriber.publicRaw, subscriber.authSecret);
    expect(new TextDecoder().decode(decrypted)).toBe(new TextDecoder().decode(originalPayload));
  });

  it("el header RFC 8188 tiene el tamaño y forma esperados (salt 16 + rs 4 + idlen 1 + keyid 65)", async () => {
    const subscriber = await generateFakeSubscriber();
    const body = await encryptPayload({
      uaPublicRaw: subscriber.publicRaw,
      authSecret: subscriber.authSecret,
      payload: new TextEncoder().encode("{}"),
    });
    expect(body[20]).toBe(65); // idlen — la clave pública efímera siempre es un punto sin comprimir de 65 bytes
    expect(body.length).toBeGreaterThan(16 + 4 + 1 + 65);
  });

  it("dos cifrados del mismo payload producen ciphertexts distintos (salt/ephemeral key nuevos cada vez)", async () => {
    const subscriber = await generateFakeSubscriber();
    const payload = new TextEncoder().encode("{}");
    const bodyA = await encryptPayload({ uaPublicRaw: subscriber.publicRaw, authSecret: subscriber.authSecret, payload });
    const bodyB = await encryptPayload({ uaPublicRaw: subscriber.publicRaw, authSecret: subscriber.authSecret, payload });
    expect(base64UrlEncode(bodyA)).not.toBe(base64UrlEncode(bodyB));
  });

  it("descifrar con el auth secret incorrecto falla (la integridad del auth secret importa)", async () => {
    const subscriber = await generateFakeSubscriber();
    const body = await encryptPayload({
      uaPublicRaw: subscriber.publicRaw,
      authSecret: subscriber.authSecret,
      payload: new TextEncoder().encode("{}"),
    });
    const wrongAuthSecret = crypto.getRandomValues(new Uint8Array(16));
    await expect(
      decryptForTest(body, subscriber.keyPair.privateKey, subscriber.publicRaw, wrongAuthSecret)
    ).rejects.toThrow();
  });
});

describe("buildVapidAuthHeader — VAPID real (RFC 8292, test #9)", () => {
  it("produce un JWT ES256 verificable con la clave pública correspondiente", async () => {
    const keyPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify",
    ]);
    const publicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
    const jwkPrivate = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
    const privateRaw = base64UrlDecode(jwkPrivate.d as string);

    const header = await buildVapidAuthHeader({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
      subject: "mailto:soporte@chamby.pe",
      vapidPublicKeyRaw: publicRaw,
      vapidPrivateKeyRaw: privateRaw,
    });

    expect(header.startsWith("vapid t=")).toBe(true);
    expect(header).toContain(`k=${base64UrlEncode(publicRaw)}`);

    const jwt = header.match(/t=([^,]+),/)?.[1];
    expect(jwt).toBeTruthy();
    const [encodedHeader, encodedClaims, encodedSignature] = jwt!.split(".");

    const decodedHeader = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedHeader)));
    const decodedClaims = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedClaims)));
    expect(decodedHeader).toEqual({ typ: "JWT", alg: "ES256" });
    expect(decodedClaims.aud).toBe("https://fcm.googleapis.com");
    expect(decodedClaims.sub).toBe("mailto:soporte@chamby.pe");
    expect(decodedClaims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));

    const signatureValid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      keyPair.publicKey,
      base64UrlDecode(encodedSignature),
      new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`)
    );
    expect(signatureValid).toBe(true);
  });

  it("una firma verificada con la clave pública de OTRO keypair falla", async () => {
    const keyPairA = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
    const keyPairB = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify",
    ]);
    const publicRawA = new Uint8Array(await crypto.subtle.exportKey("raw", keyPairA.publicKey));
    const jwkPrivateA = await crypto.subtle.exportKey("jwk", keyPairA.privateKey);
    const privateRawA = base64UrlDecode(jwkPrivateA.d as string);

    const header = await buildVapidAuthHeader({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
      subject: "mailto:soporte@chamby.pe",
      vapidPublicKeyRaw: publicRawA,
      vapidPrivateKeyRaw: privateRawA,
    });
    const jwt = header.match(/t=([^,]+),/)![1];
    const [encodedHeader, encodedClaims, encodedSignature] = jwt.split(".");

    const validWithWrongKey = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      keyPairB.publicKey,
      base64UrlDecode(encodedSignature),
      new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`)
    );
    expect(validWithWrongKey).toBe(false);
  });
});

describe("sendWebPush — forma del request saliente (test #10, #15, #16, #17)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("envía exactamente title/body/jobId cifrados, con headers VAPID correctos, y nada más", async () => {
    const subscriber = await generateFakeSubscriber();
    const vapidKeyPair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
    const vapidPublicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", vapidKeyPair.publicKey));
    const vapidJwk = await crypto.subtle.exportKey("jwk", vapidKeyPair.privateKey);
    const vapidPrivateRaw = base64UrlDecode(vapidJwk.d as string);

    let capturedInit: RequestInit | undefined;
    let capturedUrl: string | undefined;
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;
      return new Response(null, { status: 201 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await sendWebPush({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
      p256dh: base64UrlEncode(subscriber.publicRaw),
      auth: base64UrlEncode(subscriber.authSecret),
      payload: { title: "Trabajo próximo", body: "Empieza en 1 hora", jobId: "job-123" },
      vapid: {
        publicKey: base64UrlEncode(vapidPublicRaw),
        privateKey: base64UrlEncode(vapidPrivateRaw),
        subject: "mailto:soporte@chamby.pe",
      },
    });

    expect(response.status).toBe(201);
    expect(capturedUrl).toBe("https://fcm.googleapis.com/fcm/send/abc123");
    const headers = capturedInit!.headers as Record<string, string>;
    expect(headers["Content-Encoding"]).toBe("aes128gcm");
    expect(headers["Content-Type"]).toBe("application/octet-stream");
    expect(headers.Authorization.startsWith("vapid t=")).toBe(true);
    // Sin CORS permisivo ni headers adicionales innecesarios.
    expect(Object.keys(headers).sort()).toEqual(["Authorization", "Content-Encoding", "Content-Type", "TTL"]);

    // Descifrar lo que realmente se mandó al "push service" (el fetch mockeado)
    // y confirmar que el payload es EXACTAMENTE {title, body, jobId} — nada más.
    const sentBody = new Uint8Array(capturedInit!.body as ArrayBuffer);
    const decrypted = await decryptForTest(
      sentBody,
      subscriber.keyPair.privateKey,
      subscriber.publicRaw,
      subscriber.authSecret
    );
    const decoded = JSON.parse(new TextDecoder().decode(decrypted));
    expect(decoded).toEqual({ title: "Trabajo próximo", body: "Empieza en 1 hora", jobId: "job-123" });
    expect(Object.keys(decoded).sort()).toEqual(["body", "jobId", "title"]);

    // Ningún secreto (VAPID private key, auth, p256dh en claro) aparece en
    // ningún header ni en el cuerpo tal como se transmite (el cuerpo va
    // cifrado; los headers solo llevan el JWT firmado y la clave PÚBLICA).
    const rawRequestText = JSON.stringify(headers) + base64UrlEncode(vapidPublicRaw);
    expect(rawRequestText).not.toContain(base64UrlEncode(vapidPrivateRaw));
    expect(rawRequestText).not.toContain(base64UrlEncode(subscriber.authSecret));
  });
});
