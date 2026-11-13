import { fail } from "./http.ts";
import type { NewSlot } from "./store.ts";

export const ID = /^[A-Za-z0-9_-]{22}$/;
const HASH = /^[A-Za-z0-9_-]{43}$/;
const APP = /^[a-z0-9-]{1,40}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

const invalid = (message: string): never => fail(422, "VALIDATION_ERROR", message);

// Reads a JSON object body without ever buffering more than maxBytes.
export async function readBody(
  request: Request,
  maxBytes: number,
): Promise<{ raw: Uint8Array<ArrayBuffer>; data: Record<string, unknown> }> {
  if (!request.headers.get("Content-Type")?.toLowerCase().includes("application/json"))
    fail(415, "UNSUPPORTED_MEDIA_TYPE", "Send JSON.");
  const reader = request.body?.getReader();
  if (!reader) return invalid("The request body is missing.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      fail(413, "PAYLOAD_TOO_LARGE", "This request is too large.");
    }
    chunks.push(value);
  }
  const raw = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    raw.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return invalid("The request body is not valid JSON.");
  }
  if (typeof data !== "object" || data === null || Array.isArray(data))
    invalid("The request body must be a JSON object.");
  return { raw, data: data as Record<string, unknown> };
}

export const idField = (value: unknown, name: string): string =>
  typeof value === "string" && ID.test(value) ? value : invalid(`${name} must be a 22-character base64url ID.`);

export const hashField = (value: unknown, name: string): string =>
  typeof value === "string" && HASH.test(value) ? value : invalid(`${name} must be a 43-character base64url hash.`);

export const appField = (value: unknown): string =>
  typeof value === "string" && APP.test(value) ? value : invalid("app must be 1–40 lowercase letters, digits or hyphens.");

export const intField = (value: unknown, min: number, max: number, name: string): number =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max
    ? (value as number)
    : invalid(`${name} must be a whole number from ${min} to ${max}.`);

export const instantField = (value: unknown, name: string): Date =>
  typeof value === "string" && ISO_INSTANT.test(value) && !Number.isNaN(Date.parse(value))
    ? new Date(value)
    : invalid(`${name} must be an ISO 8601 UTC time, such as 2026-11-19T15:00:00.000Z.`);

// Checks the v1 envelope shape (never its contents) and returns it re-serialized from known fields only.
export function envelopeField(value: unknown, maxBytes: number, name = "envelope"): string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid(`${name} must be an envelope object.`);
  const e = value as Record<string, unknown>;
  const text = (field: string, length?: number) => {
    const v = e[field];
    if (typeof v !== "string" || !BASE64URL.test(v) || (length !== undefined && v.length !== length))
      invalid(`${name}.${field} is not valid.`);
    return v as string;
  };
  if (e.v !== 1) invalid(`${name} must be a version 1 envelope.`);
  let canonical: object;
  if (e.alg === "A256GCM") canonical = { v: 1, alg: e.alg, iv: text("iv", 16), ct: text("ct") };
  else if (e.alg === "ECDH-ES+A256GCM")
    canonical = { v: 1, alg: e.alg, epk: text("epk", 87), iv: text("iv", 16), ct: text("ct") };
  else return invalid(`${name}.alg is not supported.`);
  const serialized = JSON.stringify(canonical);
  if (serialized.length > maxBytes) fail(413, "PAYLOAD_TOO_LARGE", `${name} is too large.`);
  return serialized;
}

export function slotsField(value: unknown, maxSlots: number): NewSlot[] {
  if (!Array.isArray(value) || value.length === 0) return invalid("slots must be a non-empty list.");
  if (value.length > maxSlots) fail(422, "LIMIT_EXCEEDED", `A session can have at most ${maxSlots} participants.`);
  const slots = value.map((item, i) => {
    if (typeof item !== "object" || item === null) invalid(`slots[${i}] must be an object.`);
    const s = item as Record<string, unknown>;
    return { slotId: idField(s.slotId, `slots[${i}].slotId`), writeHash: hashField(s.writeTokenHash, `slots[${i}].writeTokenHash`) };
  });
  if (new Set(slots.map((s) => s.slotId)).size !== slots.length) invalid("slots must have unique slotId values.");
  return slots;
}
