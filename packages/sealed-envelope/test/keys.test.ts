import { test } from "node:test";
import assert from "node:assert/strict";
import * as envelope from "../src/index.ts";
import {
  EnvelopeError,
  generateRecipientKeys,
  hashToken,
  importContentKey,
  importRecipientPrivateKey,
  importRecipientPublicKey,
  randomId,
  randomPasscode,
  randomSecret,
} from "../src/index.ts";

const rejectsWith = (code: string) => (error: unknown) =>
  error instanceof EnvelopeError && error.code === code;

test("random secrets and IDs are base64url of the specified lengths", () => {
  const secrets = new Set(Array.from({ length: 1000 }, randomSecret));
  assert.equal(secrets.size, 1000);
  for (const s of secrets) assert.match(s, /^[A-Za-z0-9_-]{43}$/);
  assert.match(randomId(), /^[A-Za-z0-9_-]{22}$/);
});

test("passcodes are six digits and cover every leading digit", () => {
  const leading = new Set<string>();
  for (let i = 0; i < 100_000; i++) {
    const passcode = randomPasscode();
    assert.match(passcode, /^[0-9]{6}$/);
    leading.add(passcode[0]!);
  }
  assert.equal(leading.size, 10);
});

test("content keys import from 32-byte secrets only", async () => {
  await importContentKey(randomSecret());
  await assert.rejects(importContentKey(randomId()), rejectsWith("BAD_KEY"));
  await assert.rejects(importContentKey("not base64url!"), rejectsWith("BAD_KEY"));
});

test("recipient keys round-trip through their text encodings", async () => {
  const { publicKey, privateKey } = await generateRecipientKeys();
  assert.match(publicKey, /^[A-Za-z0-9_-]{87}$/);
  await importRecipientPublicKey(publicKey);
  await importRecipientPrivateKey(privateKey);
});

test("invalid recipient keys are rejected as BAD_KEY", async () => {
  const offCurve = "BA" + "A".repeat(85);
  await assert.rejects(importRecipientPublicKey(offCurve), rejectsWith("BAD_KEY"));
  await assert.rejects(importRecipientPublicKey(randomSecret()), rejectsWith("BAD_KEY"));
  await assert.rejects(importRecipientPrivateKey(randomSecret()), rejectsWith("BAD_KEY"));
});

test("hashToken is SHA-256 of the token text, base64url-encoded", async () => {
  assert.equal(await hashToken("abc"), "ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0");
  await assert.rejects(hashToken(""), rejectsWith("BAD_FORMAT"));
  await assert.rejects(hashToken("has space"), rejectsWith("BAD_FORMAT"));
});

test("EnvelopeError carries a machine-readable code", () => {
  const error = new EnvelopeError("BAD_KEY", "x");
  assert.ok(error instanceof Error);
  assert.equal(error.code, "BAD_KEY");
  assert.equal(error.name, "EnvelopeError");
});

test("public exports match the spec's interface", () => {
  assert.deepEqual(Object.keys(envelope).sort(), [
    "EnvelopeError",
    "MAX_PLAINTEXT_BYTES",
    "deriveSlot",
    "generateRecipientKeys",
    "hashToken",
    "importContentKey",
    "importRecipientPrivateKey",
    "importRecipientPublicKey",
    "open",
    "openWith",
    "randomId",
    "randomPasscode",
    "randomSecret",
    "seal",
    "sealTo",
  ]);
});
