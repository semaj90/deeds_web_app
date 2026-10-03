---
name: parent-atlas-workstation
description: Use when a Parent Atlas task involves file analysis, lexical/AST/symbol search, noun/keyword ranking, domain classification, retrieval fusion, packet/ACE validation, graph analysis, or GPU challengers — routes each step to its existing owner from docs/architecture/runtime-ownership-registry.json so nothing gets rebuilt as a second owner. Load before writing new analysis code.
---

# Parent Atlas workstation router

Router only. Every row is an existing owner; do not add a peer. Source of truth:
`docs/architecture/runtime-ownership-registry.json` (re-read it, this table can go stale).
Rule: identity owns identity, representation owns representation, transport and cache never invent identity.

## Owners (registry-verified 2026-09-27)

| Need | Owner | Status |
|---|---|---|
| Exact lexical / `rg` evidence | `retrieval/router-matrix.ts`; skill `rg-atlas` | CANONICAL_OWNER |
| AST structural extraction | `analysis/worker.ts` -> `ast-grep-extractor.ts` -> `code_features` | CANONICAL_OWNER |
| ast-grep symbol scripts | `scripts/atlas/lib/ast-grep-symbol-extraction.mjs`, `atlas-ast-nodes-writer.mjs`, `ast-source-ref-key.mjs` | script side |
| Tree-sitter / CST chunking | referenced in registry + AST receipts; source not located | UNVERIFIED |
| Symbol identity | 4 incompatible key schemes live | **UNKNOWN - read `openspec/changes/parent-atlas-ontology-kernel/tasks.md` (SYMBOL-SEMANTIC-BRIDGE-01) first; pick none** |
| `semantic_768` producer | not confirmed | **UNKNOWN** - read `parent-atlas-semantic-768-canonical-contract` |
| Noun / keyword ranking | `retrieval/noun-reranker.ts`, `scripts/atlas/extract-lexical-features.mjs`, `analysis/keyword-matrix-analysis.ts` | not in registry |
| NLP evidence (:8095) | `python/miniforge_nlp_sidecar*.py` | evidence executor, never identity |
| Domain classification | `atlas/domain-taxonomy.ts`; TRACE `domain.classify` (provisional) | CANONICAL_OWNER |
| Rerank | `retrieval/canonical-rerank-executor.ts` | CANONICAL_OWNER |
| Fusion (RRF) | `retrieval/search-runtime.ts` | CANONICAL_OWNER |
| Graph algorithms | `graph/graph-analysis-runner.ts` | CANONICAL_OWNER |
| ACE assembly / validation | `ace/context-assembler.ts`, `atlas/envelope-validator.ts`, `db/packet-topology-envelope.ts` | CANONICAL_OWNER |
| RPC packets | `routes/api/hyperrag/packet-rpc/+server.ts` | CANONICAL_OWNER |
| Glyph / cartridge (NES, CHR97) | `routes/api/cartridge/export/+server.ts` | CANONICAL_OWNER |
| Neural prefill | `ai/neural-decoder-prefill-caller-v1.ts` | CANONICAL_OWNER |
| Low-rank / Tang sampling | `python/atlas_compute/low_rank.py`, `sample-query-matrix-v1.ts` | EXPERIMENT (non-canonical) |
| cuTile / TensorRT challengers | registry: `OPTIONAL_CHALLENGER_*` | not production |
| N-ary relationship synthesis | none in registry | **UNOWNED** |
| Ghidra, QUIC, Titans/OaK, LSP feature matrix | no owner searched or found | **UNOWNED / unverified** |

## Steps

1. Grep the registry and `packages/parent-atlas/src/core/` + `packages/atlas-core/src/` first.
2. Use the owner above; wire to it, do not reimplement.
3. Codebase-graph questions: MCP `atlas-tools` (`find_dependencies`, `find_feature`, `find_route`, `find_source_refs`) before multi-file grep.
4. If a row is UNKNOWN/UNOWNED, stop and record the ambiguity in an OpenSpec `tasks.md`; do not implement past it.

## Never

- feature_id-only joins; Postgres `atlas_packets`/`packet_key` is identity, everything else is a mirror.
- Bulk vectors through JSON/MessagePack (Arrow/mmap/tensors instead).
- A new symbol-identity scheme, a second reranker, or a second PageRank owner.
