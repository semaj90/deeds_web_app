# Parent Atlas Master TOC (V2)

> Generated projection from `docs/reports/document-governance-registry-v2.json`.
> This file is navigation, not canonical architecture or supersession authority.

Registry checksum: `c98c5220b962d96b4b7e77b21eb2752b6ba730d544397f7fae7691cc1565187f`

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
- [AGENTS.md](AGENTS.md) — AGENT_INSTRUCTIONS — `8951bea50d28`
- [CLAUDE.md](CLAUDE.md) — CLAUDE_INSTRUCTIONS — `f301f0eabdd6`
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

- [./AGENTS.md](AGENTS.md) — `8951bea50d28`
- [mcp-server-mcp/documentation/docs/20-instructions/.generated/AGENTS.md](mcp-server-mcp/documentation/docs/20-instructions/.generated/agents.md) — `d2a3fb0c935c`
- [mcp-server-mcp/tools/instructions/AGENTS.md](mcp-server-mcp/tools/instructions/AGENTS.md) — `d2a3fb0c935c`
- [sveltekit-frontend/AGENTS.md](sveltekit-frontend/AGENTS.md) — `cad0382cca39`
- [sveltekit-frontend/scripts/AGENTS.md](sveltekit-frontend/scripts/AGENTS.md) — `6dc76921686e`
- [sveltekit-frontend/src/lib/server/graph/AGENTS.md](sveltekit-frontend/src/lib/server/graph/AGENTS.md) — `1b0dea36f78b`
- [sveltekit-frontend/src/mcp/AGENTS.md](sveltekit-frontend/src/mcp/AGENTS.md) — `19dcc918a267`

## Canonical topics

- No document currently declares an explicit canonical topic owner.

## Architecture index

- [Parent Atlas Architecture TOC V2](architecture/ARCH-TOC-v2.md) — complete navigation, workstation owner map, and explicit temporal snapshot receipts.

## Code Capability Knowledge and Agentic DAG Retrieval

- [Code-symbol semantic retrieval](architecture/code-symbol-semantic-retrieval-v1.md) — typed, source-grounded symbol evidence and existing DAG/OaK ownership boundaries.
- [Repo-local capability-card contract](.okf/indexes/code-capability-knowledge-v1.yaml) — design-only `spec.card_kind` projections; canonical identity remains with Parent Atlas.
- [CODE-KNOW-01..18](../openspec/changes/parent-atlas-compiler-semantic-graph-resolution/tasks.md) — open schema, evidence, transport, and admission gates; no datastore writes authorized.

## Historical chunk resolution & revision qualification

- [Historical chunk resolver V2](reports/historical-chunk-resolver-receipt-v2.json) — `sha256:7361518695574c727d1fec4d03aac085ed549ef8e1b37c888dd9aaa5fe2de53d` — 38 verified current, 0 historical, 11 mismatched. Rebuild cohort: 12.
- Lineage safeguard: stale chunks matching older revisions are strictly prohibited from current repair (`eligibleForCurrentRepair: false`).

## Architecture documents

