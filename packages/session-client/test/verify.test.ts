import { test } from "node:test";
import assert from "node:assert/strict";
import { generateRecipientKeys } from "@malverdesoftware/sealed-envelope";
import { SessionError, prepareSession, renderSessionFile, verifySessionFile } from "../src/index.ts";
import { sessionInput } from "./support.ts";

const rejectsWith = (code: string, pattern?: RegExp) => (error: unknown) =>
  error instanceof SessionError && error.code === code && (!pattern || pattern.test(error.message));

test("verifySessionFile accepts a saved file and confirms it matches the session in memory", async () => {
  const file = await prepareSession(sessionInput(["Y01", "Y02"]));
  const result = await verifySessionFile(renderSessionFile(file), file);
  assert.equal(result.participants, 2);
  assert.deepEqual(result.file, file);
});

test("verifySessionFile refuses a file whose private key does not match its public key", async () => {
  const file = await prepareSession(sessionInput(["Y01"]));
  const other = await generateRecipientKeys();
  const broken = { ...file, researcherPrivateKey: other.privateKey };
  await assert.rejects(verifySessionFile(renderSessionFile(broken)), rejectsWith("BAD_SESSION_FILE", /private key/));
});

test("verifySessionFile refuses a file from another session or an older copy", async () => {
  const file = await prepareSession(sessionInput(["Y01"]));
  const other = await prepareSession(sessionInput(["Y01"]));
  await assert.rejects(verifySessionFile(renderSessionFile(other), file), rejectsWith("BAD_SESSION_FILE", /different session/));
  const newer = { ...file, participants: [...file.participants, { ...file.participants[0]!, label: "Y02", slotId: other.participants[0]!.slotId }] };
  await assert.rejects(verifySessionFile(renderSessionFile(file), newer), rejectsWith("BAD_SESSION_FILE", /older copy/));
  const revoked = { ...file, participants: [{ ...file.participants[0]!, revokedAt: new Date().toISOString() }] };
  await assert.rejects(verifySessionFile(renderSessionFile(file), revoked), rejectsWith("BAD_SESSION_FILE", /older copy/));
});

test("verifySessionFile refuses text that is not a key file", async () => {
  await assert.rejects(verifySessionFile("# notes\n"), rejectsWith("BAD_SESSION_FILE"));
});
