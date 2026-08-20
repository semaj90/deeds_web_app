from __future__ import annotations

from typing import Any, Awaitable, Mapping, Protocol


class AtlasHostBridge(Protocol):
    async def request(self, kind: str, payload: Mapping[str, Any]) -> Mapping[str, Any]: ...


_host: AtlasHostBridge | None = None


def configure(host: AtlasHostBridge) -> None:
    """Bind the authoritative Parent Atlas host bridge for this kernel session."""
    global _host
    _host = host


async def run(query: str, k: int = 256, *, filters: Mapping[str, Any] | None = None) -> Mapping[str, Any]:
    """Nominate semantic candidates through the host-owned RETRIEVE action."""
    if _host is None:
        raise RuntimeError("semantic_search is not configured with an Atlas host bridge")
    if not query.strip():
        raise ValueError("query must be non-empty")
    if k <= 0:
        raise ValueError("k must be positive")
    return await _host.request(
        "RETRIEVE",
        {
            "query": query,
            "k": int(k),
            "filters": dict(filters or {}),
            "logicalLane": "semantic",
            "exactPromotionRequired": True,
            "canonicalWritesRequested": False,
        },
    )


async def __call__(query: str, k: int = 256, **kwargs: Any) -> Mapping[str, Any]:
    return await run(query, k=k, **kwargs)
