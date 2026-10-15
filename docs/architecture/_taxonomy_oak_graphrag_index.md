# Taxonomy, OAK, GraphRAG, NetworkX, Inverse DAG — Index

**Status**: index only; no canonical authority | **Date**: 2026-10-13 | **Tracking**: `openspec/changes/manual-migration-reconciliation/tasks.md` (INDEX-01, INVERSE-DAG-LOWRANK-01)

---

## TL;DR

Navigation for the taxonomy-to-GraphRAG integration. PostgreSQL is the owner for taxonomy terms. The existing OAK and PostgreSQL-boundary interfaces are intended to resolve terms, but the cited census marks that boundary as not yet wired to the live tables. NetworkX is a CPU parity executor, not an authority. The inverse-DAG work is proposal-only.

## Corpus, glossary, and entity alignment

Use the existing repo-local `.okf` contracts as the validation boundary; `docs/.okf/schema.yaml` explicitly describes a code-intelligence convention, not the external OKF specification. Do not add a competing taxonomy or infer canonical IDs from text.

| Stage | Meaning | Evidence / authority rule |
|---|---|---|
| Corpus document | Revisioned source document or code packet with `source_ref`, source/workspace revisions, and content digest | Validate its registered schema and source binding before extracting terms |
| Glossary term | Surface form, normalized label, aliases, and language metadata | Candidate vocabulary only; normalization and keyword hits do not establish entity identity |
| Topic / keyword cluster | Query or corpus grouping derived from lexical/co-occurrence signals | Advisory feature; record producer revision, corpus snapshot checksum, and membership evidence; cluster numbers are not ordered taxonomy IDs |
| Concept / domain | Existing ontology or domain term with canonical ID and ontology/taxonomy revision | Resolve through the PostgreSQL owner; unresolved or ambiguous values remain unresolved |
| Entity | Canonical packet, symbol, source, or other typed owner identity | Resolve with its owning registry and revision; never mint from a label or embedding |
| N-ary fact | Predicate plus role-labeled participants, evidence refs, source/graph revisions, and policy digest | `.okf` proposal/schema validation is structural only; require explicit predicate resolution and participant-owner proof before admission |
| Graph feature | NetworkX/cuGraph PageRank, path distance, community, or incidence projection | Derived from a frozen graph snapshot; advisory only and never a source fact or independent retrieval lane |

Recommended alignment sequence:

```text
schema-validated corpus + exact source lineage
  → extracted glossary surface forms and keyword candidates
  → deterministic alias/normalization crosswalk (EXACT / AMBIGUOUS / UNMAPPED)
  → PostgreSQL/OAK concept resolution with ontology revision
  → evidence-linked binary or role-labeled N-ary proposal
  → checksummed NetworkX mirror / incidence CSR
  → optional RAPIDS/cuGraph features and retrieval candidates
```

Keep the ledgers distinct: `keyword → term candidate`, `term → resolved concept ID`, `text mention → typed canonical entity`, and `participants + predicate → fact`. Do not join them on display name alone. Until the live OAK/PostgreSQL resolver and corpus-wide crosswalk are verified, corpus coverage and concept-resolution completeness remain **PARTIAL / NOT_PROVEN**; no learned clusters or GPU graph results may fill missing canonical links.

## Taxonomy tables (historical read-only census, 2026-10-13)

| Table | Identity | Domain key | FKs | Census status |
|---|---|---|---|---|
| `domain_taxonomy_v1` | uuid id; unique `(domain_id, version)` | `domain_id`, `version` | none | initial census: **0 rows**; later 17 operator-approved rows reported; no current recensus |
| `atlas_domain_ontology` | uuid id; unique `group_id` | `group_id`, `parent_group_id` | none | live; **17 rows** |
| `atlas_document_classification` | uuid id; unique `source_ref` | `domain_class` | none | live; **0 rows** |
| `feature_domain` | int id; unique `(packet_key, source_ref)` | `domain_class` | none | live; **61,659 rows** |
| `ontology_domain_tuples` | int id; unique `(packet_key, domain_class, subject, predicate, object)` | `domain_class` | none | live; **61,659 rows** |
| `classification_envelope` | uuid id | `domain_labels` jsonb | `signal_id` → `semantic_signals` | live; **0 rows** |
| `domain_function_mapping` | — | — | — | NOT LIVE (`table_not_found`) |

No foreign keys link the domain tables. The 2026-10-13 pre-insert census found 40 distinct `domain_class` values: **32 did not match `atlas_domain_ontology.group_id`**, and none matched then-empty `domain_taxonomy_v1.domain_id`. Later insertions were not independently recounted here; these historical counts are not current-state proof.

