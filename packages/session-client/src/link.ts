import { fail } from "./errors.ts";

export type ParticipantCredentials = { sessionId: string; definitionKey: string; slotSecret: string };

const ID = /^[A-Za-z0-9_-]{22}$/;
const SECRET = /^[A-Za-z0-9_-]{43}$/;

// Everything secret sits after "#", which browsers never send to servers or in Referer headers.
export const buildLink = (participantUrl: string, c: ParticipantCredentials) =>
  `${participantUrl}#v1.${c.sessionId}.${c.definitionKey}.${c.slotSecret}`;

export function parseParticipantLink(url: string): ParticipantCredentials {
  const text = typeof url === "string" ? url.trim() : "";
  const fragment = text.includes("#") ? text.slice(text.indexOf("#") + 1) : "";
  const [version, sessionId = "", definitionKey = "", slotSecret = "", ...rest] = fragment.split(".");
  if (version !== "v1" || rest.length || !ID.test(sessionId) || !SECRET.test(definitionKey) || !SECRET.test(slotSecret))
    fail("BAD_LINK", "This link is incomplete. Open the full link you were sent.");
  return { sessionId, definitionKey, slotSecret };
}

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

// https everywhere, except plain http on this computer for development.
export function isAllowedUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    if (url.hash || url.search || url.username || url.password) return false;
    return url.protocol === "https:" || (url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname));
  } catch {
    return false;
  }
}
