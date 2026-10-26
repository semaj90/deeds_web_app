# Domain Classification and Agentic Indexing Implementation V1

- status: IMPLEMENTATION_PLAN / NON-AUTHORITY
- canonical_authority: false
- persistence_or_migration: none
- scope: connect existing `.okf`, source, packet, taxonomy, retrieval, symbol, graph, ACE, and cache owners

## Goal

Make a query such as “find the cache-to-ACE implementation and propose a safe fix” resolve through existing source/document owners, return revision-qualified code and documentation candidates, and produce an inspect-only plan. This document defines the order of work; it does not claim a live index, ontology admission, ContextManifest, or model receipt.

## Record shape and storage boundaries

Use a bounded JSON array of proposal records at ingestion boundaries, not a new universal database table or linked-list key chain. Every element keeps identity namespaces and revisions separate:

```json
{
  "schema": "atlas.domain-classification-proposal.v1",
  "sourceRef": "owner-issued-reference",
  "sourceRevision": "owner-issued-revision",
  "workspaceRevision": null,
  "packetKey": null,
  "domainLabels": [{"label": "retrieval", "confidence": 0.0, "evidenceRefs": []}],
  "featureLabel": null,
  "summary": null,
  "representation": null,
  "ontologyTupleRefs": [],
  "status": "PROPOSAL_ONLY"
}
```

The JSON above remains a storage-neutral illustration. The `.okf` JSON Schema is `docs/.okf/schemas/domain-classification-batch-v1.schema.json`; the runtime strict row and batch Zod contracts are in `okf-cross-domain-v1.ts`, and JSON Schema/Zod parity still needs review. `buildOkfDomainClassificationProposalArrayV1()` composes the single-candidate adapter into a bounded, deterministically ordered `rows[]` proposal batch (maximum 500 candidates), rejecting duplicate subject/source-revision identities and validating every returned envelope against the batch Zod schema. It returns `UNAVAILABLE` if any candidate lacks evidence refs. Rows use canonical deterministic labels only. The adapter does not verify supplied source revisions against bytes or authorize persistence. `featureLabel`, summary, domain labels, ontology IDs, packet identity, and admission status remain distinct. Missing owner revisions stay null/unavailable; no producer revision may fill them.

### Classification rows and future upsert mapping

The current `feature_domain_facts` Drizzle owner has the unique key `(packet_key, classifier_version, content_hash)`, but the proposal contract is keyed by `subjectRef`, `subjectKind`, `sourceRevision`, and `taxonomyRevision`. These are not interchangeable keys. In particular, `classifierVersion` is not a safe substitute for `taxonomyRevision`, and `sourceRef` is not a packet key. Until the existing packet/source resolver can prove a unique packet and the table can preserve all required revisions and digest semantics, `rows[]` remains an inspect-only proposal and no `INSERT ... ON CONFLICT`, `ALTER TABLE`, or migration is specified here.

Any future persistence proposal must map each proposal to an independently resolved packet key, retain workspace/source/taxonomy/classifier/producer revisions without substitution, use the canonical content digest for the exact declared byte representation, and perform an idempotent write followed by independent readback. A schema migration is a separate reviewed decision after the current owner/readback contract is established; PostgreSQL 18 AIO, bitmap scans, GIN/BTREE/pgvector are execution/index choices, not a new table contract or correctness requirement.

### Index planes and row ownership

The indexing target is a set of projections over the existing identity spine, not one all-purpose table:

