"""P0 tests for SnapshotLease, GPU fence FSM, artifact allowlist, bomb limits, and TaskGroup cancellation."""

from __future__ import annotations

import asyncio
import zlib
import pytest

from python.atlas_graph_runtime.snapshot_lifecycle_v1 import (
    GpuResourceLifecycleV1,
    GpuResourceState,
    SnapshotHandleV1,
    SnapshotLeaseError,
    SnapshotState,
    bounded_async_pipeline_v1,
    bounded_zlib_decompress_v1,
    resolve_artifact_id_v1,
    run_bounded_multicore_batch_v1,
)


def test_snapshot_lease_keeps_handle_alive_until_refs_and_fences_done():
    released = False

    def _on_release() -> None:
        nonlocal released
        released = True

    handle = SnapshotHandleV1(revision=1, digest="sha256:abc", on_release=_on_release)
    handle.mark_validating()
    handle.mark_frozen()
    handle.mark_active()

    lease = handle.acquire_lease(fence_id="gpu-fence-1")
    handle.mark_retiring()
    assert handle.state == SnapshotState.RETIRING
    assert released is False  # Still leased!

    lease.release()
    assert handle.state == SnapshotState.RELEASED
    assert released is True


def test_gpu_resource_cannot_be_freed_or_dispatched_before_fence_completion():
    gpu = GpuResourceLifecycleV1("bvh-buffer-0")
    gpu.allocate()
    gpu.submit_upload(fence_value=10)
    assert gpu.state == GpuResourceState.COPY_IN_FLIGHT

    with pytest.raises(SnapshotLeaseError, match="GPU_NOT_READY_FOR_DISPATCH"):
        gpu.dispatch_use(11)

    gpu.complete_fence(10)
    assert gpu.state == GpuResourceState.GPU_READY

    gpu.dispatch_use(12)
    gpu.retire()
    assert gpu.state == GpuResourceState.PENDING_FREE  # Protected by fence 12!

    gpu.complete_fence(12)
    assert gpu.state == GpuResourceState.FREED


def test_artifact_allowlist_rejects_path_traversal():
    allowlist = {"batch:8f2d": "/var/lib/atlas/snapshots/batch_8f2d.arrow"}
    assert resolve_artifact_id_v1("batch:8f2d", allowlist) == "/var/lib/atlas/snapshots/batch_8f2d.arrow"

    for bad in ("../etc/passwd", "C:\\atlas\\foo.arrow", "batch/../../secret", "bad"):
        with pytest.raises(ValueError, match="ARTIFACT_"):
            resolve_artifact_id_v1(bad, allowlist)


def test_decompression_bomb_limits():
    payload = b"A" * 50_000
    compressed = zlib.compress(payload, level=9)
    with pytest.raises(ValueError, match="COMPRESSION_RATIO_EXCEEDED|DECOMPRESSION_BOMB"):
        bounded_zlib_decompress_v1(compressed, max_ratio=5.0)


@pytest.mark.asyncio
async def test_bounded_async_pipeline_cancellation_runs_cleanup():
    cleaned = False

    def _cleanup() -> None:
        nonlocal cleaned
        cleaned = True

    async def slow_source():
        yield 1
        await asyncio.sleep(5)
        yield 2

    async def sink(_item):
        await asyncio.sleep(0)

    task = asyncio.create_task(bounded_async_pipeline_v1(slow_source(), sink, maxsize=2, on_cleanup=_cleanup))
    await asyncio.sleep(0.05)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert cleaned is True


def _square_shard(x: int) -> int:
    return x * x


def test_bounded_multicore_batch_preserves_order_and_snapshot_lease():
    handle = SnapshotHandleV1(revision=2, digest="sha256:mc")
    handle.mark_validating()
    handle.mark_frozen()
    handle.mark_active()

    results = run_bounded_multicore_batch_v1(
        [1, 2, 3, 4, 5],
        _square_shard,
        snapshot_handle=handle,
        max_workers=2,
        use_processes=True,
    )
    assert results == [1, 4, 9, 16, 25]
    # Lease was released cleanly after workers completed
    handle.mark_retiring()
    assert handle.state == SnapshotState.RELEASED
