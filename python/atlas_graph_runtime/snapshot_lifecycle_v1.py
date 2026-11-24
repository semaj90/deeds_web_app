"""Cross-language snapshot lifecycle, GPU resource fence FSM, bounded async pipeline,
artifact allowlist resolution, and visualization separation schemas.
"""

from __future__ import annotations

import asyncio
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
from dataclasses import dataclass, field
from enum import Enum
import os
import re
from typing import Any, AsyncIterable, Awaitable, Callable, Mapping, Sequence
import zlib


class SnapshotState(str, Enum):
    CREATED = "CREATED"
    VALIDATING = "VALIDATING"
    FAILED = "FAILED"
    FROZEN = "FROZEN"
    ACTIVE = "ACTIVE"
    RETIRING = "RETIRING"
    RELEASED = "RELEASED"


class GpuResourceState(str, Enum):
    UNALLOCATED = "UNALLOCATED"
    CPU_WRITABLE = "CPU_WRITABLE"
    COPY_IN_FLIGHT = "COPY_IN_FLIGHT"
    GPU_READY = "GPU_READY"
    GPU_IN_USE = "GPU_IN_USE"
    PENDING_FREE = "PENDING_FREE"
    FREED = "FREED"


class SnapshotLeaseError(RuntimeError):
    pass


class SnapshotHandleV1:
    """Reference-counted snapshot handle ensuring buffers stay alive until refs == 0 and fences complete."""

    def __init__(self, *, revision: int, digest: str, on_release: Callable[[], None] | None = None) -> None:
        self.revision = int(revision)
        self.digest = str(digest)
        self.state = SnapshotState.CREATED
        self._refcount = 0
        self._pending_fences: set[str] = set()
        self._on_release = on_release

    def mark_validating(self) -> None:
        if self.state != SnapshotState.CREATED:
            raise SnapshotLeaseError(f"INVALID_TRANSITION:{self.state}->VALIDATING")
        self.state = SnapshotState.VALIDATING

    def mark_frozen(self) -> None:
        if self.state != SnapshotState.VALIDATING:
            raise SnapshotLeaseError(f"INVALID_TRANSITION:{self.state}->FROZEN")
        self.state = SnapshotState.FROZEN

    def mark_failed(self) -> None:
        self.state = SnapshotState.FAILED

    def mark_active(self) -> None:
        if self.state != SnapshotState.FROZEN:
            raise SnapshotLeaseError(f"INVALID_TRANSITION:{self.state}->ACTIVE")
        self.state = SnapshotState.ACTIVE

    def mark_retiring(self) -> None:
        if self.state not in (SnapshotState.ACTIVE, SnapshotState.FROZEN):
            raise SnapshotLeaseError(f"INVALID_TRANSITION:{self.state}->RETIRING")
        self.state = SnapshotState.RETIRING
        self._try_release()

    def acquire_lease(self, *, fence_id: str | None = None) -> "SnapshotLeaseGuardV1":
        if self.state not in (SnapshotState.FROZEN, SnapshotState.ACTIVE):
            raise SnapshotLeaseError(f"CANNOT_LEASE_IN_STATE:{self.state}")
        self._refcount += 1
        if fence_id:
            self._pending_fences.add(fence_id)
        return SnapshotLeaseGuardV1(self, fence_id=fence_id)

    def _release_lease(self, *, fence_id: str | None = None) -> None:
        if self._refcount > 0:
            self._refcount -= 1
        if fence_id:
            self._pending_fences.discard(fence_id)
        self._try_release()

    def _try_release(self) -> None:
        if self.state == SnapshotState.RETIRING and self._refcount == 0 and not self._pending_fences:
            self.state = SnapshotState.RELEASED
            if self._on_release is not None:
                self._on_release()


class SnapshotLeaseGuardV1:
    """Context manager holding a CPU/GPU lease on a SnapshotHandleV1."""

    def __init__(self, handle: SnapshotHandleV1, *, fence_id: str | None = None) -> None:
        self._handle = handle
        self._fence_id = fence_id
        self._released = False

    def __enter__(self) -> SnapshotHandleV1:
        return self._handle

    def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        self.release()

    def release(self) -> None:
        if not self._released:
            self._released = True
            self._handle._release_lease(fence_id=self._fence_id)


class GpuResourceLifecycleV1:
    """Enforces fence-protected GPU buffer/texture lifetime transitions."""

    def __init__(self, resource_id: str) -> None:
        self.resource_id = resource_id
        self.state = GpuResourceState.UNALLOCATED
        self._active_fence: int = 0
        self._completed_fence: int = 0

    def allocate(self) -> None:
        if self.state != GpuResourceState.UNALLOCATED:
            raise SnapshotLeaseError(f"GPU_INVALID_ALLOCATE:{self.state}")
        self.state = GpuResourceState.CPU_WRITABLE

    def submit_upload(self, fence_value: int) -> None:
        if self.state != GpuResourceState.CPU_WRITABLE:
            raise SnapshotLeaseError(f"GPU_INVALID_UPLOAD:{self.state}")
        self._active_fence = max(self._active_fence, int(fence_value))
        self.state = GpuResourceState.COPY_IN_FLIGHT

    def complete_fence(self, completed_value: int) -> None:
        self._completed_fence = max(self._completed_fence, int(completed_value))
        if self.state in (GpuResourceState.COPY_IN_FLIGHT, GpuResourceState.GPU_IN_USE):
            if self._completed_fence >= self._active_fence:
                self.state = GpuResourceState.GPU_READY
        elif self.state == GpuResourceState.PENDING_FREE:
            if self._completed_fence >= self._active_fence:
                self.state = GpuResourceState.FREED

    def dispatch_use(self, fence_value: int) -> None:
        if self.state != GpuResourceState.GPU_READY:
            raise SnapshotLeaseError(f"GPU_NOT_READY_FOR_DISPATCH:{self.state}")
        self._active_fence = max(self._active_fence, int(fence_value))
        self.state = GpuResourceState.GPU_IN_USE

    def retire(self) -> None:
        if self.state == GpuResourceState.FREED:
            return
        if self._completed_fence >= self._active_fence:
            self.state = GpuResourceState.FREED
        else:
            self.state = GpuResourceState.PENDING_FREE


