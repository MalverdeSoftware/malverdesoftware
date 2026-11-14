#!/usr/bin/env node
// Reads a session's responses with only a key file and Node, without the app or its console.
//   malverdesoftware-session verify <key-file>
//   malverdesoftware-session collect <key-file> [--drafts] [--out <file.json>]
// collect calls the relay named in the key file and writes decrypted, readable JSON. That output is as
// sensitive as the key file: keep it where your study keeps participant data.
import { realpathSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { SessionError } from "./errors.ts";
import { readDefinition } from "./file.ts";
import { openResearcherSession } from "./researcher.ts";
import type { TransportOptions } from "./transport.ts";
import { verifySessionFile } from "./verify.ts";

const USAGE = `Usage:
  malverdesoftware-session verify <key-file>
  malverdesoftware-session collect <key-file> [--drafts] [--out <file.json>]`;

type Io = { out?: (text: string) => void } & TransportOptions;

export async function main(args: string[], io: Io = {}): Promise<number> {
  const { out = (text: string) => void process.stdout.write(text), ...transport } = io;
  const [command, path, ...rest] = args;
  if ((command !== "verify" && command !== "collect") || !path) {
    out(`${USAGE}\n`);
    return 2;
  }
  const { file, participants } = await verifySessionFile(await readFile(path, "utf8"));
  if (command === "verify") {
    out(`OK: this key file opens session "${file.title}" (${file.app}, ${participants} participant${participants === 1 ? "" : "s"}).\n`);
    return 0;
  }
  const drafts = rest.includes("--drafts");
  const outIndex = rest.indexOf("--out");
  const target = outIndex === -1 ? undefined : rest[outIndex + 1];
  if (outIndex !== -1 && !target) {
    out(`${USAGE}\n`);
    return 2;
  }
  const items = await openResearcherSession(file, transport).collect({ includeDrafts: drafts });
  const json = JSON.stringify(
    {
      format: "malverdesoftware-collection/v1",
      app: file.app,
      title: file.title,
      sessionId: file.sessionId,
      collectedAt: new Date().toISOString(),
      definition: await readDefinition(file),
      items,
    },
    null,
    2,
  );
  if (target) {
    await writeFile(target, `${json}\n`, { flag: "wx", mode: 0o600 });
    out(`Wrote ${items.length} responses to ${target}. It is readable data: store it like the key file.\n`);
  } else out(`${json}\n`);
  return 0;
}

const invoked = (() => {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();
if (invoked) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: unknown) => {
      process.stderr.write(`${error instanceof SessionError ? error.message : String(error)}\n`);
      process.exit(1);
    },
  );
}
