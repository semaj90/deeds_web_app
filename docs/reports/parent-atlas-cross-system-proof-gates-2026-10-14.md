# Parent Atlas Cross-System Proof Gates — 2026-10-14

## Scope and score

This report audits the proposed `.okf` → PostgreSQL retrieval → graph/NetworkX → MCP/OAK → ContextManifest/agent-evaluation path. It is based on repository source/tests, the checked WSL `atlas-rapids-cu13` environment, the repository OpenWiki quickstart, and the focused validations listed below. OpenWiki retrieval tools were unavailable, so no generated wiki search was performed.

The attached scratch receipt records **3 of 13 checks passed (23.1%)**. This is only the fraction of this fixed proof checklist with explicit PASS evidence. Source presence, mock/fixture tests, old receipts, and unrun live checks are not counted as passes. This is not an overall Parent Atlas completion percentage or a Phase 1–24 score; those phases use multiple roadmaps and lack one shared denominator.

## Findings

### PostgreSQL retrieval

- The repository already defines the FTS owner: `codebase_chunk_index.search_vector`, a trigger-maintained weighted `tsvector`, and a GIN index in `sveltekit-frontend/drizzle/0019_bm25_search_vector.sql`.
- Native PostgreSQL FTS is not true BM25. Keep the existing `POSTGRES_FTS_AST`/FTS lane naming; do not add a duplicate FTS table or index.
- Source-revision identity and index maintenance must remain in the existing admitted chunk/index writer. The trigger can derive `search_vector` on insert/update; it does not itself qualify source/chunk identity or prove successful readback.
- B-tree is appropriate for exact identifiers and ordered snapshot-scoped joins; GIN is appropriate for the existing `tsvector` and suitable containment workloads. PostgreSQL's planner may combine indexes using bitmap scans; “AIO bitmap” is not a separate index type or schema owner.
- **Not verified in this pass:** live `indisvalid`/`indisready`, row coverage, query plans, write/readback parity, and whether each proposed upsert would satisfy the current source-revision admission contract. No SQL writes or DDL were run.

### Source paths and WSL2

- Store canonical repository-relative POSIX paths such as `python/module.py`, with repository/workspace identity and source revision in their separate fields.
- `C:\...`, `/mnt/c/...`, and `/home/...` may be local locators used by an adapter to read bytes, but must not become canonical cross-runtime `source_ref` values. Resolve against an explicit repository root and reject paths escaping it before source inspection.
- No WSL path-conversion or source-byte readback proof was run here. The earlier 371-entry Tree-sitter catalog is a grammar-ID candidate catalog, not a source inventory, parser readiness matrix, or LSP catalog.

### Graph and MCP

- Shared graph snapshot/node/edge/relation tables and traversal indexes already have owners under `sveltekit-frontend/drizzle/0112_parent_atlas_graph_v2.sql` and `20260819_atlas_graph_traversal_indexes.sql`. They are snapshot-scoped; do not create one physical table per graph.
- NetworkX is an analysis/reference executor, not a canonical source of graph identity. The cited `docs/reports/atlas-resident-bfs-proof-2026-10-13.json` explicitly declares `FIXTURE_ONLY` and `liveBfsRequestPerformed=false`; `python/tests/test_resident_bfs_proof.py` constructs an in-memory graph and substitutes `FakeCuGraph` rows. This proves local contract behavior, not a live resident graph, database readback, or GPU traversal.
- The source tree contains MCP tool registrations, including graph and diagnostic surfaces. This turn did not call live MCP tools or establish current service health, schemas, read-only enforcement, or response receipts.

### `.okf`, Python sidecar, and optimization

- The Tree-sitter catalog validator and adapter were tested previously in this session; catalog entries remain `CANDIDATE`, with no LSP bindings and no claim that every listed grammar is installed.
- In the inspected WSL environment, FastAPI, Pydantic, NetworkX, Tree-sitter language pack, and PyTorch imported; OAKlib, Python LangChain, Deep Agents, and DSPy/GEPA were absent. Node dependency declarations for LangChain/Deep Agents do not establish Python integration or safe execution.
- OAK semantic checks, a live FastAPI request, a bounded live MCP call, a ContextManifest admission/readback, and GEPA baseline-vs-optimized held-out evaluation remain unproven.
- GEPA must wait for a frozen reviewed evaluation set, deterministic baseline, evidence-grounding metric, calibrated abstention, held-out split, and reproducible model/prompt/runtime revisions. Optimizing before those inputs exist would produce no defensible gain claim.

## Validation receipt

Machine-readable checklist: `.tmp/atlas/parent-atlas-cross-system-proof-gates-v1.json`.

Passed checks are limited to the candidate catalog Python validation, the existing language-registry adapter tests, and strict validation of the two updated OpenSpec changes. Live data stores, MCP services, caches, and models were not called or modified.

## Recommended next sequence

1. Validate the full `.okf` corpus against each owning schema; emit per-file results and checksums, rejecting duplicate YAML keys and unknown schema versions.
2. Run the existing **read-only** PostgreSQL FTS/index audit. Record live columns, trigger/function definitions, index validity/readiness, bounded row-coverage counts, and representative query plans.
3. Choose one already admitted repository-relative source and prove exact bytes → source revision → packet/chunk identity → FTS row → independent readback. Do not upsert unqualified WSL home-path rows.
4. Freeze one graph snapshot and prove canonical node/typed-edge identity and source provenance before replaying bounded NetworkX traversal.
5. Exercise already-registered MCP tools in a verified read-only mode; record tool schema, bounded request, service revision, response checksum, and zero-side-effect evidence.
6. Validate ontology tuples through the existing OAK boundary once OAKlib is installed in the intended runtime; compare against PostgreSQL authority without writes.
7. Only after the above, run a frozen DSPy/GEPA evaluation. Report held-out metrics; do not optimize against the same examples used for training/reflection.

No PostgreSQL upsert, schema/index change, Graphify refresh, source indexing, ACE/Valkey write, Qdrant write, model call, or agent dispatch occurred in this review.
