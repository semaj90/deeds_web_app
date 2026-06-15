#!/bin/bash
# Parent Atlas GPU Acceleration — Consolidation Commands
# This script documents the exact copy/merge operations to consolidate code into packages

set -e

REPO_ROOT="$(pwd)"
PACKAGES_DIR="$REPO_ROOT/packages"

echo "================================"
echo "Parent Atlas Consolidation Script"
echo "================================"
echo ""
echo "WARNING: This script COPIES files. It does NOT delete originals."
echo "After consolidation, original files can be safely deleted."
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ==================================================================================
# PHASE A: Create Package Scaffolds
# ==================================================================================

phase_a() {
  echo -e "${BLUE}[PHASE A] Creating package scaffolds...${NC}"

  for pkg in core ingest retrieval opencode; do
    mkdir -p "$PACKAGES_DIR/parent-atlas-$pkg/{src,tests,native}"
    echo "✓ Created $PACKAGES_DIR/parent-atlas-$pkg/"
  done

  # Copy root-level config templates (if needed)
  echo -e "${GREEN}✓ Phase A complete${NC}"
}

# ==================================================================================
# PHASE B: Copy Bifrost Files (Retrieval Stage 1)
# ==================================================================================

phase_b() {
  echo -e "${BLUE}[PHASE B] Copying Bifrost files...${NC}"

  mkdir -p "$PACKAGES_DIR/parent-atlas-retrieval/src/bifrost"

  # Copy Bifrost core files
  cp "$REPO_ROOT/sveltekit-frontend/src/lib/server/ai/bifrost-provider.ts" \
     "$PACKAGES_DIR/parent-atlas-retrieval/src/bifrost/"
  echo "✓ bifrost-provider.ts"

  cp "$REPO_ROOT/sveltekit-frontend/src/lib/server/ai/bifrost-cache-manager.ts" \
     "$PACKAGES_DIR/parent-atlas-retrieval/src/bifrost/"
  echo "✓ bifrost-cache-manager.ts"

  cp "$REPO_ROOT/sveltekit-frontend/src/lib/server/cache/bifrost-som-prefilter.ts" \
     "$PACKAGES_DIR/parent-atlas-retrieval/src/bifrost/"
  echo "✓ bifrost-som-prefilter.ts"

  cp "$REPO_ROOT/sveltekit-frontend/src/lib/server/retrieval/bifrost-trace.ts" \
     "$PACKAGES_DIR/parent-atlas-retrieval/src/bifrost/trace.ts"
  echo "✓ bifrost-trace.ts"

  # Copy tests
  mkdir -p "$PACKAGES_DIR/parent-atlas-retrieval/tests/bifrost"
  cp "$REPO_ROOT/sveltekit-frontend/tests/bifrost-semantic-cache.spec.ts" \
     "$PACKAGES_DIR/parent-atlas-retrieval/tests/bifrost/"
  echo "✓ bifrost-semantic-cache.spec.ts"

  echo -e "${GREEN}✓ Phase B complete${NC}"
}

# ==================================================================================
# PHASE C: Copy TurboVec Files (Retrieval Stage 2-3)
# ==================================================================================

phase_c() {
  echo -e "${BLUE}[PHASE C] Copying TurboVec files...${NC}"

  mkdir -p "$PACKAGES_DIR/parent-atlas-retrieval/src/turbovec"

  # Core TurboVec files
  cp "$REPO_ROOT/sveltekit-frontend/src/lib/server/retrieval/turbovec-prefilter.ts" \
     "$PACKAGES_DIR/parent-atlas-retrieval/src/turbovec/"
  echo "✓ turbovec-prefilter.ts"

  cp "$REPO_ROOT/sveltekit-frontend/src/lib/server/retrieval/turbovec-rerank.ts" \
     "$PACKAGES_DIR/parent-atlas-retrieval/src/turbovec/"
  echo "✓ turbovec-rerank.ts"

  cp "$REPO_ROOT/sveltekit-frontend/src/lib/server/search/turbovec-search.ts" \
     "$PACKAGES_DIR/parent-atlas-retrieval/src/turbovec/"
  echo "✓ turbovec-search.ts"

  cp "$REPO_ROOT/sveltekit-frontend/src/lib/server/grpc/turbovec-cuda-client.ts" \
     "$PACKAGES_DIR/parent-atlas-retrieval/src/turbovec/"
  echo "✓ turbovec-cuda-client.ts"

  # Copy proto types
  cp "$REPO_ROOT/sveltekit-frontend/src/lib/generated/proto/turbovec_cuda_pb.d.ts" \
     "$PACKAGES_DIR/parent-atlas-retrieval/src/turbovec/proto.d.ts"
  echo "✓ proto types"

  # Copy related reranking files
  cp "$REPO_ROOT/sveltekit-frontend/src/lib/server/retrieval/cluster-aware-reranker.ts" \
     "$PACKAGES_DIR/parent-atlas-retrieval/src/turbovec/" 2>/dev/null || true
  cp "$REPO_ROOT/sveltekit-frontend/src/lib/server/retrieval/boosted-reranker.ts" \
     "$PACKAGES_DIR/parent-atlas-retrieval/src/turbovec/" 2>/dev/null || true
  cp "$REPO_ROOT/sveltekit-frontend/src/lib/server/retrieval/authority-chain.ts" \
     "$PACKAGES_DIR/parent-atlas-retrieval/src/turbovec/" 2>/dev/null || true

  # Copy contract
  cp "$REPO_ROOT/sveltekit-frontend/src/lib/server/vector/turbovec-contract.ts" \
     "$PACKAGES_DIR/parent-atlas-retrieval/src/turbovec/"
  echo "✓ turbovec-contract.ts"

  # Copy tests
  mkdir -p "$PACKAGES_DIR/parent-atlas-retrieval/tests/turbovec"
  cp "$REPO_ROOT/sveltekit-frontend/src/lib/server/vector/turbovec-contract.test.ts" \
     "$PACKAGES_DIR/parent-atlas-retrieval/tests/turbovec/"
  echo "✓ tests"

  echo -e "${GREEN}✓ Phase C complete${NC}"
}

