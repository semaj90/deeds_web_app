# Parent Atlas Architecture TOC (V2)

> V2 adds explicit temporal snapshot receipts to the V1 navigation projection.
> Generated from the document-governance registry and Parent Atlas workstation helper; this index is not canonical architecture or ownership authority.

## Authority and routing sources

- [Parent Atlas workstation helper](../../.claude/skills/parent-atlas-workstation/SKILL.md) — task routing and owner pointers.
- [Runtime ownership registry](./runtime-ownership-registry.json) — re-check this registry before implementation; helper summaries can become stale.
- [Master TOC](../MASTER-TOC.md) — repository-wide document navigation.

## Workstation helper owner map

> Snapshot extracted from the helper for navigation. The registry and implementation contracts remain authoritative.
| Need | Owner | Status |
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

## Temporal snapshot history

- Contract owner: [TemporalDocumentIndexV1](../../packages/parent-atlas/src/core/temporal-indexing-fabric.ts); each receipt is content-addressed and noncanonical.
- The first receipt is a baseline only. A delta is reported only when a previous snapshot path is supplied explicitly; no fuzzy path or “latest” selection is used.
- [architecture-temporal-index-v1-e017e58921317ef1606dfacab180d5fce1ae4b96d58ed335bdc0116036837171.json](../reports/architecture-temporal-snapshots/architecture-temporal-index-v1-e017e58921317ef1606dfacab180d5fce1ae4b96d58ed335bdc0116036837171.json) — VALID; 83 source artifacts; 0 explicit deltas; previous=INITIAL_BASELINE_NO_PRIOR; index checksum `e017e58921317ef1606dfacab180d5fce1ae4b96d58ed335bdc0116036837171`.

## Architecture documents

### Markdown

