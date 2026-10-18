# Parent Atlas Master TOC

> Generated projection from `docs/reports/document-governance-registry-v1.json`.
> This file is navigation, not canonical architecture or supersession authority.

Registry checksum: `5b6183ab1a0a537272a28b78b47ef20325754a65a6f620fa528280d28c9bc415`

## Revision definitions (canonical; identity is exact, not inferred)

| Term | Definition | Owner |
| --- | --- | --- |
| `sourceRevision` | `sha256:<64 lowercase hex>` = SHA-256 of the exact UTF-8 bytes of one source file. No decoding, newline normalization, or reserialization. Empty content is rejected. | `sveltekit-frontend/src/lib/server/atlas/identity/code-source-revision-v1.ts` (`deriveCodeSourceRevisionV1`, schema `atlas.code.source-revision.v1`) |
| `contentDigest` | The bare 64-hex digest behind `sourceRevision`, without the `sha256:` prefix. | same as above |
| `byteLength` | UTF-8 byte count of the exact bytes hashed. | same as above |
| `workspaceRevision` | `sha256:` over a sorted manifest of `(sourceRef, sourceRevision, contentDigest, byteLength, gitBlobOid)` for the indexed source set. Git base commit/tree and `dirty` are recorded as provenance, not digested. Non-authoritative (`canonicalAuthority:false`). Known gap: files skipped for size, encoding, or read errors are not digested (see `codex.md`). | `sveltekit-frontend/src/lib/server/atlas/identity/workspace-source-binding-v1.ts` and `.../atlas/indexing/workspace-revision-origin-runtime-v1.ts` |
| Not interchangeable | `sourceRevision` ≠ `workspaceRevision` ≠ `codebase_chunk_index.content_hash` ≠ `packet_key`. Never compare across grains or namespaces. | — |

## Canonical source documents

- [.claude/CLAUDE.md](.claude/CLAUDE.md) — CLAUDE_INSTRUCTIONS — `13bc6179f4ad`
- [AGENTS.md](AGENTS.md) — AGENT_INSTRUCTIONS — `fef20519d5e9`
- [CLAUDE.md](CLAUDE.md) — CLAUDE_INSTRUCTIONS — `811a318ae8b9`
- [claude-mem/CLAUDE.md](claude-mem/CLAUDE.md) — CLAUDE_INSTRUCTIONS — `a6f297acd125`
- [llm/claude.md](llm/claude.md) — CLAUDE_INSTRUCTIONS — `fdcdba7c73d7`
- [mcp-server-mcp/CLAUDE.md](mcp-server-mcp/CLAUDE.md) — CLAUDE_INSTRUCTIONS — `1707a6375458`
- [mcp-server-mcp/documentation/docs/20-instructions/.generated/agents.md](mcp-server-mcp/documentation/docs/20-instructions/.generated/agents.md) — AGENT_INSTRUCTIONS — `d2a3fb0c935c`
- [mcp-server-mcp/tools/instructions/AGENTS.md](mcp-server-mcp/tools/instructions/AGENTS.md) — AGENT_INSTRUCTIONS — `d2a3fb0c935c`
- [sveltekit-frontend/.github/claude.md](sveltekit-frontend/.github/claude.md) — CLAUDE_INSTRUCTIONS — `95ca700f3ccf`
- [sveltekit-frontend/AGENTS.md](sveltekit-frontend/AGENTS.md) — AGENT_INSTRUCTIONS — `cad0382cca39`
- [sveltekit-frontend/claude.md](sveltekit-frontend/claude.md) — CLAUDE_INSTRUCTIONS — `4b9a0db385eb`
- [sveltekit-frontend/scripts/AGENTS.md](sveltekit-frontend/scripts/AGENTS.md) — AGENT_INSTRUCTIONS — `6dc76921686e`
- [sveltekit-frontend/src/lib/server/graph/AGENTS.md](sveltekit-frontend/src/lib/server/graph/AGENTS.md) — AGENT_INSTRUCTIONS — `1b0dea36f78b`
- [sveltekit-frontend/src/mcp/AGENTS.md](sveltekit-frontend/src/mcp/AGENTS.md) — AGENT_INSTRUCTIONS — `19dcc918a267`

## AGENTS.md by directory scope

> Navigation only. Each file governs its own directory subtree; a deeper instruction file takes precedence for its subtree.

- [./AGENTS.md](AGENTS.md) — `fef20519d5e9`
- [mcp-server-mcp/documentation/docs/20-instructions/.generated/AGENTS.md](mcp-server-mcp/documentation/docs/20-instructions/.generated/agents.md) — `d2a3fb0c935c`
- [mcp-server-mcp/tools/instructions/AGENTS.md](mcp-server-mcp/tools/instructions/AGENTS.md) — `d2a3fb0c935c`
- [sveltekit-frontend/AGENTS.md](sveltekit-frontend/AGENTS.md) — `cad0382cca39`
- [sveltekit-frontend/scripts/AGENTS.md](sveltekit-frontend/scripts/AGENTS.md) — `6dc76921686e`
- [sveltekit-frontend/src/lib/server/graph/AGENTS.md](sveltekit-frontend/src/lib/server/graph/AGENTS.md) — `1b0dea36f78b`
- [sveltekit-frontend/src/mcp/AGENTS.md](sveltekit-frontend/src/mcp/AGENTS.md) — `19dcc918a267`

## Canonical topics

- No document currently declares an explicit canonical topic owner.

## Architecture index