- [ACP-GEMMA4-MEMORY-HIERARCHY](docs/architecture/ACP-GEMMA4-MEMORY-HIERARCHY.md) — UNCLASSIFIED
- [ACP-TELEMETRY-DAILY-GRAPHIFY-FLOW](docs/architecture/ACP-TELEMETRY-DAILY-GRAPHIFY-FLOW.md) — UNCLASSIFIED
- [AGENTIC-ERROR-FIXING-ARCHITECTURE](docs/architecture/AGENTIC-ERROR-FIXING-ARCHITECTURE.md) — UNCLASSIFIED
- [AGENTIC-ERROR-FIXING-DIMENSIONAL-MODEL](docs/architecture/AGENTIC-ERROR-FIXING-DIMENSIONAL-MODEL.md) — UNCLASSIFIED
- [agentic-error-proposal-flow](docs/architecture/agentic-error-proposal-flow.md) — UNCLASSIFIED
- [agentic-openspec-tasks-error-fixing-playbook](docs/architecture/agentic-openspec-tasks-error-fixing-playbook.md) — UNCLASSIFIED
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
- [grpc-binary-memory-registry-master-todo](docs/architecture/grpc-binary-memory-registry-master-todo.md) — UNCLASSIFIED
- [grpc-binary-memory-registry-plan](docs/architecture/grpc-binary-memory-registry-plan.md) — UNCLASSIFIED
- [HEADROOM-COMPRESSION-CRYPTO-PROVENANCE-ALIGNMENT](docs/architecture/HEADROOM-COMPRESSION-CRYPTO-PROVENANCE-ALIGNMENT.md) — UNCLASSIFIED
- [kanban-parent-atlas-alignment](docs/architecture/kanban-parent-atlas-alignment.md) — UNCLASSIFIED
- [langextract-atlas-integrations](docs/architecture/langextract-atlas-integrations.md) — UNCLASSIFIED
- [legal-ai-parent-atlas-product-integration](docs/architecture/legal-ai-parent-atlas-product-integration.md) — UNCLASSIFIED
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
- [packet-truth-flow-canonical-pattern](docs/architecture/packet-truth-flow-canonical-pattern.md) — UNCLASSIFIED
- [PARENT_ATLAS_INSTRUCTION_AUTHORITY](docs/architecture/PARENT_ATLAS_INSTRUCTION_AUTHORITY.md) — UNCLASSIFIED
- [PARENT_ATLAS_PACKAGE_BOUNDARIES](docs/architecture/PARENT_ATLAS_PACKAGE_BOUNDARIES.md) — UNCLASSIFIED
- [PARENT_ATLAS_RECOMMENDATION_AND_RETRIEVAL_POLICY](docs/architecture/PARENT_ATLAS_RECOMMENDATION_AND_RETRIEVAL_POLICY.md) — UNCLASSIFIED
- [parent-atlas-karpathy-pipeline](docs/architecture/parent-atlas-karpathy-pipeline.md) — UNCLASSIFIED
- [parent-atlas-native-dawn-viewer-contract-v1](docs/architecture/parent-atlas-native-dawn-viewer-contract-v1.md) — UNCLASSIFIED
- [parent-atlas-policy-routing](docs/architecture/parent-atlas-policy-routing.md) — UNCLASSIFIED
- [parent-atlas-representation-structural-contract](docs/architecture/parent-atlas-representation-structural-contract.md) — UNCLASSIFIED
- [PARENT-ATLAS-STUDIO-AWARENESS-TOURNAMENT](docs/architecture/PARENT-ATLAS-STUDIO-AWARENESS-TOURNAMENT.md) — UNCLASSIFIED
- [parent-atlas-unreal-client-contract-v1](docs/architecture/parent-atlas-unreal-client-contract-v1.md) — UNCLASSIFIED
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
- [rtx-visual-enhancement-boundary-v1](docs/architecture/rtx-visual-enhancement-boundary-v1.md) — UNCLASSIFIED
- [runtime-owner-deduplication](docs/architecture/runtime-owner-deduplication.md) — UNCLASSIFIED
- [RUST-BACKEND-DECISION-TREE](docs/architecture/RUST-BACKEND-DECISION-TREE.md) — UNCLASSIFIED
- [scheduler-gpu-bridge-roadmap](docs/architecture/scheduler-gpu-bridge-roadmap.md) — UNCLASSIFIED
- [SESSION-84-MISSING-LAYERS-ANALYSIS](docs/architecture/SESSION-84-MISSING-LAYERS-ANALYSIS.md) — UNCLASSIFIED
- [storage-tier-schema](docs/architecture/storage-tier-schema.md) — UNCLASSIFIED
- [subgraph-instruction-programming-kag-ace-topology](docs/architecture/subgraph-instruction-programming-kag-ace-topology.md) — UNCLASSIFIED
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
- [local-llm-offload-ownership](openspec/changes/local-llm-offload-ownership) — 46/74 tasks (62%)
- [manual-migration-reconciliation](openspec/changes/manual-migration-reconciliation) — 98/131 tasks (75%)
- [parent-atlas-ace-bitfrost-cache-correctness](openspec/changes/parent-atlas-ace-bitfrost-cache-correctness) — 56/108 tasks (52%)
- [parent-atlas-ace-rlm-bitfrost-integration](openspec/changes/parent-atlas-ace-rlm-bitfrost-integration) — 888/1319 tasks (67%)
- [parent-atlas-adaptive-dag-fabric](openspec/changes/parent-atlas-adaptive-dag-fabric) — 11/13 tasks (85%)
- [parent-atlas-agentic-completion](openspec/changes/parent-atlas-agentic-completion) — 10/11 tasks (91%)
- [parent-atlas-agentic-file-compiler](openspec/changes/parent-atlas-agentic-file-compiler) — 56/81 tasks (69%)
- [parent-atlas-agentic-repair-bundle-integration](openspec/changes/parent-atlas-agentic-repair-bundle-integration) — 29/96 tasks (30%)
- [parent-atlas-agentic-repair-fabric](openspec/changes/parent-atlas-agentic-repair-fabric) — 41/42 tasks (98%)
- [parent-atlas-analysis-pass-ornith-adapter](openspec/changes/parent-atlas-analysis-pass-ornith-adapter) — 24/25 tasks (96%)
- [parent-atlas-best-fit-score-fabric](openspec/changes/parent-atlas-best-fit-score-fabric) — 422/714 tasks (59%)
- [parent-atlas-branch-merge-consolidation-aug20](openspec/changes/parent-atlas-branch-merge-consolidation-aug20) — 18/35 tasks (51%)
- [parent-atlas-candidate-feature-execution-fabric](openspec/changes/parent-atlas-candidate-feature-execution-fabric) — 306/466 tasks (66%)
- [parent-atlas-canonical-directory-ingestion-fabric](openspec/changes/parent-atlas-canonical-directory-ingestion-fabric) — 21/66 tasks (32%)
- [parent-atlas-code-ingestion-pipeline](openspec/changes/parent-atlas-code-ingestion-pipeline) — 26/35 tasks (74%)
- [parent-atlas-code-intel-e2e](openspec/changes/parent-atlas-code-intel-e2e) — 2/19 tasks (11%)
- [parent-atlas-compiler-semantic-graph-resolution](openspec/changes/parent-atlas-compiler-semantic-graph-resolution) — 40/89 tasks (45%)
- [parent-atlas-compute-rank-cache-eval-dspy-gepa](openspec/changes/parent-atlas-compute-rank-cache-eval-dspy-gepa) — 37/148 tasks (25%)
- [parent-atlas-deep-research-ingestion](openspec/changes/parent-atlas-deep-research-ingestion) — 6/7 tasks (86%)
- [parent-atlas-document-governance-master-index](openspec/changes/parent-atlas-document-governance-master-index) — 52/69 tasks (75%)
- [parent-atlas-error-embedding-768-migration](openspec/changes/parent-atlas-error-embedding-768-migration) — 12/25 tasks (48%)
- [parent-atlas-gate2-chunk-lineage-convergence](openspec/changes/parent-atlas-gate2-chunk-lineage-convergence) — 3/20 tasks (15%)
- [parent-atlas-governed-compute-fabric](openspec/changes/parent-atlas-governed-compute-fabric) — 2/178 tasks (1%)
- [parent-atlas-gpu-graph-vector-substrate](openspec/changes/parent-atlas-gpu-graph-vector-substrate) — 2/27 tasks (7%)
- [parent-atlas-gpu-prellm-recommendation-v1](openspec/changes/parent-atlas-gpu-prellm-recommendation-v1) — 35/37 tasks (95%)
- [parent-atlas-gpu-runtime-abi-alignment](openspec/changes/parent-atlas-gpu-runtime-abi-alignment) — 17/22 tasks (77%)
- [parent-atlas-gpu-sidecar-patch-tournament](openspec/changes/parent-atlas-gpu-sidecar-patch-tournament) — 17/114 tasks (15%)
- [parent-atlas-graph-analysis-contract](openspec/changes/parent-atlas-graph-analysis-contract) — 62/84 tasks (74%)
- [parent-atlas-graph-retrieval-proof](openspec/changes/parent-atlas-graph-retrieval-proof) — 165/293 tasks (56%)
- [parent-atlas-graph-runtime-enhancement](openspec/changes/parent-atlas-graph-runtime-enhancement) — 4/10 tasks (40%)
- [parent-atlas-graph-runtime-python-consolidation](openspec/changes/parent-atlas-graph-runtime-python-consolidation) — 20/30 tasks (67%)
- [parent-atlas-graph-validation-fabric](openspec/changes/parent-atlas-graph-validation-fabric) — 61/94 tasks (65%)
- [parent-atlas-graphify-recovery-proof-ladder](openspec/changes/parent-atlas-graphify-recovery-proof-ladder) — 4/9 tasks (44%)
- [parent-atlas-grounded-knowledge-fabric](openspec/changes/parent-atlas-grounded-knowledge-fabric) — 14/25 tasks (56%)
- [parent-atlas-kafka-projection-initiative](openspec/changes/parent-atlas-kafka-projection-initiative) — 0/7 tasks (0%)
- [parent-atlas-kv-cache-adaptation-research](openspec/changes/parent-atlas-kv-cache-adaptation-research) — 12/92 tasks (13%)
- [parent-atlas-memory-architecture-freeze](openspec/changes/parent-atlas-memory-architecture-freeze) — 44/57 tasks (77%)
- [parent-atlas-ml-graph-retrieval-convergence](openspec/changes/parent-atlas-ml-graph-retrieval-convergence) — 72/254 tasks (28%)
- [parent-atlas-multi-agent-wave-plan](openspec/changes/parent-atlas-multi-agent-wave-plan) — 21/36 tasks (58%)
- [parent-atlas-native-acceleration-cabi](openspec/changes/parent-atlas-native-acceleration-cabi) — 39/63 tasks (62%)
- [parent-atlas-neural-prefill-encoder](openspec/changes/parent-atlas-neural-prefill-encoder) — 1531/2215 tasks (69%)
- [parent-atlas-nlp-sidecar-feature-compiler](openspec/changes/parent-atlas-nlp-sidecar-feature-compiler) — 102/154 tasks (66%)
- [parent-atlas-observation-routing-fabric](openspec/changes/parent-atlas-observation-routing-fabric) — 19/26 tasks (73%)
- [parent-atlas-okf-knowledge-layers](openspec/changes/parent-atlas-okf-knowledge-layers) — 39/53 tasks (74%)
- [parent-atlas-onnx-webgpu-embedding-promotion](openspec/changes/parent-atlas-onnx-webgpu-embedding-promotion) — 15/21 tasks (71%)
- [parent-atlas-ontology-kernel](openspec/changes/parent-atlas-ontology-kernel) — 227/360 tasks (63%)
- [parent-atlas-ontology-oaklib-fanout-bitmap](openspec/changes/parent-atlas-ontology-oaklib-fanout-bitmap) — 33/36 tasks (92%)
- [parent-atlas-opencode-replay-proof](openspec/changes/parent-atlas-opencode-replay-proof) — 2/19 tasks (11%)
- [parent-atlas-openspec-task-triage-pipeline](openspec/changes/parent-atlas-openspec-task-triage-pipeline) — 12/54 tasks (22%)
- [parent-atlas-openspec-tasks-audit-fabric](openspec/changes/parent-atlas-openspec-tasks-audit-fabric) — 16/18 tasks (89%)
- [parent-atlas-pass-fabric](openspec/changes/parent-atlas-pass-fabric) — 36/184 tasks (20%)
- [parent-atlas-pca-svd-representation-baseline](openspec/changes/parent-atlas-pca-svd-representation-baseline) — 7/18 tasks (39%)
- [parent-atlas-policy-routing-integration](openspec/changes/parent-atlas-policy-routing-integration) — 36/40 tasks (90%)
- [parent-atlas-prefill-routing-residency-convergence](openspec/changes/parent-atlas-prefill-routing-residency-convergence) — 127/167 tasks (76%)
- [parent-atlas-qdrant-structural-payload-enrichment](openspec/changes/parent-atlas-qdrant-structural-payload-enrichment) — 17/23 tasks (74%)
- [parent-atlas-query-routing-classifier](openspec/changes/parent-atlas-query-routing-classifier) — 47/107 tasks (44%)
- [parent-atlas-repair-candidate-feature-matrix](openspec/changes/parent-atlas-repair-candidate-feature-matrix) — 135/174 tasks (78%)
- [parent-atlas-retrieval-executor-compatibility-convergence](openspec/changes/parent-atlas-retrieval-executor-compatibility-convergence) — 39/48 tasks (81%)
- [parent-atlas-retrieval-fusion-reachability](openspec/changes/parent-atlas-retrieval-fusion-reachability) — 119/144 tasks (83%)
- [parent-atlas-retrieval-lineage-dag-convergence](openspec/changes/parent-atlas-retrieval-lineage-dag-convergence) — 824/1080 tasks (76%)
- [parent-atlas-retrieval-lod-algorithm-taxonomy](openspec/changes/parent-atlas-retrieval-lod-algorithm-taxonomy) — 52/109 tasks (48%)
- [parent-atlas-retrieval-logic-convergence](openspec/changes/parent-atlas-retrieval-logic-convergence) — 32/74 tasks (43%)
- [parent-atlas-rrf-fusion-consolidation](openspec/changes/parent-atlas-rrf-fusion-consolidation) — 5/6 tasks (83%)
- [parent-atlas-search-classifier-sidecar](openspec/changes/parent-atlas-search-classifier-sidecar) — 70/88 tasks (80%)
- [parent-atlas-semantic-512-canonicalization](openspec/changes/parent-atlas-semantic-512-canonicalization) — 23/31 tasks (74%)
- [parent-atlas-semantic-768-canonical-contract](openspec/changes/parent-atlas-semantic-768-canonical-contract) — 52/78 tasks (67%)
- [parent-atlas-telemetry-lowrank-recommendation-okf-integration](openspec/changes/parent-atlas-telemetry-lowrank-recommendation-okf-integration) — 2/31 tasks (6%)
- [parent-atlas-tensor-residency-integration](openspec/changes/parent-atlas-tensor-residency-integration) — 121/202 tasks (60%)
- [parent-atlas-topology-representation-admission](openspec/changes/parent-atlas-topology-representation-admission) — 20/29 tasks (69%)
- [parent-atlas-transport-memory-boundaries](openspec/changes/parent-atlas-transport-memory-boundaries) — 44/93 tasks (47%)
- [parent-atlas-unordered-execution-contract](openspec/changes/parent-atlas-unordered-execution-contract) — 7/26 tasks (27%)
- [parent-atlas-versioned-doc-intelligence](openspec/changes/parent-atlas-versioned-doc-intelligence) — 57/97 tasks (59%)
- [parent-atlas-workboard-feature-utility-fabric](openspec/changes/parent-atlas-workboard-feature-utility-fabric) — 28/70 tasks (40%)
- [parent-atlas-workspace-snapshot-runtime](openspec/changes/parent-atlas-workspace-snapshot-runtime) — 6/35 tasks (17%)
- [parent-atlas-workstation-domain-classifier](openspec/changes/parent-atlas-workstation-domain-classifier) — 127/190 tasks (67%)
- [parent-atlas-xgboost-cuda-runtime-proof](openspec/changes/parent-atlas-xgboost-cuda-runtime-proof) — 12/30 tasks (40%)
- [route-import-infra-isolation](openspec/changes/route-import-infra-isolation) — 16/17 tasks (94%)

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
- Decoder contract: `semantic_768` → physical `latent_256` → derived `latent_128`/`latent_64`; `canonicalAuthority=false`, `textSynthesis=false`, and `writesPerformed=false`.
- Ornith remains the synthesis/tool-use owner; PostgreSQL remains canonical storage/lineage authority; Qdrant and GPU residency remain rebuildable execution/projection layers.
- Open GPU gates: FEAT-04 envelope, owner-process residency reuse, decoder replay, cuTile parity, CUDA SIMT parity, and RMM allocator evaluation.
- Quantization & Training Contract: NF4 (NormalFloat4) supported by Ampere RTX 3060 Ti via PyTorch/bitsandbytes for small LoRA adapters (1B–3B); concurrent QLoRA training of Ornith 9B blocked while llama-server (:8090) occupies VRAM. LibTorch and TensorRT remain independent inference backends.
- Storage & Resource Precondition: C: free space stabilized to 9.42 GB free (10,113,802,240 bytes, up from 3.1 GB) via ClickHouse system log partition drops and Qdrant snapshot pruning. Docker AppData footprint lowered from 175 GB to ~145 GB.

