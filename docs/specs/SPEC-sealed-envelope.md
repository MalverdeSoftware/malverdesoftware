# Spec: sealed-envelope

Module id `sealed-envelope` · October 25, 2026 · **Status: approved by the author on October 25; passcodes were added the same day at their suggestion.** Depends on nothing. Commands, structure, code style and repository-wide boundaries are in the [capability map](../CONVENTIONS.md).

## Objective

Give every MalverdeSoftware app one small, audited way to seal and open data in the browser, so the relay only ever stores ciphertext. The consumers are `session-client` now, other apps' clients later, and possibly a Python implementation for mVote's CLI, which must be able to read the same envelopes.

What it protects, and from whom:

| Holder | Can read |
|---|---|
| Relay operator (the vendor) | Nothing inside an envelope. Sees sizes rounded up to 1 KiB, and timing. |
| Participant with their personal link and passcode | The shared definition and their own draft |
| Researcher with the session key file | Everything in the session |
| Someone holding a leaked link but not the passcode | Nothing. Without the passcode they cannot derive the write token the relay requires, and the relay locks the slot after 5 wrong guesses. |
| Someone holding both the link and the passcode | The same as that participant, until they submit. Submissions are sealed to the researcher, so even both together cannot open them. |

## Interface

All functions are asynchronous where WebCrypto is. Secrets cross the boundary as base64url strings (no padding) so they can sit in links and in the session file. Keys inside the process are non-extractable `CryptoKey` values.

```ts
// Secrets and keys
export function randomSecret(): string;                              // 32 random bytes → 43 chars
export function randomId(): string;                                  // 16 random bytes → 22 chars
export function randomPasscode(): string;                            // 6 decimal digits, uniform
export function importContentKey(secret: string): Promise<ContentKey>;
export function generateRecipientKeys(): Promise<{ publicKey: string; privateKey: string }>;
export function importRecipientPublicKey(encoded: string): Promise<RecipientPublicKey>;
export function importRecipientPrivateKey(encoded: string): Promise<RecipientPrivateKey>;
export function deriveSlot(slotSecret: string, passcode: string): Promise<{ slotId: string; writeToken: string; draftKey: ContentKey }>;
export function hashToken(token: string): Promise<string>;           // what the relay stores and compares

// Sealing
export function seal(key: ContentKey, value: unknown, context: EnvelopeContext): Promise<Envelope>;
export function open(key: ContentKey, envelope: unknown, context: EnvelopeContext): Promise<unknown>;
export function sealTo(recipient: RecipientPublicKey, value: unknown, context: EnvelopeContext): Promise<Envelope>;
export function openWith(recipient: RecipientPrivateKey, envelope: unknown, context: EnvelopeContext): Promise<unknown>;

export const MAX_PLAINTEXT_BYTES = 196_608; // 192 KiB after framing and padding

export type ContentKey = CryptoKey & { readonly __brand: "ContentKey" };
export type RecipientPublicKey = CryptoKey & { readonly __brand: "RecipientPublicKey" };
export type RecipientPrivateKey = CryptoKey & { readonly __brand: "RecipientPrivateKey" };
export type Channel = "definition" | "draft" | "submission" | "shared"; // "shared" reserved for mVote
export type EnvelopeContext = { app: string; sessionId: string; channel: Channel; slotId?: string };
export type Envelope =
  | { v: 1; alg: "A256GCM"; iv: string; ct: string }
  | { v: 1; alg: "ECDH-ES+A256GCM"; epk: string; iv: string; ct: string };

export class EnvelopeError extends Error { readonly code: EnvelopeErrorCode }
export type EnvelopeErrorCode =
  | "BAD_FORMAT"          // malformed envelope, context or decrypted frame
  | "BAD_KEY"             // a key string that cannot be imported
  | "UNSUPPORTED_VERSION" // v or alg this release does not know
  | "TOO_LARGE"           // value exceeds MAX_PLAINTEXT_BYTES
  | "DECRYPT_FAILED";     // wrong key, wrong context or tampered data (deliberately indistinguishable)
```

Nothing else is exported. Every exported behavior becomes a commitment, so internal helpers stay internal.

## Wire format v1

