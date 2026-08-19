from __future__ import annotations

from typing import Any, Mapping, Protocol, Sequence


class AtlasHostBridge(Protocol):
    async def request(self, kind: str, payload: Mapping[str, Any]) -> Mapping[str, Any]: ...


_host: AtlasHostBridge | None = None


def configure(host: AtlasHostBridge) -> None:
    global _host
    _host = host


async def run(
    *,
    failure: Mapping[str, Any],
    claims: Sequence[Mapping[str, Any]],
    target_path: str,
) -> Mapping[str, Any]:
    if _host is None:
        raise RuntimeError("file_repair is not configured with an Atlas host bridge")
    if not target_path.strip():
        raise ValueError("target_path must be non-empty")
    return await _host.request(
        "PROPOSE_PATCH",
        {
            "failure": dict(failure),
            "claims": [dict(claim) for claim in claims],
            "targetPath": target_path,
            "requiresRevisionCas": True,
            "requiresExactSourceEvidence": True,
            "requiresValidation": True,
            "directWriteAllowed": False,
            "canonicalWritesRequested": False,
        },
    )
