"""Independent check of fixtures/envelope-v1.json with Python's `cryptography` package.

Optional: shows a non-JavaScript implementation (for example mVote's CLI) can
derive slots and open envelopes from the wire format alone. Run from this package folder:

    python scripts/crosscheck.py
"""

import base64
import hashlib
import json
import struct
import sys
from pathlib import Path

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

SLOT_SALT = b"malverdesoftware-slot/v1"
ECDH_INFO = b"malverdesoftware-envelope/v1 ECDH-ES+A256GCM"


def b64d(text):
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def b64e(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def hkdf(ikm, info, length, salt=SLOT_SALT):
    return HKDF(hashes.SHA256(), length, salt, info).derive(ikm)


def aad(context):
    parts = ["malverdesoftware-envelope/v1", context["app"], context["sessionId"],
             context["channel"], context.get("slotId", "")]
    return "\n".join(parts).encode()


def open_aes(key, envelope, context):
    framed = AESGCM(key).decrypt(b64d(envelope["iv"]), b64d(envelope["ct"]), aad(context))
    (length,) = struct.unpack(">I", framed[:4])
    return json.loads(framed[4:4 + length].decode())


def main():
    fixtures = json.loads((Path(__file__).parent.parent / "fixtures" / "envelope-v1.json").read_text())
    problems = []
    for slot in fixtures["slots"]:
        secret = b64d(slot["slotSecret"])
        salt = hkdf(secret, b"passcode-salt", 16)
        stretched = PBKDF2HMAC(hashes.SHA256(), 32, salt, fixtures["pbkdf2Iterations"]).derive(
            slot["passcode"].encode())
        ikm = secret + stretched
        if b64e(hkdf(secret, b"id", 16)) != slot["slotId"]:
            problems.append(f"slotId for {slot['slotSecret'][:8]}…")
        if b64e(hkdf(ikm, b"write-token", 32)) != slot["writeToken"]:
            problems.append(f"writeToken for {slot['slotId']}")
        draft = slot["draft"]
        if open_aes(hkdf(ikm, b"draft-key", 32), draft["envelope"], draft["context"]) != draft["value"]:
            problems.append(f"draft for {slot['slotId']}")
    for token in fixtures["tokens"]:
        if b64e(hashlib.sha256(token["token"].encode()).digest()) != token["hash"]:
            problems.append(f"hash of {token['token'][:8]}…")
    for vector in fixtures["a256gcm"]:
        if open_aes(b64d(vector["key"]), vector["envelope"], vector["context"]) != vector["value"]:
            problems.append("an A256GCM vector")
    for vector in fixtures["ecdhEs"]:
        private_key = serialization.load_der_private_key(b64d(vector["privateKey"]), None)
        epk = b64d(vector["envelope"]["epk"])
        ephemeral = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), epk)
        key = hkdf(private_key.exchange(ec.ECDH(), ephemeral), ECDH_INFO, 32, salt=epk)
        if open_aes(key, vector["envelope"], vector["context"]) != vector["value"]:
            problems.append("an ECDH-ES vector")
    if problems:
        print("Python cross-check failed: " + "; ".join(problems))
        sys.exit(1)
    print("Python cross-check passed.")


if __name__ == "__main__":
    main()
