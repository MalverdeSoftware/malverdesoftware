import {
  EnvelopeError,
  deriveSlot,
  generateRecipientKeys,
  importContentKey,
  open,
  randomId,
  randomPasscode,
  randomSecret,
  seal,
} from "@malverdesoftware/sealed-envelope";
import type { Envelope } from "@malverdesoftware/sealed-envelope";
import { fail } from "./errors.ts";
import { buildLink, isAllowedUrl } from "./link.ts";
import { APP, ID, SECRET } from "./patterns.ts";
import { isObject } from "./transport.ts";

export type ParticipantEntry = {
  label: string;
  slotSecret: string;
  slotId: string;
  passcode: string;
  link: string;
  addedAt: string;
  revokedAt?: string;
};

export type SessionFile = {
  format: "malverdesoftware-session/v1";
  app: string;
  title: string;
  relayUrl: string;
  participantUrl: string;
  sessionId: string;
  adminToken: string;
  definitionKey: string;
  researcherPublicKey: string;
  researcherPrivateKey: string;
  definitionEnvelope: Envelope;
  createdAt: string;
  expiresInDays: number;
  participants: ParticipantEntry[];
};

export type PrepareInput = {
  app: string;
  title: string;
  relayUrl: string;
  participantUrl: string;
  definition: unknown;
  participantLabels: string[];
  expiresInDays?: number;
};

export const FORMAT = "malverdesoftware-session/v1";
export const MAX_PARTICIPANTS = 200;
const MARKER = "<!-- malverdesoftware-session-data: do not edit below this line -->";
const LABEL = /^[A-Za-z0-9 _.-]{1,40}$/;
const PUBLIC_KEY = /^[A-Za-z0-9_-]{87}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const PASSCODE = /^[0-9]{6}$/;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const DAY = 86_400_000;

export const definitionContext = (app: string, sessionId: string) =>
  ({ app, sessionId, channel: "definition" }) as const;

export function checkLabels(labels: unknown, existing: string[] = []): string[] {
  if (!Array.isArray(labels) || labels.length === 0) fail("BAD_INPUT", "Add at least one participant label.");
  const all = [...existing, ...(labels as unknown[])];
  for (const label of labels as unknown[])
    if (typeof label !== "string" || !LABEL.test(label))
      fail("BAD_INPUT", "Participant labels use 1–40 letters, digits, spaces, dots, dashes or underscores.");
  if (new Set(all).size !== all.length) fail("BAD_INPUT", "Participant labels must be unique.");
  if (all.length > MAX_PARTICIPANTS) fail("LIMIT_EXCEEDED", `A session can have at most ${MAX_PARTICIPANTS} participants.`);
  return labels as string[];
}

export async function newParticipant(
  file: Pick<SessionFile, "participantUrl" | "sessionId" | "definitionKey">,
  label: string,
  addedAt: string,
): Promise<ParticipantEntry> {
  const slotSecret = randomSecret();
  const passcode = randomPasscode();
  const { slotId } = await deriveSlot(slotSecret, passcode);
  const link = buildLink(file.participantUrl, { sessionId: file.sessionId, definitionKey: file.definitionKey, slotSecret });
  return { label, slotSecret, slotId, passcode, link, addedAt };
}

