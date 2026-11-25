#!/usr/bin/env python3
"""P1 Directory Card Admission + Expansion Benchmark & P2 Storage/BitFrost Proof (read-only on canonical stores)."""

from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.request
from pathlib import Path
from typing import Any

import numpy as np
import psycopg
import redis
import torch

REPO_ROOT = Path(__file__).resolve().parents[2]
PYTHON_ROOT = REPO_ROOT / "python"
if str(PYTHON_ROOT) not in sys.path:
    sys.path.insert(0, str(PYTHON_ROOT))

from atlas_compute.directory_inventory_manifest_v2 import (
    directory_of_source_ref_v2,
    verify_directory_hints_batch_v2,
)

STATE_DIR = REPO_ROOT / ".tmp" / "atlas" / "universal-directory-cards-v1"
REPORT_OUT = REPO_ROOT / "docs" / "reports" / "p1-p2-directory-and-storage-proof-v1.json"


def _load_env() -> None:
    env_file = REPO_ROOT / "sveltekit-frontend" / ".env"
    if not env_file.is_file():
        return
    for raw in env_file.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def _collect_openspec_task_refs() -> dict[str, list[str]]:
    """Map repo directory prefixes -> OpenSpec task IDs found in active tasks.md files."""
    by_dir: dict[str, list[str]] = {}
    changes_dir = REPO_ROOT / "openspec" / "changes"
    if not changes_dir.is_dir():
        return by_dir
    for tasks_md in changes_dir.glob("*/tasks.md"):
        change_name = tasks_md.parent.name
        text = tasks_md.read_text(encoding="utf-8", errors="replace")
        task_ids = re.findall(r"-\s*\[[ xX]\]\s*\*{0,2}([A-Z0-9]+-[A-Z0-9-]+|\d+\.\d+)", text)
        if not task_ids:
            task_ids = [f"openspec:{change_name}"]
        else:
            task_ids = [f"{change_name}:{tid}" for tid in task_ids[:4]]
        for ref in re.findall(r"`((?:sveltekit-frontend|packages|python|scripts|services|simd-bridge)/[^`\s]+)`", text):
            d = directory_of_source_ref_v2(ref)
            bucket = by_dir.setdefault(d, [])
            for tid in task_ids:
                if tid not in bucket:
                    bucket.append(tid)
    return by_dir


