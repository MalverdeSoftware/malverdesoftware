import {
  EnvelopeError,
  deriveSlot,
  hashToken,
  importRecipientPrivateKey,
  open,
  openWith,
} from "@malverdesoftware/sealed-envelope";
import type { ContentKey, RecipientPrivateKey } from "@malverdesoftware/sealed-envelope";
import { fail } from "./errors.ts";
import { checkLabels, newParticipant } from "./file.ts";
import type { ParticipantEntry, SessionFile } from "./file.ts";
import { shapes, transport } from "./transport.ts";
import type { Call, Page, ParticipantStatus, TransportOptions } from "./transport.ts";

export type { ParticipantStatus } from "./transport.ts";

export type SessionStatus = {
  expiresAt: string;
  isClosed: boolean;
  // label is null for a participant missing from this copy of the file (added from a newer copy).
  participants: { label: string | null; status: ParticipantStatus; updatedAt: string | null }[];
};

export type CollectedResponse =
  | { label: string | null; kind: "SUBMITTED" | "DRAFT"; body: unknown; updatedAt: string }
  | { label: string | null; kind: "UNREADABLE"; problem: "DECRYPT_FAILED" | "NO_KEY"; updatedAt: string };

export type ResearcherSession = {
  readonly file: SessionFile; // current, including participants added or revoked through this object
  status(): Promise<SessionStatus>;
  collect(options?: { includeDrafts?: boolean }): Promise<CollectedResponse[]>;
  addParticipants(labels: string[]): Promise<SessionFile>; // save the returned file again, everywhere you keep it
  revokeParticipant(label: string): Promise<SessionFile>;
  close(): Promise<SessionStatus>;
  setExpiry(expiresAt: Date): Promise<SessionStatus>;
  destroy(): Promise<void>; // deletes everything on the relay; the local file remains
};

const KIND_ORDER = { SUBMITTED: 0, DRAFT: 1, UNREADABLE: 2 } as const;
const byLabel = (a: { label: string | null }, b: { label: string | null }) =>
  a.label === b.label ? 0 : a.label === null ? 1 : b.label === null ? -1 : a.label.localeCompare(b.label, "en", { numeric: true });

async function slotRegistrations(participants: ParticipantEntry[]) {
  const slots: { slotId: string; writeTokenHash: string }[] = [];
  for (const p of participants) {
    const { slotId, writeToken } = await deriveSlot(p.slotSecret, p.passcode);
    slots.push({ slotId, writeTokenHash: await hashToken(writeToken) });
  }
  return slots;
}

async function allPages<T>(call: Call, path: string, token: string, check: (v: unknown) => v is Page<T>) {
  const items: T[] = [];
  let cursor: string | null = null;
  do {
    const page: Page<T> = await call("GET", `${path}?limit=50${cursor ? `&cursor=${cursor}` : ""}`, { token, check });
    items.push(...page.data);
    cursor = page.nextCursor;
  } while (cursor);
  return items;
}

// Creates the session on the relay. The request is rebuilt identically from the file, so a retry,
// even after reopening the saved file, replays instead of creating a second session.
export async function publishSession(
  file: SessionFile,
  options: { creationKey: string } & TransportOptions,
): Promise<SessionStatus> {
  const body = JSON.stringify({
    sessionId: file.sessionId,
    app: file.app,
    adminTokenHash: await hashToken(file.adminToken),
    expiresInDays: file.expiresInDays,
    definition: file.definitionEnvelope,
    slots: await slotRegistrations(file.participants.filter((p) => !p.revokedAt)),
  });
  await transport(file.relayUrl, options)("POST", "/v1/sessions", { token: options.creationKey, body, check: shapes.session });
  return openResearcherSession(file, options).status();
}

