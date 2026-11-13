// Node-only entry (@malverdesoftware/relay/node): keeps node:sqlite and node:http out of Worker bundles.
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { Readable } from "node:stream";
import { purgeExpired } from "./purge.ts";
import { schemaSql } from "./schema.ts";
import type { SqlDatabase } from "./sql.ts";
import type { RelayStore } from "./store.ts";

// Serves a relay handler over HTTP and purges expired sessions at start and hourly.
export async function serveNode(
  handler: (request: Request) => Promise<Response>,
  options: { host: string; port: number; store: RelayStore },
): Promise<{ url: string; close(): Promise<void> }> {
  async function respond(req: IncomingMessage, res: ServerResponse) {
    try {
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers))
        if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
      const hasBody = req.method !== "GET" && req.method !== "HEAD";
      const request = new Request(`http://${options.host}${req.url ?? "/"}`, {
        method: req.method,
        headers,
        body: hasBody ? (Readable.toWeb(req) as ReadableStream<Uint8Array>) : undefined,
        duplex: "half",
      } as RequestInit);
      const response = await handler(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(new Uint8Array(await response.arrayBuffer()));
    } catch {
      res.writeHead(500).end();
    }
  }
  const server = createServer((req, res) => void respond(req, res));
  await new Promise<void>((resolve) => server.listen(options.port, options.host, resolve));
  const purge = () => void purgeExpired(options.store).catch(() => undefined);
  purge();
  const timer = setInterval(purge, 3_600_000);
  timer.unref();
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : options.port;
  return {
    url: `http://${options.host}:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        clearInterval(timer);
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

// Opens (or creates) a SQLite file, or ":memory:", and applies the relay schema.
export function nodeSqliteDatabase(path: string): SqlDatabase {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  db.exec(schemaSql);
  return {
    async run(sql, params = []) {
      return { changes: Number(db.prepare(sql).run(...params).changes) };
    },
    async first<T>(sql: string, params: (string | number | null)[] = []) {
      return (db.prepare(sql).get(...params) as T | undefined) ?? null;
    },
    async all<T>(sql: string, params: (string | number | null)[] = []) {
      return db.prepare(sql).all(...params) as T[];
    },
    async batch(statements) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map((s) => ({ changes: Number(db.prepare(s.sql).run(...s.params).changes) }));
        db.exec("COMMIT");
        return results;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}