- [Parent Atlas Architecture TOC V2](architecture/ARCH-TOC.md) — complete navigation, workstation owner map, and explicit temporal snapshot receipts.
- [Master feature roadmap and evidence ledger](master_feature_todo_1011.md) — phase register 1–24, current blockers, and dated audit-note navigation; phase labels remain evidence-qualified.
- [Deferred dense-search session TODO](reports/sessions/MASTER-FEATURE-TODO-2026-05-20-pgvector-embeddinggemma-agentic-dense-search-todo.md) — historical task notes; consult current OpenSpec owners for status.
- [Embedding Dimension Policy (Corrected)](architecture/CORRECTED-embedding-dimension-policy.md) — canonical 768-D policy replacing 384-D truncation assumptions.

## EmbeddingGemma and pgvector 768-D Policy (embeddinggemma_toc)

> [!CAUTION]
> **CRITICAL MODEL & DIMENSION COMPATIBILITY GATEWAY**
>
> - **Canonical Vector Dimension**: `768-D` (`semantic_768`).
>   - Canonical Truth Store: PostgreSQL `codebase_chunk_index.content_embedding_768` (pgvector 768).
>   - Rebuildable ANN Mirror: Qdrant `codebase_chunks_768` (vector size 768, cosine distance).
>   - Prohibited / Deprecated: `384-D` truncation is obsolete. Zero-row 384-D columns are archived. Never insert 384-D vectors or truncate 768-D vectors.
> - **KMeans Clustering**: Must operate on `768-D` dense embeddings (`kmeans768`), using RAPIDS cuVS (GPU) or CPU KMeans over `semantic_768`, never on 384-D.
> - **Approved Ollama Models (`:11434`)**:
>   - `embeddinggemma:latest` — Primary canonical GPU model (768-D, L2-normalized).
>   - `embeddinggemma-cpu:latest` — Approved CPU fallback (768-D, cosine similarity ~0.9999 vs GPU).
> - ⚠️ **STRICT PROHIBITION — EmbeddingGemma 2 (`embeddinggemma2:q8_0`)**:
>   - Testing on `:11434` confirmed that `embeddinggemma2:q8_0` produces vectors in an **orthogonal embedding space** to `embeddinggemma:latest` (cosine similarity $\sim 0.00$).
>   - Querying or indexing with `embeddinggemma2` destroys pgvector/Qdrant cosine retrieval across the existing corpus.
>   - `embeddinggemma2` is strictly forbidden unless an atomic database-wide re-embedding migration is executed.

## Code Capability Knowledge and Agentic DAG Retrieval

- [Code-symbol semantic retrieval](architecture/code-symbol-semantic-retrieval-v1.md) — typed, source-grounded symbol evidence and existing DAG/OaK ownership boundaries.
- [Repo-local capability-card contract](.okf/indexes/code-capability-knowledge-v1.yaml) — design-only `spec.card_kind` projections; canonical identity remains with Parent Atlas.
- [CODE-KNOW-01..18](../openspec/changes/parent-atlas-compiler-semantic-graph-resolution/tasks.md) — open schema, evidence, transport, and admission gates; no datastore writes authorized.

## NLP Grounding, Classification, and Retrieval Context

> Navigation across existing owners; this is not a new registry or an admission claim. Domain/class labels, topics, extracted entities/concepts, clusters, ranked Top-K results, and future-context indexes are derived projections until their source, workspace, taxonomy, and representation revisions are qualified.

- [Task/evidence-card grounding and tuple lineage](../openspec/changes/parent-atlas-compute-rank-cache-eval-dspy-gepa/tasks.md) — task proof join, `GroundedNlpFactV1`, deployed-schema check, tuple lineage, and read-only admission gates.
- [OpenSpec task evidence cards](../openspec/changes/parent-atlas-openspec-task-triage-pipeline/tasks.md) — TaskCard/EvidenceCard receipts and predicate-level proof binding.
- [NLP sidecar feature compiler](../openspec/changes/parent-atlas-nlp-sidecar-feature-compiler/tasks.md) — extraction, feature compilation, source spans, and sidecar/runtime boundaries.
- [Domain classifier and taxonomy](../openspec/changes/parent-atlas-workstation-domain-classifier/tasks.md) — domain/intent classification and non-authoritative routing signals.
- [Feature-label derivation](../openspec/changes/feature-label-semantic-derivation/tasks.md) — sourceRef-to-feature labels and review-gated canonical reconciliation.
- [Ontology kernel: entities, concepts, and tuples](../openspec/changes/parent-atlas-ontology-kernel/tasks.md) — ontology ownership, entity extraction, tuple lineage, and domain normalization.
- [Feature intelligence: entity fanout and clustering](../openspec/changes/atlas-feature-intelligence/tasks.md) — entity/evidence admission, bounded fanout, feature convergence, and KMeans/SOM projections.
- [Topology representation admission](../openspec/changes/parent-atlas-topology-representation-admission/tasks.md) — snapshot/ordinal-bound clustering and topology artifacts.
- [Candidate feature execution](../openspec/changes/parent-atlas-candidate-feature-execution-fabric/tasks.md) — candidate feature production, ranking signals, and evidence-aligned feature rows.
- [Retrieval lineage and DAG convergence](../openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/tasks.md) — retrieval/top-K candidate flow, context assembly, and revision-bound downstream consumption.
- [Semantic representation and retrieval](../openspec/changes/parent-atlas-semantic-768-canonical-contract/tasks.md) — `semantic_768` representation lineage and retrieval projection gates.

## Architecture documents

