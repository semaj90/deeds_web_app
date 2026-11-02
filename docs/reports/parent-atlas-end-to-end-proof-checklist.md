# Parent Atlas End-to-End Proof Checklist

## Purpose and authority order

This checklist defines the proof required to establish a source-grounded Parent Atlas relation from source bytes through a validated tuple and packet. It distinguishes implementation, tests, live read-only observations, and isolated integration proof. Existing components are not treated as one end-to-end pipeline merely because each exists.

```text
immutable source bytes + source/workspace revision
  -> bounded AST/LangExtract observations (8095)
  -> exact-span, identity-bound evidence claims
  -> admitted relation tuple in PostgreSQL 18
  -> packet materializer reads and validates the persisted tuple
  -> optional transient Redis/BitFrost cache or rebuildable projections
```

PostgreSQL is authoritative for durable identity, revisions, claims, and tuples. LangExtract/AST produce observations, not authority. Redis/BitFrost is transient and must not precede verified PostgreSQL persistence. Qdrant/NetworkX/TurboVec are optional derived projections, not tuple owners. HyperLogLog (HLL) reports approximate cardinality only; it cannot retrieve tuple members, create relations, or validate claims. Ordered timeline/list views are derived from immutable events/relations, not the canonical data structure.

## Current evidence and gaps

| Stage | Verified present | Not yet proven / blocker | How to close |
| --- | --- | --- | --- |
| Source identity | `EvidenceClaimV1` validates source digest, source/case identity, and spans; synthesis recomputes SHA-256 against original bytes. Focused Unicode/span tests exist. | A live end-to-end input with frozen source bytes, workspace revision, and exact 8095 request/response receipt was not run. | In an authorized isolated rehearsal, freeze one non-sensitive fixture's exact bytes, source/workspace revisions, and checksums; retain the fixture and request/response receipt. |
| AST/LangExtract 8095 | Read-only health/OpenAPI previously reported `/extract`, `/analyze`, Tree-sitter, AST-grep, LangExtract and spaCy. `evidence-synthesis-v1.ts` calls `requestLangExtractDocumentationFacts()` through `atlas/ai/langextract-transport.ts`, which posts to `/extract/documentation-facts` and checks the input hash and exact alignment status. | Health/OpenAPI only prove advertised capability. No extraction POST was exercised in this audit; runtime model/output, exact source span mapping, and persistence linkage remain unproven. `python-fastapi-oaklib-bridge-v1.ts` parses/adapts OakLib tuple payloads; it is not the LangExtract HTTP caller and should not be wired as a substitute. | Verify the live OpenAPI contract for `/extract/documentation-facts` and configured environment-backed URL; send a bounded fixture only in the isolated rehearsal; preserve raw response hash and producer/model revision; reject malformed or ungrounded spans. |
| Grounded evidence claims | Zod contract and pure claim/span validators exist. The upload processor attaches synthesis results to its durable job result. | Claim production is not equivalent to ontology relation admission. Conflict links are not produced by the current LangExtract fact mapping; the conflict branch is therefore not end-to-end proven. | Keep claims proposal/source-grounded only. Add an independently reviewable contradiction-link contract and producer test before claiming `CONFLICTED` output. |
| Ontology tuples | PostgreSQL 18 table `public.atlas_ontology_linked_tuples` exists with participant, evidence-ref, evidence-span, provenance, revision, and state fields. Exact read-only row count was 0. Existing `projectGroundedNlpFactToOntologyTupleV1` and OAK candidate adapter produce `GATED` proposal tuples; the new pure `admitGroundedOntologyLinkedTupleV1` check validates source bytes/revision, exact span text/checksum, relation/workspace revisions, evidence refs, and at least two distinct participant IDs. Its result explicitly has `canonicalAuthority: false` and `writesPerformed: false`. | `buildTaxonomyReferenceTuplesV1` intentionally emits `participants: []`, `evidenceRefs: []`, and `REFERENCE_ONLY`; this is not a source-grounded relation. The new admission check verifies participant shape/distinctness, not whether IDs are authoritatively resolved. It is not wired to the persistence writer. The persistence helper still accepts the broader tuple schema and performs upserts. | Preserve `REFERENCE_ONLY` as a distinct lane. Add an approved participant-resolution receipt/contract and relation semantics, then gate a separate grounded persistence entry point on this validator plus that receipt. Do not label reference tuples as grounded or treat arbitrary distinct IDs as canonical resolution. |
| Tuple write/readback | `persistOntologyLinkedTuples()` writes to PostgreSQL; focused unit tests exercise the writer with mocked DB access. | No production or disposable-PG readback receipt proves field parity, idempotency, or source-to-tuple lineage. Current writer tests are not a live DB test. | In a disposable PostgreSQL 18 database, persist exactly one approved fixture tuple in a transaction, select it back by stable tuple ID, compare every identity/evidence/provenance field and checksum, then roll back or destroy only the disposable database. |
| Packet assembly | Taxonomy packet creation and ACE/ACP packet assemblers exist with contract/unit coverage. | No proven reader consumes a verified PostgreSQL tuple row and materializes a packet from that readback. `buildTaxonomyTopologyPacket` writes an ACE packet before it persists its `REFERENCE_ONLY` tuples, then conditionally writes the tuple cache; it is not a PostgreSQL-readback materializer for grounded tuples. | Implement or identify a read-only materializer that takes the verified tuple readback, validates packet schema and identity, and records the input tuple/source revisions. Add an integration test for exact lineage; do not feed a tuple into the existing taxonomy builder and call that readback proof. |
| Cache/projection | Existing taxonomy code writes PostgreSQL before its Redis cache plan and excludes failed tuple writes from that cache path. | Cache success is not a PostgreSQL readback receipt; the existing reference-only tuples do not become grounded by caching. No full chain receipt exists. | Cache only after successful verified DB readback; include tuple/packet revisions and checksums. Treat cache loss as recoverable. Keep Qdrant/graph projections out of the initial tuple proof. |
| HLL/telemetry | Redis HLL telemetry helper exists. | HLL cannot serve as entity/relation storage or a proof of exact membership. | Keep HLL out of correctness gates; report it only as approximate operational telemetry. |
| Transport | Caddy config/runtime previously advertised HTTP/3 on the web edge; ACP gRPC uses gRPC over HTTP/2/TCP. | A successful HTTP/3 handshake was not proven. gRPC metadata mentioning QUIC is not a QUIC transport proof. | Treat web HTTP/3 as a separate optional edge test; do not make it a prerequisite for the source→tuple→packet proof. |

