"""
batch_doc_gpu_ranker.py
Enhanced for Google Colab G4 (NVIDIA RTX PRO 6000 Blackwell SM 12.0, 96GB GDDR7),
Hopper H100 (SM 9.0), Ampere A100 (SM 8.0), and local workstation (RTX 3060 Ti SM 8.6).

Features:
- Blackwell SM 12.0 / Hopper / Ampere runtime tier auto-detection
- Fused 64-bit NES LUT domain bitmask pre-filtering on GPU
- Tensor Core Cosine Top-K batched matrix ranking
- 64-bit Composite Radix Key synthesis on GPU (actionable | engram | morton | cohort)
"""

import time
import torch
from typing import Dict, Any, Optional

def detect_gpu_tier() -> Dict[str, Any]:
    """
    Detects hardware tier and configures optimal precision and batch limits.
    Distinguishes Colab G4 Blackwell (SM 12.0, 96GB) from H100, A100, and local RTX cards.
    """
    if not torch.cuda.is_available():
        return {
            "tier": "CPU",
            "device_name": "CPU",
            "compute_capability": "0.0",
            "vram_gb": 0.0,
            "dtype": torch.float32,
            "max_batch": 5_000,
        }

    props = torch.cuda.get_device_properties(0)
    vram_gb = props.total_memory / (1024 ** 3)
    cc_major, cc_minor = props.major, props.minor

    # G4 = NVIDIA RTX PRO 6000 Blackwell Server Edition (cc >= 10.0 or 12.0, ~95.6 GB usable VRAM)
    if cc_major >= 10 or "RTX PRO 6000" in props.name or "Blackwell" in props.name:
        tier = "COLAB_G4_BLACKWELL_96GB"
        dtype = torch.bfloat16  # Or torch.float8_e4m3fn for 5th-Gen Tensor Core GEMM
        max_batch = 2_000_000   # Fits comfortably inside 96 GB GDDR7 alongside LLM & KV cache
    elif cc_major == 9:
        tier = "COLAB_H100_HOPPER"
        dtype = torch.bfloat16
        max_batch = 1_000_000
    elif cc_major == 8 and vram_gb > 30:
        tier = "COLAB_A100_40GB"
        dtype = torch.bfloat16
        max_batch = 500_000
    else:
        tier = f"LOCAL_WORKSTATION_{props.name.replace(' ', '_')}"
        dtype = torch.float16 if not torch.cuda.is_bf16_supported() else torch.bfloat16
        max_batch = 50_000

    torch.backends.cuda.matmul.allow_tf32 = True
    torch.backends.cudnn.allow_tf32 = True

    return {
        "tier": tier,
        "device_name": props.name,
        "compute_capability": f"{cc_major}.{cc_minor}",
        "vram_gb": round(vram_gb, 2),
        "dtype": dtype,
        "max_batch": max_batch,
    }


@torch.inference_mode()
def fused_nes_lut_radix_topk_ranker(
    query_vecs: torch.Tensor,       # [Q, D] normalized
    corpus_vecs: torch.Tensor,      # [N, D] normalized (resident in GPU VRAM)
    corpus_lut_bytes: torch.Tensor, # [N] uint8 (0..63 canonical NES LUT byte)
    allowed_lut_mask: int,          # 64-bit integer bitmask of active NES LUT domains
    corpus_morton: torch.Tensor,    # [N] int64 (30-bit Morton spatial code)
    corpus_cohort: torch.Tensor,    # [N] int64 (16-bit OpenSpec/nextsteps cohort ID)
    top_k: int = 32,
) -> Dict[str, Any]:
    """
    Executes bit-exact 64-bit NES LUT bitmask pre-filtering on GPU,
    followed by Tensor Core GEMM similarity and composite 64-bit Radix Key synthesis.
    """
    t0 = time.perf_counter()

    # 1. Bit-exact GPU equivalent of nes_lut_filter_avx2: ((allowed_lut_mask >> lut_byte) & 1) != 0
    shifts = corpus_lut_bytes.to(torch.int64) & 63
    mask_tensor = torch.tensor(allowed_lut_mask, dtype=torch.int64, device=corpus_vecs.device)
    valid_mask = ((mask_tensor >> shifts) & 1).bool()

    valid_indices = torch.nonzero(valid_mask, as_tuple=False).squeeze(-1)
    if valid_indices.numel() == 0:
        return {
            "global_indices": torch.empty((query_vecs.shape[0], 0), dtype=torch.int64, device=corpus_vecs.device),
            "top_scores": torch.empty((query_vecs.shape[0], 0), dtype=query_vecs.dtype, device=corpus_vecs.device),
            "radix_keys_u64": torch.empty((query_vecs.shape[0], 0), dtype=torch.int64, device=corpus_vecs.device),
            "filtered_candidates": 0,
            "elapsed_ms": round((time.perf_counter() - t0) * 1000.0, 3),
        }

    filtered_corpus = corpus_vecs.index_select(0, valid_indices)

    # 2. Tensor Core Batched Cosine Similarity [Q, N_valid]
    scores = torch.matmul(query_vecs, filtered_corpus.T)
    k_actual = min(top_k, filtered_corpus.shape[0])
    top_scores, local_idx = torch.topk(scores, k=k_actual, dim=-1, largest=True, sorted=True)

    # Map back to global corpus indices [Q, k_actual]
    global_idx = valid_indices[local_idx]

    # 3. Synthesize 64-bit Composite Radix Key on GPU:
    # Actionable_1b (bit 63) | LOD_2b (61..62) | Engram_15b (46..60) | Morton_30b (16..45) | Cohort_16b (0..15)
    actionable_bit = (top_scores > 0.72).to(torch.int64) << 63
    engram_15b = (corpus_lut_bytes[global_idx].to(torch.int64) & 0x7FFF) << 46
    morton_30b = (corpus_morton[global_idx] & 0x3FFFFFFF) << 16
    cohort_16b = corpus_cohort[global_idx] & 0xFFFF

    radix_keys = actionable_bit | engram_15b | morton_30b | cohort_16b
    if torch.cuda.is_available():
        torch.cuda.synchronize()
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    return {
        "global_indices": global_idx,
        "top_scores": top_scores,
        "radix_keys_u64": radix_keys,
        "filtered_candidates": int(valid_indices.numel()),
        "elapsed_ms": round(elapsed_ms, 3),
    }

if __name__ == "__main__":
    hw = detect_gpu_tier()
    print(f"=== [Detected Runtime: {hw['tier']} | {hw['device_name']} | {hw['vram_gb']} GB VRAM] ===")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = hw["dtype"]

    q = torch.nn.functional.normalize(torch.randn(4, 768, device=device, dtype=dtype), dim=-1)
    c = torch.nn.functional.normalize(torch.randn(20_000, 768, device=device, dtype=dtype), dim=-1)
    lut = torch.randint(0, 64, (20_000,), device=device, dtype=torch.uint8)
    morton = torch.randint(0, (1 << 30), (20_000,), device=device, dtype=torch.int64)
    cohort = torch.randint(0, 6527, (20_000,), device=device, dtype=torch.int64)

    # Allowed mask: domains 1, 2, 3 (0b1110 = 0x0E)
    res = fused_nes_lut_radix_topk_ranker(q, c, lut, 0x0E, morton, cohort, top_k=10)
    print(f"✓ Ranked 20,000 vectors (4 queries) in {res['elapsed_ms']} ms")
    print(f"✓ Filtered candidates: {res['filtered_candidates']:,}")
    print(f"✓ Top scores sample: {[round(float(s), 4) for s in res['top_scores'][0][:5]]}")
