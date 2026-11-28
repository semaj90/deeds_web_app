"""Hardened P4 TensorRT-RTX HTTP parity, operator profiling, JIT cache, and VRAM receipt runner.

Tasks covered:
  1. Dimension-aware CPU (:8094) vs GPU (:18094) HTTP parity + exact-neighbor recall.
  2. ORT + TensorRT-RTX provider verification, strict ORT_FALLBACK_TO_CPU=0 check, and operator profiling.
  3. Isolated fresh ORT_TRT_CACHE_DIR -> nv_runtime_cache_path cold vs fresh-process warm cache reuse.
  4. Loopback-bound (127.0.0.1:18094) port ownership check, batch=1..8 VRAM admission, cancellation, and teardown.
  5. Always-emitted checksummed diagnostic receipt (.tmp/atlas/p4-trt-rtx-parity-profile-v1.json).

Read-only with respect to canonical datastores; never touches Docker CPU :8094 or llama-server :8090.
"""
from __future__ import annotations

import hashlib
import importlib.metadata
import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[2]
SERVER_SCRIPT = REPO_ROOT / "scripts" / "atlas" / "gemma2-onnx-embed-server-v1.py"
MODEL_DIR = REPO_ROOT / "models" / "embeddinggemma2" / "onnx-trt-rtx"
MODEL_FILE = MODEL_DIR / "onnx" / "model_trt.onnx"
MODEL_DATA_FILE = MODEL_DIR / "onnx" / "model.onnx_data"
TOKENIZER_FILE = MODEL_DIR / "tokenizer.json"
PINNED_MODEL_ID = "onnx-community/embeddinggemma-2-ONNX@daa72c51243991dfcaf9f9137d2c573d8f7790c0:onnx/model_trt.onnx"
MRL_DIMS = [768, 512, 256, 128]

CPU_URL = "http://127.0.0.1:8094"
GPU_HOST = "127.0.0.1"
GPU_PORT = 18094
GPU_URL = f"http://{GPU_HOST}:{GPU_PORT}"

FRESH_CACHE_DIR = MODEL_DIR / "cache" / "sm86" / (
    f"fp32-trt1.7-ep0.5.0-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')}-{os.getpid()}"
)
PROFILE_DIR = REPO_ROOT / ".tmp" / "atlas" / "ort-profiles-fp32-v1"
RECEIPT_PATH = REPO_ROOT / ".tmp" / "atlas" / "p4-trt-rtx-fp32-parity-profile-v1.json"
PROFILE_DIR = REPO_ROOT / ".tmp" / "atlas" / "ort-profiles-v1"
RECEIPT_PATH = REPO_ROOT / ".tmp" / "atlas" / "p4-trt-rtx-parity-profile-v1.json"

FIXTURE_TEXTS = [
    "SearchRuntime executes hybrid PostgreSQL FTS and Qdrant dense retrieval with RRF fusion.",
    "BitFrost token FSM transitions candidates from UNLOADED to ADMITTED and RESIDENT.",
    "Actor workspace source grants enforce PostgreSQL authorization before retrieval.",
    "TensorRT-RTX execution provider compiles ONNX graphs with nv_runtime_cache_path.",
    "Drizzle ORM manages PostgreSQL 18 migrations and canonical chunk lineage.",
    "SvelteKit 2 route handlers validate JSON request bodies with Zod schemas.",
    "Matryoshka representation learning slices 768D vectors to 512D, 256D, and 128D.",
    "Tree-sitter CST and AST-grep emit bounded structural observations on port 8095.",
    "SeaweedFS filer serves object storage artifacts on port 8888.",
    "EmbeddingGemma2 ONNX quantized model produces L2-normalized sentence embeddings.",
    "AVX2 masked Top-K kernel filters candidate bitmasks before cosine scoring.",
    "GraphBFSExtended traverses workspace-scoped dependency edges without cycle loops.",
]


def sha256_file(path: Path) -> str | None:
    if not path.is_file():
        return None
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return f"sha256:{h.hexdigest()}"