- [ACP-GEMMA4-MEMORY-HIERARCHY](./ACP-GEMMA4-MEMORY-HIERARCHY.md)
- [ACP-TELEMETRY-DAILY-GRAPHIFY-FLOW](./ACP-TELEMETRY-DAILY-GRAPHIFY-FLOW.md)
- [AGENTIC-ERROR-FIXING-ARCHITECTURE](./AGENTIC-ERROR-FIXING-ARCHITECTURE.md)
- [AGENTIC-ERROR-FIXING-DIMENSIONAL-MODEL](./AGENTIC-ERROR-FIXING-DIMENSIONAL-MODEL.md)
- [agentic-error-proposal-flow](./agentic-error-proposal-flow.md)
- [atlas-topic-identity-read-model-v1](./atlas-topic-identity-read-model-v1.md)
- [atlas-work-items-design-v1](./atlas-work-items-design-v1.md)
- [README](./autoencoder/README.md)
- [bounded-tool-gateway-implementation](./bounded-tool-gateway-implementation.md)
- [CANONICAL-PACKET-WIRING-BLUEPRINT](./CANONICAL-PACKET-WIRING-BLUEPRINT.md)
- [canonical-tool-catalog](./canonical-tool-catalog.md)
- [cold-warm-hot-packet-lifecycle](./cold-warm-hot-packet-lifecycle.md)
- [compressed-semantic-geometry](./compressed-semantic-geometry.md)
- [consolidation-and-schema-alignment](./consolidation-and-schema-alignment.md)
- [consolidation-and-schema-migration-checklist](./consolidation-and-schema-migration-checklist.md)
- [CORRECTED-embedding-dimension-policy](./CORRECTED-embedding-dimension-policy.md)
- [couchdb-mapreduce-atlas-ingestion](./couchdb-mapreduce-atlas-ingestion.md)
- [CUVS-DOCKER-IMPLEMENTATION-CHECKLIST](./CUVS-DOCKER-IMPLEMENTATION-CHECKLIST.md)
- [CUVS-INSTALLATION-WINDOWS-RESEARCH](./CUVS-INSTALLATION-WINDOWS-RESEARCH.md)
- [CUVS-QUICK-REFERENCE](./CUVS-QUICK-REFERENCE.md)
- [CUVS-RESEARCH-SUMMARY](./CUVS-RESEARCH-SUMMARY.md)
- [DAG-ACP-OPEN-MEMORY-WIRING](./DAG-ACP-OPEN-MEMORY-WIRING.md)
- [deepseek-engram-architecture-search](./deepseek-engram-architecture-search.md)
- [dual-lane-hot-brain-cold-queue](./dual-lane-hot-brain-cold-queue.md)
- [engram-plugin-memory-support](./engram-plugin-memory-support.md)
- [feature-consolidation-review-queue](./feature-consolidation-review-queue.md)
- [gemma4-bounded-tool-system-prompt](./gemma4-bounded-tool-system-prompt.md)
- [gemma4-retrieval-loop-hook](./gemma4-retrieval-loop-hook.md)
- [GPU-CUDA-NAPI-MEMORY-LAYOUT](./GPU-CUDA-NAPI-MEMORY-LAYOUT.md)
- [grpc-binary-memory-registry-master-todo](./grpc-binary-memory-registry-master-todo.md)
- [grpc-binary-memory-registry-plan](./grpc-binary-memory-registry-plan.md)
- [kanban-parent-atlas-alignment](./kanban-parent-atlas-alignment.md)
- [langextract-atlas-integrations](./langextract-atlas-integrations.md)
- [legal-ai-parent-atlas-product-integration](./legal-ai-parent-atlas-product-integration.md)
- [llm-synthesis-memory-policy](./llm-synthesis-memory-policy.md)
- [local-deep-research-boundary](./local-deep-research-boundary.md)
- [MCP-TOOL-AUDIT-AND-ACE-PACKET-FLOW](./MCP-TOOL-AUDIT-AND-ACE-PACKET-FLOW.md)
- [neo4j-graphrag-parent-atlas](./neo4j-graphrag-parent-atlas.md)
- [NES-CHROM97-GLYPH-BITENCODING-ALIGNED](./NES-CHROM97-GLYPH-BITENCODING-ALIGNED.md)
- [oaklib-external-ontology-adapter-v1](./oaklib-external-ontology-adapter-v1.md)
- [offline-synthesis-parent-atlas](./offline-synthesis-parent-atlas.md)
- [okf-v02-validation-profile-v1](./okf-v02-validation-profile-v1.md)
- [opencode-claude-mem-bridge](./opencode-claude-mem-bridge.md)
- [PACKET-COMPILER-STAGES](./PACKET-COMPILER-STAGES.md)
- [packet-truth-flow-canonical-pattern](./packet-truth-flow-canonical-pattern.md)
- [PARENT_ATLAS_INSTRUCTION_AUTHORITY](./PARENT_ATLAS_INSTRUCTION_AUTHORITY.md)
- [PARENT_ATLAS_PACKAGE_BOUNDARIES](./PARENT_ATLAS_PACKAGE_BOUNDARIES.md)
- [PARENT_ATLAS_RECOMMENDATION_AND_RETRIEVAL_POLICY](./PARENT_ATLAS_RECOMMENDATION_AND_RETRIEVAL_POLICY.md)
- [parent-atlas-karpathy-pipeline](./parent-atlas-karpathy-pipeline.md)
- [parent-atlas-policy-routing](./parent-atlas-policy-routing.md)
- [parent-atlas-representation-structural-contract](./parent-atlas-representation-structural-contract.md)
- [PARENT-ATLAS-STUDIO-AWARENESS-TOURNAMENT](./PARENT-ATLAS-STUDIO-AWARENESS-TOURNAMENT.md)
- [pathway-cards-spec](./pathway-cards-spec.md)
- [phase-101-completion-plan](./phase-101-completion-plan.md)
- [phase-17g-gpu-json-tensor-mapping](./phase-17g-gpu-json-tensor-mapping.md)
- [phase-3-gpu-graph-adaptive-architecture](./phase-3-gpu-graph-adaptive-architecture.md)
- [phase-3d-telemetry-instrumentation](./phase-3d-telemetry-instrumentation.md)
- [PHASE-85-ARTIFACT-REGISTRY-SPEC](./PHASE-85-ARTIFACT-REGISTRY-SPEC.md)
- [PHASE-C-OPTION-B-ARCHITECTURE-DECISION](./PHASE-C-OPTION-B-ARCHITECTURE-DECISION.md)
- [phase8-query-optimization-taxonomy](./phase8-query-optimization-taxonomy.md)
- [qdrant-search-contract](./qdrant-search-contract.md)
- [rabbitmq-workflow-fabric](./rabbitmq-workflow-fabric.md)
- [residency-scheduler-boundary-v1](./residency-scheduler-boundary-v1.md)
- [retrieval-architecture](./retrieval-architecture.md)
- [retrieval-boundary-and-langgraph](./retrieval-boundary-and-langgraph.md)
- [retrieval-layer-separation](./retrieval-layer-separation.md)
- [rtx-visual-enhancement-boundary-v1](./rtx-visual-enhancement-boundary-v1.md)
- [runtime-owner-deduplication](./runtime-owner-deduplication.md)
- [RUST-BACKEND-DECISION-TREE](./RUST-BACKEND-DECISION-TREE.md)
- [scheduler-gpu-bridge-roadmap](./scheduler-gpu-bridge-roadmap.md)
- [SESSION-84-MISSING-LAYERS-ANALYSIS](./SESSION-84-MISSING-LAYERS-ANALYSIS.md)
- [storage-tier-schema](./storage-tier-schema.md)
- [subgraph-instruction-programming-kag-ace-topology](./subgraph-instruction-programming-kag-ace-topology.md)
- [trace-kag-web-development-guide](./trace-kag-web-development-guide.md)
- [trace-runtime-split](./trace-runtime-split.md)
- [TRANSPORT-WORKER-CHROM97-ALIGNMENT](./TRANSPORT-WORKER-CHROM97-ALIGNMENT.md)
- [unified-ace-engram-pipeline](./unified-ace-engram-pipeline.md)
- [UNIFIED-ID-HIERARCHY-AND-RETRIEVAL](./UNIFIED-ID-HIERARCHY-AND-RETRIEVAL.md)
- [UNIFIED-RETRIEVAL-HMM-POLICY-ARCHITECTURE](./UNIFIED-RETRIEVAL-HMM-POLICY-ARCHITECTURE.md)
- [vram-hygiene-policy](./vram-hygiene-policy.md)

### JSON registries and baselines

- [runtime-ownership-baseline](./runtime-ownership-baseline.json)
- [runtime-ownership-registry](./runtime-ownership-registry.json)
