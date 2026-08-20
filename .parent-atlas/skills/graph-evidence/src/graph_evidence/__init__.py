from __future__ import annotations

from typing import Any, Awaitable, Mapping, Protocol, Sequence


class AtlasHostBridge(Protocol):
    async def request(self, kind: str, payload: Mapping[str, Any]) -> Mapping[str, Any]: ...


_host: AtlasHostBridge | None = None


def configure(host: AtlasHostBridge) -> None:
    global _host
    _host = host


async def run(
    *,
    canonical_ids: Sequence[str],
    max_hops: int = 2,
    include_hypergraph: bool = True,
) -> Mapping[str, Any]:
    if _host is None:
        raise RuntimeError("graph_evidence is not configured with an Atlas host bridge")
    ids = sorted({str(value) for value in canonical_ids if str(value)})
    if not ids:
        raise ValueError("canonical_ids must be non-empty")
    if max_hops < 0:
        raise ValueError("max_hops must be non-negative")
    return await _host.request(
        "GRAPH_EVIDENCE",
        {
            "canonicalIds": ids,
            "maxHops": int(max_hops),
            "includeHypergraph": bool(include_hypergraph),
            "logicalLane": "graph",
            "canonicalWritesRequested": False,
        },
    )