## Backend Table of Contents (TOC) mappings for agentic LUTs

| Backend Storage Plane | Primary Index Key | Resolution / Coordinate Type | Role in Agentic LUT Routing | Gating / Mutation Authority |
| :--- | :--- | :--- | :--- | :--- |
| `feature_ontology_tuples` | `packet_key`, `feature_key` | Feature-level relations | Fine-grained symbol & AST concept relations | Non-admitted until `resolved_concept_id` matches active ontology revision |
| `registry_ontology_tuples` | `packet_key`, `tuple_type` | Macro registry tuples | Cross-packet lineage and corroboration counts | Materialization version gate; tracks corroboration |
| `ontology_domain_tuples` | `packet_key`, `domain_class` | Domain partition classes | Fast DAG dispatch (`backend`, `frontend`, `legal`) | Routing and budget allocation only; never promotes identity |
| `codebase_chunk_index` | `chunk_id`, `source_ref` | `CHUNK_LEVEL_ORDINAL_MATCH` | Text span and vector retrieval target (`semantic_768`) | Read-only target for dense and lexical search lanes |
| `atlas_packets` | `packet_id`, `source_ref` | `PACKET_LEVEL_ORDINAL_MATCH` | Canonical workspace provenance and source revision | Canonical storage owner; immutable source byte anchor |

