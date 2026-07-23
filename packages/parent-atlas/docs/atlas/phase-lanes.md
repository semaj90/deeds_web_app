**Atlas Phase Lanes**

- **Purpose:** Describe offline phase lanes (Phase 17–19) run procedure, flags, and Python dependency notes.

- **Primary scripts:**
  - `npm run atlas:phase17` — runs Phase 17 feature extractor (Python preferred, JS fallback available)
  - `npm run atlas:phase18` — runs Phase 18 reranker (Python preferred, JS fallback available)
  - `npm run atlas:phase17-18` — runs both in sequence
  - `npm run atlas:phase-lanes` — runs aggregator/completion lane

- **Typical run (from repo root):**
```bash
npm run atlas:phase17-18
```

- **Flags:**
  - `--no-py` — force JS fallback (skip attempting to spawn Python worker). Useful on CI or machines without required Python deps.
  - `--input <path>` — input JSONL (default: `memory/knowledge/schema-indexer-contract-cards.jsonl`)
  - `--out <path>` — output JSONL (default: `.tmp/phase17-pytorch-features.jsonl` / `.tmp/phase18-xgboost-rerank.jsonl`)
  - `--report <path>` — markdown report path (default: `reports/phase17-pytorch-feature-summary.md`, etc.)

- **Where outputs go (read-only for indexer):**
  - Feature vectors: `.tmp/feature_vectors/*.npy`
  - JSONL rows: `.tmp/*.jsonl`
  - Human reports: `reports/*.md`

- **Python dependencies (optional, for native workers):**
  - Phase 17: `numpy`, `torch` (install via `pip install numpy torch`)
  - Phase 18: `numpy`, `xgboost` (install via `pip install numpy xgboost`)
  - If you have GPU and want GPU PyTorch builds, install matching `torch` for your CUDA version (refer to PyTorch docs).

- **CI guidance:**
  - Prefer `--no-py` on CI unless a build step installs Python + wheels.
  - Fail the build if any expected report or JSONL file is empty — see `sveltekit-frontend/scripts/ci/check_atlas_reports.mjs` for a ready check.

- **Troubleshooting:**
  - If wrappers fail to spawn Python due to path doubling, ensure the repository is run from root and scripts use `import.meta.url` (wrappers included in this repo already do).
  - Use `--no-py` to force deterministic JS fallback during investigation.

---
Generated: May 26, 2026
