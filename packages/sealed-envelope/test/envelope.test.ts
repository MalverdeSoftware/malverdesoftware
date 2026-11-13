import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EnvelopeError,
  MAX_PLAINTEXT_BYTES,
  generateRecipientKeys,
  importContentKey,
  importRecipientPrivateKey,
  importRecipientPublicKey,
  open,
  openWith,
  randomId,
  randomSecret,
  seal,
  sealTo,
} from "../src/index.ts";
import type { EnvelopeContext } from "../src/index.ts";
import { fromBase64url, toBase64url } from "../src/util.ts";

const rejectsWith = (code: string) => (error: unknown) =>
  error instanceof EnvelopeError && error.code === code;

const context: EnvelopeContext = {
  app: "mpile",
  sessionId: randomId(),
  channel: "submission",
  slotId: randomId(),
};

const values: unknown[] = [
  "¿Qué onda? Nos vemos el sábado 🌵 — mPile",
  { piles: [{ id: "p1", name: "Ánimo 💪" }], assignments: { c1: "p1", c2: null }, notes: "" },
  [1, 2.5, -3, true, false, null],
  "",
  0,
];

async function keys() {
  const content = await importContentKey(randomSecret());
  const pair = await generateRecipientKeys();
  return {
    content,
    publicKey: await importRecipientPublicKey(pair.publicKey),
    privateKey: await importRecipientPrivateKey(pair.privateKey),
  };
}

function flip(text: string, index: number): string {
  const bytes = fromBase64url(text);
  bytes[index] = bytes[index]! ^ 0x01;
  return toBase64url(bytes);
}

test("both algorithms round-trip JSON values, including emoji and accents", async () => {
  const k = await keys();
  for (const value of values) {
    assert.deepEqual(await open(k.content, await seal(k.content, value, context), context), value);
    assert.deepEqual(await openWith(k.privateKey, await sealTo(k.publicKey, value, context), context), value);
  }
});

test("envelopes have the v1 shape and carry no key material", async () => {
  const k = await keys();
  const shared = await seal(k.content, "x", context);
  const sealed = await sealTo(k.publicKey, "x", context);
  assert.deepEqual(Object.keys(shared).sort(), ["alg", "ct", "iv", "v"]);
  assert.deepEqual(Object.keys(sealed).sort(), ["alg", "ct", "epk", "iv", "v"]);
  assert.equal(shared.alg, "A256GCM");
  assert.equal(sealed.alg, "ECDH-ES+A256GCM");
});

test("tampering with ct, iv or epk gives DECRYPT_FAILED", async () => {
  const k = await keys();
  const shared = await seal(k.content, values[1], context);
  const sealed = await sealTo(k.publicKey, values[1], context);
  await assert.rejects(open(k.content, { ...shared, ct: flip(shared.ct, 5) }, context), rejectsWith("DECRYPT_FAILED"));
  await assert.rejects(open(k.content, { ...shared, iv: flip(shared.iv, 0) }, context), rejectsWith("DECRYPT_FAILED"));
  if (sealed.alg !== "ECDH-ES+A256GCM") throw new Error("unexpected algorithm");
  for (const index of [0, 1, 33, 64]) {
    await assert.rejects(openWith(k.privateKey, { ...sealed, epk: flip(sealed.epk, index) }, context), rejectsWith("DECRYPT_FAILED"));
  }
  await assert.rejects(openWith(k.privateKey, { ...sealed, ct: flip(sealed.ct, 100) }, context), rejectsWith("DECRYPT_FAILED"));
});

test("opening with any different context field gives DECRYPT_FAILED", async () => {
  const k = await keys();
  const shared = await seal(k.content, "x", context);
  const sealed = await sealTo(k.publicKey, "x", context);
  const variants: EnvelopeContext[] = [
    { ...context, app: "mvote" },
    { ...context, sessionId: randomId() },
    { ...context, channel: "draft" },
    { ...context, slotId: randomId() },
    { app: context.app, sessionId: context.sessionId, channel: context.channel },
  ];
  for (const other of variants) {
    await assert.rejects(open(k.content, shared, other), rejectsWith("DECRYPT_FAILED"));
    await assert.rejects(openWith(k.privateKey, sealed, other), rejectsWith("DECRYPT_FAILED"));
  }
});

