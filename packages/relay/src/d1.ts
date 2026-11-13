import type { SqlDatabase } from "./sql.ts";

// Structural subset of Cloudflare's D1Database, so the relay needs no Cloudflare types.
export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes?: number } }>;
}
export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
  batch(statements: D1PreparedStatementLike[]): Promise<{ meta: { changes?: number } }[]>;
}

export function d1Database(d1: D1DatabaseLike): SqlDatabase {
  const statement = (sql: string, params: unknown[] = []) => d1.prepare(sql).bind(...params);
  return {
    async run(sql, params) {
      const result = await statement(sql, params).run();
      return { changes: Number(result.meta.changes ?? 0) };
    },
    async first<T>(sql: string, params?: unknown[]) {
      return (await statement(sql, params).first<T>()) ?? null;
    },
    async all<T>(sql: string, params?: unknown[]) {
      return (await statement(sql, params).all<T>()).results;
    },
    async batch(statements) {
      // D1 runs a batch as one transaction.
      const results = await d1.batch(statements.map((s) => statement(s.sql, s.params)));
      return results.map((r) => ({ changes: Number(r.meta.changes ?? 0) }));
    },
  };
}
