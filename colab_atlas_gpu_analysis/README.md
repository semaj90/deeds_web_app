# Parent Atlas Cloud GPU Analysis Bundle (Prototype)

> This bundle contains candidate GPU ranking code, synthetic fixtures, and notebook scaffolding. It is not a measured A100/G4 benchmark, a fused CUDA kernel, or proof that any particular Colab tier provides a specific GPU. Read the hardware and evidence notes below before selecting a runtime.

---

## Hardware names and what they mean

| Runtime or instance | Accelerator | Memory | Notes |
|---|---|---:|---|
| Local workstation | RTX 3060 Ti, Ampere SM 8.6 | 8 GiB | Current local inference and small, isolated parity runs. Available VRAM must be measured at run time. |
| AWS G4dn | NVIDIA T4, Turing SM 7.5 | 16 GiB per GPU | This is the AWS `G4dn` family; it is not Google Cloud G4. T4 is not supported by the standard FlashAttention-2 CUDA kernels; the upstream project points Turing users to a separate implementation. |
| AWS G5 / G6 | NVIDIA A10G / L4 | 22 GiB per GPU | Different AWS instance families and GPUs; confirm the actual instance and driver before choosing a wheel. |
| Google Cloud G4 | NVIDIA RTX PRO 6000 Blackwell Server Edition | 12, 24, 48, or 96 GB partitions | G4 is a Google Cloud VM family, not a selectable GPU name guaranteed by ordinary Colab. The full 96 GB configuration is a provisioned Cloud VM option. |
| A100 | Ampere SM 8.0, 40 GB or 80 GB HBM2e | 40 / 80 GB | Data-center accelerator. NVIDIA lists 1,555 GB/s for 40 GB and up to 2,039 GB/s for 80 GB SXM; actual workload speed depends on kernel, data movement, and batch shape. |

The vendor names matter: **AWS G4dn means T4**, while **Google Cloud G4 means RTX PRO 6000 Blackwell**. Colab GPU availability and memory vary by account and session; do not treat the Google Cloud G4 VM configuration or a specific A100 as guaranteed Colab hardware. Vendor specs describe peak capabilities, not Parent Atlas measurements. The saved notebook currently has no executed cell outputs, so its claimed ranking latencies and VRAM allocations are not verified.

---

## GPU memory planning: measure before co-residency claims

There is no validated fixed VRAM partition for the model, KV cache, embedding model, ranker, or training buffers. The 5M-vector and zero-eviction figures previously shown here were estimates, not measured receipts. Do not launch these components together based on that table. Record free/total memory before and after each stage, model/cache settings, peak allocation, and failures on the actual runtime. The local RTX 3060 Ti is shared with the existing inference service; GPU jobs must follow the repository's operator-controlled GPU workflow.

---

## 📂 Bundle File Layout

```text
colab_atlas_gpu_analysis/
├── README.md                           # This guide & G4 architecture overview
├── TODO.md                             # Step-by-step checklist & benchmark roadmap
├── requirements.txt                    # PyTorch, CUDA, DSPy, and utility dependencies
├── notebooks/
│   └── atlas_gpu_batch_analysis.ipynb  # Interactive cloud GPU notebook; detects runtime hardware
├── src/
│   ├── python/
│   │   ├── batch_doc_gpu_ranker.py     # SM 12.0 G4 tier detect + fused 64-bit NES LUT & Radix Key ranker
│   │   ├── fused_bitmask_gpu_ranker.py # Candidate mask + GEMM prototype; compacts an intermediate tensor
│   │   ├── nes_lut_filter_v1.py        # Bit-exact scalar & bitmask filtering oracle
│   │   ├── cudf_feature_json_ingest.py # Schema-bound Engram descriptor & token builder (cudf, pandas fallback)
│   │   ├── cudf_aten_rl_check.py       # libcudf vs pandas, cudf->ATen DLPack, GRPO advantage torch-vs-oracle
│   │   ├── grpo_policy_shadow_v1.py    # Training-free GRPO-style shadow evaluator (updates NO weights)
│   │   └── parent_atlas_learning/      # Episode runner, strict checker, advisory ranker, contracts
│   └── cpp/
│       ├── nes_lut_filter.h            # C++ SIMD header (scalar + AVX2)
│       ├── nes_lut_filter_avx2.h       # C-ABI AVX2 / AVX-512 interface
│       ├── nes_lut_filter_avx2.cpp     # Host-specific SIMD implementation; build/runtime ISA must be checked
│       ├── test_nes_lut_filter_avx2.cpp# 23-test standalone benchmark suite
│       └── nes_lut_filter_cpp_check.cpp# Standalone CLI validation binary
└── data/
    └── nes-lut-filter-avx2-parity-receipt-v1.json # Frozen 6,527-candidate verification receipt
```

---

## 🚀 Execution Instructions on Google Colab

### 1. Record the runtime Colab actually assigned
- Select a GPU runtime if one is available; do not assume it is G4, A100, or L4.
- Run the notebook's hardware inventory first and retain the GPU name, compute capability, memory, driver, CUDA runtime, and PyTorch version in the receipt.
- `batch_doc_gpu_ranker.py` labels a device and picks a hard-coded batch ceiling; that is not evidence the batch fits or that the kernel is tuned for the device.

### 2. Install Dependencies
```bash
!pip install -r requirements.txt
```

### 3. Compile a host-specific native binary only after CPU feature detection
`-march=native` targets the CPU of the current runtime; it does not establish that the host is EPYC Turin or supports AVX-512BW. Record compiler and CPU features, and keep a scalar fallback. Do not compare this result to another host without recording its architecture.
```bash
!g++ -O3 -march=native -mtune=native -std=c++20 \
  src/cpp/nes_lut_filter_avx2.cpp \
  src/cpp/test_nes_lut_filter_avx2.cpp \
  -o /tmp/test_nes_lut_filter_native && /tmp/test_nes_lut_filter_native
```

### 4. Run the candidate ranking prototype
`fused_nes_lut_radix_topk_ranker` currently composes separate PyTorch operations: a bitmask tensor, `nonzero`, `index_select` (which materializes a filtered corpus), matrix multiplication, top-K, and radix-key construction. This is not a single fused kernel and does allocate an intermediate filtered tensor. The function's wall-clock timing is not yet a reproducible GPU benchmark with separate transfer, warm-up, kernel, and synchronization measurements. Treat outputs as prototype results until correctness and performance are recorded on an identified GPU.

The current radix-key expression is:
  `actionable_1b (bit 63) | lod_2b (61..62) | engram_15b (46..60) | morton_30b (16..45) | cohort_16b (0..15)`
- Emits verification receipt to `data/colab_gpu_analysis_receipt.json`.