export function openResearcherSession(file: SessionFile, options: TransportOptions = {}): ResearcherSession {
  let current = file;
  const call = transport(file.relayUrl, options);
  const path = `/v1/sessions/${file.sessionId}`;
  const token = file.adminToken;
  const context = (channel: "draft" | "submission", slotId: string) =>
    ({ app: file.app, sessionId: file.sessionId, channel, slotId }) as const;
  let privateKey: Promise<RecipientPrivateKey> | undefined;
  const draftKeys = new Map<string, Promise<ContentKey>>();
  const draftKey = (p: ParticipantEntry) => {
    let key = draftKeys.get(p.slotId);
    if (!key) draftKeys.set(p.slotId, (key = deriveSlot(p.slotSecret, p.passcode).then((d) => d.draftKey)));
    return key;
  };
  const labels = () => new Map(current.participants.map((p) => [p.slotId, p]));
  const opened = async (read: () => Promise<unknown>) => {
    try {
      return { ok: true as const, body: await read() };
    } catch (error) {
      if (error instanceof EnvelopeError) return { ok: false as const };
      throw error;
    }
  };

  async function status(): Promise<SessionStatus> {
    const [{ session }, slots] = await Promise.all([
      call("GET", path, { token, check: shapes.session }),
      allPages(call, `${path}/slots`, token, shapes.slots),
    ]);
    const known = labels();
    return {
      expiresAt: session.expiresAt,
      isClosed: session.isClosed,
      participants: slots
        .map((s) => ({ label: known.get(s.slotId)?.label ?? null, status: s.status, updatedAt: s.updatedAt }))
        .sort(byLabel),
    };
  }

  async function collect({ includeDrafts = false }: { includeDrafts?: boolean } = {}) {
    const known = labels();
    const results: CollectedResponse[] = [];
    const key = await (privateKey ??= importRecipientPrivateKey(current.researcherPrivateKey));
    for (const s of await allPages(call, `${path}/submissions`, token, shapes.submissions)) {
      const label = known.get(s.slotId)?.label ?? null;
      const r = await opened(() => openWith(key, s.envelope, context("submission", s.slotId)));
      results.push(
        r.ok
          ? { label, kind: "SUBMITTED", body: r.body, updatedAt: s.submittedAt }
          : { label, kind: "UNREADABLE", problem: "DECRYPT_FAILED", updatedAt: s.submittedAt },
      );
    }
    if (includeDrafts)
      for (const d of await allPages(call, `${path}/drafts`, token, shapes.drafts)) {
        const entry = known.get(d.slotId);
        if (!entry) {
          results.push({ label: null, kind: "UNREADABLE", problem: "NO_KEY", updatedAt: d.updatedAt });
          continue;
        }
        const k = await draftKey(entry);
        const r = await opened(() => open(k, d.envelope, context("draft", d.slotId)));
        results.push(
          r.ok
            ? { label: entry.label, kind: "DRAFT", body: r.body, updatedAt: d.updatedAt }
            : { label: entry.label, kind: "UNREADABLE", problem: "DECRYPT_FAILED", updatedAt: d.updatedAt },
        );
      }
    return results.sort((a, b) => byLabel(a, b) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  }

  async function addParticipants(newLabels: string[]) {
    checkLabels(newLabels, current.participants.map((p) => p.label));
    const addedAt = new Date().toISOString();
    const entries: ParticipantEntry[] = [];
    for (const label of newLabels) entries.push(await newParticipant(current, label, addedAt));
    const body = JSON.stringify({ slots: await slotRegistrations(entries) });
    await call("POST", `${path}/slots`, { token, body, check: shapes.session });
    current = { ...current, participants: [...current.participants, ...entries] };
    return current;
  }

  async function revokeParticipant(label: string) {
    const entry = current.participants.find((p) => p.label === label);
    if (!entry) fail("BAD_INPUT", `No participant is labeled ${label}.`);
    await call("DELETE", `${path}/slots/${entry!.slotId}`, { token, check: shapes.nothing });
    const revokedAt = entry!.revokedAt ?? new Date().toISOString();
    current = { ...current, participants: current.participants.map((p) => (p === entry ? { ...p, revokedAt } : p)) };
    return current;
  }

  async function patch(change: Record<string, unknown>) {
    await call("PATCH", path, { token, body: JSON.stringify(change), check: shapes.session });
    return status();
  }

  return {
    get file() {
      return current;
    },
    status,
    collect,
    addParticipants,
    revokeParticipant,
    close: () => patch({ isClosed: true }),
    setExpiry: (expiresAt: Date) => patch({ expiresAt: expiresAt.toISOString() }),
    destroy: async () => {
      await call("DELETE", path, { token, check: shapes.nothing });
    },
  };
}
