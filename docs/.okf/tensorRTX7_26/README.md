# TensorRT-RTX 1.6 / CUDA 13.4 — reference doc snapshot (fetched 2026-09-27)

**Status: reference material only.** This is a manual `WebFetch` archive of NVIDIA's public
TensorRT-RTX docs, saved for the side-by-side challenger-lane plan recorded in root `CLAUDE.md`
under "TensorRT-RTX 1.6 / CUDA 13.4 — DIRECTION ONLY, not started (2026-09-27)". It is **not**
a `docs/.okf/topics/*`-style discovery-manifest corpus (no `corpus.json`, no admission/write
receipts, no Postgres/Qdrant ingestion) — that pipeline (`atlas_okf_docs_pipeline.py`) was not
run for this. These are plain markdown notes for a human/future-session to read, nothing more.

**Do not treat any content in this folder as canonical or already-installed state.** Verified
live on this host (2026-09-27, same session): only CUDA `v12.8`/`v13.0` exist under
`NVIDIA GPU Computing Toolkit/CUDA/`, `CUDA_PATH` points at `v13.0`, and no TensorRT-RTX
installation exists anywhere on disk. Nothing has been installed as a result of fetching these
docs.

## Files

| File | Source | Content |
|---|---|---|
| `overview.md` | `docs.nvidia.com/deeplearning/tensorrt-rtx/latest/index.html` | What TensorRT-RTX is, supported GPU/CUDA/OS matrix |
| `release-notes-1.6.md` | `.../getting-started/release-notes-1/1.6.html` | 1.6 features, CUDA 13.4 support, known issues, breaking changes |
| `prerequisites.md` | `.../installing-tensorrt-rtx/prerequisites.html` | CUDA/driver/Python requirements for Windows |
| `installation-windows.md` | `.../installing-tensorrt-rtx/installing.html` | SDK-zip install steps, PATH configuration |

## Key facts extracted (verify against the live pages before acting — see caveat below)

- **TensorRT-RTX 1.6** adds support for **CUDA 13.4** (separate package per CUDA version; also
  still supports CUDA 12.9 Update 1). Docs page itself states "last updated on July 27, 2026" —
  this matches the "July 2026" release the operator referenced; do **not** trust a GitHub
  releases-page fetch that returned "July 28, 2024" for the same release — that date is almost
  certainly a mis-extraction (TensorRT-RTX 1.6/CUDA 13.4 cannot predate CUDA 13.4's own existence)
  and is not used anywhere else in these notes.
- **GPU support**: Turing (compute capability 7.5) through Blackwell (12.x) — **RTX 3060 Ti /
  Ampere sm_86 is in-range**. Note one caveat from the 1.6 release notes: "default settings
  exclude Turing in favor of Ampere and later" for certain engine-build defaults — Ampere is on
  the *included* side of that default, not the excluded side.
- **Runtime cache compatibility is tightened in 1.6**: a cached engine/runtime is validated
  against GPU SKU + TensorRT-RTX version + Compute-in-Graphics (CiG) state, and requires
  driver >= the cache's driver. Engines are **not forward-compatible** across TensorRT-RTX
  runtime versions. This directly supports root CLAUDE.md's rule: never reuse an old
  engine/runtime cache as proof a new CUDA-13.4/TensorRT-RTX-1.6 configuration works — always
  build fresh.
- **Windows**: only the **WDDM** driver is supported; **TCC is unsupported**. `cudaMallocAsync()`
  can fail under CiG mode — the docs recommend a custom allocator using `cudaMalloc()` as a
  workaround if that's hit.
- **Windows install (SDK-zip method)**: download the zip matching your CUDA Toolkit version +
  CPU arch from `developer.nvidia.com/tensorrt-rtx`, extract, then prepend `<root>\lib` and
  `<root>\bin` to `PATH`. Verify with `tensorrt_rtx.exe --help`. The docs do **not** provide a
  CMake `find_package`-style discovery recipe or an explicit `CUDA_PATH` interaction note for
  this SDK-zip path — that would need to be worked out manually against the extracted directory
  layout (headers/lib naming) when the challenger lane is actually built, matching this repo's
  existing pattern in `simd-bridge/cpp/CMakeLists.txt` (env-var-first, then glob-based path
  resolution, per its LibTorch/cuVS/CUTLASS sections).
- **Prerequisites**: CUDA 12.9 Update 1 or CUDA 13.4 (don't mix major CUDA versions in one
  build); driver must meet the CUDA release's minimum; Python 3.10-3.14 recommended for wheels
  if the optional Python bindings are used (3.8-3.9 also supported; Windows-on-ARM is 3.11-3.14
  only — not relevant to this x64 host).

## Caveat on fetch fidelity

These summaries were produced by `WebFetch` (fetches the page, converts to markdown, then a
small fast model extracts/summarizes per-prompt) — treat them as a starting point, not a
verbatim quote of NVIDIA's docs. Before writing any CMake preset or install script against
these notes, re-fetch or manually open the live pages (URLs in the table above) to confirm
exact flag names, paths, and package filenames, especially since one fetch in this same session
(the GitHub releases page) already produced one clearly-wrong date.