### Invariants for Agentic LUT Consumers
- **Explicit Ordinal Match Scope**: Consumers must discriminate `PACKET_LEVEL_ORDINAL_MATCH` from `CHUNK_LEVEL_ORDINAL_MATCH` and `SYMBOL_VERSION_EXACT_MATCH`.
- **Fail-Closed Resolution**: Concept relations missing a verified `resolved_concept_id` are strictly non-promotional.
- **Outbox Write Isolation**: Agentic tools and MCP routines must route state modifications through `promotion_outbox` rather than directly mutating canonical LUT tables.

## Lexical retrieval score-source labels (LUT, added 2026-10-12)

| `scoreSource` | Backend | Built-in or extension | Produced by | Scoring treatment |
|---|---|---|---|---|
| `postgres_fts` | PostgreSQL native full-text search: `ts_rank(search_vector, to_tsquery('english', …))` on `codebase_chunk_index` (GIN index) | **Built-in** (not an extension) | `retrieveBM25` in `src/lib/server/retrieval/retrieve-candidates.ts` | Maps to `bm25Score` (`candidate-scorer.ts`). Summary hydration applies (`hydrate-candidates.ts`). |
| `postgres_trigram` | PostgreSQL `pg_trgm` similarity / ILIKE substring fallback | `pg_trgm` is an **extension** | `retrieveBM25Trigram` (fallback) in `retrieve-candidates.ts` | Maps to `bm25Score` for backward compatibility. Excluded from summary hydration. |
| `pg_search` BM25 | ParadeDB `pg_search` BM25 index (`idx_codebase_chunk_pgsearch_bm25`) | **Extension** (`pg_search` 0.25.1) | Not wired into the production lane | Challenger only. Not a retrieval vote. |
| `rg_keyword` | ripgrep lexical scan | external CLI | ripgrep lane | Summary-stale check only. |