The [fixture file](#testing) is the normative reference. The prose below explains it.

- **Encoding.** Base64url without padding for all binary fields.
- **Value framing.** `JSON.stringify(value)` is encoded as UTF-8, prefixed with its length as 4 bytes big-endian, then zero-padded to the next multiple of 1,024 bytes (minimum 1,024). Values whose framed size exceeds `MAX_PLAINTEXT_BYTES` fail with `TOO_LARGE`.
- **Context binding.** The additional authenticated data is the UTF-8 encoding of `["malverdesoftware-envelope/v1", app, sessionId, channel, slotId ?? ""].join("\n")`. `app` must match `[a-z0-9-]{1,40}`; `sessionId` and `slotId` must be 22-character base64url strings. Opening an envelope with any different context fails, so the relay cannot move a draft between participants or pass a draft off as a submission.
- **`A256GCM`.** AES-256-GCM with a random 12-byte `iv`. `ct` includes the 16-byte tag.
- **`ECDH-ES+A256GCM`.** A fresh P-256 key pair per envelope. `epk` is the raw uncompressed ephemeral public key (65 bytes). The ECDH shared secret (256 bits) goes through HKDF-SHA-256 with salt = `epk` bytes and info = `"malverdesoftware-envelope/v1 ECDH-ES+A256GCM"` to produce the AES-256-GCM key. The rest matches `A256GCM`.
- **Recipient keys.** P-256. The public key is the raw uncompressed point (65 bytes); the private key is PKCS#8. P-256 is chosen over X25519 because it is supported by older phones' browsers.
- **Slot derivation.**
  - `slotId` = HKDF-SHA-256(ikm = the 32-byte slot secret, salt = `"malverdesoftware-slot/v1"`, info = `"id"`, 16 bytes). It comes from the link alone, so the relay can find the slot and count failed attempts.
  - The passcode is stretched with PBKDF2-SHA-256 (200,000 iterations; salt = HKDF of the slot secret with info `"passcode-salt"`, 16 bytes) into 32 bytes, `p`.
  - `writeToken` and `draftKey` = HKDF-SHA-256(ikm = slot secret ‖ `p`, salt = `"malverdesoftware-slot/v1"`, info `"write-token"` or `"draft-key"`, 32 bytes each).
  - A link without its passcode cannot produce the token or the key.
- **Passcodes.** Six decimal digits generated uniformly by rejection sampling. Leading zeros are allowed, and passcodes are compared as exact strings.
- **Token hashing.** `hashToken(t)` is SHA-256 over the ASCII bytes of `t`, base64url-encoded (43 characters).

## Testing

Module-specific, in addition to the [repository conventions](../CONVENTIONS.md).

- **Passcode effects:** a different passcode gives a different `writeToken` and `draftKey` but the same `slotId`. `randomPasscode` always returns 6 digits, and 100,000 draws cover all ten leading digits.
- **Fixtures.** `fixtures/envelope-v1.json` holds known-answer vectors: slot derivation with passcodes, token hashes, and decrypt-only cases for both algorithms (key, context, envelope, expected value). `scripts/make-fixtures.mjs` generates them once from fixed secrets and synthetic values. The file is committed and only changes with a version bump. A later Python implementation must pass the same file.
- **Round trips** for both algorithms, with values that include emoji, accented and non-Latin text, since the first session's cards are text messages.
- **Tampering:** flipping any byte of `ct`, `iv` or `epk` gives `DECRYPT_FAILED`. Opening with a different `app`, `sessionId`, `channel` or `slotId` gives `DECRYPT_FAILED`, as does a wrong key.
- **Padding:** a 10-byte value and a 900-byte value produce ciphertexts of equal length. A value just over the limit gives `TOO_LARGE`.
- **Format errors:** unknown `v` or `alg` gives `UNSUPPORTED_VERSION`. Missing fields, non-base64url data and wrong field lengths give `BAD_FORMAT`.
- **Randomness sanity:** 10,000 seals produce no repeated `iv`.

## Boundaries

Module-specific additions to the [repository boundaries](../CONVENTIONS.md#boundaries):

- **Always:** use only WebCrypto algorithms (`AES-GCM`, `ECDH` P-256, `HKDF`, `SHA-256`) and `crypto.getRandomValues`.
- **Ask first:** any change to the wire format. That requires `v: 2`, new fixtures, and keeping `open` able to read v1 for as long as v1 sessions can exist (30 days at most).
- **Never:** accept an IV or nonce from callers; export key material from a `CryptoKey` after import; distinguish the cause of a decryption failure in errors or timing.

## Success criteria

- [ ] All tests above pass on Node 24.19.0, with zero runtime dependencies.
- [ ] The public exports match the interface section exactly. A test enumerates the module's exports.
- [ ] `npm run build` emits ESM and `.d.ts` that type-check from mPile's TypeScript setup and import from plain JavaScript (mVote).
- [ ] The fixture file is committed, and `scripts/make-fixtures.mjs` reproduces its derivation and hash vectors byte for byte.
- [ ] Rehearsal check (owned by `mpile-app`): the same build seals and opens on current iOS Safari and Android Chrome, and `deriveSlot` takes under 1 second on those phones.

## Open questions

None for the author. Reviewers may question P-256 instead of X25519 and PKCS#8 instead of JWK; both were chosen for older-phone support and Python interoperability.