| Plane | Row/key source | Intended lookup | Write/readiness boundary |
| --- | --- | --- | --- |
| Documentation | reviewed `.okf` publication envelope + canonical document/source revision | exact source ID, URL/scope, lexical/FTS | cohort reconciliation before publication |
| Code and chunks | canonical packet/chunk registry + `CandidateOrdinalMapV1` | packet/source revision, chunk span, ordinal | exact source and chunk lineage readback |
| Domain/feature labels | `feature_domain_facts` and taxonomy owner | packet + classifier/content digest; label filters | proposal crosswalk is `MATCHED_NOT_ADMITTED`; no upsert yet |
| Dense retrieval | canonical `semantic_768` rows; Qdrant `content` is a rebuildable mirror | pgvector/Qdrant nearest candidates | eligible packet/chunk and embedding-recipe receipt |
| Symbols and documentation links | canonical symbol/version rows + exact source/doc spans | symbol version/name ↔ ordinal arrays ↔ document refs | diagnostic LUT only until authorized owner readbacks |
| Graph | admitted typed relations projected to incidence/CSR | bounded neighborhood and graph lane | no live admitted snapshot established |
| Cache/residency | existing Valkey/BitFrost descriptors and centroid manifests | bounded revision-qualified hint lookup | cache miss falls through; never identity/evidence |

Use JSON Schema/Zod-validated `rows[]` as an interchange/proposal envelope; it is not a PostgreSQL table definition. `feature_label` is a display/feature-registry value, never derived from summary text or substituted for `domain_class`, taxonomy ID, `title_id`, packet key, or ontology tuple. Preserve `title_id` as the three-part display identifier contract already recorded in the title ledger. Do not add columns, tables, conflict keys, or `ON CONFLICT` SQL until an owner proves where every proposal revision and the exact canonical content-digest representation are stored and independently read back. Existing FTS/GIN/B-tree/pgvector indexes remain the starting point; PostgreSQL AIO and bitmap scans are planner behavior, not schema objects.

The initial implementation is CPU-only and read-only: reconcile source cohorts, build bounded candidate/doc batches, run existing lexical/AST/symbol/semantic/graph owners on frozen inputs, and preserve SearchRuntime as the single ranking/fusion owner. SIMDJSON/N-API, workers, DuckDB, GPU/cuVS/cuGraph, centroids, PCA/SVD, radix sort, and 4D coordinates are later challengers/derived features, never an indexing prerequisite or identity authority.

### Proof-chain persistence gap

Source declarations show a concrete blocker for the objective's owner-driven `ProofChainVerifierV1`: `createDrizzleContextManifestPersistence()` in `sveltekit-frontend/src/lib/server/ace/context-compiler.parent-atlas.ts` persists the legacy ACE `ContextManifest`, while `buildContextManifestV2()` in `sveltekit-frontend/src/lib/server/atlas/graph/context-manifest-v2.ts` builds a different contract. The `atlas_context_manifests` migration stores request/feature/source-ref arrays, packet selections, token counts, and policy version, but not a serialized `ContextManifestV2`, its canonical identity checksum, selected evidence revisions, or an independent-readback receipt. It cannot currently serve as a V2 readback owner. For ontology tuples, the manual additive migration declares `source_revision` and `workspace_revision`; the verifier must still read these values from the authoritative tuple row and verify them against the source/evidence receipt.

The fixture-only proof-chain verifier still cannot become `LIVE_PROVEN`. A design-unapplied Postgres readback extension now stores the exact V2 envelope under its existing `identityChecksum` plus a full-payload checksum; the read owner recomputes both checksums and returns only `READBACK_MATCH_NOT_ADMITTED`. The migration has not been applied and the admission producer is not wired. The required next artifact is an owner-approved read-only readback contract for task admission, tuple identity/source/workspace/evidence, and complete ContextManifestV2 inputs. Do not guess IDs, claim `LIVE_PROVEN`, or treat a persisted checksum as evidence/admission. This is source/design work, not live database proof.

The current synthesis caller is `POST /api/atlas/mastra-agent` (`sveltekit-frontend/src/routes/api/atlas/mastra-agent/+server.ts`). It now blocks unless the supplied V2 manifest exactly matches the immutable Postgres readback and recomputes both identity and full-payload checksums. It still receives segment content and admission in the request and does not independently read selected source bytes, task/evidence receipts, or the ontology tuple. The response remains `canonicalAuthority: false`; this route change does not establish the full proof chain.

