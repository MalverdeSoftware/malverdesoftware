export type Bytes = Uint8Array<ArrayBuffer>;

export type EnvelopeErrorCode =
  | "BAD_FORMAT"
  | "BAD_KEY"
  | "UNSUPPORTED_VERSION"
  | "TOO_LARGE"
  | "DECRYPT_FAILED";

export class EnvelopeError extends Error {
  readonly code: EnvelopeErrorCode;
  constructor(code: EnvelopeErrorCode, message: string) {
    super(message);
    this.name = "EnvelopeError";
    this.code = code;
  }
}

export const fail = (code: EnvelopeErrorCode, message: string): never => {
  throw new EnvelopeError(code, message);
};

export const encoder = new TextEncoder();
export const decoder = new TextDecoder("utf-8", { fatal: true });

const BASE64URL = /^[A-Za-z0-9_-]*$/;

export function toBase64url(bytes: Bytes): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Rejects anything that does not re-encode to the same text, so each value has one spelling.
export function fromBase64url(text: unknown, expectedBytes?: number): Bytes {
  if (typeof text !== "string" || !BASE64URL.test(text) || text.length % 4 === 1)
    fail("BAD_FORMAT", "Expected base64url text.");
  const padded =
    (text as string).replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - ((text as string).length % 4)) % 4);
  const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  if (toBase64url(bytes) !== text) fail("BAD_FORMAT", "Expected canonical base64url text.");
  if (expectedBytes !== undefined && bytes.length !== expectedBytes)
    fail("BAD_FORMAT", `Expected ${expectedBytes} bytes.`);
  return bytes;
}

export function randomBytes(length: number): Bytes {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function concat(...parts: Bytes[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
