"""Fail-closed CLI until a canonical ACE readback transport is bound.

The previous bridge accepted both a manifest and its evidence rows from stdin,
then returned those same values from a callback named ``readback``. That was
not an independent readback and must not be presented as verified evidence.
The application-owned PostgreSQL reader currently verifies the stored manifest
checksum, but does not return independently admitted chunk bodies to this
Python process. Keep this entry point non-inferential until that owner exposes a
scoped, authenticated readback contract.
"""
import json
import sys

MAX_INPUT_BYTES = 384 * 1024


def main() -> None:
    raw = sys.stdin.buffer.read(MAX_INPUT_BYTES + 1)
    if len(raw) > MAX_INPUT_BYTES:
        print(json.dumps({
            "schema": "atlas.dspy-predict-ace-recommendation.v1",
            "status": "DOC14_INPUT_TOO_LARGE",
            "citationVerified": False,
            "canonicalAuthority": False,
            "writesPerformed": False,
        }))
        return

    try:
        payload = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError):
        payload = None

    checksum = None
    if isinstance(payload, dict) and isinstance(payload.get("manifest"), dict):
        checksum = payload["manifest"].get("identityChecksum")

    print(json.dumps({
        "schema": "atlas.dspy-predict-ace-recommendation.v1",
        "status": "ACE_VERIFIED_READBACK_TRANSPORT_NOT_CONFIGURED",
        "requestedIdentityChecksum": checksum if isinstance(checksum, str) else None,
        "citationVerified": False,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }))


if __name__ == "__main__":
    main()