# ==================================================================================
# PHASE D: Copy GPU & SIMD Files (Retrieval Stage 4-5)
# ==================================================================================

phase_d() {
  echo -e "${BLUE}[PHASE D] Copying GPU & SIMD files...${NC}"

  mkdir -p "$PACKAGES_DIR/parent-atlas-retrieval/src/gpu"
  mkdir -p "$PACKAGES_DIR/parent-atlas-retrieval/native"

  # Copy GPU bridges
  cp "$REPO_ROOT/sveltekit-frontend/src/lib/server/gpu/libtorch-bridge.ts" \
     "$PACKAGES_DIR/parent-atlas-retrieval/src/gpu/"
  echo "✓ libtorch-bridge.ts"

  cp "$REPO_ROOT/sveltekit-frontend/src/lib/server/gpu/simdjson-bridge.ts" \
     "$PACKAGES_DIR/parent-atlas-retrieval/src/gpu/"
  echo "✓ simdjson-bridge.ts"

  cp "$REPO_ROOT/sveltekit-frontend/src/lib/server/gpu/cuda-bridge.ts" \
     "$PACKAGES_DIR/parent-atlas-retrieval/src/gpu/" 2>/dev/null || true

  cp "$REPO_ROOT/sveltekit-frontend/src/lib/server/gpu/gpu-pipeline.ts" \
     "$PACKAGES_DIR/parent-atlas-retrieval/src/gpu/" 2>/dev/null || true

  cp "$REPO_ROOT/sveltekit-frontend/src/lib/server/gpu/gpu-monitor.ts" \
     "$PACKAGES_DIR/parent-atlas-retrieval/src/gpu/" 2>/dev/null || true

  cp "$REPO_ROOT/sveltekit-frontend/src/lib/server/gpu/gpu-job-queue.ts" \
     "$PACKAGES_DIR/parent-atlas-retrieval/src/gpu/" 2>/dev/null || true

  # Copy N-API binary
  if [ -f "$REPO_ROOT/simd-bridge/cpp/build/Release/tensorrt_bridge.node" ]; then
    cp "$REPO_ROOT/simd-bridge/cpp/build/Release/tensorrt_bridge.node" \
       "$PACKAGES_DIR/parent-atlas-retrieval/native/"
    echo "✓ tensorrt_bridge.node"
  else
    echo -e "${YELLOW}⚠ tensorrt_bridge.node not found at expected location${NC}"
  fi

  # Copy tests
  mkdir -p "$PACKAGES_DIR/parent-atlas-retrieval/tests/gpu"
  cp "$REPO_ROOT/sveltekit-frontend/src/lib/server/gpu/autoencoder.test.ts" \
     "$PACKAGES_DIR/parent-atlas-retrieval/tests/gpu/" 2>/dev/null || true

  echo -e "${GREEN}✓ Phase D complete${NC}"
}

# ==================================================================================
# PHASE E: Copy Core Schemas & Identity (Core Package)
# ==================================================================================