## Distinct PostgreSQL tuple owners

A fresh read-only PostgreSQL 18.4 check confirmed both tables exist, but they represent different data grains:

| Table | Observed state | Interpretation |
| --- | --- | --- |
| `public.feature_ontology_tuples` | 539,124 rows; all rows report `extractor_version = atlas-packets-ontology-v1`; grouped evidence reports `source = atlas_packets`, `join_method = exact`. Predicates include `USES_CONCEPT` (353,973), `BELONGS_TO_DOMAIN` (61,717), `CLASSIFIED_AS` (61,717), and `IMPLEMENTS_FEATURE` (61,717). | Existing packet/feature/domain association rows. This count does not establish source-span grounding or that the rows were emitted by `phase-107-v1`; the live `extractor_version` value does not match that claim. |
| `public.atlas_ontology_linked_tuples` | 0 rows; schema includes participants, evidence refs, evidence span, provenance, and token fields. | Separate fine-grained tuple owner intended for lineage-qualified relations; it is currently empty. |

Do not add these row counts together or treat the populated macro-association table as proof of fine-grained grounded tuples. The HLL helper is at `sveltekit-frontend/src/lib/server/atlas/telemetry/atlas-hll-telemetry.ts`; source search found no non-test caller. Leave it optional and observational; do not use it for tuple retrieval or eviction decisions.