def _qdrant_search_bench(col: str, vec: list[float], vector_name: str | None) -> dict[str, Any]:
    body: dict[str, Any] = {"limit": 5, "with_payload": False}
    if vector_name:
        body["vector"] = {"name": vector_name, "vector": vec}
    else:
        body["vector"] = vec
    t0 = time.perf_counter()
    try:
        req = urllib.request.Request(
            f"http://127.0.0.1:6333/collections/{col}/points/search",
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        ms = round((time.perf_counter() - t0) * 1000.0, 2)
        res = data.get("result") or []
        return {
            "collection": col,
            "ok": True,
            "elapsedMs": ms,
            "hits": len(res),
            "topScore": round(float(res[0]["score"]), 4) if res else None,
        }
    except Exception as exc:
        return {"collection": col, "ok": False, "error": str(exc)}


def main() -> int:
    _load_env()

    # 1. P1: Load manifest + hints + cards + PG18 canonical source bindings + OpenSpec task refs
    manifest = json.loads((STATE_DIR / "inventory-manifest-v2.json").read_text(encoding="utf-8"))
    hints = [
        json.loads(ln)
        for ln in (STATE_DIR / "directory-enrichment-hints-v2.jsonl").read_text(encoding="utf-8").splitlines()
        if ln.strip()
    ]
    cards = {
        c["dir_path"]: c
        for c in (json.loads(ln) for ln in (STATE_DIR / "cards.jsonl").read_text(encoding="utf-8").splitlines() if ln.strip())
    }
    readback = verify_directory_hints_batch_v2(hints, lambda d: manifest if d == manifest["inventoryManifestDigest"] else None)

    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        pg_refs = {r[0] for r in conn.execute("SELECT DISTINCT canonical_source_ref FROM atlas_workspace_source_bindings").fetchall()}
        proven_refs = {r[0] for r in conn.execute("SELECT DISTINCT source_ref FROM atlas_packet_chunk_lineage WHERE revision_status='PROVEN'").fetchall()}

    task_map = _collect_openspec_task_refs()
    bound_dirs = 0
    proven_dirs = 0
    task_linked_dirs = 0
    obo_linked_dirs = 0
    sample_linked: list[dict[str, Any]] = []

    by_dir_members: dict[str, list[str]] = {}
    for m in manifest["members"]:
        sr = m["sourceRef"]
        by_dir_members.setdefault(directory_of_source_ref_v2(sr), []).append(sr)

    for h in hints:
        d = h["directory_path"]
        members = by_dir_members.get(d, [])
        has_pg = any(sr in pg_refs for sr in members)
        has_proven = any(sr in proven_refs for sr in members)
        t_ids = task_map.get(d, [])
        obo_ids = (cards.get(d) or {}).get("obo_concept_ids") or []
        if has_pg:
            bound_dirs += 1
        if has_proven:
            proven_dirs += 1
        if t_ids:
            task_linked_dirs += 1
        if obo_ids:
            obo_linked_dirs += 1
        if has_pg and t_ids and obo_ids and len(sample_linked) < 5:
            sample_linked.append(
                {
                    "dirPath": d,
                    "memberCount": len(members),
                    "taskIds": t_ids[:3],
                    "oboConceptIds": obo_ids[:4],
                    "evidenceDigest": h["evidence_digest"],
                }
            )

    # 2. P1: Directory Expansion Benchmark (CPU vs RTX 3060 Ti CUDA Top-5 neighbor expansion over 4,312 x 768)
    shape = tuple(manifest_json_shape := (len(cards), 768))
    embs = np.frombuffer((STATE_DIR / "embeddings.f32le").read_bytes(), dtype=np.float32).reshape(shape).copy()

    t_cpu = time.perf_counter()
    cpu_sim = embs @ embs.T
    np.fill_diagonal(cpu_sim, -1.0)
    cpu_top5 = np.argpartition(cpu_sim, -5, axis=1)[:, -5:]
    cpu_ms = round((time.perf_counter() - t_cpu) * 1000.0, 2)

    gpu_ms = None
    parity_diff = None
    if torch.cuda.is_available():
        e_gpu = torch.from_numpy(embs).to("cuda:0")
        torch.cuda.synchronize()
        t_gpu = time.perf_counter()
        g_sim = e_gpu @ e_gpu.T
        g_sim.fill_diagonal_(-1.0)
        g_vals, g_idx = torch.topk(g_sim, k=5, dim=1)
        torch.cuda.synchronize()
        gpu_ms = round((time.perf_counter() - t_gpu) * 1000.0, 2)
        cpu_top_vals = np.sort(cpu_sim[:64], axis=1)[:, -5:][:, ::-1]
        parity_diff = round(float(np.max(np.abs(cpu_top_vals - g_vals[:64].cpu().numpy()))), 8)
        del e_gpu, g_sim, g_vals, g_idx
        torch.cuda.empty_cache()

    # 3. P2: Qdrant Float32/Int8/Turbo16 comparison + BitFrost/Valkey cache lifecycle proof
    q_vec = embs[0].tolist()
    qdrant_bench = {
        "codebase_chunks_768_v2_int8": _qdrant_search_bench("codebase_chunks_768_v2", q_vec, "content"),
        "codebase_chunks_768_turbo16": _qdrant_search_bench("codebase_chunks_768_turbo16", q_vec, "content"),
        "codebase_chunks_eg2_768_q8_f32": _qdrant_search_bench("codebase_chunks_eg2_768_q8", q_vec, None),
    }

    r_client = redis.Redis.from_url(os.environ.get("REDIS_URL", "redis://127.0.0.1:6379"), socket_timeout=2.0)
    probe_key = "bitfrost:p2-lifecycle-probe:v1"
    probe_val = json.dumps({"inventoryDigest": manifest["inventoryManifestDigest"], "canonicalAuthority": False})
    r_client.setex(probe_key, 30, probe_val)
    read_back = r_client.get(probe_key)
    ttl_sec = r_client.ttl(probe_key)
    r_client.delete(probe_key)
    after_del = r_client.get(probe_key)

    report = {
        "schema": "atlas.p1-p2-directory-and-storage-proof.v1",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "canonicalAuthority": False,
        "p1DirectoryAdmission": {
            "readbackOk": readback["ok"],
            "totalHints": readback["totalHints"],
            "defectCount": readback["defectCount"],
            "directoriesBoundToPgBindings": bound_dirs,
            "directoriesWithProvenLineage": proven_dirs,
            "directoriesLinkedToOpenSpecTasks": task_linked_dirs,
            "directoriesWithOboConcepts": obo_linked_dirs,
            "sampleTaskAndOboLinkedDirs": sample_linked,
            "expansionBenchmark": {
                "directoryCount": shape[0],
                "dimensions": shape[1],
                "cpuMs": cpu_ms,
                "cudaGpuMs": gpu_ms,
                "speedup": round(cpu_ms / gpu_ms, 2) if gpu_ms else None,
                "cpuGpuParityMaxAbsDiff": parity_diff,
            },
        },
        "p2PerformanceAndStorage": {
            "qdrantCollectionComparison": qdrant_bench,
            "bitfrostValkeyLifecycle": {
                "setexReadbackMatch": read_back is not None and read_back.decode("utf-8") == probe_val,
                "ttlRemainingSec": ttl_sec,
                "deletedCleanly": after_del is None,
            },
        },
    }
    REPORT_OUT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