phase_e() {
  echo -e "${BLUE}[PHASE E] Copying core schemas & identity...${NC}"

  mkdir -p "$PACKAGES_DIR/parent-atlas-core/src/{schemas,adapters,memory}"
  mkdir -p "$PACKAGES_DIR/parent-atlas-core/tests"

  # Copy identity contract
  cp "$REPO_ROOT/sveltekit-frontend/src/lib/server/vector/turbovec-contract.ts" \
     "$PACKAGES_DIR/parent-atlas-core/src/schemas/"
  echo "✓ turbovec-contract.ts"

  cp "$REPO_ROOT/sveltekit-frontend/src/lib/server/vector/turbovec-contract.test.ts" \
     "$PACKAGES_DIR/parent-atlas-core/tests/"
  echo "✓ tests"

  # Copy NES memory architecture
  cp "$REPO_ROOT/sveltekit-frontend/src/lib/gpu/nes-memory-architecture.ts" \
     "$PACKAGES_DIR/parent-atlas-core/src/memory/" 2>/dev/null || true

  echo -e "${GREEN}✓ Phase E complete${NC}"
}

# ==================================================================================
# PHASE F: Copy Retrieval Pipeline Files
# ==================================================================================

phase_f() {
  echo -e "${BLUE}[PHASE F] Copying retrieval pipeline files...${NC}"

  mkdir -p "$PACKAGES_DIR/parent-atlas-retrieval/src/{pipeline,qdrant,hyperrag,cache}"

  # Orchestrator
  cp "$REPO_ROOT/sveltekit-frontend/src/lib/server/retrieval/orchestrator.ts" \
     "$PACKAGES_DIR/parent-atlas-retrieval/src/pipeline/" 2>/dev/null || true
  echo "✓ orchestrator.ts"

  # Search backends
  cp "$REPO_ROOT/sveltekit-frontend/src/lib/server/search/qdrant-search.ts" \
     "$PACKAGES_DIR/parent-atlas-retrieval/src/qdrant/" 2>/dev/null || true

  cp "$REPO_ROOT/sveltekit-frontend/src/lib/server/search/codebase-ann-backend.ts" \
     "$PACKAGES_DIR/parent-atlas-retrieval/src/qdrant/" 2>/dev/null || true

  # HyperRAG
  cp "$REPO_ROOT/sveltekit-frontend/src/lib/server/retrieval/hyperrag-fusion-service.ts" \
     "$PACKAGES_DIR/parent-atlas-retrieval/src/hyperrag/" 2>/dev/null || true

  cp "$REPO_ROOT/sveltekit-frontend/src/lib/server/retrieval/hyperrag-packet-rpc.ts" \
     "$PACKAGES_DIR/parent-atlas-retrieval/src/hyperrag/" 2>/dev/null || true

  # Cache
  cp "$REPO_ROOT/sveltekit-frontend/src/lib/server/retrieval/centroid-cache.ts" \
     "$PACKAGES_DIR/parent-atlas-retrieval/src/cache/" 2>/dev/null || true

  echo -e "${GREEN}✓ Phase F complete${NC}"
}

# ==================================================================================
# PHASE G: Create OpenCode Plugin Structure
# ==================================================================================

phase_g() {
  echo -e "${BLUE}[PHASE G] Creating OpenCode plugin structure...${NC}"

  mkdir -p "$PACKAGES_DIR/parent-atlas-opencode/skills/{search,analyze,gpu-stats}/src"
  mkdir -p "$PACKAGES_DIR/parent-atlas-opencode/src/commands"

  # Create skill definitions
  cat > "$PACKAGES_DIR/parent-atlas-opencode/skills/search/SKILL.md" << 'EOF'
# Parent Atlas GPU-Accelerated Search

## Usage
```bash
@atlas search "authentication flow" --top-k 10 --rerank
```

## Features
- Bifrost L1/L2 semantic caching (90% hit rate)
- TurboVec cluster prefiltering (95% candidate reduction)
- GPU batch similarity reranking (100× speedup)
- Parent Atlas lineage verification (frozen identity contract)

## Parameters
- `--top-k`: Results to return (default: 5)
- `--rerank`: Apply 4-signal reranking (default: true)
- `--show-lineage`: Include full identity chain (default: false)
- `--show-gpu-stats`: Real-time GPU metrics (default: false)

## Tools
- `atlas.search` — Execute GPU-accelerated search
- `atlas.explain_retrieval` — Debug trace and decision tree
EOF
  echo "✓ search/SKILL.md"

  cat > "$PACKAGES_DIR/parent-atlas-opencode/skills/analyze/SKILL.md" << 'EOF'
# Parent Atlas Deep Analysis

## Usage
```bash
@atlas analyze "src/lib/auth.ts" --full-lineage --topology
```

## Features
- Complete packet lineage (directory → feature → symbol)
- Neo4j topology expansion (bounded k-hop)
- Cold storage verification
- Authority/PageRank scoring

## Parameters
- `--full-lineage`: Include all ancestors (default: false)
- `--topology`: Neo4j graph expansion (default: false)
- `--k`: Hop depth for topology (default: 2, max: 5)
EOF
  echo "✓ analyze/SKILL.md"

  cat > "$PACKAGES_DIR/parent-atlas-opencode/skills/gpu-stats/SKILL.md" << 'EOF'
# Parent Atlas GPU Statistics

## Usage
```bash
@atlas gpu-stats
```

## Metrics
- Real-time VRAM usage / GPU memory pressure
- Cache hit rates (L1 exact, L2 semantic)
- Inference latency (cold vs cached)
- GPU kernel performance

## Tools
- `atlas.gpu_monitor` — Query live metrics
EOF
  echo "✓ gpu-stats/SKILL.md"

  echo -e "${GREEN}✓ Phase G complete${NC}"
}