// Local only: generates every secret and seals the definition once, so publishing can be retried byte for byte.
export async function prepareSession(input: PrepareInput): Promise<SessionFile> {
  if (typeof input !== "object" || input === null) fail("BAD_INPUT", "Session details are missing.");
  const { app, title, relayUrl, participantUrl, definition, expiresInDays = 14 } = input;
  if (typeof app !== "string" || !APP.test(app)) fail("BAD_INPUT", "app must be 1–40 lowercase letters, digits or hyphens.");
  if (typeof title !== "string" || !title.trim() || title.length > 160 || /[\u0000-\u001f]/.test(title))
    fail("BAD_INPUT", "Give the session a title of up to 160 characters on one line.");
  if (!isAllowedUrl(relayUrl) || !isAllowedUrl(participantUrl))
    fail("BAD_INPUT", "Use https:// addresses (or http://localhost while developing).");
  if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 30)
    fail("BAD_INPUT", "expiresInDays must be a whole number from 1 to 30.");
  const labels = checkLabels(input.participantLabels);
  const sessionId = randomId();
  const definitionKey = randomSecret();
  const keys = await generateRecipientKeys();
  const createdAt = new Date().toISOString();
  const definitionEnvelope = await seal(
    await importContentKey(definitionKey),
    { v: 1, researcherPublicKey: keys.publicKey, appDefinition: definition },
    definitionContext(app, sessionId),
  ).catch((error: unknown): never => {
    if (error instanceof EnvelopeError && error.code === "TOO_LARGE")
      fail("TOO_LARGE", "This activity is too large to share. Use fewer or shorter cards.");
    if (error instanceof EnvelopeError) fail("BAD_INPUT", "The activity definition must be plain JSON data.");
    throw error;
  });
  const base = { participantUrl, sessionId, definitionKey };
  const participants: ParticipantEntry[] = [];
  for (const label of labels) participants.push(await newParticipant(base, label, createdAt));
  return {
    format: FORMAT,
    app,
    title: title.trim(),
    relayUrl,
    participantUrl,
    sessionId,
    adminToken: randomSecret(),
    definitionKey,
    researcherPublicKey: keys.publicKey,
    researcherPrivateKey: keys.privateKey,
    definitionEnvelope,
    createdAt,
    expiresInDays,
    participants,
  };
}

// The researcher's copy of what participants see, opened from the key file alone (no relay call),
// so an app can check and analyze collected responses after reopening a saved file.
export async function readDefinition(file: SessionFile): Promise<unknown> {
  const unreadable = (): never => bad("the activity definition cannot be opened");
  const key = await importContentKey(file.definitionKey).catch(unreadable);
  const payload = await open(key, file.definitionEnvelope, definitionContext(file.app, file.sessionId)).catch(unreadable);
  if (!isObject(payload) || payload.v !== 1 || payload.researcherPublicKey !== file.researcherPublicKey || !("appDefinition" in payload))
    unreadable();
  return (payload as { appDefinition: unknown }).appDefinition;
}

const longDate = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "America/New_York" }).format(new Date(iso));

export function renderSessionFile(file: SessionFile): string {
  const active = file.participants.filter((p) => !p.revokedAt);
  const expires = new Date(Date.parse(file.createdAt) + file.expiresInDays * DAY).toISOString();
  return [
    `# MalverdeSoftware session key: ${file.title}`,
    "",
    "> **Keep this file private.** Anyone who has it can read every response in this session.",
    "> Keep it only on your computer and in your study team's Teams channel files. Do not put it",
    "> in a git repository, email it, or paste it into a chat or AI tool. If it is lost, the",
    "> responses cannot be recovered by anyone.",
    "",
    "| | |",
    "|---|---|",
    `| App | ${file.app} |`,
    `| Created | ${longDate(file.createdAt)} |`,
    `| Deletes itself | ${longDate(expires)} (unless you delete it sooner) |`,
    "",
    "## Personal participant links",
    "",
    "Send each person only their own link and passcode, ideally through different channels.",
    "",
    "| Participant | Link | Passcode |",
    "|---|---|---|",
    ...active.map((p) => `| ${p.label} | ${p.link} | ${p.passcode} |`),
    "",
    MARKER,
    "```json",
    JSON.stringify(file, null, 2),
    "```",
    "",
  ].join("\n");
}

const bad = (detail: string): never =>
  fail("BAD_SESSION_FILE", `This is not a valid session key file (${detail}). Use the file exactly as it was saved.`);