Rules:
- The label names the executor, not the algorithm. `postgres_fts` is not BM25 in the strict sense (`ts_rank` is not Okapi BM25).
- A label change must update every consumer that branches on it: `candidate-scorer.ts`, `hydrate-candidates.ts`, and the spec fixtures.
- Legacy codec `legacy_fnv1a_logtf_l2_v1` (`src/lib/server/vector/bm42-sparse.ts`) is not BM42 and has no `scoreSource`.
- Verified 2026-10-12: a live `retrieveBM25('retrieval search')` returned 50 candidates, top score 0.97.

## Ingestion and retrieval glossary

Definitions are maintained in the canonical [`.okf` Parent Atlas ingestion glossary](../.okf/architecture/parent-atlas-ingestion-agent-integrations-glossary-v1.md) (repo-root `.okf/`, the more detailed copy with source refs). The `docs/.okf/` copy is a older 67-line duplicate pending archive.

| Term | Definition | Current role / boundary |
|---|---|---|
| `Firecrawl` | Optional web crawl/fetch acquisition; retain provider, URL, time, and content digest. | Acquisition and staging only; not source admission. Staged in crawler tables, never direct to `atlas_packets`. |
| `BeautifulSoup` | Python HTML/XML tree parser (`beautifulsoup4` in Miniforge `:8095`). | Parsing/extraction only on already-acquired markup; does not fetch or write to stores. |
| `n-gram` / `trigram` | N adjacent tokens/characters; `pg_trgm` provides PostgreSQL three-character similarity/pattern operators. | Feature/fuzzy lexical fallback (`postgres_trigram`), distinct from FTS. Excluded from summary hydration. |
| PostgreSQL FTS | Built-in `tsvector` queries ranked by `ts_rank`/`ts_rank_cd`. | Primary lexical lane (`postgres_fts`); returns up to 50 candidates in <10ms; mapped to `bm25Score`. |
| `BM25` | Term-frequency/inverse-document-frequency ranking. | `pg_search` (ParadeDB) installed as challenger (`idx_codebase_chunk_pgsearch_bm25`); not active production vote. |
| `pgvector` / `HNSW` | PostgreSQL vector types/operators and an approximate-neighbor index option (`content_embedding_768`). | Existing `semantic_768` executor (219,998 vectors); canonical truth owner behind Qdrant. |
| Qdrant snapshot / upsert | Snapshot captures collection state; upsert replaces point state for an ID. | 43 of 48 collections hold at least one snapshot (38 hold one, 5 hold two). Rebuildable only where a rebuild path is verified; none tested yet. |
| Hash map / dictionary | In-memory key/value lookup. | Cache/lookup only; not durable identity, uniqueness, or admission. |
| Bag-of-words / n-gram | Sparse term counts / adjacent token-or-character features. | Lexical feature representations with versioned tokenization. |
| Tuple / graph | Typed record / nodes and typed edges. | Graph projections require evidence-bound edge admission; similarity is not ontology. |
| Matrix / tensor / GEMM / cuBLAS | Dense numeric arrays and GPU matrix multiplication. | Numeric execution only; RTX 3060 Ti sidecar (`:8098`) is execution-only (`writesPerformed: false`). |
| `rg` / `sed` | Ripgrep search / stream editing. | Source-navigation utilities, not parsers or canonical indexers. |
| RAPIDS / cuVS / cuGraph | GPU data processing / vector search / graph analytics libraries. | Optional executors over frozen qualified inputs, never canonical owners. |
| Agentic dense search / LUT | Dense candidate retrieval plus identity, revision, evidence, and tool-permission checks. | Advisory routing; one semantic vote, no direct mutation authority. |
| Agentic error fixing LUT | Intended memory of diagnostic traces and verified fixes (`fixer_memory_768`). | Not yet populated: `fixer_memory_768` holds 0 points (verified 2026-10-12). No verified repair-pattern LUT exists; do not treat as active. |

