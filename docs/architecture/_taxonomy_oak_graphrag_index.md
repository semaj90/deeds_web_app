# Taxonomy, OAK, GraphRAG, NetworkX, Inverse DAG — Index

**Status**: index only; no canonical authority | **Date**: 2026-10-13 | **Tracking**: `openspec/changes/manual-migration-reconciliation/tasks.md` (INDEX-01, INVERSE-DAG-LOWRANK-01)

---

## TL;DR

Navigation for the taxonomy-to-GraphRAG integration. PostgreSQL is the owner for taxonomy terms. OAK resolves terms through the existing PostgreSQL boundary. NetworkX is a CPU parity executor, not an authority. The inverse-DAG work is proposal-only.

## Live taxonomy tables (read-only catalog, 2026-10-13)

| Table | Identity | Domain key | FKs | Census status |
|---|---|---|---|---|
| `domain_taxonomy_v1` | uuid id; unique `(domain_id, version)` | `domain_id`, `version` | none | live; **0 rows** (no active versions) |
| `atlas_domain_ontology` | uuid id; unique `group_id` | `group_id`, `parent_group_id` | none | live; **17 rows** |
| `atlas_document_classification` | uuid id; unique `source_ref` | `domain_class` | none | live; **0 rows** |
| `feature_domain` | int id; unique `(packet_key, source_ref)` | `domain_class` | none | live; **61,659 rows** |
| `ontology_domain_tuples` | int id; unique `(packet_key, domain_class, subject, predicate, object)` | `domain_class` | none | live; **61,659 rows** |
| `classification_envelope` | uuid id | `domain_labels` jsonb | `signal_id` → `semantic_signals` | live; **0 rows** |
| `domain_function_mapping` | — | — | — | NOT LIVE (`table_not_found`) |

No foreign keys link the domain tables. Of the 40 distinct `domain_class` values in `feature_domain` and `ontology_domain_tuples`, **32 match no `atlas_domain_ontology.group_id`**, and all 40 match no `domain_taxonomy_v1.domain_id` (the taxonomy is empty).

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
| Taxonomy census: row counts, active versions, EXPLAIN | DONE 2026-10-13 (read-only; taxonomy empty; 32 of 40 keys unmatched) |
| LR-02 replay parity (task-ordering recommender) | see tasks.md for measured result |
| LR-03 DSPy/GEPA evaluation | BLOCKED: no reviewed set |
| LR-05 OAK via PostgreSQL boundary | NOT_STARTED |

## Next steps

- Measure taxonomy row counts and active versions (read-only).
- Wire `ontology-resolution-boundary-postgres.ts` to the live tables after the census.
- Confirm the live caller of `hypergraph-retrieval-v1.ts`.
