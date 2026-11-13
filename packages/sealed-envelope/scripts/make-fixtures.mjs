// Writes fixtures/envelope-v1.json, or with --check verifies the committed file:
// derivation and hash vectors must match byte for byte, and every envelope must open.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import {
  deriveSlot,
  generateRecipientKeys,
  hashToken,
  importContentKey,
  importRecipientPrivateKey,
  importRecipientPublicKey,
  open,
  openWith,
  seal,
  sealTo,
} from "../src/index.ts";
import { toBase64url } from "../src/util.ts";

const path = fileURLToPath(new URL("../fixtures/envelope-v1.json", import.meta.url));
const fixed = (start, length = 32) =>
  toBase64url(Uint8Array.from({ length }, (_, i) => (start + i) % 256));
const app = "mpile";
const sessionId = fixed(0, 16);
const values = [
  "Synthetic card: ¿Vienes mañana al taller? 🌵",
  { piles: [{ id: "p1", name: "Ánimo", description: "" }], assignments: { c1: "p1", c2: null }, notes: "" },
];
const slotInputs = [
  { slotSecret: fixed(0), passcode: "000000" },
  { slotSecret: fixed(0), passcode: "123456" },
  { slotSecret: fixed(64), passcode: "987654" },
];
const tokenInputs = ["abc", fixed(96), fixed(128)];

async function deterministic() {
  const slots = [];
  for (const input of slotInputs) {
    const { slotId, writeToken } = await deriveSlot(input.slotSecret, input.passcode);
    slots.push({ ...input, slotId, writeToken });
  }
  const tokens = [];
  for (const token of tokenInputs) tokens.push({ token, hash: await hashToken(token) });
  return { slots, tokens };
}

async function generate() {
  const { slots, tokens } = await deterministic();
  for (const [i, slot] of slots.entries()) {
    const { draftKey } = await deriveSlot(slot.slotSecret, slot.passcode);
    const context = { app, sessionId, channel: "draft", slotId: slot.slotId };
    const value = values[i % values.length];
    slot.draft = { context, envelope: await seal(draftKey, value, context), value };
  }
  const key = fixed(160);
  const a256gcm = [];
  for (const value of values) {
    const context = { app, sessionId, channel: "definition" };
    a256gcm.push({ key, context, envelope: await seal(await importContentKey(key), value, context), value });
  }
  const recipient = await generateRecipientKeys();
  const ecdhEs = [];
  for (const value of values) {
    const context = { app, sessionId, channel: "submission", slotId: slots[2].slotId };
    const envelope = await sealTo(await importRecipientPublicKey(recipient.publicKey), value, context);
    ecdhEs.push({ ...recipient, context, envelope, value });
  }
  return {
    format: "malverdesoftware-envelope-fixtures/v1",
    note: "Synthetic vectors from scripts/make-fixtures.mjs. No real keys, people or research data.",
    pbkdf2Iterations: 200_000,
    slots,
    tokens,
    a256gcm,
    ecdhEs,
  };
}

async function check() {
  const file = JSON.parse(await readFile(path, "utf8"));
  const expected = await deterministic();
  const strip = (slots) => slots.map(({ draft, ...rest }) => rest);
  const problems = [];
  if (!isDeepStrictEqual(strip(file.slots), expected.slots)) problems.push("slot derivations differ");
  if (!isDeepStrictEqual(file.tokens, expected.tokens)) problems.push("token hashes differ");
  for (const slot of file.slots) {
    const { draftKey } = await deriveSlot(slot.slotSecret, slot.passcode);
    if (!isDeepStrictEqual(await open(draftKey, slot.draft.envelope, slot.draft.context), slot.draft.value))
      problems.push(`draft for ${slot.slotId} does not open`);
  }
  for (const v of file.a256gcm)
    if (!isDeepStrictEqual(await open(await importContentKey(v.key), v.envelope, v.context), v.value))
      problems.push("an A256GCM vector does not open");
  for (const v of file.ecdhEs)
    if (!isDeepStrictEqual(await openWith(await importRecipientPrivateKey(v.privateKey), v.envelope, v.context), v.value))
      problems.push("an ECDH-ES vector does not open");
  if (problems.length) {
    console.error(`Fixture check failed: ${problems.join("; ")}`);
    process.exit(1);
  }
  console.log("Fixture check passed.");
}

if (process.argv.includes("--check")) await check();
else {
  await writeFile(path, JSON.stringify(await generate(), null, 2) + "\n");
  console.log(`Wrote ${path}`);
}
