import { EnvelopeError, P256, fail, fromBase64url, randomBytes, toBase64url, encoder } from "./util.ts";
import type { Bytes } from "./util.ts";

export type ContentKey = CryptoKey & { readonly __brand: "ContentKey" };
export type RecipientPublicKey = CryptoKey & { readonly __brand: "RecipientPublicKey" };
export type RecipientPrivateKey = CryptoKey & { readonly __brand: "RecipientPrivateKey" };

const TOKEN = /^[A-Za-z0-9_-]{1,256}$/;

export const randomSecret = (): string => toBase64url(randomBytes(32));
export const randomId = (): string => toBase64url(randomBytes(16));

export function randomPasscode(): string {
  // Rejection sampling keeps every passcode equally likely.
  const limit = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000;
  const draw = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(draw);
    const value = draw[0]!;
    if (value < limit) return String(value % 1_000_000).padStart(6, "0");
  }
}

export function keyBytes(encoded: string, length?: number): Bytes {
  try {
    return fromBase64url(encoded, length);
  } catch (error) {
    if (error instanceof EnvelopeError) fail("BAD_KEY", "This key is not valid.");
    throw error;
  }
}

export async function contentKeyFromBytes(raw: Bytes): Promise<ContentKey> {
  return (await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ])) as ContentKey;
}

export async function importContentKey(secret: string): Promise<ContentKey> {
  return contentKeyFromBytes(keyBytes(secret, 32));
}

export async function generateRecipientKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = (await crypto.subtle.generateKey(P256, true, ["deriveBits"])) as CryptoKeyPair;
  const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const privateKey = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  return { publicKey: toBase64url(publicKey), privateKey: toBase64url(privateKey) };
}

export async function importRecipientPublicKey(encoded: string): Promise<RecipientPublicKey> {
  const raw = keyBytes(encoded, 65);
  try {
    return (await crypto.subtle.importKey("raw", raw, P256, false, [])) as RecipientPublicKey;
  } catch {
    return fail("BAD_KEY", "This public key is not a valid P-256 point.");
  }
}

export async function importRecipientPrivateKey(encoded: string): Promise<RecipientPrivateKey> {
  const raw = keyBytes(encoded);
  if (raw.length < 32 || raw.length > 256) fail("BAD_KEY", "This private key is not valid.");
  try {
    return (await crypto.subtle.importKey("pkcs8", raw, P256, false, [
      "deriveBits",
    ])) as RecipientPrivateKey;
  } catch {
    return fail("BAD_KEY", "This private key is not a valid P-256 key.");
  }
}

export async function hashToken(token: string): Promise<string> {
  if (typeof token !== "string" || !TOKEN.test(token))
    fail("BAD_FORMAT", "A token is 1–256 base64url characters.");
  return toBase64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(token))));
}