- [_bitfrost_fsm_index](docs/architecture/_bitfrost_fsm_index.md) — UNCLASSIFIED
- [_cuda_rtx_toc](docs/architecture/_cuda_rtx_toc.md) — UNCLASSIFIED
- [_qdrant_ann_pipeline_toc](docs/architecture/_qdrant_ann_pipeline_toc.md) — UNCLASSIFIED
- [_taxonomy_oak_graphrag_index](docs/architecture/_taxonomy_oak_graphrag_index.md) — UNCLASSIFIED
- [_topology_classifier_index](docs/architecture/_topology_classifier_index.md) — UNCLASSIFIED
- [ACP-GEMMA4-MEMORY-HIERARCHY](docs/architecture/ACP-GEMMA4-MEMORY-HIERARCHY.md) — UNCLASSIFIED
- [ACP-TELEMETRY-DAILY-GRAPHIFY-FLOW](docs/architecture/ACP-TELEMETRY-DAILY-GRAPHIFY-FLOW.md) — UNCLASSIFIED
- [AGENTIC-ERROR-FIXING-ARCHITECTURE](docs/architecture/AGENTIC-ERROR-FIXING-ARCHITECTURE.md) — UNCLASSIFIED
- [AGENTIC-ERROR-FIXING-DIMENSIONAL-MODEL](docs/architecture/AGENTIC-ERROR-FIXING-DIMENSIONAL-MODEL.md) — UNCLASSIFIED
- [agentic-error-proposal-flow](docs/architecture/agentic-error-proposal-flow.md) — UNCLASSIFIED
- [agentic-openspec-tasks-error-fixing-playbook](docs/architecture/agentic-openspec-tasks-error-fixing-playbook.md) — UNCLASSIFIED
- [ARCH-TOC-v2](docs/architecture/ARCH-TOC-v2.md) — UNCLASSIFIED
- [atlas-retrieval-parity-admission-gates-v1](docs/architecture/atlas-retrieval-parity-admission-gates-v1.md) — UNCLASSIFIED
- [atlas-store-ownership-and-derived-representations-v1](docs/architecture/atlas-store-ownership-and-derived-representations-v1.md) — UNCLASSIFIED
- [atlas-topic-identity-read-model-v1](docs/architecture/atlas-topic-identity-read-model-v1.md) — UNCLASSIFIED
- [atlas-work-items-design-v1](docs/architecture/atlas-work-items-design-v1.md) — UNCLASSIFIED
- [README](docs/architecture/autoencoder/README.md) — UNCLASSIFIED
- [bounded-tool-gateway-implementation](docs/architecture/bounded-tool-gateway-implementation.md) — UNCLASSIFIED
- [CANONICAL-PACKET-WIRING-BLUEPRINT](docs/architecture/CANONICAL-PACKET-WIRING-BLUEPRINT.md) — UNCLASSIFIED
- [canonical-tool-catalog](docs/architecture/canonical-tool-catalog.md) — UNCLASSIFIED
- [code-symbol-semantic-retrieval-v1](docs/architecture/code-symbol-semantic-retrieval-v1.md) — ACTIVE_SUPPORTING
- [codebase-memory-mcp-cli-and-atlas-alignment-v1](docs/architecture/codebase-memory-mcp-cli-and-atlas-alignment-v1.md) — UNCLASSIFIED
- [cold-warm-hot-packet-lifecycle](docs/architecture/cold-warm-hot-packet-lifecycle.md) — UNCLASSIFIED
- [compressed-semantic-geometry](docs/architecture/compressed-semantic-geometry.md) — UNCLASSIFIED
- [consolidation-and-schema-alignment](docs/architecture/consolidation-and-schema-alignment.md) — UNCLASSIFIED
- [consolidation-and-schema-migration-checklist](docs/architecture/consolidation-and-schema-migration-checklist.md) — UNCLASSIFIED
- [CORRECTED-embedding-dimension-policy](docs/architecture/CORRECTED-embedding-dimension-policy.md) — UNCLASSIFIED
- [couchdb-mapreduce-atlas-ingestion](docs/architecture/couchdb-mapreduce-atlas-ingestion.md) — UNCLASSIFIED
- [cuda134-simt-container-v1](docs/architecture/cuda134-simt-container-v1.md) — UNCLASSIFIED
- [CUVS-DOCKER-IMPLEMENTATION-CHECKLIST](docs/architecture/CUVS-DOCKER-IMPLEMENTATION-CHECKLIST.md) — UNCLASSIFIED
- [CUVS-INSTALLATION-WINDOWS-RESEARCH](docs/architecture/CUVS-INSTALLATION-WINDOWS-RESEARCH.md) — UNCLASSIFIED
- [CUVS-QUICK-REFERENCE](docs/architecture/CUVS-QUICK-REFERENCE.md) — UNCLASSIFIED
- [CUVS-RESEARCH-SUMMARY](docs/architecture/CUVS-RESEARCH-SUMMARY.md) — UNCLASSIFIED
- [DAG-ACP-OPEN-MEMORY-WIRING](docs/architecture/DAG-ACP-OPEN-MEMORY-WIRING.md) — UNCLASSIFIED
- [deepseek-engram-architecture-search](docs/architecture/deepseek-engram-architecture-search.md) — UNCLASSIFIED
- [domain-registry-contract-v1](docs/architecture/domain-registry-contract-v1.md) — UNCLASSIFIED
- [DRIZZLE-TOC](docs/architecture/DRIZZLE-TOC.md) — UNCLASSIFIED
- [dual-lane-hot-brain-cold-queue](docs/architecture/dual-lane-hot-brain-cold-queue.md) — UNCLASSIFIED
- [engram-plugin-memory-support](docs/architecture/engram-plugin-memory-support.md) — UNCLASSIFIED
- [feature-consolidation-review-queue](docs/architecture/feature-consolidation-review-queue.md) — UNCLASSIFIED
- [feature-to-source-next-gates-v1](docs/architecture/feature-to-source-next-gates-v1.md) — UNCLASSIFIED
- [gemma4-bounded-tool-system-prompt](docs/architecture/gemma4-bounded-tool-system-prompt.md) — UNCLASSIFIED
- [gemma4-retrieval-loop-hook](docs/architecture/gemma4-retrieval-loop-hook.md) — UNCLASSIFIED
- [GPU-CUDA-NAPI-MEMORY-LAYOUT](docs/architecture/GPU-CUDA-NAPI-MEMORY-LAYOUT.md) — UNCLASSIFIED
- [gpu-resource-observations-and-cache-boundary-v1](docs/architecture/gpu-resource-observations-and-cache-boundary-v1.md) — UNCLASSIFIED
- [graphify-daily-discovery-helpers-v1](docs/architecture/graphify-daily-discovery-helpers-v1.md) — UNCLASSIFIED
- [grpc-binary-memory-registry-master-todo](docs/architecture/grpc-binary-memory-registry-master-todo.md) — UNCLASSIFIED
- [grpc-binary-memory-registry-plan](docs/architecture/grpc-binary-memory-registry-plan.md) — UNCLASSIFIED
- [HEADROOM-COMPRESSION-CRYPTO-PROVENANCE-ALIGNMENT](docs/architecture/HEADROOM-COMPRESSION-CRYPTO-PROVENANCE-ALIGNMENT.md) — UNCLASSIFIED
- [kanban-parent-atlas-alignment](docs/architecture/kanban-parent-atlas-alignment.md) — UNCLASSIFIED
- [langextract-atlas-integrations](docs/architecture/langextract-atlas-integrations.md) — UNCLASSIFIED
- [legal-ai-parent-atlas-product-integration](docs/architecture/legal-ai-parent-atlas-product-integration.md) — UNCLASSIFIED
- [llama-runtime-mcp-controls](docs/architecture/llama-runtime-mcp-controls.md) — UNCLASSIFIED
- [llm-synthesis-memory-policy](docs/architecture/llm-synthesis-memory-policy.md) — UNCLASSIFIED
- [local-deep-research-boundary](docs/architecture/local-deep-research-boundary.md) — UNCLASSIFIED
- [MCP-TOOL-AUDIT-AND-ACE-PACKET-FLOW](docs/architecture/MCP-TOOL-AUDIT-AND-ACE-PACKET-FLOW.md) — UNCLASSIFIED
- [neo4j-graphrag-parent-atlas](docs/architecture/neo4j-graphrag-parent-atlas.md) — UNCLASSIFIED
- [NES-CHROM97-GLYPH-BITENCODING-ALIGNED](docs/architecture/NES-CHROM97-GLYPH-BITENCODING-ALIGNED.md) — UNCLASSIFIED
- [oaklib-external-ontology-adapter-v1](docs/architecture/oaklib-external-ontology-adapter-v1.md) — UNCLASSIFIED
- [observation-feature-row-lineage-proposal-v1](docs/architecture/observation-feature-row-lineage-proposal-v1.md) — UNCLASSIFIED
- [offline-synthesis-parent-atlas](docs/architecture/offline-synthesis-parent-atlas.md) — UNCLASSIFIED
- [okf-v02-validation-profile-v1](docs/architecture/okf-v02-validation-profile-v1.md) — UNCLASSIFIED
- [opencode-claude-mem-bridge](docs/architecture/opencode-claude-mem-bridge.md) — UNCLASSIFIED
- [orf-domain-nlp-oak-topology-alignment-v1](docs/architecture/orf-domain-nlp-oak-topology-alignment-v1.md) — UNCLASSIFIED
- [PACKET-COMPILER-STAGES](docs/architecture/PACKET-COMPILER-STAGES.md) — UNCLASSIFIED
- [packet-telemetry-existing-writer-v1](docs/architecture/packet-telemetry-existing-writer-v1.md) — UNCLASSIFIED
- [packet-truth-flow-canonical-pattern](docs/architecture/packet-truth-flow-canonical-pattern.md) — UNCLASSIFIED
- [PARENT_ATLAS_INSTRUCTION_AUTHORITY](docs/architecture/PARENT_ATLAS_INSTRUCTION_AUTHORITY.md) — UNCLASSIFIED
- [PARENT_ATLAS_PACKAGE_BOUNDARIES](docs/architecture/PARENT_ATLAS_PACKAGE_BOUNDARIES.md) — UNCLASSIFIED
- [PARENT_ATLAS_RECOMMENDATION_AND_RETRIEVAL_POLICY](docs/architecture/PARENT_ATLAS_RECOMMENDATION_AND_RETRIEVAL_POLICY.md) — UNCLASSIFIED
- [parent-atlas-batch-execution-gates-v1](docs/architecture/parent-atlas-batch-execution-gates-v1.md) — UNCLASSIFIED
- [parent-atlas-function-topology-search-index](docs/architecture/parent-atlas-function-topology-search-index.md) — UNCLASSIFIED
- [parent-atlas-karpathy-pipeline](docs/architecture/parent-atlas-karpathy-pipeline.md) — UNCLASSIFIED
- [parent-atlas-native-dawn-viewer-contract-v1](docs/architecture/parent-atlas-native-dawn-viewer-contract-v1.md) — UNCLASSIFIED
- [parent-atlas-policy-routing](docs/architecture/parent-atlas-policy-routing.md) — UNCLASSIFIED
- [parent-atlas-representation-structural-contract](docs/architecture/parent-atlas-representation-structural-contract.md) — UNCLASSIFIED
- [parent-atlas-selection-receipt-and-model-boundaries-v1](docs/architecture/parent-atlas-selection-receipt-and-model-boundaries-v1.md) — UNCLASSIFIED
- [PARENT-ATLAS-STUDIO-AWARENESS-TOURNAMENT](docs/architecture/PARENT-ATLAS-STUDIO-AWARENESS-TOURNAMENT.md) — UNCLASSIFIED
- [parent-atlas-unreal-client-contract-v1](docs/architecture/parent-atlas-unreal-client-contract-v1.md) — UNCLASSIFIED
- [parent-atlas-workstation-compute-fabric](docs/architecture/parent-atlas-workstation-compute-fabric.md) — UNCLASSIFIED
- [pathway-cards-spec](docs/architecture/pathway-cards-spec.md) — UNCLASSIFIED
- [phase-101-completion-plan](docs/architecture/phase-101-completion-plan.md) — UNCLASSIFIED
- [phase-17g-gpu-json-tensor-mapping](docs/architecture/phase-17g-gpu-json-tensor-mapping.md) — UNCLASSIFIED
- [phase-3-gpu-graph-adaptive-architecture](docs/architecture/phase-3-gpu-graph-adaptive-architecture.md) — UNCLASSIFIED
- [phase-3d-telemetry-instrumentation](docs/architecture/phase-3d-telemetry-instrumentation.md) — UNCLASSIFIED
- [PHASE-85-ARTIFACT-REGISTRY-SPEC](docs/architecture/PHASE-85-ARTIFACT-REGISTRY-SPEC.md) — UNCLASSIFIED
- [PHASE-C-OPTION-B-ARCHITECTURE-DECISION](docs/architecture/PHASE-C-OPTION-B-ARCHITECTURE-DECISION.md) — UNCLASSIFIED
- [phase17-feature-extractor-upgrade-v2](docs/architecture/phase17-feature-extractor-upgrade-v2.md) — UNCLASSIFIED
- [phase8-query-optimization-taxonomy](docs/architecture/phase8-query-optimization-taxonomy.md) — UNCLASSIFIED
- [POSTGRESQL-TOC](docs/architecture/POSTGRESQL-TOC.md) — UNCLASSIFIED
- [product-feature-decomposition-integration-v1](docs/architecture/product-feature-decomposition-integration-v1.md) — UNCLASSIFIED
- [product-feature-decomposition-tasks-v1](docs/architecture/product-feature-decomposition-tasks-v1.md) — UNCLASSIFIED
- [qdrant-search-contract](docs/architecture/qdrant-search-contract.md) — UNCLASSIFIED
- [rabbitmq-workflow-fabric](docs/architecture/rabbitmq-workflow-fabric.md) — UNCLASSIFIED
- [residency-scheduler-boundary-v1](docs/architecture/residency-scheduler-boundary-v1.md) — UNCLASSIFIED
- [retrieval-architecture](docs/architecture/retrieval-architecture.md) — UNCLASSIFIED
- [retrieval-boundary-and-langgraph](docs/architecture/retrieval-boundary-and-langgraph.md) — UNCLASSIFIED
- [retrieval-layer-separation](docs/architecture/retrieval-layer-separation.md) — UNCLASSIFIED
- [retrieval-transport-codec-telemetry-v1](docs/architecture/retrieval-transport-codec-telemetry-v1.md) — UNCLASSIFIED
- [rtx-visual-enhancement-boundary-v1](docs/architecture/rtx-visual-enhancement-boundary-v1.md) — UNCLASSIFIED
- [runtime-owner-deduplication](docs/architecture/runtime-owner-deduplication.md) — UNCLASSIFIED
- [RUST-BACKEND-DECISION-TREE](docs/architecture/RUST-BACKEND-DECISION-TREE.md) — UNCLASSIFIED
- [scheduler-gpu-bridge-roadmap](docs/architecture/scheduler-gpu-bridge-roadmap.md) — UNCLASSIFIED
- [SESSION-84-MISSING-LAYERS-ANALYSIS](docs/architecture/SESSION-84-MISSING-LAYERS-ANALYSIS.md) — UNCLASSIFIED
- [simdjson-tensor-array-analysis-v1](docs/architecture/simdjson-tensor-array-analysis-v1.md) — UNCLASSIFIED
- [storage-tier-schema](docs/architecture/storage-tier-schema.md) — UNCLASSIFIED
- [subgraph-instruction-programming-kag-ace-topology](docs/architecture/subgraph-instruction-programming-kag-ace-topology.md) — UNCLASSIFIED
- [sveltekit-frontend-toc](docs/architecture/sveltekit-frontend-toc.md) — UNCLASSIFIED
- [trace-kag-web-development-guide](docs/architecture/trace-kag-web-development-guide.md) — UNCLASSIFIED
- [trace-runtime-split](docs/architecture/trace-runtime-split.md) — UNCLASSIFIED
- [TRANSPORT-WORKER-CHROM97-ALIGNMENT](docs/architecture/TRANSPORT-WORKER-CHROM97-ALIGNMENT.md) — UNCLASSIFIED
- [unified-ace-engram-pipeline](docs/architecture/unified-ace-engram-pipeline.md) — UNCLASSIFIED
- [UNIFIED-ID-HIERARCHY-AND-RETRIEVAL](docs/architecture/UNIFIED-ID-HIERARCHY-AND-RETRIEVAL.md) — UNCLASSIFIED
- [UNIFIED-RETRIEVAL-HMM-POLICY-ARCHITECTURE](docs/architecture/UNIFIED-RETRIEVAL-HMM-POLICY-ARCHITECTURE.md) — UNCLASSIFIED
- [valkey-ace-context-input-derivation-v1](docs/architecture/valkey-ace-context-input-derivation-v1.md) — UNCLASSIFIED
- [vram-hygiene-policy](docs/architecture/vram-hygiene-policy.md) — UNCLASSIFIED