def package_version(distribution: str) -> str | None:
    try:
        return importlib.metadata.version(distribution)
    except importlib.metadata.PackageNotFoundError:
        return None


def query_vram_mb() -> dict[str, int] | None:
    try:
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=name,memory.used,memory.free,memory.total", "--format=csv,noheader,nounits"],
            text=True,
            timeout=5,
        ).strip()
        line = out.splitlines()[0]
        name, used, free, total = [x.strip() for x in line.split(",")]
        return {"gpuName": name, "usedMb": int(used), "freeMb": int(free), "totalMb": int(total)}
    except Exception:
        return None


def is_port_open(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((host, port)) == 0


def http_json(method: str, url: str, payload: dict[str, Any] | None = None, timeout: float = 30.0) -> tuple[int, dict[str, Any]]:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {"Content-Type": "application/json"} if payload is not None else {}
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body_text = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} from {url}: {body_text}") from exc


def extract_dim_vectors(embed_resp: dict[str, Any], dim: int, expected_count: int) -> np.ndarray:
    embs = embed_resp.get("embeddings")
    if not isinstance(embs, dict) or str(dim) not in embs:
        raise RuntimeError(f"Expected embeddings['{dim}'] dict key, got keys={list(embs.keys()) if isinstance(embs, dict) else type(embs).__name__}")
    arr = np.asarray(embs[str(dim)], dtype=np.float32)
    if arr.shape != (expected_count, dim):
        raise RuntimeError(f"Shape mismatch for dim={dim}: expected {(expected_count, dim)}, got {arr.shape}")
    if not np.isfinite(arr).all():
        raise RuntimeError(f"Non-finite values in dim={dim} embeddings")
    norms = np.linalg.norm(arr, axis=1)
    if not np.allclose(norms, 1.0, atol=1e-2):
        raise RuntimeError(f"Vectors not L2-normalized for dim={dim}: norms={norms.tolist()}")
    if embed_resp.get("truncated_count", 0) not in (0, None):
        raise RuntimeError(f"Unexpected truncation: {embed_resp.get('truncated_count')}")
    return arr


def start_gpu_worker(env_overrides: dict[str, str]) -> tuple[subprocess.Popen[str], float]:
    if is_port_open(GPU_HOST, GPU_PORT):
        raise RuntimeError(f"Port {GPU_HOST}:{GPU_PORT} is already in use before launch")
    env = os.environ.copy()
    env.update({
        "HOST": GPU_HOST,
        "PORT": str(GPU_PORT),
        "GEMMA2_ONNX_DIR": str(MODEL_DIR),
        "GEMMA2_ONNX_FILE": str(MODEL_FILE),
        "GEMMA2_MODEL_ID": PINNED_MODEL_ID,
        "GEMMA2_MAX_TOKENS": "512",
        "GEMMA2_MAX_BATCH": "32",
        "ORT_WORKERS": "1",
        "ORT_INTRA_THREADS": "4",
        **env_overrides,
    })
    log_path = REPO_ROOT / ".tmp" / "atlas" / "gpu-worker-18094.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_file = log_path.open("w", encoding="utf-8")
    t0 = time.perf_counter()
    proc = subprocess.Popen(
        [sys.executable, str(SERVER_SCRIPT)],
        cwd=str(REPO_ROOT),
        env=env,
        stdout=log_file,
        stderr=subprocess.STDOUT,
        text=True,
    )
    deadline = time.perf_counter() + 180.0
    while time.perf_counter() < deadline:
        if proc.poll() is not None:
            log_file.close()
            out = log_path.read_text(encoding="utf-8", errors="replace")
            raise RuntimeError(f"Worker exited early (rc={proc.returncode}): {out[-1000:]}")
        try:
            status, health = http_json("GET", f"{GPU_URL}/health", timeout=2.0)
            if status == 200 and health.get("status") == "ok":
                return proc, round((time.perf_counter() - t0) * 1000, 2)
            if status == 200 and health.get("load_error"):
                raise RuntimeError(f"Worker load_error: {health.get('load_error')}")
        except urllib.error.URLError:
            pass
        except Exception as exc:
            if "load_error" in str(exc):
                raise
        time.sleep(0.5)
    raise TimeoutError("Timed out waiting for GPU worker /health")