## Lineage and duplicate key findings (verified 2026-10-12)

### `codebase_chunk_index` Uniqueness and Duplicate Key Analysis
- **Constraint Facts**: In PostgreSQL `codebase_chunk_index`, unique constraints exist on `id (uuid)` (primary key) and `qdrant_id` (`codebase_chunk_index_qdrant_id_unique`). There is **no unique constraint on `(chunk_id, content_hash)`**.
- **Duplicate Pairs**: Exactly 726 duplicate groups exist (1,452 total rows) sharing `(chunk_id, content_hash)` and `(chunk_id, source_ref)`. Each group has exactly 2 rows.
- **Null Counts**: Exactly 37 rows have `chunk_id IS NULL` and 37 rows have `content_hash IS NULL`.
- **Column-by-Column Diff Evidence**:
  - `id`: Distinct UUIDs per row.
  - `qdrant_id`: One row carries a legacy numeric string ID (e.g. `'1413774487'`), while the other row carries a modern UUID string ID (e.g. `'6462eb27-708f-9377-a9af-131453ce05c5'`).
  - `summary`: Two slightly different generated summaries from separate historical indexing passes.
  - `search_vector`: Differing tsvectors reflecting the slightly distinct summaries.
  - `indexed_at` / `updated_at`: Timestamps from different ingestion epochs.
