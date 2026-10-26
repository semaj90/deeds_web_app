# Parent Atlas A–G execution alignment

Updated 2026-10-17 following the operator's source-revision deferral.

## Current execution policy

Source-revision propagation, backfill and production lineage closure remain deferred. Missing `source_revision` / `code_source_revision` does not block structural indexing, feature discovery, ontology proposals or bounded baseline experiments. Preserve existing trustworthy revisions; keep unavailable fields explicitly null/unqualified. Never infer revisions from Git HEAD, timestamps, paths or another hash grain.

Record source paths, existing packet/node identities, parser versions, offsets, input/output checksums, run provenance, counts and errors when available. These diagnostic measurements support repeatability without imposing a canonical source-revision migration.

Canonical identity, production eligibility and evidence promotion continue to use their existing owners. Indexing progress does not close deferred lineage or production GraphRAG/ACE gates.

## Existing batch definitions

The original plan is in [docs/openspec/README.md](../openspec/README.md), with [the A–G roadmap](../openspec/STRUCTURAL-IDENTITY-BATCH-ROADMAP.md), [Batch A implementation](../openspec/BATCH-A-STRUCTURAL-MATERIALIZER.md), and [startup guide](../openspec/BATCH-EXECUTION-STARTUP.md).

Those documents own the A1–G5 definitions. The previous version of this alignment note incorrectly reassigned those gate names and made admitted source/workspace revisions a prerequisite for indexing. Those additions are withdrawn. This note is navigation and scope clarification; owning OpenSpec tasks remain the completion ledger.

| Batch | Original scope | Execution alignment |
|---|---|---|
| A | Tree-node materialization; coverage, uniqueness, determinism, cycle and edge integrity | Begin with the existing owner's dry run and bounded source cohort. Source-revision closure and AST-v2 deployment are separate follow-ups, not mandatory indexing prerequisites. Preserve existing identity namespaces and migration governance. |
| B | Feature identity derivation and tree-to-feature mapping | Follow the original B1–B5 gates after A. Use the existing feature owner and preserve unresolved cases. |
| C | Grounded ontology observations, human review and locked labels | Follow C1–C5 after B; reconcile legacy vocabulary through TAXONOMY-CROSSWALK-01. Reviewed labels and classifier predictions remain distinguishable. |
| D | Feature/control-set semantic text and 768-dimensional embeddings | Retain the original C-to-D dependency for feature/label-derived text. Missing source-revision closure does not become an added batch blocker. Preserve input recipe and model provenance. |
| E | Exact, pgvector and Qdrant comparison | Retain the existing 23-query benchmark and E1–E5 definitions. Distinguish approximate-neighbor recall from reviewed relevance, and preserve one logical semantic-lane vote. |
| F | Naive Bayes and XGBoost classification | Use reviewed C labels and frozen D inputs. Reconcile the historical assumed domain count with the approved taxonomy before a classifier run. |
| G | Learning-to-rank baseline | Use reviewed ranking targets, frozen candidates and held-out evaluation through the existing ranker owner. Preserve exposure versus negative-label distinctions. |

The feature/control-set experiment in the original D batch is distinct from canonical chunk embedding materialization. PostgreSQL 18 remains canonical for packet/chunk identity and `codebase_chunk_index.content_embedding_768`; feature-description experiments must not silently replace chunk vectors. Qdrant and GPU/graph artifacts remain projections or executors.

Use the existing language owners, including `svelte/compiler` for Svelte template/rune observations and existing Tree-sitter/ast-grep providers for other supported structural extraction. Record unsupported languages and parser errors explicitly.

## Deferred production closure

NEXT-08/NEXT-09/NEXT-12 still describe the separate persisted AST-v2, participant identity and live GraphRAG proof work. The five-node preflight in `docs/reports/graph-rag-single-source-preflight-20261017.md` remains diagnostic evidence for that track. Its missing admitted workspace binding does not stop the index-first A–G work.

Production relation admission, graph expansion to final Top-K, ContextManifest grounding and independent readback keep their existing gates. Source-revision deferral does not mark them passed or authorize fabricated lineage.

Before running any write-capable original batch command, inspect its actual current script and existing migration/writer contract. The July guide's command examples and code snippets do not independently establish current wiring or approval.

## Estimates and validation

The supplied A–G estimates sum to 29–39 hours. The sequential A–B–C–D–E subtotal is 19–26 hours. These are planning estimates; human review, service readiness and actual cohort size must be measured.

No indexing, migration, backfill, embedding, training or projection job was executed while making this correction.