## EmbeddingGemma 2 and Media Grounding Status

A read-only evaluation confirmed that EmbeddingGemma 2 is a challenger only and that media is grounded through text rather than native multimodal vector spaces:

- **Canonical Dense Owner**: `embeddinggemma:latest` (768-D, Ollama `/api/embed`) owned by `codebase_chunk_index.content_embedding_768`. Qdrant `codebase_chunks_768_v2` and TurboVec `:8791` are rebuildable projections.
- **EmbeddingGemma 2 (Challenger Only)**: Tag `embeddinggemma2:q8_0` is installed (Q8_0 GGUF, 768-D). Table `codebase_chunk_eg2_embeddings` holds 1,000 rows (`canonicalDefaultChanged: false`). In self-retrieval sanity testing (776 rows, 100 queries; *not* a relevance benchmark):
  - Recall@1 / 5 / 10 = **34% / 54% / 63%** vs. Canonical **55% / 70% / 80%**.
  - Mean top-10 overlap is 0.402; same top-1 match in only 39/100 queries.
  - No held-out relevance receipt exists; EG2 vectors must not be mixed into canonical 768-D projections.
- **Media Grounding (Text Extraction Paths)**:
  - **Audio**: `routes/api/whisper/transcribe/+server.ts` and `lib/server/ai/whisper.ts` produce timestamped text transcripts.
  - **Video**: `lib/server/features/evidence/video/video-ingest-service.ts` writes PostgreSQL records (`evidenceMediaAssets`, `evidenceTranscriptSegments`, `evidenceProcessingJobs`) before directly indexing to Qdrant (`searchIndexError` on failure).
  - **Images**: `lib/server/ai/multimodal-fusion.ts` merges VLM captions and OCR text before text-based embedding.
  - **Native Multimodal Inference**: Unproven on this workstation; all media vectors are text-grounded embeddings.

## Existing validation receipts

- Focused tuple writer, taxonomy packet, evidence claim, and ACP packet-assembler tests: **20/20 passed** in the prior focused run. These are unit/contract tests; tuple PostgreSQL access was mocked and no end-to-end persistence/readback is established.
- Read-only PostgreSQL 18.4 catalog check: `atlas_ontology_linked_tuples` exists; exact row count 0.
- Follow-up read-only PG18 check: `feature_ontology_tuples` has 539,124 rows with `extractor_version = atlas-packets-ontology-v1`, not the claimed `phase-107-v1`; `atlas_ontology_linked_tuples` remains at 0. Both tables are separate owners/grains.
- Read-only 8095 health/OpenAPI: `/extract` and `/analyze` advertised in the prior receipt. No extraction POST was performed.
- Migration-history audit: live Drizzle ledger 0 rows; local journal 41/41 files. This discrepancy blocks schema changes until ownership/history is reconciled; it does not authorize seeding the ledger or applying DDL.
- No live database, Redis, Qdrant, model, or source-data writes were performed for this checklist.
- Follow-up source change: added `sveltekit-frontend/src/lib/server/atlas/integration/grounded-ontology-linked-tuple-admission-v1.ts` and its focused spec. The validator is pure and proposal-only; it does not make the full pipeline complete or change the existing taxonomy reference-tuple flow.
- Review correction: the LangExtract caller is `requestLangExtractDocumentationFacts()` in `sveltekit-frontend/src/lib/server/atlas/ai/langextract-transport.ts` (HTTP `POST /extract/documentation-facts`); `python-fastapi-oaklib-bridge-v1.ts` is an OakLib payload adapter. Also, `buildTaxonomyTopologyPacket()` writes its ACE packet before its reference-tuple persistence and does not assemble from a PostgreSQL tuple readback.

## End-to-end rehearsal checklist

Every item below remains open until supported by a receipt. Rehearsal writes require explicit authorization and isolated disposable infrastructure.

