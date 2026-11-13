import type { Envelope } from "@malverdesoftware/sealed-envelope";
import { fail } from "./errors.ts";
import type { SessionErrorCode } from "./errors.ts";

export type TransportOptions = {
  fetch?: typeof fetch;
  retryDelaysMs?: number[]; // waits before each retry; tests pass zeros
};

export type Call = <T>(
  method: string,
  path: string,
  request: { token?: string; body?: string; check: (value: unknown) => value is T },
) => Promise<T>;

const RETRYABLE = new Set([502, 503, 504]);
const DEFAULT_DELAYS = [500, 1000, 2000];
const RELAY_CODES: Record<string, SessionErrorCode> = {
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  SESSION_EXISTS: "SESSION_EXISTS",
  VERSION_CONFLICT: "VERSION_CONFLICT",
  ALREADY_SUBMITTED: "ALREADY_SUBMITTED",
  SESSION_CLOSED: "SESSION_CLOSED",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  PAYLOAD_TOO_LARGE: "TOO_LARGE",
  LIMIT_EXCEEDED: "LIMIT_EXCEEDED",
  RATE_LIMITED: "TOO_MANY_ATTEMPTS",
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const offline = () => fail("NETWORK", "The connection dropped. Your work is safe on this device; try again.", { reason: "OFFLINE" });

// Every call this package makes is safe to repeat, so network failures and 502/503/504 are retried.
// Other errors are never retried. Bodies arrive pre-serialized, so a retry sends identical bytes.
export function transport(relayUrl: string, options: TransportOptions = {}): Call {
  const fetcher = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const delays = options.retryDelaysMs ?? DEFAULT_DELAYS;
  const base = relayUrl.replace(/\/+$/, "");

  return async function call<T>(
    method: string,
    path: string,
    { token, body, check }: { token?: string; body?: string; check: (value: unknown) => value is T },
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    let response: Response | undefined;
    for (let attempt = 0; ; attempt++) {
      try {
        response = await fetcher(`${base}${path}`, { method, headers, body });
        if (!RETRYABLE.has(response.status) || attempt >= delays.length) break;
      } catch {
        if (attempt >= delays.length) offline();
      }
      await wait(delays[attempt]!);
    }
    if (RETRYABLE.has(response!.status) || response!.status === 500)
      fail("NETWORK", "The server is having trouble. Your work is safe on this device; try again.", {
        reason: "SERVER_ERROR",
        status: response!.status,
      });
    let text = "";
    try {
      text = await response!.text();
    } catch {
      offline();
    }
    let data: unknown;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        fail("INVALID_RELAY_RESPONSE", "The server sent an unreadable reply.");
      }
    }
    if (!response!.ok) {
      const error = isObject(data) && isObject(data.error) ? data.error : null;
      if (!error || typeof error.code !== "string")
        fail("INVALID_RELAY_RESPONSE", `The server refused the request (${response!.status}).`);
      fail(
        RELAY_CODES[error!.code as string] ?? "RELAY_REJECTED",
        typeof error!.message === "string" ? error!.message : "The server refused the request.",
        { relayCode: error!.code, ...(isObject(error!.details) ? error!.details : {}) },
      );
    }
    if (!check(data)) fail("INVALID_RELAY_RESPONSE", "The server sent an unexpected reply.");
    return data as T;
  };
}

// Shapes of relay replies. Relay responses are untrusted input: check before use.
export type ParticipantStatus = "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED";
export type RelaySession = { sessionId: string; expiresAt: string; isClosed: boolean; slotCount: number };
export type RelaySlot = { slotId: string; status: ParticipantStatus; draftVersion: number; updatedAt: string | null; submittedAt: string | null };
export type Page<T> = { data: T[]; nextCursor: string | null };

export const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isTextOrNull = (v: unknown) => v === null || isText(v);
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const STATUSES = new Set(["NOT_STARTED", "IN_PROGRESS", "SUBMITTED"]);

export const isEnvelope = (v: unknown): v is Envelope =>
  isObject(v) &&
  v.v === 1 &&
  isText(v.iv) &&
  isText(v.ct) &&
  (v.alg === "A256GCM" || (v.alg === "ECDH-ES+A256GCM" && isText(v.epk)));

const isRelaySession = (v: unknown): v is RelaySession =>
  isObject(v) && isText(v.sessionId) && isText(v.expiresAt) && typeof v.isClosed === "boolean" && isCount(v.slotCount);

const isRelaySlot = (v: unknown): v is RelaySlot =>
  isObject(v) &&
  isText(v.slotId) &&
  STATUSES.has(v.status as string) &&
  isCount(v.draftVersion) &&
  isTextOrNull(v.updatedAt) &&
  isTextOrNull(v.submittedAt);

const isPage = <T>(item: (v: unknown) => v is T) => (v: unknown): v is Page<T> =>
  isObject(v) && Array.isArray(v.data) && v.data.every(item) && isTextOrNull(v.nextCursor);

export const shapes = {
  nothing: (v: unknown): v is undefined => v === undefined,
  session: (v: unknown): v is { session: RelaySession } => isObject(v) && isRelaySession(v.session),
  slots: isPage(isRelaySlot),
  drafts: isPage((v: unknown): v is { slotId: string; envelope: Envelope; draftVersion: number; updatedAt: string } =>
    isObject(v) && isText(v.slotId) && isEnvelope(v.envelope) && isCount(v.draftVersion) && isText(v.updatedAt),
  ),
  submissions: isPage((v: unknown): v is { slotId: string; envelope: Envelope; submittedAt: string } =>
    isObject(v) && isText(v.slotId) && isEnvelope(v.envelope) && isText(v.submittedAt),
  ),
  view: (v: unknown): v is { slot: RelaySlot; definition: Envelope; draft: Envelope | null; session: { expiresAt: string; isClosed: boolean } } =>
    isObject(v) &&
    isRelaySlot(v.slot) &&
    isEnvelope(v.definition) &&
    (v.draft === null || isEnvelope(v.draft)) &&
    isObject(v.session) &&
    isText(v.session.expiresAt) &&
    typeof v.session.isClosed === "boolean",
  draftSaved: (v: unknown): v is { draftVersion: number; updatedAt: string } =>
    isObject(v) && isCount(v.draftVersion) && isText(v.updatedAt),
  submitted: (v: unknown): v is { submittedAt: string } => isObject(v) && isText(v.submittedAt),
};