The V2-aware Redis adapter (`getRevisionedAceContextPackV1()` / `setRevisionedAceContextPackV1()`) recomputes the V2 identity on cache reads, but a source search found no callers outside its own module. It is a derived cache, not canonical proof storage. `manifest_json` in `atlas_feature_snapshots` is a graph-snapshot field and is not a ContextManifestV2 payload. Thus neither is an existing independent V2 readback owner. This was a source search only; no Redis/PostgreSQL query was made.

### Read-only symbol and feature LUT

Use the existing integrity-checked candidate ordinal map as the row axis. A bounded, immutable in-memory LUT may contain parallel arrays/maps for `candidateOrdinal → packetKey/sourceRef`, `symbolVersionId → candidateOrdinal[]`, `normalizedSymbolName → symbolVersionId[]`, `domainLabel → candidateOrdinal[]`, and exact documentation references. Every entry carries the candidate snapshot checksum plus separate code, document, taxonomy, and representation revisions. Reverse lookup is a projection over those same qualified rows—not a second identity registry, linked-list chain, or ranking system. Preserve one-to-many results; never select an ambiguous symbol by label alone.

The current `symbol-toc-row-qualification-v1`, owner readback, and diagnostic projection are suitable qualification/projection owners, but the projection is not a published production TOC. Build or publish nothing until an authorized provider supplies a real candidate map, canonical symbol/version join, exact source-byte spans, and document-source bindings. The query LUT can then nominate candidates into existing lexical/AST/semantic/graph lanes; SearchRuntime remains the sole fusion/ranking owner. Domain/feature labels may constrain query expansion or explain a proposal, but may not reorder TopFiles as an independent score.

The pure `resolveDomainClassificationPacketCrosswalkV1()` helper consumes `atlas_packets` rows, matches proposal `evidenceRefs` to exactly one packet row by source ref + source revision + workspace revision, and calls the existing PacketKeyResolutionV2 kernel. `resolveDomainClassificationPacketCrosswalkFromPostgresV1()` now supplies packet and alias rows inside one `REPEATABLE READ READ ONLY` transaction. Its output is only `MATCHED_NOT_ADMITTED`; it does not verify source bytes, fan a classification out across multiple packets, or have a production request caller. Use it as a read-only identity crosswalk, never as an upsert/admission switch.

PostgreSQL/Drizzle owners remain canonical for packet/source lineage, domain facts, taxonomy and approved evidence. Inspect existing `feature_domain_facts`, `atlas_domain_ontology`, taxonomy, packet/chunk, and `content_embedding_768` contracts before any schema change. No new table, ALTER, UPSERT, backfill, or index DDL is authorized by this plan. PostgreSQL 18 AIO and bitmap scans are planner/runtime behavior; use existing indexes and measured `EXPLAIN` plans rather than inventing an AIO/bitmap table or correctness dependency. Keep pgvector on the existing `semantic_768` owner. Qdrant/cuVS are rebuildable retrieval projections.

## Ordered pipeline

