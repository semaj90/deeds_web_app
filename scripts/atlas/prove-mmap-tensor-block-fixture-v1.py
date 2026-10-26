#!/usr/bin/env python3
"""EXEC-MMAP-04 / EXEC-CPU-05 fixture proof (stdlib only, read-only on real data).

Builds a deterministic [N, DIM] float32 row-major fixture in a temp dir (never a
production table or vector collection), then proves a revision-qualified
materialization descriptor resolver:
  exact byte length, dtype/shape, content digest, stale-revision rejection,
  truncated-file rejection, file-disappearance rejection, read-only mapping,
  deterministic candidateOrdinal gather, worker-process reopening, and
  single-process vs 2-worker spawn-pool parity (CPU only, no CUDA context).

Status vocabulary: FIXTURE_ONLY on pass, FAILED otherwise. Not production proof.
"""
from __future__ import annotations

import array
import hashlib
import json
import mmap
import os
import shutil
import sys
import tempfile
from concurrent.futures import ProcessPoolExecutor
from multiprocessing import get_context
from pathlib import Path

N, DIM, ELEM = 64, 768, 4
ROW_BYTES = DIM * ELEM


def build_fixture(path: Path) -> bytes:
    values = array.array("f")
    for row in range(N):
        for col in range(DIM):
            values.append(((row * 31 + col * 7) % 97) / 97.0 - 0.5)
    raw = values.tobytes()
    path.write_bytes(raw)
    return raw


def descriptor(path: Path, digest: str) -> dict:
    return {
        "schema": "atlas.mmap-tensor-block-fixture.v1",
        "packetKey": "pk:fixture",
        "workspaceRevision": "ws:fixture:1",
        "sourceRevision": "src:fixture:1",
        "representationRevision": "rep:fixture:1",
        "encodingVersion": "f32le-rowmajor:v1",
        "dtype": "float32",
        "shape": [N, DIM],
        "byteLength": N * ROW_BYTES,
        "contentDigest": digest,
        "locator": str(path),
    }


def open_verified(desc: dict, current_source_revision: str):
    """Return (file, mmap) for a verified read-only mapping or raise a typed error."""
    if desc["sourceRevision"] != current_source_revision:
        raise ValueError("MMAP_TENSOR_STALE_SOURCE_REVISION")
    if desc["dtype"] != "float32" or len(desc["shape"]) != 2:
        raise ValueError("MMAP_TENSOR_DTYPE_OR_SHAPE_INVALID")
    path = Path(desc["locator"])
    if not path.exists():
        raise ValueError("MMAP_TENSOR_FILE_MISSING")
    expected = desc["shape"][0] * desc["shape"][1] * ELEM
    handle = path.open("rb")
    try:
        size = os.fstat(handle.fileno()).st_size
        if size != desc["byteLength"] or size != expected:
            raise ValueError("MMAP_TENSOR_BYTE_LENGTH_MISMATCH")
        mapped = mmap.mmap(handle.fileno(), length=0, access=mmap.ACCESS_READ)
    except Exception:
        handle.close()
        raise
    if hashlib.sha256(mapped).hexdigest() != desc["contentDigest"]:
        mapped.close()
        handle.close()
        raise ValueError("MMAP_TENSOR_CONTENT_DIGEST_MISMATCH")
    return handle, mapped


def read_row(mapped, ordinal: int):
    if not 0 <= ordinal < N:
        raise ValueError(f"MMAP_TENSOR_ORDINAL_OUT_OF_RANGE:{ordinal}")
    row = array.array("f")
    row.frombytes(mapped[ordinal * ROW_BYTES:(ordinal + 1) * ROW_BYTES])
    return row


def score_range(args):
    desc, start, stop, centroid = args
    handle, mapped = open_verified(desc, desc["sourceRevision"])  # each worker reopens
    try:
        out = []
        for ordinal in range(start, stop):
            row = read_row(mapped, ordinal)
            out.append((ordinal, sum(a * b for a, b in zip(row, centroid))))
        return out
    finally:
        mapped.close()
        handle.close()


def top_k(scores, k=5):
    return sorted(scores, key=lambda p: (-p[1], p[0]))[:k]  # deterministic tie-break


def main() -> int:
    work = Path(tempfile.mkdtemp(prefix="atlas-mmap-fixture-"))
    failures: list[str] = []

    def check(name: str, ok: bool) -> None:
        if not ok:
            failures.append(name)

    def raises(fn, needle: str) -> bool:
        try:
            fn()
        except Exception as exc:  # noqa: BLE001
            return needle in str(exc)
        return False

    try:
        tensor = work / "block.f32"
        raw = build_fixture(tensor)
        digest = hashlib.sha256(raw).hexdigest()
        desc = descriptor(tensor, digest)

        handle, mapped = open_verified(desc, "src:fixture:1")
        try:
            check("readonly-mapping", raises(lambda: mapped.__setitem__(0, 0), "TypeError") or raises(lambda: mapped.__setitem__(0, 0), "read-only") or raises(lambda: mapped.__setitem__(0, 0), "mmap"))
            r5a, r5b = read_row(mapped, 5), read_row(mapped, 5)
            check("gather-deterministic", r5a == r5b and len(r5a) == DIM)
            expected = array.array("f")
            expected.frombytes(raw[5 * ROW_BYTES:6 * ROW_BYTES])
            check("gather-matches-source-bytes", r5a == expected)
            check("ordinal-range", raises(lambda: read_row(mapped, N), "ORDINAL_OUT_OF_RANGE"))
        finally:
            mapped.close()
            handle.close()

        check("stale-revision", raises(lambda: open_verified(desc, "src:fixture:2"), "STALE_SOURCE_REVISION"))
        check("bad-dtype", raises(lambda: open_verified({**desc, "dtype": "float16"}, "src:fixture:1"), "DTYPE_OR_SHAPE"))
        check("bad-digest", raises(lambda: open_verified({**desc, "contentDigest": "0" * 64}, "src:fixture:1"), "DIGEST_MISMATCH"))

        truncated = work / "truncated.f32"
        truncated.write_bytes(raw[:-4])
        check("truncated", raises(lambda: open_verified({**desc, "locator": str(truncated)}, "src:fixture:1"), "BYTE_LENGTH_MISMATCH"))

        gone = work / "gone.f32"
        gone.write_bytes(raw)
        gone_desc = {**desc, "locator": str(gone)}
        gone.unlink()
        check("file-missing", raises(lambda: open_verified(gone_desc, "src:fixture:1"), "FILE_MISSING"))

        centroid = array.array("f", [((c * 13) % 17) / 17.0 - 0.5 for c in range(DIM)])
        single = top_k(score_range((desc, 0, N, centroid)))
        halves = [(desc, 0, N // 2, centroid), (desc, N // 2, N, centroid)]
        with ProcessPoolExecutor(max_workers=2, mp_context=get_context("spawn")) as pool:
            parts = list(pool.map(score_range, halves))
        multi = top_k([p for part in parts for p in part])
        check("multicore-parity-top-k", single == multi)
        check("multicore-parity-bytes", json.dumps(single) == json.dumps(multi))
    finally:
        shutil.rmtree(work, ignore_errors=True)

    check("cleanup", not work.exists())
    status = "FAILED" if failures else "FIXTURE_ONLY"
    print(json.dumps({
        "schema": "atlas.mmap-tensor-block-fixture-proof.v1",
        "status": status,
        "failures": failures,
        "rows": N,
        "dim": DIM,
        "workers": 2,
        "cudaContextOpened": False,
        "storeWrites": False,
    }))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
