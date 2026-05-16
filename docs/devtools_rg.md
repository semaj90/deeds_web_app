# Codex: `rg` Search Mastery for Deeds Web App

This guide provides specialized search patterns and flags to maintain **Search Integrity** across the Deeds Legal-AI repository. Use these to audit drifts, track model paths, and navigate the multi-layer architecture without being blinded by `.gitignore` or binary noise.

## Core Rule: Search Integrity
Always use `-u` (unrestricted) for audits. Ripgrep respects `.gitignore` by default, which can mask legacy code or diagnostic logs that shouldn't be there.

```bash
# The "Safe Audit" baseline
rg -u "target"

# The "Deep Audit" (includes hidden files)
rg -uu "target"

# The "Total Audit" (includes binaries - use with caution)
rg -uuu "target"
```

## Layer-Specific Search Patterns

### 1. Model & Infrastructure Audits
Track where models are being loaded or where hardcoded paths might still lurk.

```bash
# Model Path Tracking
rg -u "TURBO_|ROTOR|gguf|mmproj|Desktop|Downloads" \
  package.json \
  sveltekit-frontend/package.json \
  scripts/ \
  sveltekit-frontend/scripts/

# CUDA & VRAM Management
rg -u "cuda|CUDA|RTX|TensorRT|VRAM|GPU-cache|gpu_cache" .

# Redis/BitFrost Lane
rg -u "bitfrost|BitFrost|redis|ioredis|ace:|cache hit|cache miss" .
```

### 2. Drizzle & Schema Reconciliation
Use these to find shadow tables or type mismatches (e.g., UUID vs Integer).

```bash
# Find all table definitions
rg -u "pgTable\(" sveltekit-frontend/src/lib/server/db/schema/

# Find potential ID type mismatches
rg -u "id: .*\.(?:uuid|integer|serial)" sveltekit-frontend/src/lib/server/db/schema/

# Check for manual SQL migrations (Sidecars)
rg -u "CREATE INDEX.*USING hnsw" drizzle/
```

### 3. VLM Lifecycle & Mode Switching
Monitor how the system handles Text vs Vision transitions.

```bash
# VLM Mode Logic
rg -u "VlmMode|switchVlmMode|VISION|TEXT" sveltekit-frontend/src/lib/server/inference/

# VRAM Swap Log Points
rg -u "vram-swap|vlm-lifecycle" sveltekit-frontend/src/lib/server/inference/
```

### 4. CodeIntel & Hypergraph
Audit the retrieval logic and SOM/Topology mappings.

```bash
# Topology & Manifold Coordinates
rg -u "topoByte|topoClass|som_x|som_y" .

# ACE Packet Injection
rg -u "ace:packet|ACE_CONTEXT" .
```

## Advanced Filtering

### Filter by File Type
The Deeds repo is a mix of TS, Svelte, Go, Rust, and Python.

```bash
# Search only Svelte 5 logic
rg -u "\$state|\$derived|onclick" -g "*.svelte"

# Search only Drizzle/DB logic
rg -u "db\." -g "src/lib/server/db/**"

# Exclude large binary reports
rg -u "pattern" --iglob "!docs/reports/rg_*.txt"
```

## Audit Diagnostics Command
Run this to generate a full system health report (redirect to `docs/reports/`):

```powershell
# Run from repository root
rg -n -u "turbovec|TurboVec|ann|hnsw|vector search" . > docs/reports/rg_turbovec.txt; `
rg -n -u "napi-rs|napi|\\.node|tensorrt_bridge|rust" . > docs/reports/rg_napi.txt; `
rg -n -u "cuda|CUDA|RTX|VRAM|GPU-cache" . > docs/reports/rg_cuda.txt; `
rg -n -u "redis|ioredis|ace:|cache hit" . > docs/reports/rg_redis.txt; `
rg -n -u "vlm|VLM|mmproj|vision model" . > docs/reports/rg_vlm.txt;
```

---
**Note:** If you find a hardcoded path like `C:\Users\james`, report it immediately and move it to `.env`.