1. **Acquire and qualify sources.** Reuse the existing `.okf`/OpenWiki and official-document acquisition owners. Keep fetched bytes, URL/license/scope, parser/extractor revision and content digest in the existing receipt flow. Reconcile the source cohort before indexing; an unreviewed page is not searchable as admitted documentation.
2. **Extract structure and proposals.** Use Tree-sitter/AST-grep for language structure and exact spans; use LangExtract/FastAPI only for grounded relation/feature proposals over those bytes. `/api/nlp/analyze` currently verifies a source binding when requested and returns sidecar analysis/event-hypergraph output, but does not call `groundNlpFeatureV1`, bind a canonical task/EvidenceCard, or invoke tuple admission. Treat its outputs as proposals until those owners and exact source bytes are composed. Ornith 1.5 may summarize selected verified chunks, never mint source spans, symbols, ontology relations or labels as authority.
3. **Classify.** Reuse `domain-taxonomy.ts` and the existing feature/domain fact owners. Return bounded label arrays with taxonomy/classifier revision, evidence references and confidence. Do not silently map aliases or change stored enum values.
4. **Embed and index.** Use the existing EmbeddingGemma `semantic_768` writer only after packet/chunk/source joins qualify. Reconcile Postgres canonical rows with the named Qdrant `content` projection. Preserve lexical/FTS, symbol/AST, semantic and graph as existing logical lanes; SearchRuntime remains the single normalization/fusion owner.
5. **Build reverse lookup and LUT.** Reuse the existing documentation-symbol mutual index and symbol TOC owners for exact reverse lookups (symbol↔source↔documentation). Keep unresolved, stale and ambiguous links visible as reason-coded misses. The tool LUT/Viterbi layer proposes registered read tools only; registry schema, allow-list and authorization remain decisive.
6. **Select context.** Resolve canonical candidates and evidence first, then construct ACE cards and ContextManifest with the existing builder and independent readback. Cache centroids and BitFrost/Valkey entries are revision-qualified routing/residency hints; cache hits cannot become citations. Synthesis consumes only the verified manifest.

## Compute and ranking policy

- Start with bounded CPU batches/workers and deterministic tie-breaking over a frozen, identity-qualified candidate map. Keep parser time, AST extraction, embedding, database/vector retrieval, fusion, and summarization latency separate in measurements.
- Reuse V8 JSON parsing by default; SIMDJSON/N-API is an optional ingestion challenger only if representative end-to-end profiles show parsing is material and direct typed output beats the extra conversion cost.
- Use DuckDB only for scratch analytics over frozen exported batches; it is not an identity or admission store. Use NetworkX/PyTorch CPU as graph/tensor reference executors. cuVS/cuGraph/RAPIDS are challengers only on the same independently verified frozen inputs with an admitted GPU lease and readback.
- Radix sort is an optimization candidate for large fixed-width ordinal/key batches, not a ranking authority. Measure before adding it.
- PCA/SVD, learned low-rank recommendation, cluster assignments, centroids, and four-dimensional topology coordinates are derived features. Bind them to input and producer revisions; never use them as identities, source evidence, ontology edges, or extra SearchRuntime votes.
- QLoRA, DSPy/GEPA and agentic repair are later evaluation loops over reviewed, frozen cases. They may propose ranking/tool/prompt changes; no model score grants write permission or admission. Kanban/taskboard cards point to the owning OpenSpec gate and evidence receipt rather than becoming a second task authority.

### Indexing order for documentation and code

1. Reconcile each `.okf` publication to a reviewed acquisition envelope using canonical source identity, URL/scope, license, parser/extractor revision, and comparable same-grain digests. Candidate URL overlap alone is not an identity join.
2. Resolve source/document bytes to canonical packet/chunk rows and verify source revisions, exact UTF-8 spans, and workspace/candidate snapshot. Keep code and documentation revisions distinct.
3. Produce deterministic domain/feature proposal arrays. Treat LangExtract/8095 output as grounded proposals only; use Ornith 1.5 for summaries of already qualified selected text, with model/prompt revisions recorded.
4. Generate `semantic_768` only through the existing EmbeddingGemma recipe/writer after eligibility; reuse existing PostgreSQL vector and Qdrant projections. Keep full-text/trigram, AST/symbol, semantic and graph retrieval as separate lanes.
5. Materialize the read-only symbol/document reverse LUT from independently verified rows and feed it to SearchRuntime. Cache only revision-qualified descriptors/centroid manifests in existing Valkey/BitFrost owners; cache hits remain hints and do not become evidence.
6. Keep Arrow/mmap/DuckDB/CPU worker or GPU batching as optional execution/materialization strategies over frozen qualified inputs. Do not add radix sorting, PCA/SVD, learned low-rank routing, centroids, or 4D manifold coordinates until profiling identifies a bottleneck/use case; these outputs remain advisory derived features.

## Implementation gates

