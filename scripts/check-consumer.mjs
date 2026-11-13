// Proves a fresh mPile checkout can install the packed packages, type-check against them,
// run a full synthetic session with them, and still build, with no sibling malverdesoftware checkout.
//   npm run pack && node scripts/check-consumer.mjs [--keep]
// MPILE_REPO and MPILE_BRANCH override the source checkout and branch.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const source = process.env.MPILE_REPO ?? resolve(root, "../mpile");
const branch = process.env.MPILE_BRANCH ?? "main";
const keep = process.argv.includes("--keep");

const run = (command, args, cwd) => {
  console.log(`\n$ ${command} ${args.join(" ")}`);
  execFileSync(command, args, { cwd, stdio: "inherit" });
};

const TYPE_CHECK = `// Written by malverdesoftware/scripts/check-consumer.mjs; type-checked, never imported by the app.
import { createRelay, memoryStore } from "@malverdesoftware/relay";
import { importContentKey, randomId, randomSecret, seal } from "@malverdesoftware/sealed-envelope";
import type { Envelope } from "@malverdesoftware/sealed-envelope";
import { parseParticipantLink, prepareSession } from "@malverdesoftware/session-client";
import type { SessionFile } from "@malverdesoftware/session-client";

export const handler: (request: Request) => Promise<Response> = createRelay({ store: memoryStore(), creationKeyHashes: [] });

export async function check(): Promise<[Envelope, SessionFile]> {
  const key = await importContentKey(randomSecret());
  const sealed = await seal(key, { ok: true }, { app: "mpile", sessionId: randomId(), channel: "definition" });
  const file = await prepareSession({
    app: "mpile",
    title: "Consumer check (synthetic)",
    relayUrl: "https://example.test/relay",
    participantUrl: "https://example.test/p",
    definition: { cards: [{ id: "c1", text: "Synthetic" }] },
    participantLabels: ["Y01"],
  });
  parseParticipantLink(file.participants[0]!.link);
  return [sealed, file];
}
`;

const RUNTIME_CHECK = `// Written by malverdesoftware/scripts/check-consumer.mjs: a full synthetic session using the installed dist.
import assert from "node:assert/strict";
import { createRelay, memoryStore } from "@malverdesoftware/relay";
import { hashToken, randomSecret } from "@malverdesoftware/sealed-envelope";
import { joinSession, memoryStorage, openResearcherSession, parseParticipantLink, prepareSession, publishSession } from "@malverdesoftware/session-client";

const creationKey = randomSecret();
const relay = createRelay({ store: memoryStore(), creationKeyHashes: [await hashToken(creationKey)] });
const fetch = (input, init) => relay(new Request(input, init));
const file = await prepareSession({
  app: "mpile",
  title: "Consumer check (synthetic)",
  relayUrl: "https://example.test/relay",
  participantUrl: "https://example.test/p",
  definition: { cards: [{ id: "c1", text: "Synthetic" }] },
  participantLabels: ["Y01"],
});
await publishSession(file, { creationKey, fetch });
const [p] = file.participants;
const session = await joinSession(parseParticipantLink(p.link), { app: file.app, relayUrl: file.relayUrl, passcode: p.passcode, storage: memoryStorage(), fetch });
await session.saveDraft({ piles: ["a"] });
await session.submit({ piles: ["a", "b"] });
const [response] = await openResearcherSession(file, { fetch }).collect();
assert.deepEqual(response.body, { piles: ["a", "b"] });
console.log("Runtime check passed with the installed packages.");
`;

const tarballs = readdirSync(join(root, "artifacts")).filter((f) => /^malverdesoftware-(sealed-envelope|relay|session-client)-.*\.tgz$/.test(f));
if (tarballs.length !== 3) throw new Error(`Expected 3 tarballs in artifacts/, found ${tarballs.length}. Run npm run pack first.`);
const work = mkdtempSync(join(tmpdir(), "malverdesoftware-consumer-"));
try {
  run("git", ["clone", "--quiet", "--depth", "1", "--branch", branch, `file://${source}`, "mpile"], work);
  const app = join(work, "mpile", "app");
  const vendor = join(app, "vendor", "malverdesoftware");
  mkdirSync(vendor, { recursive: true });
  for (const t of tarballs) cpSync(join(root, "artifacts", t), join(vendor, t));
  run("npm", ["ci"], app);
  run("npm", ["install", "--save-exact", ...tarballs.map((t) => `./vendor/malverdesoftware/${t}`)], app);
  writeFileSync(join(app, "malverdesoftware-consumer-check.ts"), TYPE_CHECK);
  run("npm", ["run", "typecheck"], app);
  writeFileSync(join(app, "malverdesoftware-consumer-check.mjs"), RUNTIME_CHECK);
  run("node", ["malverdesoftware-consumer-check.mjs"], app);
  run("npm", ["run", "build"], app);
  console.log("\nConsumer check passed: a fresh mPile checkout installs, type-checks, runs and builds with the packed packages.");
} finally {
  if (keep) console.log(`Kept ${work}`);
  else rmSync(work, { recursive: true, force: true });
}
