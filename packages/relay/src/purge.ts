import type { RelayStore } from "./store.ts";

// Deletes every expired session and its data. Run hourly (a Cloudflare cron trigger, or serveNode's timer).
export const purgeExpired = (store: RelayStore, now: Date = new Date()): Promise<number> =>
  store.purgeExpired(now.toISOString());
