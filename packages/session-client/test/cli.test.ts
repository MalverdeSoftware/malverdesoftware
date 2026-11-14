import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "../src/cli.ts";
import { joinSession, memoryStorage, parseParticipantLink, prepareSession, publishSession, renderSessionFile } from "../src/index.ts";
import { FAST, inProcessRelay, sessionInput } from "./support.ts";

test("the command line verifies a key file and collects readable JSON with only the file and the relay", async () => {
  const relay = await inProcessRelay();
  const options = { fetch: relay.fetch, ...FAST };
  const file = await prepareSession(sessionInput(["Y01", "Y02"]));
  await publishSession(file, { creationKey: relay.creationKey, ...options });
  const p = file.participants[0]!;
  const participant = await joinSession(parseParticipantLink(p.link), { app: "mpile", relayUrl: file.relayUrl, passcode: p.passcode, storage: memoryStorage(), ...options });
  await participant.submit({ piles: [] });

  const dir = await mkdtemp(join(tmpdir(), "session-cli-"));
  const keyFile = join(dir, "key.md");
  await writeFile(keyFile, renderSessionFile(file));
  const lines: string[] = [];
  const out = (t: string) => void lines.push(t);

  assert.equal(await main(["verify", keyFile], { out }), 0);
  assert.match(lines.pop()!, /^OK: this key file opens session "Synthetic test session" \(mpile, 2 participants\)/);

  const target = join(dir, "collected.json");
  assert.equal(await main(["collect", keyFile, "--out", target], { out, ...options }), 0);
  const collected = JSON.parse(await readFile(target, "utf8"));
  assert.equal(collected.format, "malverdesoftware-collection/v1");
  assert.deepEqual(collected.definition, sessionInput([]).definition);
  assert.deepEqual(collected.items.map((i: { label: string; kind: string }) => [i.label, i.kind]), [["Y01", "SUBMITTED"]]);
  await assert.rejects(main(["collect", keyFile, "--out", target], { out, ...options }), /EEXIST/);
  assert.equal(await main(["nonsense"], { out }), 2);
});