_ARTIFACT_ID_PATTERN = re.compile(r"^[a-z0-9_]+:[a-zA-Z0-9._-]{4,128}$")


def resolve_artifact_id_v1(artifact_id: str, allowlist: Mapping[str, str]) -> str:
    """Resolve a server-side `artifact_id` via an allowlisted store; reject paths & `..` traversal."""
    if not isinstance(artifact_id, str) or ".." in artifact_id or "/" in artifact_id or "\\" in artifact_id:
        raise ValueError("ARTIFACT_PATH_TRAVERSAL_REJECTED")
    if not _ARTIFACT_ID_PATTERN.fullmatch(artifact_id):
        raise ValueError(f"ARTIFACT_ID_MALFORMED:{artifact_id}")
    resolved = allowlist.get(artifact_id)
    if resolved is None:
        raise KeyError(f"ARTIFACT_ID_NOT_ALLOWLISTED:{artifact_id}")
    return resolved


def bounded_zlib_decompress_v1(
    compressed: bytes,
    *,
    max_compressed_bytes: int = 16 * 1024 * 1024,
    max_uncompressed_bytes: int = 64 * 1024 * 1024,
    max_ratio: float = 20.0,
) -> bytes:
    """Decompress zlib payload while enforcing size and decompression-bomb ratio limits."""
    if len(compressed) > max_compressed_bytes:
        raise ValueError(f"COMPRESSED_PAYLOAD_TOO_LARGE:{len(compressed)}>{max_compressed_bytes}")
    dobj = zlib.decompressobj()
    out = dobj.decompress(compressed, max_uncompressed_bytes + 1)
    if len(out) > max_uncompressed_bytes or dobj.unconsumed_tail:
        raise ValueError("DECOMPRESSION_BOMB_LIMIT_EXCEEDED")
    out += dobj.flush()
    if len(out) > max_uncompressed_bytes:
        raise ValueError("DECOMPRESSION_BOMB_LIMIT_EXCEEDED")
    if len(compressed) > 0 and (len(out) / len(compressed)) > max_ratio:
        raise ValueError(f"COMPRESSION_RATIO_EXCEEDED:{len(out)/len(compressed):.2f}>{max_ratio}")
    return out


async def bounded_async_pipeline_v1(
    source: AsyncIterable[Any],
    sink: Callable[[Any], Awaitable[None]],
    *,
    maxsize: int = 8,
    on_cleanup: Callable[[], None] | None = None,
) -> int:
    """Bounded asyncio.Queue + TaskGroup pipeline with strict cancellation propagation."""
    q: asyncio.Queue[Any] = asyncio.Queue(maxsize=maxsize)
    sentinel = object()
    processed = 0

    async def producer() -> None:
        try:
            async for item in source:
                await q.put(item)
        finally:
            # Ensure consumer exits cleanly unless already cancelled
            await q.put(sentinel)

    async def consumer() -> None:
        nonlocal processed
        while True:
            item = await q.get()
            try:
                if item is sentinel:
                    return
                await sink(item)
                processed += 1
            finally:
                q.task_done()

    try:
        async with asyncio.TaskGroup() as tg:
            tg.create_task(producer())
            tg.create_task(consumer())
    except asyncio.CancelledError:
        if on_cleanup is not None:
            on_cleanup()
        raise
    if on_cleanup is not None:
        on_cleanup()
    return processed


@dataclass(frozen=True)
class PaletteThemeV1:
    """Disposable visualization palette mapping semantic category -> palette index."""
    palette_revision: int
    entries: Mapping[str, int]


@dataclass(frozen=True)
class SpriteInstanceV1:
    """Disposable sprite record; resolves back to canonical `candidate_id` without owning it."""
    candidate_id: str
    sprite_id: int
    palette_index: int
    tile_u: int
    tile_v: int
    flags: int
    lod_class: int


@dataclass(frozen=True)
class TextRunV1:
    """Asynchronous font/text metadata handle; never ships raw filesystem font paths."""
    text_utf8: str
    font_family_id: str
    font_face_id: str
    weight: int
    style: str
    size_px: float
    script: str
    language: str
    direction: str
    glyph_run_id: str


def run_bounded_multicore_batch_v1(
    shards: Sequence[Any],
    worker_fn: Callable[[Any], Any],
    *,
    snapshot_handle: SnapshotHandleV1 | None = None,
    max_workers: int | None = None,
    use_processes: bool = False,
) -> list[Any]:
    """Execute CPU/IO shards concurrently across bounded worker threads or processes.

    Preserves deterministic shard order (`executor.map`), bounds `max_workers` to
    `min(len(shards), cpu_count)`, and holds a `SnapshotHandleV1` lease across execution
    so mapped buffers cannot be retired while workers are active.
    """
    if not shards:
        return []
    cpu_cap = max(1, (os.cpu_count() or 4))
    workers = max(1, min(len(shards), max_workers if max_workers is not None else cpu_cap, cpu_cap))
    pool_cls = ProcessPoolExecutor if use_processes else ThreadPoolExecutor

    lease = snapshot_handle.acquire_lease(fence_id="multicore-batch") if snapshot_handle else None
    try:
        with pool_cls(max_workers=workers) as executor:
            return list(executor.map(worker_fn, shards))
    finally:
        if lease is not None:
            lease.release()
