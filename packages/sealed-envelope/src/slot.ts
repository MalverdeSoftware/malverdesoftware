import { contentKeyFromBytes, keyBytes } from "./keys.ts";
import type { ContentKey } from "./keys.ts";
import { concat, encoder, fail, toBase64url } from "./util.ts";
import type { Bytes } from "./util.ts";

// Wire-format constants: changing any of them is a v2 change.
const SALT = encoder.encode("malverdesoftware-slot/v1");
export const PBKDF2_ITERATIONS = 200_000;
const PASSCODE = /^[0-9]{6}$/;

async function hkdf(ikm: Bytes, info: string, length: number): Promise<Bytes> {
  const base = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt: SALT, info: encoder.encode(info) },
      base,
      length * 8,
    ),
  );
}

async function stretch(passcode: string, salt: Bytes): Promise<Bytes> {
  const password = await crypto.subtle.importKey("raw", encoder.encode(passcode), "PBKDF2", false, [
    "deriveBits",
  ]);
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
      password,
      256,
    ),
  );
}

// The slot ID comes from the link alone; the write token and draft key also need the passcode.
export async function deriveSlot(
  slotSecret: string,
  passcode: string,
): Promise<{ slotId: string; writeToken: string; draftKey: ContentKey }> {
  const secret = keyBytes(slotSecret, 32);
  if (typeof passcode !== "string" || !PASSCODE.test(passcode))
    fail("BAD_FORMAT", "A passcode is six digits.");
  const slotId = await hkdf(secret, "id", 16);
  const ikm = concat(secret, await stretch(passcode, await hkdf(secret, "passcode-salt", 16)));
  return {
    slotId: toBase64url(slotId),
    writeToken: toBase64url(await hkdf(ikm, "write-token", 32)),
    draftKey: await contentKeyFromBytes(await hkdf(ikm, "draft-key", 32)),
  };
}