1. Reconcile existing `.okf` vocabulary/schema with runtime taxonomy and record the exact compatible mapping; do not alter canonical labels yet.
2. Reconcile eligible documentation/source cohorts and verify packet/chunk/source digest compatibility through existing owners.
3. Publish a scratch-only reverse symbol/documentation projection from exact code/document revisions; keep ambiguous spans blocked.
4. Demonstrate existing SearchRuntime lanes and ranking on a frozen query cohort, with one fusion owner and separate source/doc citations.
5. Connect only qualified evidence to ACE/ContextManifest readback; leave missing ontology tuples and manifest receipts blocked.
6. Benchmark CPU workers, parsing, vector projection, graph traversal and optional GPU executors independently; optimize only a measured bottleneck.
7. Add recommendation/error-repair feedback only after a reviewed evaluation set and human approval path exist.

Until those gates pass, do not claim a published symbol index, full-corpus semantic search, admitted KAG/HyperGraphRAG relation, live GPU parity, or production synthesis chain.

## Existing implementation owners confirmed by source review

- `candidate-feature-matrix-adapter-v1.ts` already defines a strict `RetrievalCandidateFeatureMatrixReceiptV1`, row-binding and matrix checksums, serialization, and `verifyCandidateFeatureMatrixAdapterReadbackV1()`. Reuse this CPU-side artifact path; do not introduce another matrix receipt. Its fixture/readback path does not establish a live source provider or production retrieval caller.
- `context-dag-handlers-v1.ts` exposes `makeAstHandlerV1()` and `makeDefaultAstGrepRefinementHandlerV1()`, with the default bound to `extractAstGrepStructuralCandidates`. AST-grep refinement is therefore an existing DAG owner, not a missing parser. It remains structural candidate evidence, not canonical symbol admission or a Graphify edge.
- `python/atlas_graph_runtime/gnn_reference.py::run_gnn_v1()` and `networkx_executor.py` provide CPU reference/execution owners; `cugraph_executor.py` is a separate GPU challenger. The checked-in operator suite and receipts are fixture evidence only. Do not broaden GPU work until a current independently qualified graph snapshot exists.
- Continue the symbol/document LUT using the existing candidate ordinal map, canonical symbol/version and documentation crosswalk owners. Preserve ambiguity and missing source/document bindings as reason-coded unavailable entries; do not publish or persist a TOC from proposal-only rows.
- The diagnostic TOC projection now derives deterministic key/value reverse lookup arrays from source-readback-matched rows (candidate ordinal, symbol version, qualified name, source ref, and exact documentation revision). These are scratch diagnostic indexes, not production SearchRuntime indexes or evidence admission.
- `lookupSymbolTocDiagnosticV1()` performs bounded exact-key lookup over the checksummed diagnostic projection and returns candidate ordinals plus frozen snapshot identifiers. It does not rank, cite, admit, or invoke production retrieval.
- `resolveSymbolTocCandidatesV1()` joins those ordinals back through an independently supplied integrity-checked `CandidateOrdinalMapV1` and verifies packet/source/revision identity against source-readback-matched symbol rows. It is still a diagnostic candidate adapter; it does not establish an authorized live provider or production caller.
- `createAtlasSearchAdapter()` already exposes opt-in `searchWithAceManifest()`, while `/api/retrieval/search-unified` currently follows `runSemanticSearchWorkflow()` → `createAtlasSearchAdapter().search()` and supplies no `contextManifestShadow` source provider. The shadow preflight now defaults to a root-confined source reader bound to its integrity-checked CandidateOrdinalMap and to the canonical packet/source receipt owner; the production route still supplies neither its live map nor trusted root. Complete feature-profile/supplement producers and independent manifest readback also remain missing. Keep the route on its current path; do not synthesize fallback revisions to make the shadow appear ready.
- The current task explicitly requested pausing tests. New or existing focused tests may be authored/updated, but no test, typecheck, benchmark, service invocation, database query, or live materialization is run until testing is resumed.