## Active OpenSpec task progress

- [agent-branch-review-fanout-ace-centroid-aug22](openspec/changes/agent-branch-review-fanout-ace-centroid-aug22) — 17/20 tasks (85%)
- [atlas-feature-intelligence](openspec/changes/atlas-feature-intelligence) — 27/82 tasks (33%)
- [deep-audit-code-gates-aug22](openspec/changes/deep-audit-code-gates-aug22) — 16/28 tasks (57%)
- [legal-corpus-california-codes](openspec/changes/legal-corpus-california-codes) — 56/102 tasks (55%)
- [local-llm-offload-ownership](openspec/changes/local-llm-offload-ownership) — 49/82 tasks (60%)
- [manual-migration-reconciliation](openspec/changes/manual-migration-reconciliation) — 98/132 tasks (74%)
- [parent-atlas-ace-bitfrost-cache-correctness](openspec/changes/parent-atlas-ace-bitfrost-cache-correctness) — 57/110 tasks (52%)
- [parent-atlas-ace-rlm-bitfrost-integration](openspec/changes/parent-atlas-ace-rlm-bitfrost-integration) — 981/1493 tasks (66%)
- [parent-atlas-adaptive-backprop-hll-monitoring](openspec/changes/parent-atlas-adaptive-backprop-hll-monitoring) — 10/64 tasks (16%)
- [parent-atlas-adaptive-dag-fabric](openspec/changes/parent-atlas-adaptive-dag-fabric) — 12/13 tasks (92%)
- [parent-atlas-agent-framework-integration-hardening](openspec/changes/parent-atlas-agent-framework-integration-hardening) — 12/71 tasks (17%)
- [parent-atlas-agentic-completion](openspec/changes/parent-atlas-agentic-completion) — 10/11 tasks (91%)
- [parent-atlas-agentic-file-compiler](openspec/changes/parent-atlas-agentic-file-compiler) — 56/81 tasks (69%)
- [parent-atlas-agentic-repair-bundle-integration](openspec/changes/parent-atlas-agentic-repair-bundle-integration) — 29/96 tasks (30%)
- [parent-atlas-agentic-repair-fabric](openspec/changes/parent-atlas-agentic-repair-fabric) — 45/54 tasks (83%)
- [parent-atlas-analysis-pass-ornith-adapter](openspec/changes/parent-atlas-analysis-pass-ornith-adapter) — 24/25 tasks (96%)
- [parent-atlas-best-fit-score-fabric](openspec/changes/parent-atlas-best-fit-score-fabric) — 422/714 tasks (59%)
- [parent-atlas-branch-merge-consolidation-aug20](openspec/changes/parent-atlas-branch-merge-consolidation-aug20) — 18/35 tasks (51%)
- [parent-atlas-candidate-feature-execution-fabric](openspec/changes/parent-atlas-candidate-feature-execution-fabric) — 311/471 tasks (66%)
- [parent-atlas-canonical-directory-ingestion-fabric](openspec/changes/parent-atlas-canonical-directory-ingestion-fabric) — 25/77 tasks (32%)
- [parent-atlas-chunk-index-whole-file-hash](openspec/changes/parent-atlas-chunk-index-whole-file-hash) — 25/29 tasks (86%)
- [parent-atlas-code-ingestion-pipeline](openspec/changes/parent-atlas-code-ingestion-pipeline) — 26/35 tasks (74%)
- [parent-atlas-code-intel-e2e](openspec/changes/parent-atlas-code-intel-e2e) — 2/28 tasks (7%)
- [parent-atlas-compiler-semantic-graph-resolution](openspec/changes/parent-atlas-compiler-semantic-graph-resolution) — 40/89 tasks (45%)
- [parent-atlas-compute-rank-cache-eval-dspy-gepa](openspec/changes/parent-atlas-compute-rank-cache-eval-dspy-gepa) — 37/148 tasks (25%)
- [parent-atlas-deep-research-ingestion](openspec/changes/parent-atlas-deep-research-ingestion) — 6/7 tasks (86%)
- [parent-atlas-document-governance-master-index](openspec/changes/parent-atlas-document-governance-master-index) — 60/80 tasks (75%)
- [parent-atlas-error-embedding-768-migration](openspec/changes/parent-atlas-error-embedding-768-migration) — 12/26 tasks (46%)
- [parent-atlas-gate2-chunk-lineage-convergence](openspec/changes/parent-atlas-gate2-chunk-lineage-convergence) — 3/20 tasks (15%)
- [parent-atlas-governed-compute-fabric](openspec/changes/parent-atlas-governed-compute-fabric) — 2/180 tasks (1%)
- [parent-atlas-gpu-graph-vector-substrate](openspec/changes/parent-atlas-gpu-graph-vector-substrate) — 3/57 tasks (5%)
- [parent-atlas-gpu-prellm-recommendation-v1](openspec/changes/parent-atlas-gpu-prellm-recommendation-v1) — 35/37 tasks (95%)
- [parent-atlas-gpu-runtime-abi-alignment](openspec/changes/parent-atlas-gpu-runtime-abi-alignment) — 17/22 tasks (77%)
- [parent-atlas-gpu-sidecar-patch-tournament](openspec/changes/parent-atlas-gpu-sidecar-patch-tournament) — 18/122 tasks (15%)
- [parent-atlas-graph-analysis-contract](openspec/changes/parent-atlas-graph-analysis-contract) — 68/128 tasks (53%)
- [parent-atlas-graph-pagerank-okf-fanout-hardening](openspec/changes/parent-atlas-graph-pagerank-okf-fanout-hardening) — 6/10 tasks (60%)
- [parent-atlas-graph-retrieval-proof](openspec/changes/parent-atlas-graph-retrieval-proof) — 165/293 tasks (56%)
- [parent-atlas-graph-runtime-enhancement](openspec/changes/parent-atlas-graph-runtime-enhancement) — 4/10 tasks (40%)
- [parent-atlas-graph-runtime-python-consolidation](openspec/changes/parent-atlas-graph-runtime-python-consolidation) — 20/30 tasks (67%)
- [parent-atlas-graph-validation-fabric](openspec/changes/parent-atlas-graph-validation-fabric) — 61/94 tasks (65%)
- [parent-atlas-graphify-recovery-proof-ladder](openspec/changes/parent-atlas-graphify-recovery-proof-ladder) — 16/42 tasks (38%)
- [parent-atlas-grounded-knowledge-fabric](openspec/changes/parent-atlas-grounded-knowledge-fabric) — 14/25 tasks (56%)
- [parent-atlas-kafka-projection-initiative](openspec/changes/parent-atlas-kafka-projection-initiative) — 38/71 tasks (54%)
- [parent-atlas-kv-cache-adaptation-research](openspec/changes/parent-atlas-kv-cache-adaptation-research) — 23/118 tasks (19%)
- [parent-atlas-memory-architecture-freeze](openspec/changes/parent-atlas-memory-architecture-freeze) — 44/57 tasks (77%)
- [parent-atlas-ml-graph-retrieval-convergence](openspec/changes/parent-atlas-ml-graph-retrieval-convergence) — 72/254 tasks (28%)
- [parent-atlas-multi-agent-wave-plan](openspec/changes/parent-atlas-multi-agent-wave-plan) — 21/36 tasks (58%)
- [parent-atlas-native-acceleration-cabi](openspec/changes/parent-atlas-native-acceleration-cabi) — 39/63 tasks (62%)
- [parent-atlas-neural-prefill-encoder](openspec/changes/parent-atlas-neural-prefill-encoder) — 1546/2239 tasks (69%)
- [parent-atlas-nlp-sidecar-feature-compiler](openspec/changes/parent-atlas-nlp-sidecar-feature-compiler) — 102/160 tasks (64%)
- [parent-atlas-nlp-sidecar-okf-alignment](openspec/changes/parent-atlas-nlp-sidecar-okf-alignment) — 8/16 tasks (50%)
- [parent-atlas-observation-routing-fabric](openspec/changes/parent-atlas-observation-routing-fabric) — 19/26 tasks (73%)
- [parent-atlas-okf-knowledge-layers](openspec/changes/parent-atlas-okf-knowledge-layers) — 39/63 tasks (62%)
- [parent-atlas-onnx-webgpu-embedding-promotion](openspec/changes/parent-atlas-onnx-webgpu-embedding-promotion) — 15/21 tasks (71%)
- [parent-atlas-ontology-kernel](openspec/changes/parent-atlas-ontology-kernel) — 248/408 tasks (61%)
- [parent-atlas-ontology-oaklib-fanout-bitmap](openspec/changes/parent-atlas-ontology-oaklib-fanout-bitmap) — 33/36 tasks (92%)
- [parent-atlas-opencode-replay-proof](openspec/changes/parent-atlas-opencode-replay-proof) — 2/19 tasks (11%)
- [parent-atlas-openspec-ledger-reconciliation](openspec/changes/parent-atlas-openspec-ledger-reconciliation) — 0/13 tasks (0%)
- [parent-atlas-openspec-task-triage-pipeline](openspec/changes/parent-atlas-openspec-task-triage-pipeline) — 12/54 tasks (22%)
- [parent-atlas-openspec-tasks-audit-fabric](openspec/changes/parent-atlas-openspec-tasks-audit-fabric) — 16/18 tasks (89%)
- [parent-atlas-pass-fabric](openspec/changes/parent-atlas-pass-fabric) — 36/184 tasks (20%)
- [parent-atlas-pca-svd-representation-baseline](openspec/changes/parent-atlas-pca-svd-representation-baseline) — 7/20 tasks (35%)
- [parent-atlas-policy-routing-integration](openspec/changes/parent-atlas-policy-routing-integration) — 36/40 tasks (90%)
- [parent-atlas-prefill-routing-residency-convergence](openspec/changes/parent-atlas-prefill-routing-residency-convergence) — 127/171 tasks (74%)
- [parent-atlas-qdrant-structural-payload-enrichment](openspec/changes/parent-atlas-qdrant-structural-payload-enrichment) — 17/23 tasks (74%)
- [parent-atlas-query-routing-classifier](openspec/changes/parent-atlas-query-routing-classifier) — 49/113 tasks (43%)
- [parent-atlas-repair-candidate-feature-matrix](openspec/changes/parent-atlas-repair-candidate-feature-matrix) — 135/174 tasks (78%)
- [parent-atlas-retire-384-lane](openspec/changes/parent-atlas-retire-384-lane) — 17/31 tasks (55%)
- [parent-atlas-retrieval-executor-compatibility-convergence](openspec/changes/parent-atlas-retrieval-executor-compatibility-convergence) — 39/48 tasks (81%)
- [parent-atlas-retrieval-fusion-reachability](openspec/changes/parent-atlas-retrieval-fusion-reachability) — 121/148 tasks (82%)
- [parent-atlas-retrieval-lineage-dag-convergence](openspec/changes/parent-atlas-retrieval-lineage-dag-convergence) — 865/1189 tasks (73%)
- [parent-atlas-retrieval-lod-algorithm-taxonomy](openspec/changes/parent-atlas-retrieval-lod-algorithm-taxonomy) — 60/157 tasks (38%)
- [parent-atlas-retrieval-logic-convergence](openspec/changes/parent-atlas-retrieval-logic-convergence) — 32/74 tasks (43%)
- [parent-atlas-rpc-packet-registry-fabric](openspec/changes/parent-atlas-rpc-packet-registry-fabric) — 30/41 tasks (73%)
- [parent-atlas-rrf-fusion-consolidation](openspec/changes/parent-atlas-rrf-fusion-consolidation) — 5/6 tasks (83%)
- [parent-atlas-runtime-log-remediation](openspec/changes/parent-atlas-runtime-log-remediation) — 0/18 tasks (0%)
- [parent-atlas-search-classifier-sidecar](openspec/changes/parent-atlas-search-classifier-sidecar) — 70/88 tasks (80%)
- [parent-atlas-semantic-512-canonicalization](openspec/changes/parent-atlas-semantic-512-canonicalization) — 23/31 tasks (74%)
- [parent-atlas-semantic-768-canonical-contract](openspec/changes/parent-atlas-semantic-768-canonical-contract) — 60/104 tasks (58%)
- [parent-atlas-telemetry-lowrank-recommendation-okf-integration](openspec/changes/parent-atlas-telemetry-lowrank-recommendation-okf-integration) — 17/55 tasks (31%)
- [parent-atlas-tensor-residency-integration](openspec/changes/parent-atlas-tensor-residency-integration) — 179/332 tasks (54%)
- [parent-atlas-topology-representation-admission](openspec/changes/parent-atlas-topology-representation-admission) — 37/58 tasks (64%)
- [parent-atlas-transport-memory-boundaries](openspec/changes/parent-atlas-transport-memory-boundaries) — 44/106 tasks (42%)
- [parent-atlas-unordered-execution-contract](openspec/changes/parent-atlas-unordered-execution-contract) — 7/26 tasks (27%)
- [parent-atlas-versioned-doc-intelligence](openspec/changes/parent-atlas-versioned-doc-intelligence) — 57/98 tasks (58%)
- [parent-atlas-workboard-feature-utility-fabric](openspec/changes/parent-atlas-workboard-feature-utility-fabric) — 28/70 tasks (40%)
- [parent-atlas-workspace-snapshot-runtime](openspec/changes/parent-atlas-workspace-snapshot-runtime) — 6/44 tasks (14%)
- [parent-atlas-workstation-domain-classifier](openspec/changes/parent-atlas-workstation-domain-classifier) — 143/219 tasks (65%)
- [parent-atlas-xgboost-cuda-runtime-proof](openspec/changes/parent-atlas-xgboost-cuda-runtime-proof) — 12/30 tasks (40%)
- [route-import-infra-isolation](openspec/changes/route-import-infra-isolation) — 16/17 tasks (94%)
- [svelte-a11y-warning-remediation](openspec/changes/svelte-a11y-warning-remediation) — 13/20 tasks (65%)
- [visual-element-rendering](openspec/changes/visual-element-rendering) — 15/16 tasks (94%)