- [ ] Select one non-sensitive text fixture and preserve exact bytes, SHA-256, source reference, workspace revision, and expected extractable text.
- [ ] Record the live 8095 service identity, OpenAPI digest, exact request schema, configured endpoint, and extractor/model revision; send only a bounded fixture request.
- [ ] Validate every extraction observation against the exact source bytes and digest; convert character offsets to byte spans and verify substring equality.
- [ ] Resolve tuple participants from an approved identity source. If identity is ambiguous or absent, return `UNRESOLVED`; do not invent participant IDs.
- [ ] Admit only a grounded tuple with non-empty participants/evidence references, exact evidence span, source/relation revisions, and proposal/admission state explicitly represented.
- [ ] Persist the tuple in a disposable PostgreSQL 18 database and read it back; verify exact tuple ID, participant set, evidence refs/span, source hash, relation revision, and producer revision.
- [ ] Materialize a packet from the PostgreSQL readback (not from the original model response); verify packet schema, tuple identity, source revision, and deterministic checksum.
- [ ] If testing cache, write a disposable Redis key only after verified readback; confirm cache payload revision/checksum and demonstrate cache loss does not lose canonical data.
- [ ] Exercise negative cases: unavailable 8095, empty extraction, invalid/mismatched spans, changed source bytes, unknown participant, missing registry/catalog, DB failure, duplicate replay, and packet identity mismatch. All must fail closed with explicit status.
- [ ] Save a run receipt with exact commands, exit codes, service versions, DB identity, request/response and artifact hashes, readback values, and cleanup of disposable resources. No mock-only result may be reported as end-to-end proof.

## Separate feature/taxonomy readiness gate

Feature taxonomy promotion is not a prerequisite to prove a generic source-grounded relation, but it is required before emitting canonical feature labels or feature recommendations. The latest recorded snapshot says `feature_registry` is absent, the Drizzle ledger is empty, and crosswalk candidates are noncanonical. Reconcile migration ownership/history first; then review a source-revision-bound feature-to-taxonomy crosswalk. Do not apply migrations or promote mappings as part of this checklist.

## Data and artifact ownership

Use the existing [workspace feature and storage master register](workspace-feature-and-storage-master-register-2026-11-01.md) for file-by-file inventories and retention evidence. Keep Legal AI product/runtime, Parent Atlas authority/projections, workstation/dev/test/evaluation, and protected backups/archives in separate ownership lanes. Existing ignored-file byte totals are logical-size snapshots, not allocated NTFS usage. Docker volumes, ClickHouse logs, backups, model archives, and duplicate groups remain protected/review-only; this work authorizes no truncation, deletion, pruning, migration, reindex, or archive movement.

`likely_cause`: Existing extraction, claim validation, reference-tuple persistence, packet assembly, and cache helpers are separate flows; no test or receipt proves their full grounded lineage as one pipeline.

`evidence`: `sveltekit-frontend/src/lib/server/evidence/synthesis/evidence-synthesis-v1.ts`; `sveltekit-frontend/src/lib/server/evidence/synthesis/evidence-claim-v1.ts`; `sveltekit-frontend/src/lib/server/atlas/taxonomy-topology-packet.ts`; `sveltekit-frontend/src/lib/server/atlas/ontology-linked-tuple-postgres.ts`; `sveltekit-frontend/src/lib/server/ace/context/packet-assembler.ts`; read-only PG18 and 8095 receipts summarized above.

`patch_targets`: This report and `openspec/changes/parent-atlas-evidence-agent-proposals/tasks.md`; no runtime or datastore code changed.

`safe_next_command`: `node scripts/ops/audit-drizzle-history-readonly.mjs`

`smoke_command`: `npm --prefix sveltekit-frontend exec -- vitest run src/lib/server/atlas/ontology-linked-tuple-postgres.spec.ts src/lib/server/atlas/taxonomy-topology-packet.spec.ts src/lib/server/evidence/synthesis/evidence-claim-v1.spec.ts src/lib/server/acp/packet-assembler.spec.ts`

`report_path`: `docs/reports/parent-atlas-end-to-end-proof-checklist.md`
