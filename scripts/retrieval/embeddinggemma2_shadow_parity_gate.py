# scripts/retrieval/embeddinggemma2_shadow_parity_gate.py
import hashlib
import json
import time
from dataclasses import dataclass, asdict
from pathlib import Path
import numpy as np
try:
    import torch
except ImportError:
    torch = None


@dataclass(frozen=True)
class ShadowEmbeddingRecord:
    representation_id: str        # "embeddinggemma2-text-mrl256-v1"
    model_id: str                 # "google/embeddinggemma-2"
    model_revision: str           # Pinned commit hash
    dimension: int                # 256
    dtype: str                    # "float32"
    normalized: bool              # True
    task: str                     # "Document" | "Query"
    source_sha256: str            # 64-hex digest of canonical text/chunk
    source_revision: str
    canonical: bool               # Strictly False (Shadow Index only)


def assert_vram_headroom_for_experiment(min_free_mib: int = 1200) -> dict:
    """
    Guardrail for RTX 3060 Ti (8 GB): Prevents OOM / TDR crashes if Ornith (:8090)
    is currently occupying ~7.3 GB VRAM.
    """
    if torch is None or not torch.cuda.is_available():
        return {
            "device": "cpu",
            "safe": True,
            "freeMiB": 0,
            "totalMiB": 0,
            "note": "PyTorch CUDA runtime not available in active environment"
        }

    free_bytes, total_bytes = torch.cuda.mem_get_info(0)
    free_mib = free_bytes // (1024 * 1024)
    total_mib = total_bytes // (1024 * 1024)

    if free_mib < min_free_mib:
        raise RuntimeError(
            f"BLOCKED_VRAM_HEADROOM: Only {free_mib} MiB free of {total_mib} MiB on RTX 3060 Ti. "
            f"Stop Ornith (:8090) before running GPU EmbeddingGemma 2 / cuTile benchmarks."
        )
    return {"device": "cuda:0", "safe": True, "freeMiB": free_mib, "totalMiB": total_mib}


def truncate_and_renormalize_mrl256(v_768: np.ndarray) -> np.ndarray:
    """
    Implements Google's official MRL truncation + L2 re-normalization:
    v_256 = v_768[:, :256] / ||v_768[:, :256]||_2
    """
    if v_768.ndim == 1:
        v_768 = v_768[None, :]
    assert v_768.shape[1] == 768, f"Expected 768-D source vector, got {v_768.shape}"

    slice_256 = v_768[:, :256].astype(np.float32)
    norms = np.linalg.norm(slice_256, axis=1, keepdims=True)
    norms = np.maximum(norms, 1e-12)
    return slice_256 / norms


def verify_pytorch_vs_onnx_parity(
    pytorch_vec_768: np.ndarray,
    onnx_vec_768: np.ndarray,
    atol: float = 1e-3
) -> dict:
    """
    Compares 768-D and normalized 256-D MRL vectors between PyTorch and ONNX Runtime.
    """
    pt_256 = truncate_and_renormalize_mrl256(pytorch_vec_768)
    ort_256 = truncate_and_renormalize_mrl256(onnx_vec_768)

    max_abs_diff_768 = float(np.max(np.abs(pytorch_vec_768 - onnx_vec_768)))
    max_abs_diff_256 = float(np.max(np.abs(pt_256 - ort_256)))

    # Cosine similarity of already L2-normalized 256-D vectors is their dot product
    cos_sim_256 = float(np.min(np.sum(pt_256 * ort_256, axis=1)))
    norms_256 = np.linalg.norm(pt_256, axis=1)
    unit_norm_ok = bool(np.allclose(norms_256, 1.0, atol=1e-5))

    passed = (max_abs_diff_256 <= atol) and (cos_sim_256 >= 0.9995) and unit_norm_ok
    return {
        "status": "PASS" if passed else "FAIL",
        "maxAbsDiff768": round(max_abs_diff_768, 6),
        "maxAbsDiff256": round(max_abs_diff_256, 6),
        "minCosineSim256": round(cos_sim_256, 6),
        "unitNormVerified": unit_norm_ok
    }


def benchmark_aten_topk_baseline(num_candidates: int = 65536, dim: int = 256, k: int = 32) -> dict:
    """
    Establishes the baseline ATen GEMM + torch.topk() latency on the RTX 3060 Ti (sm_86)
    that any candidate cuTile kernel must beat and match bit-for-bit.
    """
    if torch is None:
        raise RuntimeError("No module named 'torch' in active Python environment")

    vram_status = assert_vram_headroom_for_experiment(min_free_mib=800)
    device = vram_status["device"]

    torch.manual_seed(42)
    db_vectors = torch.randn(num_candidates, dim, dtype=torch.float16, device=device)
    db_vectors = torch.nn.functional.normalize(db_vectors, dim=1)
    query = torch.randn(1, dim, dtype=torch.float16, device=device)
    query = torch.nn.functional.normalize(query, dim=1)

    # Warmup
    for _ in range(5):
        scores = torch.matmul(db_vectors, query.T).squeeze(-1)
        _ = torch.topk(scores, k=k, largest=True, sorted=True)
    if device.startswith("cuda"):
        torch.cuda.synchronize()

    # Timed 50-iteration run
    t0 = time.perf_counter()
    for _ in range(50):
        scores = torch.matmul(db_vectors, query.T).squeeze(-1)
        top_vals, top_idx = torch.topk(scores, k=k, largest=True, sorted=True)
    if device.startswith("cuda"):
        torch.cuda.synchronize()
    avg_ms = ((time.perf_counter() - t0) / 50.0) * 1000.0

    return {
        "status": "PASS",
        "device": device,
        "numCandidates": num_candidates,
        "dimension": dim,
        "k": k,
        "avgLatencyMs": round(avg_ms, 4),
        "top5Indices": top_idx[:5].detach().cpu().tolist(),
        "top5Scores": [round(float(x), 5) for x in top_vals[:5].detach().cpu().tolist()]
    }


if __name__ == "__main__":
    # Smoke test on synthetic frozen inputs
    rng = np.random.default_rng(20261107)
    base_768 = rng.standard_normal((8, 768), dtype=np.float32)
    noisy_ort_768 = base_768 + rng.normal(0, 1e-5, size=base_768.shape).astype(np.float32)

    parity = verify_pytorch_vs_onnx_parity(base_768, noisy_ort_768)
    sample_meta = ShadowEmbeddingRecord(
        representation_id="embeddinggemma2-text-mrl256-v1",
        model_id="google/embeddinggemma-2",
        model_revision="sha256:pinned-fixture-rev-v1",
        dimension=256,
        dtype="float32",
        normalized=True,
        task="Document",
        source_sha256=hashlib.sha256(b"18 U.S.C. 1001 Vance Deposition Excerpt").hexdigest(),
        source_revision="rev-1",
        canonical=False
    )

    try:
        aten_bench = benchmark_aten_topk_baseline()
    except RuntimeError as e:
        aten_bench = {"status": "BLOCKED", "reason": str(e)}

    receipt = {
        "parityCheck": parity,
        "atenBaseline": aten_bench,
        "shadowRecordContract": asdict(sample_meta)
    }
    root = Path(__file__).resolve().parents[2]
    out_path = root / ".tmp" / "atlas" / "embeddinggemma2-shadow-parity-receipt.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(receipt, indent=2), encoding="utf-8")
    print(json.dumps(receipt, indent=2))
