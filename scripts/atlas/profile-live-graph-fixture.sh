#!/usr/bin/env bash
set -euo pipefail

# Headless Parent Atlas GPU proof wrapper.
# The .nsys-rep is the canonical execution trace. JSONLines/SQLite and NCU CSV
# are derived inspection artifacts and may change schema across tool versions.

FIXTURE="${1:?usage: profile-live-graph-fixture.sh <fixture.json> [output-dir]}"
OUT_DIR="${2:-.tmp/atlas/live-graph/profile}"
PYTHON_BIN="${PYTHON_BIN:-python}"
NSYS_BIN="${NSYS_BIN:-nsys}"
NCU_BIN="${NCU_BIN:-ncu}"
NCU_SET="${ATLAS_NCU_SET:-full}"
ROOT_RANGE="atlas.graph_fixture"
NVTX_DOMAIN="parent-atlas"

mkdir -p "$OUT_DIR"
FIXTURE="$(realpath "$FIXTURE")"
OUT_DIR="$(realpath "$OUT_DIR")"
NSYS_PREFIX="$OUT_DIR/live-graph"
NCU_PREFIX="$OUT_DIR/live-graph-ncu"
NSYS_RECEIPT="$OUT_DIR/live-graph-fixture-receipt.nsys.json"
NCU_RECEIPT="$OUT_DIR/live-graph-fixture-receipt.ncu.json"

command -v "$NSYS_BIN" >/dev/null || { echo "NSYS_NOT_FOUND:$NSYS_BIN" >&2; exit 20; }
command -v "$NCU_BIN" >/dev/null || { echo "NCU_NOT_FOUND:$NCU_BIN" >&2; exit 21; }
command -v "$PYTHON_BIN" >/dev/null || { echo "PYTHON_NOT_FOUND:$PYTHON_BIN" >&2; exit 22; }

# Nsight Systems captures only the registered Parent Atlas root range.
"$NSYS_BIN" profile \
  --force-overwrite=true \
  --trace=cuda,nvtx,cublas,cublas-verbose \
  --capture-range=nvtx \
  --nvtx-capture="${ROOT_RANGE}@${NVTX_DOMAIN}" \
  --capture-range-end=stop \
  --export=jsonlines \
  --export=sqlite \
  --output="$NSYS_PREFIX" \
  "$PYTHON_BIN" python/prove_live_graph_fixture.py \
    --fixture="$FIXTURE" \
    --output="$NSYS_RECEIPT"

NSYS_REP="${NSYS_PREFIX}.nsys-rep"
[[ -f "$NSYS_REP" ]] || { echo "NSYS_REPORT_MISSING:$NSYS_REP" >&2; exit 23; }

# Nsight Compute reruns the same immutable fixture and profiles only kernels
# inside the same NVTX push/pop range. Its report is secondary evidence used to
# establish precision/Tensor Core activity; it is not the canonical trace.
"$NCU_BIN" \
  --force-overwrite \
  --nvtx \
  --nvtx-include="${NVTX_DOMAIN}@${ROOT_RANGE}/" \
  --set="$NCU_SET" \
  --export="$NCU_PREFIX" \
  "$PYTHON_BIN" python/prove_live_graph_fixture.py \
    --fixture="$FIXTURE" \
    --output="$NCU_RECEIPT"

NCU_REP="${NCU_PREFIX}.ncu-rep"
[[ -f "$NCU_REP" ]] || { echo "NCU_REPORT_MISSING:$NCU_REP" >&2; exit 24; }
"$NCU_BIN" --import "$NCU_REP" --page raw --csv > "$OUT_DIR/live-graph-ncu.csv"

# Older/newer Nsight Systems versions use the requested prefix but may vary the
# exact export suffix. Discover the generated files rather than inventing paths.
JSONLINES="$(find "$OUT_DIR" -maxdepth 1 -type f \( -name 'live-graph*.json' -o -name 'live-graph*.jsonlines' \) ! -name '*receipt*' | head -n 1 || true)"
SQLITE="$(find "$OUT_DIR" -maxdepth 1 -type f -name 'live-graph*.sqlite' | head -n 1 || true)"

BUILD_ARGS=(
  --fixture-receipt "$NSYS_RECEIPT"
  --nsys-rep "$NSYS_REP"
  --ncu-rep "$NCU_REP"
  --ncu-csv "$OUT_DIR/live-graph-ncu.csv"
  --output "$OUT_DIR/gpu-execution-evidence-receipt.json"
)
[[ -n "$JSONLINES" ]] && BUILD_ARGS+=(--nsys-jsonlines "$JSONLINES")
[[ -n "$SQLITE" ]] && BUILD_ARGS+=(--nsys-sqlite "$SQLITE")

"$PYTHON_BIN" python/build_gpu_trace_evidence_receipt.py "${BUILD_ARGS[@]}"

echo "GPU proof artifacts: $OUT_DIR"