- **Lineage Boundary Rule**: Joins between PostgreSQL and Qdrant must anchor on `qdrant_id` $\leftrightarrow$ `qdrant_point_id` or `id (uuid)`. Deduplication requires an explicit promotion receipt confirming active Qdrant point mapping before pruning legacy rows.

### Qdrant Collection and Snapshot Census (live readback 2026-10-12)
- **Current inventory**: `.tmp/atlas/production-hardening-seed-20261012/qdrant-pruning-audit-v2.json` records 18/18 collections, 18 API-visible snapshots totaling 5,163,315,712 bytes, zero aliases, zero empty collections, and no `*384*` collection. All collection and snapshot endpoints succeeded after bounded GET retries. The former 48-collection census is historical and must not be presented as current.
- **Snapshot distribution**: 5 live collections have two snapshots, 8 have one, and 5 have none. The container has 43 collection-named snapshot directories plus `tmp`; 30 names are absent from the live collection API, of which 28 contain 7,403,776 bytes and 2 are empty (`codebase_chunks_384`, `codebase_chunks_384_hybrid`). Thus the 384 collections and snapshot payload files are gone, but their empty directory shells remain. The other non-current snapshot data is not classified for deletion. Snapshot retention, consumer/rollback value, and isolated restore compatibility remain open; no snapshot is deletion-authorized.
- **Inventory fields**: the receipt captures point counts, reported vector counts, named vector dimensions/metrics, HNSW and optimizer configuration, payload schemas, aliases, snapshot names/checksums/bytes/times, and literal source-reference matches. `vectors_count` is not supplied by this API readback; source-reference matches do not prove runtime use.
- **Representation separation**: `semantic_768` / EmbeddingGemma remains the canonical semantic contract. The live Qdrant API has no 384 collection, but PostgreSQL `atlas_packets.content_embedding_384` remains populated on 58,109 rows; its producer/model and archive provenance are unresolved. Do not claim that data was dropped or infer MiniLM from dimension alone.
- **Sparse status**: no validated BM42 encoder or live sparse 384 collection is established. The historical hashed-sparse adapter is not BM42 and is explicit-opt-in; the default SearchRuntime does not enable it. PostgreSQL FTS remains the lexical baseline.
- **Recovery rule**: PostgreSQL authority does not make Qdrant snapshots disposable. Do not prune or rebuild until exact backup/rollback roles, aliases, source lineage, and isolated restore/readback are proven.

