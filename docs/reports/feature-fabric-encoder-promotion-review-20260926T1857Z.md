# Feature-fabric encoder and promotion review

Date: 2026-09-26
Scope: read-only code/receipt audit; no canonical writes.

## Findings

- Coordinate proof: CandidateOrdinal snapshot `sha256:09bfbf6125ddc67f194edd6170f6d9c87a14d001f877eef1ec269600b2424388`; 16,151 packet candidates; ordinal-map checksum `90c237c8d8afd41d176540e2a5a3430ae86b626b7de94e08b49255e7b7fd4bf9`.
- MapReduce readiness: 127 candidates / 1,520 chunk records conserved; authoritative binding, packet, proven lineage membership and source file digest all revalidated for 1,520. Only 114 chunk-row/canonical-chunk identities exactly match. 1,406 rows point to a different chunk ordinal for the same file and remain blocked; no remapping attempted.
- Feature evidence: prior 03A/03B artifacts reported 178 sparse candidate values and 15,973 unavailable. Those are artifact-only HINT/RF conformance results, not base-matrix promotion, live scorer exposure, or retrieval lift. They are not used to bypass the current chunk-identity blocker.
- Encoder: `SemanticRepresentationV1Schema` is the existing typed provenance owner. Immutable model/representation revision is absent from the relevant live evidence (readiness qualified representation revisions: 0; :8097 query model revision was not reported).
- Persistence: `summary_embedding_meta` exists only in an unapplied manual migration draft. Existing stored vectors are unbound. No new YAML/schema/table/DDL or persistence path added.
- Scorer: source search found no production consumer for the legacy-summary cosine feature outside its feature and presence contracts / offline artifacts.
- Evaluation: no eligible frozen/human relevance labels are available; gain test blocked; MMR deferred.

## Gate state

`INDEXED-CHUNK-CANONICAL-ID-RECONCILIATION-01` remains the immediate blocker. After that: obtain immutable encoder provenance from the existing embedding receipt owner, identify the authorized persistence owner (without applying DDL), then re-evaluate same-snapshot feature admission and scorer exposure. Keep `RF-EVAL-01` open until valid labels exist.

## Write boundary

PostgreSQL writes: 0. Qdrant writes: 0. Valkey writes: 0. RabbitMQ publishes: 0. Neo4j writes: 0. Graphify runs: 0.
