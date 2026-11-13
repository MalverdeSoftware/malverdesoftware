import {
  EnvelopeError,
  deriveSlot,
  hashToken,
  importContentKey,
  importRecipientPublicKey,
  open,
  seal,
  sealTo,
} from "@malverdesoftware/sealed-envelope";
import type { Channel, Envelope } from "@malverdesoftware/sealed-envelope";
import { SessionError, fail } from "./errors.ts";
import { isAllowedUrl } from "./link.ts";
import type { ParticipantCredentials } from "./link.ts";
import { defaultStorage, safeStorage } from "./storage.ts";
import type { KeyValueStorage } from "./storage.ts";
import { isEnvelope, isObject, shapes, transport } from "./transport.ts";
import type { ParticipantStatus, TransportOptions } from "./transport.ts";

export type JoinOptions = TransportOptions & {
  app: string;
  relayUrl: string;
  passcode?: string; // omitted: use the one remembered on this device, else PASSCODE_REQUIRED
  rememberOnDevice?: boolean; // default true; false on shared computers
  storage?: KeyValueStorage;
};

export type SaveResult = { state: "SAVED" } | { state: "SAVED_ON_DEVICE"; reason: "OFFLINE" | "SERVER_ERROR" };

export type ParticipantSession = {
  readonly definition: unknown;
  readonly status: ParticipantStatus | "SUBMITTING"; // SUBMITTING: stored on this device, not yet confirmed
  readonly draft: unknown | null;
  readonly submitted: unknown | null; // this device's own copy of what it submitted
  readonly expiresAt: string;
  readonly isClosed: boolean;
  saveDraft(body: unknown): Promise<SaveResult>;
  submit(body: unknown): Promise<void>;
  retryPending(): Promise<SaveResult>;
};

type LocalState = {
  draft?: unknown;
  baseVersion?: number;
  pending?: boolean;
  submission?: Envelope;
  submissionBody?: unknown;
  submitted?: { body: unknown; submittedAt: string };
};

const APP = /^[a-z0-9-]{1,40}$/;
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const isCode = (error: unknown, code: string): error is SessionError => error instanceof SessionError && error.code === code;

function readLocal(text: string | null): LocalState {
  if (!text) return {};
  try {
    const value = JSON.parse(text);
    if (!isObject(value)) return {};
    return {
      ...("draft" in value ? { draft: value.draft } : {}),
      ...(Number.isInteger(value.baseVersion) ? { baseVersion: value.baseVersion as number } : {}),
      ...(value.pending === true ? { pending: true } : {}),
      ...(isEnvelope(value.submission) ? { submission: value.submission, submissionBody: value.submissionBody } : {}),
      ...(isObject(value.submitted) && typeof value.submitted.submittedAt === "string"
        ? { submitted: { body: value.submitted.body, submittedAt: value.submitted.submittedAt } }
        : {}),
    };
  } catch {
    return {};
  }
}

const sealing = (error: unknown): never => {
  if (error instanceof EnvelopeError && error.code === "TOO_LARGE")
    fail("TOO_LARGE", "This response is too large to save. Remove some text and try again.");
  if (error instanceof EnvelopeError) fail("BAD_INPUT", "This response must be plain JSON data.");
  throw error;
};

