import { P256, decoder, encoder, fail, fromBase64url, randomBytes, toBase64url } from "./util.ts";
import type { Bytes } from "./util.ts";
import type { ContentKey, RecipientPrivateKey, RecipientPublicKey } from "./keys.ts";

export type Channel = "definition" | "draft" | "submission" | "shared";
export type EnvelopeContext = { app: string; sessionId: string; channel: Channel; slotId?: string };
export type Envelope =
  | { v: 1; alg: "A256GCM"; iv: string; ct: string }
  | { v: 1; alg: "ECDH-ES+A256GCM"; epk: string; iv: string; ct: string };

export const MAX_PLAINTEXT_BYTES = 196_608;

const BLOCK = 1024;
const TAG_BYTES = 16;
const APP = /^[a-z0-9-]{1,40}$/;
const ID = /^[A-Za-z0-9_-]{22}$/;
const CHANNELS = new Set<string>(["definition", "draft", "submission", "shared"]);
const ALGORITHMS = new Set<string>(["A256GCM", "ECDH-ES+A256GCM"]);
const ECDH_INFO = encoder.encode("malverdesoftware-envelope/v1 ECDH-ES+A256GCM");

function additionalData(context: EnvelopeContext): Bytes {
  const { app, sessionId, channel, slotId } = context ?? ({} as EnvelopeContext);
  if (
    typeof app !== "string" ||
    !APP.test(app) ||
    typeof sessionId !== "string" ||
    !ID.test(sessionId) ||
    !CHANNELS.has(channel) ||
    (slotId !== undefined && (typeof slotId !== "string" || !ID.test(slotId)))
  )
    fail("BAD_FORMAT", "The envelope context is not valid.");
  return encoder.encode(
    ["malverdesoftware-envelope/v1", app, sessionId, channel, slotId ?? ""].join("\n"),
  );
}

// 4-byte big-endian length, the JSON bytes, then zero padding to a 1 KiB multiple.
function frame(value: unknown): Bytes {
  let json: string | undefined;
  try {
    json = JSON.stringify(value);
  } catch {
    fail("BAD_FORMAT", "The value cannot be written as JSON.");
  }
  if (json === undefined) fail("BAD_FORMAT", "The value cannot be written as JSON.");
  const body = encoder.encode(json!);
  const size = Math.max(BLOCK, Math.ceil((body.length + 4) / BLOCK) * BLOCK);
  if (size > MAX_PLAINTEXT_BYTES) fail("TOO_LARGE", "This content is too large to seal.");
  const framed = new Uint8Array(size);
  new DataView(framed.buffer).setUint32(0, body.length);
  framed.set(body, 4);
  return framed;
}

function unframe(framed: Bytes): unknown {
  const length = new DataView(framed.buffer, framed.byteOffset, framed.byteLength).getUint32(0);
  if (length > framed.length - 4) fail("BAD_FORMAT", "The sealed content is malformed.");
  try {
    return JSON.parse(decoder.decode(framed.subarray(4, 4 + length)));
  } catch {
    return fail("BAD_FORMAT", "The sealed content is malformed.");
  }
}

type Parsed =
  | { alg: "A256GCM"; iv: Bytes; ct: Bytes }
  | { alg: "ECDH-ES+A256GCM"; epk: Bytes; iv: Bytes; ct: Bytes };

function parse(envelope: unknown): Parsed {
  if (typeof envelope !== "object" || envelope === null || Array.isArray(envelope))
    fail("BAD_FORMAT", "An envelope is an object.");
  const e = envelope as Record<string, unknown>;
  if (typeof e.v !== "number") fail("BAD_FORMAT", "The envelope has no version.");
  if (e.v !== 1) fail("UNSUPPORTED_VERSION", "This link was made by a newer version of the app.");
  if (typeof e.alg !== "string") fail("BAD_FORMAT", "The envelope has no algorithm.");
  if (!ALGORITHMS.has(e.alg as string))
    fail("UNSUPPORTED_VERSION", "This link was made by a newer version of the app.");
  const iv = fromBase64url(e.iv, 12);
  const ct = fromBase64url(e.ct);
  const framedSize = ct.length - TAG_BYTES;
  if (framedSize < BLOCK || framedSize % BLOCK !== 0 || framedSize > MAX_PLAINTEXT_BYTES)
    fail("BAD_FORMAT", "The envelope ciphertext has an invalid length.");
  if (e.alg === "A256GCM") return { alg: "A256GCM", iv, ct };
  return { alg: "ECDH-ES+A256GCM", epk: fromBase64url(e.epk, 65), iv, ct };
}

async function encrypt(key: CryptoKey, framed: Bytes, aad: Bytes) {
  const iv = randomBytes(12);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, key, framed),
  );
  return { iv: toBase64url(iv), ct: toBase64url(ct) };
}

async function decrypt(key: CryptoKey, iv: Bytes, ct: Bytes, aad: Bytes): Promise<Bytes> {
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: aad }, key, ct),
    );
  } catch {
    return fail("DECRYPT_FAILED", "This content could not be opened.");
  }
}

async function ecdhKey(privateKey: CryptoKey, publicKey: CryptoKey, epk: Bytes) {
  const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: publicKey }, privateKey, 256);
  const base = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: epk, info: ECDH_INFO },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function seal(
  key: ContentKey,
  value: unknown,
  context: EnvelopeContext,
): Promise<Envelope> {
  const aad = additionalData(context);
  const { iv, ct } = await encrypt(key, frame(value), aad);
  return { v: 1, alg: "A256GCM", iv, ct };
}

export async function open(
  key: ContentKey,
  envelope: unknown,
  context: EnvelopeContext,
): Promise<unknown> {
  const aad = additionalData(context);
  const parsed = parse(envelope);
  if (parsed.alg !== "A256GCM") fail("BAD_FORMAT", "Expected a shared-key envelope.");
  return unframe(await decrypt(key, parsed.iv, parsed.ct, aad));
}

export async function sealTo(
  recipient: RecipientPublicKey,
  value: unknown,
  context: EnvelopeContext,
): Promise<Envelope> {
  const aad = additionalData(context);
  const framed = frame(value);
  const ephemeral = (await crypto.subtle.generateKey(P256, true, ["deriveBits"])) as CryptoKeyPair;
  const epk = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey));
  const key = await ecdhKey(ephemeral.privateKey, recipient, epk);
  const { iv, ct } = await encrypt(key, framed, aad);
  return { v: 1, alg: "ECDH-ES+A256GCM", epk: toBase64url(epk), iv, ct };
}

export async function openWith(
  recipient: RecipientPrivateKey,
  envelope: unknown,
  context: EnvelopeContext,
): Promise<unknown> {
  const aad = additionalData(context);
  const parsed = parse(envelope);
  if (parsed.alg !== "ECDH-ES+A256GCM") fail("BAD_FORMAT", "Expected a researcher-sealed envelope.");
  const { epk, iv, ct } = parsed as Extract<Parsed, { alg: "ECDH-ES+A256GCM" }>;
  let key: CryptoKey;
  try {
    const ephemeral = await crypto.subtle.importKey("raw", epk, P256, false, []);
    key = await ecdhKey(recipient, ephemeral, epk);
  } catch {
    return fail("DECRYPT_FAILED", "This content could not be opened.");
  }
  return unframe(await decrypt(key, iv, ct, aad));
}
