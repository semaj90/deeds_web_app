# Parent Atlas: Google Colab G4 Blackwell (96GB SM 12.0) GPU Analysis Bundle

> High-throughput GPU document batch ranking, 64-bit Radix Key synthesis, EPYC Turin AVX-512 SIMD filtering, and multi-turn DSPy / RLM prompt compilation for **Google Colab G4 (NVIDIA RTX PRO 6000 Blackwell Server Edition, 96 GB GDDR7)**.

---

## 📌 Hardware Comparison: G4 vs. A100 vs. Local RTX 3060 Ti

| Hardware Metric | **Local Workstation (RTX 3060 Ti)** | **Colab A100 (SXM4)** | **Colab G4 (RTX PRO 6000 Blackwell)** | Why G4 Wins for Parent Atlas |
|---|---|---|---|---|
| **Architecture / SM** | Ampere (SM 8.6) | Ampere (SM 8.0) | **Blackwell (SM 12.0)** | Native 5th-Gen Tensor Cores with hardware FP4/NVFP4, FP8, and BF16. |
| **VRAM Capacity** | 8 GB GDDR6 | 40 GB HBM2e | **96 GB GDDR7** (~95.6 GiB usable) | **2.4x the VRAM of Colab A100**. Holds Ornith-1.5-9B + EmbeddingGemma 2 + 1M+ vectors + 64k KV cache simultaneously with zero eviction. |
| **3D / BVH RT Cores** | 2nd-Gen RT Cores | None (Compute only) | **4th-Gen RT Cores** | Hardware-accelerates both Multi-BVH spatial raycasts and Tensor Core GEMM on one GPU. |
| **Host System RAM** | 16 GB DDR4 | ~83 GB RAM | **~176 GB RAM (AMD EPYC Turin)** | Supports massive AVX-512 / AVX2 mmap arenas and Arrow/cuDF tables in host memory. |
| **Colab Compute Units** | 0.0 CU/hr (Local) | ~5.4 - 6.0 CU/hr | **~6.71 CU/hr** (vs ~18.02 for H100) | Delivers H100-tier LLM/ranking speed and 16 GB more VRAM than an 80GB H100 at nearly A100 pricing. |

---

## ⚡ G4 VRAM Allocation Strategy (96 GB GDDR7)

On a 40GB A100 or 8GB local workstation, you must serialize and swap between LLMs, embedding models, and cuVS clustering.
With 96 GB of GDDR7 on Colab G4, all four services co-exist in memory without eviction:

| VRAM Partition | Resident Component | Memory Footprint | Purpose in Parent Atlas |
|---|---|---|---|
| **0 - 22 GB** | vLLM / llama-server (`ornith-1.5-9b` BF16 + 64k KV Cache + 8 QLoRA adapters) | ~22 GB | Runs DSPy RLM self-prompting & dspy-rlm-prompt-packet-v1 synthesis at >120 tok/s |
| **22 - 28 GB** | EmbeddingGemma 2 + 4x4x6 SOM / K-Means Centroid Projector | ~6 GB | Embeds Firecrawl LDR markdown & computes engram_96 (0..95) tokens |
| **28 - 48 GB** | `batch_doc_gpu_ranker.py` Resident Corpus (up to 5M 768D FP16 vectors + CSR Graph) | ~20 GB | Sub-5ms cosine ranking + 64-bit NES LUT mask filtering |
| **48 - 95.6 GB**| Free Scratch / RAPIDS cuDF / QLoRA ae:train Gradient Buffer | ~47.6 GB | Zero-eviction headroom for `cudf_feature_json_ingest.py` & GRPO rollouts |

---

## 📂 Bundle File Layout

```text
colab_atlas_gpu_analysis/
├── README.md                           # This guide & G4 architecture overview
├── TODO.md                             # Step-by-step checklist & benchmark roadmap
├── requirements.txt                    # PyTorch, CUDA, DSPy, and utility dependencies
├── notebooks/
│   └── atlas_gpu_batch_analysis.ipynb  # Interactive Colab G4 Notebook with SM 12.0 auto-detect
├── src/
│   ├── python/
│   │   ├── batch_doc_gpu_ranker.py     # SM 12.0 G4 tier detect + fused 64-bit NES LUT & Radix Key ranker
│   │   ├── fused_bitmask_gpu_ranker.py # Fused bitmask pre-filtering + BF16 Tensor Core GEMM
│   │   ├── nes_lut_filter_v1.py        # Bit-exact scalar & bitmask filtering oracle
│   │   ├── cudf_feature_json_ingest.py # Schema-bound Engram descriptor & token builder (cudf, pandas fallback)
│   │   ├── cudf_aten_rl_check.py       # libcudf vs pandas, cudf->ATen DLPack, GRPO advantage torch-vs-oracle
│   │   ├── grpo_policy_shadow_v1.py    # Training-free GRPO-style shadow evaluator (updates NO weights)
│   │   └── parent_atlas_learning/      # Episode runner, strict checker, advisory ranker, contracts
│   └── cpp/
│       ├── nes_lut_filter.h            # C++ SIMD header (scalar + AVX2)
│       ├── nes_lut_filter_avx2.h       # C-ABI AVX2 / AVX-512 interface
│       ├── nes_lut_filter_avx2.cpp     # EPYC Turin AVX-512BW (64 bytes/cycle) + AVX2 implementation
│       ├── test_nes_lut_filter_avx2.cpp# 23-test standalone benchmark suite
│       └── nes_lut_filter_cpp_check.cpp# Standalone CLI validation binary
└── data/
    └── nes-lut-filter-avx2-parity-receipt-v1.json # Frozen 6,527-candidate verification receipt
```

---

## 🚀 Execution Instructions on Google Colab

### 1. Select the G4 Runtime in Google Colab
- In Colab, click **Runtime** → **Change runtime type**.
- Select **GPU** and pick **G4 (NVIDIA RTX PRO 6000 Blackwell)**.
- If G4 is not selected in your tier, select **A100 (40GB)** or **L4 (24GB)**; `batch_doc_gpu_ranker.py` automatically detects the SM version and adapts batch sizes.

### 2. Install Dependencies
```bash
!pip install -r requirements.txt
```

### 3. Compile Native EPYC Turin AVX-512BW Binary
In Notebook Step 1:
```bash
!g++ -O3 -march=native -mtune=native -std=c++20 \
  src/cpp/nes_lut_filter_avx2.cpp \
  src/cpp/test_nes_lut_filter_avx2.cpp \
  -o /tmp/test_nes_lut_filter_native && /tmp/test_nes_lut_filter_native
```

### 4. Run Fused 64-Bit NES LUT + Tensor Core Ranking
`fused_nes_lut_radix_topk_ranker`:
- Pre-filters candidates via 64-bit integer bitmask directly on GPU: `((allowed_mask >> (lut_byte & 63)) & 1) != 0`.
- Executes batched Tensor Core cosine similarity in `bfloat16`.
- Synthesizes 64-bit composite Radix Key on GPU:
  `actionable_1b (bit 63) | lod_2b (61..62) | engram_15b (46..60) | morton_30b (16..45) | cohort_16b (0..15)`
- Emits verification receipt to `data/colab_gpu_analysis_receipt.json`.
