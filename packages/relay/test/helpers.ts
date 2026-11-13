// Shared test helpers. Envelopes here have the v1 shape but random bytes: the relay never opens them.
export const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));
export const id = () => b64url(random(16));
export const secret = () => b64url(random(32));

export async function sha256(text: string | Uint8Array<ArrayBuffer>) {
  const bytes = typeof text === "string" ? new TextEncoder().encode(text) : text;
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

export function envelope(alg: "A256GCM" | "ECDH-ES+A256GCM" = "A256GCM", blocks = 1) {
  const base = { v: 1, alg, iv: b64url(random(12)), ct: b64url(random(blocks * 1024 + 16)) };
  return alg === "A256GCM" ? base : { v: 1, alg, epk: b64url(random(65)), iv: base.iv, ct: base.ct };
}

export function sessionRow(overrides: Partial<Record<string, unknown>> = {}) {
  const now = new Date("2026-11-05T15:00:00.000Z");
  return {
    sessionId: id(),
    app: "mpile",
    adminHash: "a".repeat(43),
    requestHash: "r".repeat(43),
    definition: JSON.stringify(envelope()),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 14 * 86_400_000).toISOString(),
    closedAt: null,
    ...overrides,
  } as {
    sessionId: string;
    app: string;
    adminHash: string;
    requestHash: string;
    definition: string;
    createdAt: string;
    expiresAt: string;
    closedAt: string | null;
  };
}
