import { importRecipientPrivateKey, importRecipientPublicKey, openWith, sealTo } from "@malverdesoftware/sealed-envelope";
import { fail } from "./errors.ts";
import { parseSessionFile, readDefinition } from "./file.ts";
import type { SessionFile } from "./file.ts";

export type VerifiedSessionFile = { file: SessionFile; participants: number };

const unusable = (detail: string): never =>
  fail("BAD_SESSION_FILE", `This key file cannot open the session's responses (${detail}). Save it again from the console.`);

// Proves a saved key file can do its job, locally and without the relay: it parses, opens the activity definition,
// and its private key opens something sealed to its public key. Passcodes can't be checked
// here: only the relay holds what they derive, as hashes. Pass the file the
// app holds in memory as `expected` to confirm the saved copy is that session and is current (same participants).
export async function verifySessionFile(markdown: string, expected?: SessionFile): Promise<VerifiedSessionFile> {
  const file = parseSessionFile(markdown);
  await readDefinition(file);
  const context = { app: file.app, sessionId: file.sessionId, channel: "submission" } as const;
  const probe = { probe: file.sessionId };
  const sealed = await sealTo(await importRecipientPublicKey(file.researcherPublicKey), probe, context).catch(() =>
    unusable("public key"),
  );
  const opened = await importRecipientPrivateKey(file.researcherPrivateKey)
    .then((key) => openWith(key, sealed, context))
    .catch(() => unusable("private key"));
  if ((opened as { probe?: unknown } | null)?.probe !== file.sessionId) unusable("private key does not match");
  if (expected) {
    if (
      file.sessionId !== expected.sessionId ||
      file.adminToken !== expected.adminToken ||
      file.researcherPrivateKey !== expected.researcherPrivateKey ||
      file.definitionKey !== expected.definitionKey
    )
      fail("BAD_SESSION_FILE", "This key file belongs to a different session.");
    const key = (f: SessionFile) => f.participants.map((p) => `${p.slotId}:${p.revokedAt ?? ""}`).sort().join(",");
    if (key(file) !== key(expected))
      fail("BAD_SESSION_FILE", "This key file is an older copy: its participant list does not match. Save the current file again.");
  }
  return { file, participants: file.participants.length };
}