## Naive Bayes (readiness, 2026-10-13)

Status: **NOT READY.** The dry run is READY, but the model cannot discriminate and the apply step is not gated.

| Requirement | Status | Evidence | Needed |
|---|---|---|---|
| Multi-class model | NOT_PROVEN | `.tmp/semantic-naive-bayes-model.json` (`nb-packet-features-v1`): one class (`SemanticError`), trained on 20 rows | Reject any training run with fewer than two classes. Retrain on a reviewed set. |
| Label source | NOT_PROVEN | Trainer assigns labels from keyword rules, defaulting to `VectorError` | Independently reviewed labels, at least 200 rows and 30 per class (the trust floor in CLAUDE.md). Rule labels may serve only as a labelled baseline, stated as such. |
| Feature contract | NOT_PROVEN | Model tokens (`has_ast_symbols`, `has_lexical_features`, `has_used_concepts`, `qdrant_point_id_present`, `source:`) differ from apply tokens (`has_ast`, `has_lex`, `has_concepts`, `has_qdrant`, `*_tok:`). Most apply tokens are absent from the model. | One shared token schema, versioned, imported by both trainer and apply. |
| Parameter coverage check | MISSING | Apply has no coverage report | Apply fails closed if too few tokens match the model vocabulary. Report coverage per run. |
| Embedding presence flag | CREATED | `has_embedding` checks the 768 `embedding` (2026-10-13) | Retrain or re-verify after the feature contract changes. |
| Held-out evaluation | NOT_PROVEN | None | Split by packet or source, not by row. Report macro F1 and calibration against a majority-class baseline. |
| Dry run | DRY_RUN_PROVEN (mechanics only) | 500 rows READY, 0 written | Dry run must also show more than one distinct prediction before any write. Current: 1. |
| Apply (DB write) | BLOCKED | `atlas_packet_metrics.naive_bayes_predictions` | Requires explicit approval after the gates above. |

Blocking order: label review → feature contract → retrain with held-out evaluation → coverage check → dry run with more than one class → approved apply.

The Naive Bayes model is not evidence for retrieval or routing until these gates pass. Its predictions must not be cited as classification results.

### Naive Bayes: verified root cause, compute, and graph inputs (2026-10-13)

| Item | Finding | Status |
|---|---|---|
| Training set size | Trainer SQL requires `array_length(apf.used_concepts, 1) > 0` (`sveltekit-frontend/scripts/atlas/train-naive-bayes-packet-classifier.py:125`). The saved model has 20 training rows, one class. | VERIFIED_READ_ONLY |
| Feature mismatch | Trainer: TF-IDF over space-joined lexical strings. Apply: prefixed tokens (`ast_tok:`, `has_ast`, `has_embedding`). | VERIFIED_READ_ONLY |
| RTX GPU | Not needed. Naive Bayes is scikit-learn on CPU. The GPU lane has no role in this classifier. | NOT_APPLICABLE |
| NetworkX / PageRank | The apply step uses a PageRank value (`page_rank_score` or `pagerank`) as a presence token (`has_pagerank`). Its source is the CPU graph path; NetworkX is the CPU oracle, not GPU. A PageRank feature needs its own parity proof before it counts as evidence. | NOT_PROVEN as a feature |
| cuGraph / cuVS | Not in this pipeline. | NOT_APPLICABLE |

Requirement addition: any graph feature in the shared token schema must come from a frozen, revision-qualified graph snapshot, with the CPU NetworkX result as the reference. GPU graph execution is out of scope for Naive Bayes until that parity exists.

`.tmp` cleanup note: `.tmp/merge-validation-20260912` and `.tmp/verify-merged-main-409a` are registered git worktrees. Remove them with `git worktree remove --force <path>`, not by deleting the folder. Removal deletes files and needs your approval.
