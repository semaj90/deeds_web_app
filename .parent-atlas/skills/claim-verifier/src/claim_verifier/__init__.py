from __future__ import annotations

from typing import Any, Mapping, Protocol, Sequence


class AtlasHostBridge(Protocol):
    async def request(self, kind: str, payload: Mapping[str, Any]) -> Mapping[str, Any]: ...


_host: AtlasHostBridge | None = None


def configure(host: AtlasHostBridge) -> None:
    global _host
    _host = host


async def run(*, claim: str, evidence_refs: Sequence[str]) -> Mapping[str, Any]:
    if _host is None:
        raise RuntimeError("claim_verifier is not configured with an Atlas host bridge")
    if not claim.strip():
        raise ValueError("claim must be non-empty")
    refs = sorted({str(value) for value in evidence_refs if str(value)})
    if not refs:
        raise ValueError("evidence_refs must be non-empty")
    return await _host.request(
        "VERIFY_CLAIM",
        {
            "claim": claim,
            "evidenceRefs": refs,
            "canonicalWritesRequested": False,
        },
    )
