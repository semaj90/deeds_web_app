#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-.}"
OUT="$ROOT/artifacts/phase-110/discovery"
mkdir -p "$OUT"

cd "$ROOT"

# Canonical file inventory. Exclude generated and dependency trees from primary mapping.
rg --files \
  -g '!node_modules/**' \
  -g '!build/**' \
  -g '!dist/**' \
  -g '!.svelte-kit/**' \
  -g '!coverage/**' \
  -g '!artifacts/**' \
  > "$OUT/all-files.txt"

search_group () {
  local name="$1"
  local pattern="$2"
  rg -n -i \
    -g '!node_modules/**' \
    -g '!build/**' \
    -g '!dist/**' \
    -g '!.svelte-kit/**' \
    -g '!coverage/**' \
    "$pattern" . \
    > "$OUT/${name}.txt" || true
}

search_group "tree-parsing" \
  'tree[-_ ]?sitter|treechunker|tree_chunker|ts-morph|typescript.*program|createSourceFile'

search_group "structural-search" \
  'ast-grep|ast_grep|sg scan|RuleConfig|pattern:'

search_group "lexical-search" \
  'ripgrep|\brg\b|BM25|BM42|sparse[_ -]?vector|miniCOIL|SPLADE|uniCOIL'

search_group "dense-search" \
  'embedding|dense[_ -]?vector|cosine|semantic[_ -]?search|Qdrant|searchPoints|queryPoints'

search_group "rerank" \
  'mixedbread|rerank|cross[-_ ]?encoder|mxbai|bge[-_ ]?reranker'

search_group "langextract" \
  'langextract|structured extraction|evidence span|entity extraction'

search_group "clustering" \
  'kmeans|k-means|SOM|self[-_ ]?organizing|centroid|cluster_id|clusterRun'

search_group "graph" \
  'Neo4j|HyperGraphRAG|hypergraph|PageRank|Louvain|community|cuGraph|RAPIDS'

search_group "ann" \
  'HNSW|IVF|IVFQ|IVF-PQ|CAGRA|cuVS|DiskANN'

search_group "provenance" \
  'source_ref|sourceRef|source_ref_url|downloaded_at|release_date|pinned_version|content_hash|workspace_revision'

search_group "ace" \
  'ACE packet|ace_packet|buildAce|context.*packet|packet_key'

search_group "mcp" \
  'MCP|Model Context Protocol|server\.tool|registerTool|tool\('

search_group "tensorrt-napi" \
  'TensorRT|tensorrt|N-API|node-addon-api|\.node\b|napi_|tensorrt_bridge|simd-bridge'

search_group "native-loaders" \
  'require\(.*\.node|process\.dlopen|bindings\(|createRequire|existsSync.*\.node|Release[/\\].*\.node'

search_group "gpu-runtime" \
  'CUDA|onnxruntime-gpu|torch\.cuda|cupy|cuml|cugraph|rapids|device.*cuda'

search_group "schema-validation" \
  'zod|json schema|ajv|safeParse|parseAsync|schema_version|validation_state'

search_group "jsonl" \
  'jsonl|ndjson|readline|createReadStream|write.*JSON\.stringify'

# Find likely specification/harness owners.
rg --files | rg -i \
  '(^|/)(specs?|openspec|\.specify|gsd|scripts|mcp|atlas|retrieval|qdrant|graph|gpu|native|bridge|tree|ast|eval|schema|migration)' \
  > "$OUT/relevant-files.txt" || true

# Native addon existence and ABI evidence.
{
  echo "node=$(command -v node || true)"
  node -p '"node_version=" + process.version' 2>/dev/null || true
  node -p '"modules_abi=" + process.versions.modules' 2>/dev/null || true
  node -p '"napi=" + (process.versions.napi || "unknown")' 2>/dev/null || true
  find . -type f -name '*.node' \
    -not -path './node_modules/*' \
    -not -path './.git/*' 2>/dev/null || true
} > "$OUT/native-addon-evidence.txt"

cat > "$OUT/STATUS.md" <<'EOF'
# Phase 110 Discovery Status

Populate after reviewing generated files.

| Capability | Existing owner | Static evidence | Runtime proof | State |
|---|---|---|---|---|
| tree-sitter/treechunker | | | | UNKNOWN |
| ast-grep | | | | UNKNOWN |
| lexical search | | | | UNKNOWN |
| dense/Qdrant | | | | UNKNOWN |
| reranker | | | | UNKNOWN |
| LangExtract | | | | UNKNOWN |
| Postgres artifact identity | | | | UNKNOWN |
| JSONL datasets | | | | UNKNOWN |
| K-means/SOM | | | | UNKNOWN |
| Neo4j/hypergraph | | | | UNKNOWN |
| TensorRT/N-API bridge | | | | RUNTIME_PROOF_PENDING |
EOF

echo "Discovery written to $OUT"