test("a wrong key gives DECRYPT_FAILED", async () => {
  const a = await keys();
  const b = await keys();
  await assert.rejects(open(b.content, await seal(a.content, "x", context), context), rejectsWith("DECRYPT_FAILED"));
  await assert.rejects(openWith(b.privateKey, await sealTo(a.publicKey, "x", context), context), rejectsWith("DECRYPT_FAILED"));
});

test("padding hides small size differences and enforces the limit", async () => {
  const k = await keys();
  const small = await seal(k.content, "a".repeat(10), context);
  const medium = await seal(k.content, "a".repeat(900), context);
  const larger = await seal(k.content, "a".repeat(2000), context);
  assert.equal(small.ct.length, medium.ct.length);
  assert.ok(larger.ct.length > medium.ct.length);
  const atLimit = "a".repeat(MAX_PLAINTEXT_BYTES - 4 - 2);
  assert.equal(await open(k.content, await seal(k.content, atLimit, context), context), atLimit);
  await assert.rejects(seal(k.content, atLimit + "a", context), rejectsWith("TOO_LARGE"));
  await assert.rejects(sealTo(k.publicKey, atLimit + "a", context), rejectsWith("TOO_LARGE"));
});

test("format problems are reported precisely", async () => {
  const k = await keys();
  const shared = await seal(k.content, "x", context);
  const sealed = await sealTo(k.publicKey, "x", context);
  await assert.rejects(open(k.content, { ...shared, v: 2 }, context), rejectsWith("UNSUPPORTED_VERSION"));
  await assert.rejects(open(k.content, { ...shared, alg: "A128GCM" }, context), rejectsWith("UNSUPPORTED_VERSION"));
  await assert.rejects(open(k.content, { v: 1, alg: "A256GCM", iv: shared.iv }, context), rejectsWith("BAD_FORMAT"));
  await assert.rejects(open(k.content, { ...shared, iv: shared.iv + "AA" }, context), rejectsWith("BAD_FORMAT"));
  await assert.rejects(open(k.content, { ...shared, ct: "not base64url!" }, context), rejectsWith("BAD_FORMAT"));
  await assert.rejects(open(k.content, { ...shared, ct: shared.ct.slice(0, 40) }, context), rejectsWith("BAD_FORMAT"));
  await assert.rejects(open(k.content, "envelope", context), rejectsWith("BAD_FORMAT"));
  await assert.rejects(open(k.content, null, context), rejectsWith("BAD_FORMAT"));
  await assert.rejects(open(k.content, sealed, context), rejectsWith("BAD_FORMAT"));
  await assert.rejects(openWith(k.privateKey, shared, context), rejectsWith("BAD_FORMAT"));
  await assert.rejects(seal(k.content, "x", { ...context, app: "My Pile" }), rejectsWith("BAD_FORMAT"));
  await assert.rejects(seal(k.content, "x", { ...context, sessionId: "short" }), rejectsWith("BAD_FORMAT"));
  await assert.rejects(seal(k.content, "x", { ...context, channel: "other" as never }), rejectsWith("BAD_FORMAT"));
  await assert.rejects(seal(k.content, undefined, context), rejectsWith("BAD_FORMAT"));
  await assert.rejects(seal(k.content, { n: 1n }, context), rejectsWith("BAD_FORMAT"));
});

test("10,000 seals never repeat an IV", async () => {
  const k = await keys();
  const ivs = new Set<string>();
  for (let i = 0; i < 10_000; i++) ivs.add((await seal(k.content, i, context)).iv);
  assert.equal(ivs.size, 10_000);
});
