import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  EnvelopeError,
  deriveSlot,
  hashToken,
  importContentKey,
  importRecipientPrivateKey,
  open,
  openWith,
  randomId,
  randomSecret,
  seal,
} from "../src/index.ts";
import type { EnvelopeContext } from "../src/index.ts";

type Vector = { context: EnvelopeContext; envelope: unknown; value: unknown };
type Fixtures = {
  format: string;
  pbkdf2Iterations: number;
  slots: { slotSecret: string; passcode: string; slotId: string; writeToken: string; draft: Vector }[];
  tokens: { token: string; hash: string }[];
  a256gcm: (Vector & { key: string })[];
  ecdhEs: (Vector & { privateKey: string; publicKey: string })[];
};

const fixtures: Fixtures = JSON.parse(
  await readFile(new URL("../fixtures/envelope-v1.json", import.meta.url), "utf8"),
);
const rejectsWith = (code: string) => (error: unknown) =>
  error instanceof EnvelopeError && error.code === code;

test("the fixture file is v1", () => {
  assert.equal(fixtures.format, "malverdesoftware-envelope-fixtures/v1");
  assert.equal(fixtures.pbkdf2Iterations, 200_000);
});

test("slot derivations match the fixtures, and each draft opens with its derived key", async () => {
  for (const slot of fixtures.slots) {
    const derived = await deriveSlot(slot.slotSecret, slot.passcode);
    assert.equal(derived.slotId, slot.slotId);
    assert.equal(derived.writeToken, slot.writeToken);
    assert.deepEqual(await open(derived.draftKey, slot.draft.envelope, slot.draft.context), slot.draft.value);
  }
});

test("token hashes match the fixtures", async () => {
  for (const { token, hash } of fixtures.tokens) assert.equal(await hashToken(token), hash);
});

test("A256GCM and ECDH-ES vectors open to their expected values", async () => {
  for (const v of fixtures.a256gcm)
    assert.deepEqual(await open(await importContentKey(v.key), v.envelope, v.context), v.value);
  for (const v of fixtures.ecdhEs)
    assert.deepEqual(await openWith(await importRecipientPrivateKey(v.privateKey), v.envelope, v.context), v.value);
});

test("a different passcode keeps the slot ID but changes the token and draft key", async () => {
  const secret = randomSecret();
  const a = await deriveSlot(secret, "111111");
  const b = await deriveSlot(secret, "222222");
  assert.equal(a.slotId, b.slotId);
  assert.notEqual(a.writeToken, b.writeToken);
  const context: EnvelopeContext = { app: "mpile", sessionId: randomId(), channel: "draft", slotId: a.slotId };
  await assert.rejects(open(b.draftKey, await seal(a.draftKey, "draft", context), context), rejectsWith("DECRYPT_FAILED"));
});

test("deriveSlot rejects malformed passcodes and secrets", async () => {
  const secret = randomSecret();
  for (const passcode of ["12345", "1234567", "abcdef", "12 345", ""])
    await assert.rejects(deriveSlot(secret, passcode), rejectsWith("BAD_FORMAT"));
  await assert.rejects(deriveSlot(randomId(), "123456"), rejectsWith("BAD_KEY"));
  await assert.rejects(deriveSlot("not a secret", "123456"), rejectsWith("BAD_KEY"));
});
