// Local relay for development with synthetic data only: npm run relay:dev
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRelay, sqlStore } from "../src/index.ts";
import { sha256 } from "../src/http.ts";
import { nodeSqliteDatabase, serveNode } from "../src/node.ts";

const dir = fileURLToPath(new URL("../../../.relay-dev/", import.meta.url));
mkdirSync(dir, { recursive: true });
const creationKey = process.env.RELAY_DEV_CREATION_KEY ?? "dev-creation-key-synthetic-data-only";
const store = sqlStore(nodeSqliteDatabase(`${dir}relay.sqlite`));
const relay = createRelay({ store, creationKeyHashes: [await sha256(creationKey)] });
const server = await serveNode(relay, { host: "127.0.0.1", port: Number(process.env.PORT ?? 8787), store });

console.log(`Development relay at ${server.url}/relay (synthetic data only)`);
console.log(`Creation key: ${creationKey}`);
console.log(`Data file: ${dir}relay.sqlite`);
process.on("SIGINT", () => void server.close().then(() => process.exit(0)));