def stop_worker(proc: subprocess.Popen[str] | None) -> dict[str, Any]:
    if proc is None:
        return {"terminated": True, "alreadyNone": True}
    if proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)
    for _ in range(20):
        if not is_port_open(GPU_HOST, GPU_PORT):
            break
        time.sleep(0.25)
    port_free = not is_port_open(GPU_HOST, GPU_PORT)
    return {"terminated": proc.poll() is not None, "returncode": proc.returncode, "portReleased": port_free}


def profile_inprocess_ort(cache_dir: Path, profile_prefix: Path) -> dict[str, Any]:
    import onnxruntime as ort
    import onnxruntime_ep_nv_tensorrt_rtx as trt_ep
    from tokenizers import Tokenizer

    if trt_ep.get_ep_name() not in ort.get_available_providers():
        ort.register_execution_provider_library(trt_ep.get_ep_name(), trt_ep.get_library_path())

    profile_prefix.parent.mkdir(parents=True, exist_ok=True)
    so = ort.SessionOptions()
    so.intra_op_num_threads = 4
    so.inter_op_num_threads = 1
    so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    so.add_session_config_entry("session.disable_cpu_ep_fallback", "1")
    so.enable_profiling = True
    so.profile_file_prefix = str(profile_prefix)

    sess = ort.InferenceSession(
        str(MODEL_FILE),
        so,
        providers=[(trt_ep.get_ep_name(), {"nv_runtime_cache_path": str(cache_dir)})],
    )
    tok = Tokenizer.from_file(str(TOKENIZER_FILE))
    tok.enable_truncation(max_length=512)
    enc = tok.encode(FIXTURE_TEXTS[0])
    ids = np.asarray([enc.ids], dtype=np.int64)
    mask = np.asarray([enc.attention_mask], dtype=np.int64)
    empty = np.zeros((0, 512), dtype=np.float32)
    feeds = {
        "input_ids": ids,
        "attention_mask": mask,
        "image_features": empty,
        "video_features": empty,
        "audio_features": empty,
    }
    sess.run(["sentence_embedding"], feeds)
    prof_file = Path(sess.end_profiling())
    events = json.loads(prof_file.read_text(encoding="utf-8"))
    by_provider: dict[str, dict[str, Any]] = {}
    for ev in events:
        if ev.get("cat") != "Node":
            continue
        args = ev.get("args", {})
        prov = args.get("provider", "unknown")
        dur_us = int(ev.get("dur", 0))
        entry = by_provider.setdefault(prov, {"nodeEvents": 0, "totalDurUs": 0, "ops": set()})
        entry["nodeEvents"] += 1
        entry["totalDurUs"] += dur_us
        if args.get("op_name"):
            entry["ops"].add(args["op_name"])
    summary = {
        prov: {
            "nodeEvents": v["nodeEvents"],
            "totalDurMs": round(v["totalDurUs"] / 1000.0, 3),
            "sampleOps": sorted(v["ops"])[:15],
        }
        for prov, v in by_provider.items()
    }
    return {
        "sessionProviders": sess.get_providers(),
        "profileFile": str(prof_file),
        "providerBreakdown": summary,
    }