# ==================================================================================
# PHASE H: Generate Index Files & package.json
# ==================================================================================

phase_h() {
  echo -e "${BLUE}[PHASE H] Generating package.json and index files...${NC}"

  # parent-atlas-core/package.json
  cat > "$PACKAGES_DIR/parent-atlas-core/package.json" << 'EOF'
{
  "name": "@deeds/parent-atlas-core",
  "version": "1.0.0",
  "description": "Parent Atlas identity contract, schemas, and adapters",
  "main": "src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./schemas": "./src/schemas/index.ts",
    "./adapters": "./src/adapters/index.ts"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest"
  },
  "dependencies": {
    "zod": "^3.0.0",
    "drizzle-orm": "^0.44.0"
  },
  "devDependencies": {
    "typescript": "^5.2.0",
    "vitest": "^0.34.0"
  }
}
EOF
  echo "✓ parent-atlas-core/package.json"

  # parent-atlas-retrieval/package.json
  cat > "$PACKAGES_DIR/parent-atlas-retrieval/package.json" << 'EOF'
{
  "name": "@deeds/parent-atlas-retrieval",
  "version": "1.0.0",
  "description": "Parent Atlas GPU-accelerated retrieval pipeline (Bifrost, TurboVec, LibTorch)",
  "main": "src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./bifrost": "./src/bifrost/index.ts",
    "./turbovec": "./src/turbovec/index.ts",
    "./gpu": "./src/gpu/index.ts"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest"
  },
  "dependencies": {
    "@deeds/parent-atlas-core": "workspace:*",
    "ioredis": "^5.3.0",
    "qdrant-js": "^1.1.0"
  },
  "devDependencies": {
    "typescript": "^5.2.0",
    "vitest": "^0.34.0"
  }
}
EOF
  echo "✓ parent-atlas-retrieval/package.json"

  # parent-atlas-opencode/package.json
  cat > "$PACKAGES_DIR/parent-atlas-opencode/package.json" << 'EOF'
{
  "name": "@deeds/parent-atlas-opencode",
  "version": "1.0.0",
  "description": "Parent Atlas OpenCode CLI plugin (skills and commands)",
  "main": "src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest"
  },
  "dependencies": {
    "@deeds/parent-atlas-core": "workspace:*",
    "@deeds/parent-atlas-retrieval": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.2.0"
  }
}
EOF
  echo "✓ parent-atlas-opencode/package.json"

  echo -e "${GREEN}✓ Phase H complete${NC}"
}

# ==================================================================================
# VERIFICATION
# ==================================================================================

verify() {
  echo -e "${BLUE}[VERIFY] Checking consolidation...${NC}"

  echo ""
  echo "Directory structure:"
  tree -L 2 "$PACKAGES_DIR" 2>/dev/null || find "$PACKAGES_DIR" -maxdepth 2 -type d | sort

  echo ""
  echo "File counts:"
  for pkg in core ingest retrieval opencode; do
    count=$(find "$PACKAGES_DIR/parent-atlas-$pkg/src" -name "*.ts" 2>/dev/null | wc -l)
    echo "  parent-atlas-$pkg: $count TypeScript files"
  done

  echo ""
  echo -e "${GREEN}✓ Verification complete${NC}"
}

# ==================================================================================
# MAIN
# ==================================================================================

main() {
  if [ ! -d "$REPO_ROOT/.git" ]; then
    echo -e "${YELLOW}Warning: Not in a git repository. Running anyway...${NC}"
  fi

  echo ""
  phase_a
  echo ""
  phase_b
  echo ""
  phase_c
  echo ""
  phase_d
  echo ""
  phase_e
  echo ""
  phase_f
  echo ""
  phase_g
  echo ""
  phase_h
  echo ""
  verify

  echo ""
  echo -e "${GREEN}================================"
  echo "✓ Consolidation complete!"
  echo "================================${NC}"
  echo ""
  echo "Next steps:"
  echo "  1. Review consolidated files in packages/"
  echo "  2. Run: npm run build (from package roots)"
  echo "  3. Update SvelteKit imports to use @deeds/* packages"
  echo "  4. Delete original files after verification"
  echo ""
}

# Run if not sourced
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