function checkParticipant(value: unknown, file: SessionFile, index: number): ParticipantEntry {
  const p = (typeof value === "object" && value !== null ? value : bad(`participant ${index + 1}`)) as Record<string, unknown>;
  const ok =
    typeof p.label === "string" && LABEL.test(p.label) &&
    typeof p.slotSecret === "string" && SECRET.test(p.slotSecret) &&
    typeof p.slotId === "string" && ID.test(p.slotId) &&
    typeof p.passcode === "string" && PASSCODE.test(p.passcode) &&
    typeof p.addedAt === "string" && INSTANT.test(p.addedAt) &&
    (p.revokedAt === undefined || (typeof p.revokedAt === "string" && INSTANT.test(p.revokedAt))) &&
    p.link === buildLink(file.participantUrl, { sessionId: file.sessionId, definitionKey: file.definitionKey, slotSecret: p.slotSecret as string });
  if (!ok) bad(`participant ${index + 1}`);
  return {
    label: p.label as string,
    slotSecret: p.slotSecret as string,
    slotId: p.slotId as string,
    passcode: p.passcode as string,
    link: p.link as string,
    addedAt: p.addedAt as string,
    ...(p.revokedAt ? { revokedAt: p.revokedAt as string } : {}),
  };
}

export function parseSessionFile(markdown: string): SessionFile {
  if (typeof markdown !== "string") return bad("not text");
  const start = markdown.lastIndexOf(MARKER);
  if (start === -1) bad("data section missing");
  const match = /```json\n([\s\S]*?)\n```/.exec(markdown.slice(start));
  if (!match) bad("data section missing");
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(match![1]!);
  } catch {
    return bad("data section damaged");
  }
  if (typeof data !== "object" || data === null || data.format !== FORMAT) bad("unknown format");
  const e = data.definitionEnvelope as Record<string, unknown> | undefined;
  const envelopeOk =
    typeof e === "object" && e !== null && e.v === 1 && e.alg === "A256GCM" &&
    typeof e.iv === "string" && BASE64URL.test(e.iv) && typeof e.ct === "string" && BASE64URL.test(e.ct);
  const ok =
    typeof data.app === "string" && APP.test(data.app) &&
    typeof data.title === "string" && data.title.length > 0 && data.title.length <= 160 &&
    isAllowedUrl(data.relayUrl) && isAllowedUrl(data.participantUrl) &&
    typeof data.sessionId === "string" && ID.test(data.sessionId) &&
    typeof data.adminToken === "string" && SECRET.test(data.adminToken) &&
    typeof data.definitionKey === "string" && SECRET.test(data.definitionKey) &&
    typeof data.researcherPublicKey === "string" && PUBLIC_KEY.test(data.researcherPublicKey) &&
    typeof data.researcherPrivateKey === "string" && BASE64URL.test(data.researcherPrivateKey) &&
    envelopeOk &&
    typeof data.createdAt === "string" && INSTANT.test(data.createdAt) &&
    Number.isInteger(data.expiresInDays) && (data.expiresInDays as number) >= 1 && (data.expiresInDays as number) <= 30 &&
    Array.isArray(data.participants) && data.participants.length >= 1 && data.participants.length <= MAX_PARTICIPANTS;
  if (!ok) bad("fields damaged");
  const file = {
    format: FORMAT,
    app: data.app,
    title: data.title,
    relayUrl: data.relayUrl,
    participantUrl: data.participantUrl,
    sessionId: data.sessionId,
    adminToken: data.adminToken,
    definitionKey: data.definitionKey,
    researcherPublicKey: data.researcherPublicKey,
    researcherPrivateKey: data.researcherPrivateKey,
    definitionEnvelope: { v: 1, alg: "A256GCM", iv: e!.iv, ct: e!.ct },
    createdAt: data.createdAt,
    expiresInDays: data.expiresInDays,
    participants: [],
  } as unknown as SessionFile;
  file.participants = (data.participants as unknown[]).map((p, i) => checkParticipant(p, file, i));
  const labels = file.participants.map((p) => p.label);
  const slotIds = file.participants.map((p) => p.slotId);
  if (new Set(labels).size !== labels.length || new Set(slotIds).size !== slotIds.length) bad("repeated participants");
  return file;
}