Measured 2026-10-13 with `.tmp/census-readonly-2026-10-13.sql` (single read-only transaction, exit 0). `EXPLAIN` was run without `ANALYZE`. Planner estimates on `ontology_domain_tuples` look stale (estimated 1 row on a 61,659-row table); `ANALYZE` has not been run.

## Code owners (reuse; do not add a second)

| Capability | Path | Role | Status |
|---|---|---|---|
| Taxonomy resolution (PostgreSQL owner) | `sveltekit-frontend/src/lib/server/atlas/ontology-resolution-boundary-postgres.ts` | boundary to the taxonomy tables | exists; not yet wired to these tables |
| OAK bridge (TS) | `sveltekit-frontend/src/lib/server/atlas/oaklib/python-fastapi-oaklib-bridge-v1.ts` | parses OAK payloads, builds cache plans | exists; spec present |
| OAK kernel (Python) | `python/atlas_oak_kernel.py` | term resolution on `:8095` | exists; not run here |
| OAK resolution evidence | `sveltekit-frontend/src/lib/server/atlas/agentic/contracts/oak-resolution-evidence-v1.ts` | evidence contract | exists |
| GraphRAG retrieval (proposed owner) | `sveltekit-frontend/src/lib/server/atlas/retrieval/hypergraph-retrieval-v1.ts` | query integration | exists; caller NOT_CONFIRMED |
| Low-rank sampling | `python/atlas_compute/low_rank.py`; `sveltekit-frontend/src/lib/server/atlas/sampling/sample-query-matrix-v1.ts` | EXPERIMENT per CLAUDE.md | exists |
| Low-rank task recommender (advisory) | `python/build_low_rank_task_recommendation_v2.py` | OpenSpec task ordering only | exists; deterministic rank stays authority |
| NetworkX parity | `python/graph_snapshot_parity_networkx_oracle.py` | CPU reference | exists |

## Draft DDL (not applied)

| Path | Status |
|---|---|
| `sveltekit-frontend/drizzle/manual/20261013_graph_revision_and_traversal_CONCURRENT_DRAFT.sql` | DRAFT; NOT APPLIED; NOT rehearsed |

## Proof gates (summary)

See `openspec/changes/manual-migration-reconciliation/tasks.md` for the full gate tables. Key items:

| Gate | Status |
|---|---|
| Taxonomy census: row counts, active versions, EXPLAIN | DONE 2026-10-13 (read-only; taxonomy was empty before the operator-approved 17-row insert) |
| Key crosswalk (`.tmp/taxonomy-crosswalk-2026-10-13.json`) | DONE: 8 EXACT_MATCH, 4 AMBIGUOUS (case-only), 28 UNMAPPED. Frequencies NOT_COLLECTED (no TRACE row tool) |
| Canonical taxonomy owner conflict | OPEN, needs decision: `seedDomainTaxonomy()` (`src/lib/server/atlas/phase109a-baseline-classifier.ts`) seeds a different 10-domain vocabulary. Only `auth`, `database`, `retrieval` overlap with the 17 inserted rows. My insert bypassed the owner |
| `pg_stat_all_tables` review | NOT_RUN (no TRACE tool for it; ANALYZE not run) |
| FTS (`search_postgres_fts`) | Verified on bounded query: 10 lexical hits, but over code chunks, not taxonomy tables |
| LR-02 replay parity (task-ordering recommender) | see tasks.md for measured result |
| LR-03 DSPy/GEPA evaluation | BLOCKED: no reviewed set |
| LR-05 OAK via PostgreSQL boundary | NOT_STARTED |

## Next steps

- Measure taxonomy row counts and active versions (read-only).
- Wire `ontology-resolution-boundary-postgres.ts` to the live tables after the census.
- Confirm the live caller of `hypergraph-retrieval-v1.ts`.

## Keyword corpus crosswalk checkpoint (2026-10-14)

`docs/reports/atlas-taxonomy-glossary-alignment-v1.json` is a deterministic, read-only derivation from the schema-validated `.okf/corpora/keyword-corpus.yaml` and the existing local domain alias mapper. The report covers **17 topic entries / 81 term occurrences / 81 normalized terms**, with **0 exact domain-alias candidates** and **0 missing referenced paths** (path existence only, not source lineage). The zero exact matches do not mean concepts are absent: the corpus schema has no canonical `concept_id`, `domain_id`, or entity ID field. Its entry IDs group reference vocabulary topics only.

The report is **PARTIAL** by design: keyword clustering was not run, canonical PostgreSQL/OAK resolution was not attempted, the corpus remains `reference_only` and non-searchable, and the historical taxonomy proposal is not joined to this corpus. Exact keyword/alias matching is candidate discovery, not taxonomy or entity admission. No corpus/index/database data was written; only the derived JSON receipt was created.