export async function joinSession(credentials: ParticipantCredentials, options: JoinOptions): Promise<ParticipantSession> {
  const { app, relayUrl, rememberOnDevice = true } = options;
  if (typeof app !== "string" || !APP.test(app) || !isAllowedUrl(relayUrl))
    fail("BAD_INPUT", "The app name or relay address is not valid.");
  const { sessionId, definitionKey, slotSecret } = credentials;
  const storage = safeStorage(options.storage ?? defaultStorage());
  const prefix = `malverdesoftware:${app}:${sessionId}:${await hashToken(slotSecret).catch(() => fail("BAD_LINK", "This link is incomplete. Open the full link you were sent."))}`;
  const passcodeKey = `${prefix}:passcode`;
  const stateKey = `${prefix}:state`;

  const passcode = options.passcode ?? storage.get(passcodeKey);
  if (!passcode) fail("PASSCODE_REQUIRED", "Enter the six-digit passcode you were sent.");
  const slot = await deriveSlot(slotSecret, passcode!).catch((error: unknown): never => {
    if (error instanceof EnvelopeError && error.code === "BAD_FORMAT") fail("WRONG_PASSCODE", "A passcode is six digits.");
    if (error instanceof EnvelopeError) fail("BAD_LINK", "This link is incomplete. Open the full link you were sent.");
    throw error;
  });
  const call = transport(relayUrl, options);
  const path = `/v1/sessions/${sessionId}/slots/${slot.slotId}`;
  const token = slot.writeToken;
  const context = (channel: Channel) => ({ app, sessionId, channel, slotId: slot.slotId });
  const forgetPasscode = () => storage.remove(passcodeKey);

  const view = await call("GET", path, { token, check: shapes.view }).catch((error: unknown): never => {
    if (isCode(error, "FORBIDDEN")) {
      forgetPasscode();
      fail("WRONG_PASSCODE", "That passcode does not match this link.");
    }
    throw error;
  });

  const unreadable = (): never => fail("DECRYPT_FAILED", "This activity could not be opened. Check that you used the full link.");
  const definitionKeyValue = await importContentKey(definitionKey).catch(() => fail("BAD_LINK", "This link is incomplete. Open the full link you were sent."));
  const payload = await open(definitionKeyValue, view.definition, { app, sessionId, channel: "definition" }).catch(unreadable);
  if (!isObject(payload) || payload.v !== 1 || typeof payload.researcherPublicKey !== "string" || !("appDefinition" in payload))
    unreadable();
  const researcherKey = await importRecipientPublicKey((payload as { researcherPublicKey: string }).researcherPublicKey).catch(unreadable);
  const relayDraft = view.draft ? await open(slot.draftKey, view.draft, context("draft")).catch(unreadable) : null;

  let local = readLocal(storage.get(stateKey));
  const saveLocal = () => storage.set(stateKey, JSON.stringify(local));
  const state = {
    status: view.slot.status as ParticipantStatus | "SUBMITTING",
    draft: relayDraft as unknown,
    baseVersion: view.slot.draftVersion,
    expiresAt: view.session.expiresAt,
    isClosed: view.session.isClosed,
  };

  if (view.slot.status === "SUBMITTED") {
    local = local.submitted ? { submitted: local.submitted } : {};
    state.draft = null;
  } else if (local.submission) {
    state.status = "SUBMITTING";
    state.draft = local.submissionBody ?? local.draft ?? relayDraft;
  } else if (local.pending && "draft" in local) {
    // An unsynced draft from this device wins; syncing will report a conflict if another device saved since.
    state.draft = local.draft;
    state.baseVersion = local.baseVersion ?? view.slot.draftVersion;
    if (state.status === "NOT_STARTED") state.status = "IN_PROGRESS";
  } else {
    local = { ...local, draft: relayDraft, baseVersion: view.slot.draftVersion, pending: false };
  }
  saveLocal();
  if (rememberOnDevice && state.status !== "SUBMITTED") storage.set(passcodeKey, passcode!);
  else forgetPasscode();

  // Saves and submissions run one at a time, so an autosave never races itself.
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const run = chain.then(task, task);
    chain = run.catch(() => undefined);
    return run;
  };

  function confirmDraft(version: number) {
    state.baseVersion = version;
    local = { ...local, draft: state.draft, baseVersion: version, pending: false };
    saveLocal();
  }

  async function syncDraft(): Promise<SaveResult> {
    const body = state.draft;
    const envelope = await seal(slot.draftKey, body, context("draft")).catch(sealing);
    try {
      const saved = await call("PUT", `${path}/draft`, {
        token,
        body: JSON.stringify({ envelope, baseVersion: state.baseVersion }),
        check: shapes.draftSaved,
      });
      confirmDraft(saved.draftVersion);
      return { state: "SAVED" };
    } catch (error) {
      if (isCode(error, "NETWORK"))
        return { state: "SAVED_ON_DEVICE", reason: error.details?.reason === "SERVER_ERROR" ? "SERVER_ERROR" : "OFFLINE" };
      if (isCode(error, "VERSION_CONFLICT") && error.details?.draftVersion === state.baseVersion + 1) {
        // The outcome of an earlier attempt was unknown; if the stored draft is this one, it was saved.
        const latest = await call("GET", path, { token, check: shapes.view });
        const stored = latest.draft ? await open(slot.draftKey, latest.draft, context("draft")).catch(() => undefined) : undefined;
        if (stored !== undefined && sameJson(stored, body)) {
          confirmDraft(latest.slot.draftVersion);
          return { state: "SAVED" };
        }
      }
      if (isCode(error, "SESSION_CLOSED")) state.isClosed = true;
      if (isCode(error, "ALREADY_SUBMITTED")) markSubmitted(null);
      throw error;
    }
  }

  function markSubmitted(submitted: LocalState["submitted"] | null) {
    local = submitted ? { submitted } : {};
    saveLocal();
    state.status = "SUBMITTED";
    state.draft = null;
    forgetPasscode();
  }

  async function sendSubmission(): Promise<void> {
    try {
      const { submittedAt } = await call("PUT", `${path}/submission`, {
        token,
        body: JSON.stringify({ envelope: local.submission }),
        check: shapes.submitted,
      });
      markSubmitted({ body: local.submissionBody, submittedAt });
    } catch (error) {
      if (isCode(error, "ALREADY_SUBMITTED")) markSubmitted(null);
      if (isCode(error, "SESSION_CLOSED")) {
        local = { ...local, submission: undefined, submissionBody: undefined };
        saveLocal();
        state.status = state.draft === null ? "NOT_STARTED" : "IN_PROGRESS";
        state.isClosed = true;
      }
      throw error;
    }
  }

  return {
    get definition() {
      return (payload as { appDefinition: unknown }).appDefinition;
    },
    get status() {
      return state.status;
    },
    get draft() {
      return state.draft;
    },
    get submitted() {
      return local.submitted?.body ?? null;
    },
    get expiresAt() {
      return state.expiresAt;
    },
    get isClosed() {
      return state.isClosed;
    },
    saveDraft(body: unknown) {
      if (state.status === "SUBMITTED" || state.status === "SUBMITTING")
        return Promise.reject(new SessionError("ALREADY_SUBMITTED", "This response has already been submitted."));
      // Saved on the device at once; synced to the relay in order.
      state.draft = body;
      if (state.status === "NOT_STARTED") state.status = "IN_PROGRESS";
      local = { ...local, draft: body, baseVersion: state.baseVersion, pending: true };
      saveLocal();
      return serial(syncDraft);
    },
    submit(body: unknown) {
      return serial(async () => {
        if (state.status === "SUBMITTED") fail("ALREADY_SUBMITTED", "This response has already been submitted.");
        if (!local.submission) {
          // Stored before sending, so a retry (even after a reload) sends exactly the same bytes.
          const envelope = await sealTo(researcherKey, body, context("submission")).catch(sealing);
          local = { ...local, submission: envelope, submissionBody: body };
          saveLocal();
          state.status = "SUBMITTING";
          state.draft = body;
        }
        await sendSubmission();
      });
    },
    retryPending() {
      return serial(async (): Promise<SaveResult> => {
        if (local.submission) {
          try {
            await sendSubmission();
            return { state: "SAVED" };
          } catch (error) {
            if (isCode(error, "NETWORK"))
              return { state: "SAVED_ON_DEVICE", reason: error.details?.reason === "SERVER_ERROR" ? "SERVER_ERROR" : "OFFLINE" };
            throw error;
          }
        }
        if (local.pending) return syncDraft();
        return { state: "SAVED" };
      });
    },
  };
}
