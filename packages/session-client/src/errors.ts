export type SessionErrorCode =
  | "BAD_INPUT"
  | "BAD_LINK"
  | "BAD_SESSION_FILE"
  | "NETWORK"
  | "INVALID_RELAY_RESPONSE"
  | "RELAY_REJECTED"
  | "DECRYPT_FAILED"
  | "TOO_LARGE"
  | "PASSCODE_REQUIRED"
  | "WRONG_PASSCODE"
  | "TOO_MANY_ATTEMPTS"
  | "VERSION_CONFLICT"
  | "ALREADY_SUBMITTED"
  | "SESSION_CLOSED"
  | "SESSION_EXPIRED"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "LIMIT_EXCEEDED"
  | "SESSION_EXISTS";

export class SessionError extends Error {
  readonly code: SessionErrorCode;
  readonly details: Record<string, unknown> | undefined;
  constructor(code: SessionErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "SessionError";
    this.code = code;
    this.details = details;
  }
}

// Declared with an explicit type so TypeScript treats calls as never returning.
export const fail: (code: SessionErrorCode, message: string, details?: Record<string, unknown>) => never = (
  code,
  message,
  details,
) => {
  throw new SessionError(code, message, details);
};