## Ordered workboard

- [OpenSpec workboard](OPENSPEC-WORKBOARD.md) — priority-ordered open tasks with evidence-based ETA fields.

## Superseded and archive candidates

- No documents are classified SUPERSEDED.
- No documents are archive-ready.
- Original files remain in place until an explicit supersession and archive receipt exists.

## Experiments and challengers

- [TANG_INSPIRED_LOW_RANK_SHORTLIST](docs/reports/atlas-candidate-shortlist-receipt-v1.json) — EXECUTED_UNPROVEN; 512→96, rank 8; Recall@10 30%, Recall@24 33%, Top24 overlap 33%, oracle NDCG@24 50%; receipt dated 2026-08-27. Canonical authority is false; promotion remains gated by [NE-23E exact-rerank/quality evaluation](../openspec/changes/parent-atlas-neural-prefill-encoder/tasks.md).

## Conflicts

- No governance conflicts are recorded.

## Runtime ETA

- ETA unavailable: no validated workflow event with `progress.etaMs` is present in the registry.

## Latest verified retrieval findings

- [Latent256 exact/Qdrant parity](reports/latent256-ann-exact-parity-bounded-v2.json) — atlas.latent256-ann-exact-parity.v1 — sample 15, k=10, mean overlap 1.
- [Qdrant semantic identity canary](reports/lineage-qdrant-semantic-canary-v1.json) — CANARY_QDRANT_IDENTITY_BLOCKED — 30 points for 15 candidates; duplicates 15.
- [Qdrant projection targets](reports/lineage-qdrant-projection-targets-v1.json) — QDRANT_PROJECTION_TARGETS_CENSUSED — same-collection duplicates 15, missing 0.
- Rebuild safety warning: the existing Qdrant backfill tool reads canonical vectors but still requires packet/workspace lineage reconciliation before apply; it is not a promotion-ready blue/green rebuild.
- Promotion note: Qdrant remains a rebuildable projection; duplicate ownership must be reconciled before cutover or deletion.

## Neural decoder and GPU runtime separation

- [Neural decoder separation](reports/neural-decoder-runtime-separation-v1.json) — PROVEN_LIVE_BOUNDED — host PyTorch 2.8.0+cu128 is reference-only; decoder 2.13.0+cu132 on http://127.0.0.1:8121 owns learned projection only.
- [Python ML runtime inventory (2026-10-13)](reports/python-ml-runtime-inventory-2026-10-13.md) — Windows `.venv`: PyTorch CPU-only and XGBoost CUDA 12.9; WSL RAPIDS: CUDA-enabled PyTorch and XGBoost CUDA 13.3. Package capability is not workload or service proof.
- Decoder contract: `semantic_768` → physical `latent_256` → derived `latent_128`/`latent_64`; `canonicalAuthority=false`, `textSynthesis=false`, and `writesPerformed=false`.
- Ornith remains the synthesis/tool-use owner; PostgreSQL remains canonical storage/lineage authority; Qdrant and GPU residency remain rebuildable execution/projection layers.
- Open GPU gates: FEAT-04 envelope, owner-process residency reuse, decoder replay, cuTile parity, CUDA SIMT parity, and RMM allocator evaluation.
