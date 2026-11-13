export type RelayErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "SESSION_EXISTS"
  | "SLOT_EXISTS"
  | "VERSION_CONFLICT"
  | "ALREADY_SUBMITTED"
  | "SESSION_CLOSED"
  | "SESSION_EXPIRED"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "VALIDATION_ERROR"
  | "LIMIT_EXCEEDED"
  | "RATE_LIMITED"
  | "INTERNAL";

export class RelayError extends Error {
  readonly status: number;
  readonly code: RelayErrorCode;
  readonly details: object | undefined;
  readonly headers: Record<string, string>;
  constructor(status: number, code: RelayErrorCode, message: string, details?: object, headers: Record<string, string> = {}) {
    super(message);
    this.name = "RelayError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.headers = headers;
  }
}

export const fail = (
  status: number,
  code: RelayErrorCode,
  message: string,
  details?: object,
  headers?: Record<string, string>,
): never => {
  throw new RelayError(status, code, message, details, headers);
};

const BASE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  // Bearer tokens are not cookies, so allowing any origin does not enable cross-site request forgery.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers": "Retry-After",
};

export const json = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { ...BASE_HEADERS, "Content-Type": "application/json; charset=utf-8", ...headers },
  });

export const empty = () => new Response(null, { status: 204, headers: BASE_HEADERS });

export const preflight = () =>
  new Response(null, {
    status: 204,
    headers: {
      ...BASE_HEADERS,
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "600",
    },
  });

// Logs only the error code and route template: never bodies, tokens, IDs or addresses.
export function errorResponse(error: unknown, route: string): Response {
  if (error instanceof RelayError)
    return json(
      { error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } },
      error.status,
      error.headers,
    );
  console.error("relay", "INTERNAL", route);
  return json(
    { error: { code: "INTERNAL", message: "The relay could not complete this request. Please retry." } },
    500,
  );
}

const b64url = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

// Same as sealed-envelope's hashToken for token text: SHA-256, base64url.
export async function sha256(input: string | Uint8Array<ArrayBuffer>): Promise<string> {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

export function bearer(request: Request): string {
  const match = /^Bearer ([A-Za-z0-9_-]{1,256})$/.exec(request.headers.get("Authorization") ?? "");
  if (!match) fail(401, "UNAUTHORIZED", "This request needs its access key.");
  return match![1]!;
}
