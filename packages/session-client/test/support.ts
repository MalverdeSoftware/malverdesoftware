import { createRelay, memoryStore } from "@malverdesoftware/relay";
import type { RelayStore } from "@malverdesoftware/relay";
import { deriveSlot, hashToken, importRecipientPublicKey, randomSecret, seal, sealTo } from "@malverdesoftware/sealed-envelope";
import type { PrepareInput, SessionFile } from "../src/index.ts";

export const RELAY_URL = "https://mpile.example/relay";
export const PARTICIPANT_URL = "https://mpile.example/p";
export const FAST = { retryDelaysMs: [0, 0, 0] };

export const sessionInput = (labels: string[], definition: unknown = { cards: [{ id: "c1", text: "Synthetic card" }] }): PrepareInput => ({
  app: "mpile",
  title: "Synthetic test session",
  relayUrl: RELAY_URL,
  participantUrl: PARTICIPANT_URL,
  definition,
  participantLabels: labels,
});

export type Recorded = { url: string; method: string; headers: Record<string, string>; body: string };

// A real relay running in this process; every request is recorded for inspection.
export async function inProcessRelay(now?: () => Date) {
  const store: RelayStore = memoryStore();
  const creationKey = randomSecret();
  const relay = createRelay({ store, creationKeyHashes: [await hashToken(creationKey)], now });
  const requests: Recorded[] = [];
  let offline = false;
  const fetch = (async (input: string | URL, init: RequestInit = {}) => {
    if (offline) throw new TypeError("fetch failed");
    const body = typeof init.body === "string" ? init.body : "";
    requests.push({ url: String(input), method: init.method ?? "GET", headers: { ...(init.headers as Record<string, string>) }, body });
    return relay(new Request(input, init));
  }) as typeof globalThis.fetch;
  return {
    store,
    creationKey,
    fetch,
    requests,
    setOffline: (value: boolean) => {
      offline = value;
    },
  };
}

// Acts as a participant's browser would, using only sealed-envelope, for researcher-side tests.
export async function actAs(file: SessionFile, label: string, fetch: typeof globalThis.fetch) {
  const p = file.participants.find((x) => x.label === label)!;
  const { slotId, writeToken, draftKey } = await deriveSlot(p.slotSecret, p.passcode);
  const base = `${file.relayUrl}/v1/sessions/${file.sessionId}/slots/${slotId}`;
  const put = (path: string, body: unknown) =>
    fetch(`${base}/${path}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${writeToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const researcher = await importRecipientPublicKey(file.researcherPublicKey);
  return {
    slotId,
    writeToken,
    saveDraft: async (value: unknown, baseVersion: number) =>
      put("draft", { envelope: await seal(draftKey, value, { app: file.app, sessionId: file.sessionId, channel: "draft", slotId }), baseVersion }),
    submit: async (value: unknown, sealedForSlot = slotId) =>
      put("submission", {
        envelope: await sealTo(researcher, value, { app: file.app, sessionId: file.sessionId, channel: "submission", slotId: sealedForSlot }),
      }),
  };
}