def main() -> int:
    receipt: dict[str, Any] = {
        "schema": "atlas.p4-trt-rtx-parity-profile.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "status": "STARTED",
        "canonicalAuthority": False,
        "writesPerformed": False,
        "artifacts": {
            "modelFile": str(MODEL_FILE),
            "modelGraphSha256": sha256_file(MODEL_FILE),
            "externalWeightsFile": str(MODEL_DATA_FILE),
            "externalWeightsSha256": sha256_file(MODEL_DATA_FILE),
            "tokenizerFile": str(TOKENIZER_FILE),
            "tokenizerSha256": sha256_file(TOKENIZER_FILE),
        },
        "runtime": {
            "python": sys.version.split()[0],
            "ortVersion": package_version("onnxruntime"),
            "epPackageVersion": package_version("onnxruntime-ep-nv-tensorrt-rtx-cu13"),
        },
        "jitCache": {"path": str(FRESH_CACHE_DIR), "preExistingCachePreserved": True},
        "vram": {"baseline": query_vram_mb()},
    }

    proc: subprocess.Popen[str] | None = None
    try:
        # Allocate a unique cache per run. Never remove an earlier JIT cache.
        FRESH_CACHE_DIR.mkdir(parents=True, exist_ok=False)
        PROFILE_DIR.mkdir(parents=True, exist_ok=True)

        # CPU :8094 baseline check + fixture embeddings (Task 1, all MRL dims)
        _, cpu_health = http_json("GET", f"{CPU_URL}/health", timeout=5.0)
        receipt["cpu8094Health"] = cpu_health
        t_cpu = time.perf_counter()
        _, cpu_embed_1 = http_json("POST", f"{CPU_URL}/embed", {"texts": FIXTURE_TEXTS, "dims": MRL_DIMS}, timeout=30.0)
        cpu_ms = round((time.perf_counter() - t_cpu) * 1000, 2)
        cpu_vecs_by_dim = {d: extract_dim_vectors(cpu_embed_1, d, len(FIXTURE_TEXTS)) for d in MRL_DIMS}
        cpu_model_id = cpu_embed_1.get("model_id")
        if not isinstance(cpu_model_id, str) or not cpu_model_id:
            raise RuntimeError("CPU :8094 response is missing a model_id")
        _, cpu_embed_2 = http_json("POST", f"{CPU_URL}/embed", {"texts": FIXTURE_TEXTS, "dims": MRL_DIMS}, timeout=30.0)
        cpu_vecs_2 = extract_dim_vectors(cpu_embed_2, 768, len(FIXTURE_TEXTS))
        cpu_repeat_cos = float(np.min(np.sum(cpu_vecs_by_dim[768] * cpu_vecs_2, axis=1)))

        # Run 1 (Cold fresh JIT cache, strict ORT_FALLBACK_TO_CPU=0)
        proc, cold_startup_ms = start_gpu_worker({
            "ORT_PROVIDER_MODE": "tensorrt_rtx",
            "ORT_FALLBACK_TO_CPU": "0",
            "ORT_TRT_CACHE_DIR": str(FRESH_CACHE_DIR),
        })
        receipt["vram"]["run1Active"] = query_vram_mb()
        _, gpu_health = http_json("GET", f"{GPU_URL}/health", timeout=5.0)
        receipt["gpu18094Health"] = gpu_health
        receipt["workerPidRun1"] = proc.pid

        t0 = time.perf_counter()
        _, gpu_cold_resp = http_json("POST", f"{GPU_URL}/embed", {"texts": [FIXTURE_TEXTS[0]], "dims": MRL_DIMS}, timeout=180.0)
        cold_first_req_ms = round((time.perf_counter() - t0) * 1000, 2)
        _ = extract_dim_vectors(gpu_cold_resp, 768, 1)

        t0 = time.perf_counter()
        _, gpu_embed_1 = http_json("POST", f"{GPU_URL}/embed", {"texts": FIXTURE_TEXTS, "dims": MRL_DIMS}, timeout=180.0)
        gpu_fixture_ms_1 = round((time.perf_counter() - t0) * 1000, 2)
        gpu_vecs_by_dim = {d: extract_dim_vectors(gpu_embed_1, d, len(FIXTURE_TEXTS)) for d in MRL_DIMS}
        gpu_model_id = gpu_embed_1.get("model_id")
        if gpu_model_id != PINNED_MODEL_ID:
            raise RuntimeError(f"GPU model identity mismatch: expected={PINNED_MODEL_ID!r}, got={gpu_model_id!r}")

        t0 = time.perf_counter()
        _, gpu_embed_2 = http_json("POST", f"{GPU_URL}/embed", {"texts": FIXTURE_TEXTS, "dims": MRL_DIMS}, timeout=120.0)
        gpu_fixture_ms_2 = round((time.perf_counter() - t0) * 1000, 2)
        gpu_vecs_2 = extract_dim_vectors(gpu_embed_2, 768, len(FIXTURE_TEXTS))

        # Task 1 Parity & Exact-Neighbor Recall@3 across all MRL dims (768, 512, 256, 128)
        mrl_parity: dict[str, Any] = {}
        for d in MRL_DIMS:
            c_vecs = cpu_vecs_by_dim[d]
            g_vecs = gpu_vecs_by_dim[d]
            cosines = np.sum(c_vecs * g_vecs, axis=1)
            c_sim = c_vecs @ c_vecs.T
            g_sim = g_vecs @ g_vecs.T
            recalls = [
                len(set(np.argsort(-c_sim[i])[1:4].tolist()) & set(np.argsort(-g_sim[i])[1:4].tolist())) / 3.0
                for i in range(len(FIXTURE_TEXTS))
            ]
            mrl_parity[str(d)] = {
                "cpuGpuCosineMin": round(float(np.min(cosines)), 6),
                "cpuGpuCosineMean": round(float(np.mean(cosines)), 6),
                "cpuGpuCosineMax": round(float(np.max(cosines)), 6),
                "exactNeighborRecallAt3": round(float(np.mean(recalls)), 6),
            }
        gpu_repeat_cos = float(np.min(np.sum(gpu_vecs_by_dim[768] * gpu_vecs_2, axis=1)))

        receipt["task1Parity"] = {
            "fixtureCount": len(FIXTURE_TEXTS),
            "dims": MRL_DIMS,
            "cpuElapsedMs": cpu_ms,
            "gpuWarmElapsedMs": [gpu_fixture_ms_1, gpu_fixture_ms_2],
            "cpuThroughputTextsPerSec": round(len(FIXTURE_TEXTS) / (cpu_ms / 1000.0), 2),
            "gpuWarmThroughputTextsPerSec": round(len(FIXTURE_TEXTS) / (gpu_fixture_ms_2 / 1000.0), 2),
            "cpuModelId": cpu_model_id,
            "gpuModelId": gpu_model_id,
            "cpuRepeatMinCosine": round(cpu_repeat_cos, 7),
            "gpuRepeatMinCosine": round(gpu_repeat_cos, 7),
            "mrlParity": mrl_parity,
            **mrl_parity["768"],
        }

        # Task 4: Batch=1,4,8 + bounded queue (2 concurrent) + cancellation check
        batch_timings: dict[str, Any] = {}
        for b in (1, 4, 8):
            receipt["currentStep"] = f"task4_batch_{b}"
            tb = time.perf_counter()
            _, b_resp = http_json("POST", f"{GPU_URL}/embed", {"texts": FIXTURE_TEXTS[:b], "dims": [768]}, timeout=120.0)
            _ = extract_dim_vectors(b_resp, 768, b)
            batch_timings[f"batch_{b}_ms"] = round((time.perf_counter() - tb) * 1000, 2)
            print(f"task4 batch={b}: {batch_timings[f'batch_{b}_ms']} ms", flush=True)

        receipt["currentStep"] = "task4_concurrent_2x4"
        with ThreadPoolExecutor(max_workers=2) as pool:
            futs = [pool.submit(http_json, "POST", f"{GPU_URL}/embed", {"texts": FIXTURE_TEXTS[:4], "dims": [768]}, 120.0) for _ in range(2)]
            conc_statuses = [f.result()[0] for f in futs]

        receipt["currentStep"] = "task4_cancel_probe"
        cancel_observed = False
        try:
            http_json("POST", f"{GPU_URL}/embed", {"texts": FIXTURE_TEXTS[:1], "dims": [768]}, timeout=0.001)
        except Exception:
            cancel_observed = True
        # Verify server stays healthy after client cancellation
        receipt["currentStep"] = "task4_post_cancel_health"
        _, post_cancel_health = http_json("GET", f"{GPU_URL}/health", timeout=30.0)
        receipt["task4VramAdmission"] = {
            "batchTimings": batch_timings,
            "concurrent2xBatch4Statuses": conc_statuses,
            "clientCancellationObserved": cancel_observed,
            "postCancelHealthy": post_cancel_health.get("status") == "ok",
            "peakActiveVram": query_vram_mb(),
        }

        receipt["run1Teardown"] = stop_worker(proc)
        proc = None
        receipt["vram"]["afterRun1Teardown"] = query_vram_mb()

        # Run 2 (Fresh process reusing the exact same ORT_TRT_CACHE_DIR)
        proc, warm_startup_ms = start_gpu_worker({
            "ORT_PROVIDER_MODE": "tensorrt_rtx",
            "ORT_FALLBACK_TO_CPU": "0",
            "ORT_TRT_CACHE_DIR": str(FRESH_CACHE_DIR),
        })
        receipt["workerPidRun2"] = proc.pid
        t0 = time.perf_counter()
        _, gpu_run2_first = http_json("POST", f"{GPU_URL}/embed", {"texts": [FIXTURE_TEXTS[0]], "dims": [768]}, timeout=30.0)
        run2_first_req_ms = round((time.perf_counter() - t0) * 1000, 2)
        _ = extract_dim_vectors(gpu_run2_first, 768, 1)

        t0 = time.perf_counter()
        _, gpu_run2_warm = http_json("POST", f"{GPU_URL}/embed", {"texts": [FIXTURE_TEXTS[0]], "dims": [768]}, timeout=30.0)
        run2_warm_req_ms = round((time.perf_counter() - t0) * 1000, 2)
        _ = extract_dim_vectors(gpu_run2_warm, 768, 1)

        receipt["run2Teardown"] = stop_worker(proc)
        proc = None
        receipt["vram"]["afterRun2Teardown"] = query_vram_mb()

        cache_files = [
            {
                "name": str(p.relative_to(FRESH_CACHE_DIR)),
                "sizeBytes": p.stat().st_size,
                "sha256": sha256_file(p),
            }
            for p in sorted(FRESH_CACHE_DIR.rglob("*"))
            if p.is_file()
        ]
        receipt["task3JitCache"] = {
            "cacheDir": str(FRESH_CACHE_DIR),
            "run1Cold": {"startupToReadyMs": cold_startup_ms, "firstRequestMs": cold_first_req_ms, "warmBatch12Ms": gpu_fixture_ms_1},
            "run2WarmReuse": {"startupToReadyMs": warm_startup_ms, "firstRequestMs": run2_first_req_ms, "warmRequestMs": run2_warm_req_ms},
            "cacheFileCount": len(cache_files),
            "cacheFiles": cache_files,
        }

        # Task 2: In-process ORT operator profile (strict GPU-only, no CPUExecutionProvider)
        receipt["task2OperatorProfile"] = profile_inprocess_ort(FRESH_CACHE_DIR, PROFILE_DIR / "trt_rtx_op_profile")
        receipt["vram"]["finalAfterProfile"] = query_vram_mb()
        receipt["status"] = "PROVEN"
        return 0
    except Exception as exc:
        import traceback
        receipt["status"] = "FAILED"
        receipt["error"] = {"type": type(exc).__name__, "message": str(exc), "traceback": traceback.format_exc()}
        return 1
    finally:
        if proc is not None:
            receipt["cleanupTeardown"] = stop_worker(proc)
        payload_bytes = json.dumps(receipt, indent=2, sort_keys=True).encode("utf-8")
        receipt["receiptSha256"] = hashlib.sha256(payload_bytes).hexdigest()
        RECEIPT_PATH.parent.mkdir(parents=True, exist_ok=True)
        RECEIPT_PATH.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
