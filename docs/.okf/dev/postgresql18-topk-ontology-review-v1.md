# PostgreSQL 18 Glossary and Parent Atlas Feature Taxonomy — Review v1

**Status:** REVIEW_ONLY / PROPOSAL_ONLY  
**Firecrawl source:** [PostgreSQL 18 Appendix M: Glossary](https://www.postgresql.org/docs/18/glossary.html)  
**Retrieved:** 2026-11-24; Firecrawl returned HTTP 200 and identified the page as PostgreSQL 18 documentation. Its structured extraction returned 146 glossary entries, including cross-reference-only aliases.

## Version distinction

Use **PostgreSQL** as the product/concept and `18` as a version dimension on the source document or corpus record. Do not make `PostgreSQL 18` a second OBO domain beside the existing `ATLASDOM:database.postgresql`. Version-specific behavior can be attached to the versioned source record and individual fact evidence. The domain classification stays `ATLASDOM:database.postgresql`.

The Firecrawl result is a discovery/extraction receipt, not canonical documentation admission. Ingest the official page through the existing external-document path to obtain a captured revision, exact chunk spans, and independent PostgreSQL readback. The 146 source entries should remain in that versioned documentation corpus; they should not all become OBO concepts. Many are database primitives, aliases, or cross-references rather than domain classes.

## Compact Top-K candidate key/value examples

These short definitions are paraphrased from the official glossary to make a review fixture. All rows remain candidates, with no OBO term IDs minted here.

```json
[
  {"term":"Asynchronous I/O (AIO)","definition":"Non-blocking I/O that allows concurrent operations.","domainLabel":"database.postgresql","sourceVersion":"18","status":"PROPOSAL_ONLY"},
  {"term":"Analyze (operation)","definition":"Collects relation statistics to guide query planning.","domainLabel":"database.postgresql","sourceVersion":"18","status":"PROPOSAL_ONLY"},
  {"term":"Buffer Access Strategy","definition":"Limits shared-buffer churn during large operations.","domainLabel":"database.postgresql","sourceVersion":"18","status":"PROPOSAL_ONLY"},
  {"term":"Extension","definition":"An add-on that provides PostgreSQL instance features.","domainLabel":"database.postgresql","sourceVersion":"18","status":"PROPOSAL_ONLY"},
  {"term":"Index (relation)","definition":"A derived relation that supports faster data access.","domainLabel":"database.postgresql","sourceVersion":"18","status":"PROPOSAL_ONLY"},
  {"term":"Multi-version concurrency control (MVCC)","definition":"Coordinates concurrent reads and writes using row versions.","domainLabel":"database.postgresql","sourceVersion":"18","status":"PROPOSAL_ONLY"},
  {"term":"Query planner","definition":"Chooses a plan for executing a query.","domainLabel":"database.postgresql","sourceVersion":"18","status":"PROPOSAL_ONLY"},
  {"term":"Relation","definition":"A database object represented by an ordered set of attributes.","domainLabel":"database.postgresql","sourceVersion":"18","status":"PROPOSAL_ONLY"},
  {"term":"Transaction","definition":"Commands executed as one atomic unit.","domainLabel":"database.postgresql","sourceVersion":"18","status":"PROPOSAL_ONLY"},
  {"term":"Write-ahead log (WAL)","definition":"Sequential journal of changes used for recovery and replication.","domainLabel":"database.postgresql","sourceVersion":"18","status":"PROPOSAL_ONLY"}
]
```

For evaluation, store each candidate with `sourceRef`, `sourceRevision`, `workspaceRevision` (where applicable), `termExtractorRevision`, exact excerpt/span, and a stable `featureKey`. Keep the page's product version separate from `sourceRevision`. A Top-K hit can be a ranking example; it is not automatically an admitted ontology fact or ACE citation.

## Where the other requested terms belong

| Term family | Existing state found | Recommendation |
|---|---|---|
| **PageRank** | Present in the retrieval vocabulary and NetworkX/optional GPU helpers. The advisory candidate sequence explicitly attaches it as metadata; keyword score drives Top-K ordering. | Keep it a graph-ranking feature. Do not add it as a new `database.postgresql` concept or an independent retrieval vote. |
| **RTX / CUDA** | OBO already has `ATLASPLAT` concepts for NVIDIA RTX and CUDA, plus `ATLASLANG:cuda_cpp`. | Reuse these platform/language concepts; attach their scores only as advisory features. |
| **PyTorch / LibTorch** | Already present in the GPU/native-interop keyword groups and CUDA build presets. | Keep framework/runtime terms in the compute vocabulary, separate from domain labels. |
| **Bitsets / byte and nibble encoding** | PFB1 already defines LSB0 bitsets, packed 4-bit nibbles, checksums, and a feature-map revision guard. | Register as encoding/transport features in the feature registry. The payload represents numeric signals; IDs, concepts, and provenance stay in the ordinal map/JSON. |
| **Polars / SGEMM** | No active source or keyword-corpus matches were found in the scoped code search. | Do not add yet. Add Polars only if a real batch-processing caller is selected; add SGEMM only if a named single-precision GEMM implementation is actually used. |

## Identity and feature owners

- OBO domain: `.okf/ontologies/atlas-domain-and-language-terms-v1.obo` (`ATLASDOM:database.postgresql`, RTX/CUDA platform terms).
- Feature tracking: `sveltekit-frontend/src/lib/server/db/schema/feature-registry.ts` (`featureKey`, title, status, source/code/test refs).
- Packet feature identity: `sveltekit-frontend/src/lib/server/db/schema/atlas-packets.ts` (`feature_id`, `feature_label`). A `feature_label` is display/classification metadata; it is not a substitute for the registry key or ontology concept ID.
- Packed feature ABI: `python/atlas_graph_runtime/packed_feature_block_v1.py` (`PFB1` bit/nibble validation and feature-map revision check).
- Graph-ranking reference: `python/atlas_compute/advisory_candidate_sequence_v1.py` and `python/atlas_graph_runtime/networkx_executor.py`.

## Proposed evaluation order

1. Use the PostgreSQL 18 page as versioned external documentation and capture its exact source spans through the existing document-admission/readback owner.
2. Build a small held-out Top-K query set around the ten database terms above, including code identifiers such as `sourceRevision` only in a separate code vocabulary.
3. Classify to `ATLASDOM:database.postgresql`; preserve term hits, PageRank, GPU/backend, and PFB1 features as separate named signals.
4. Register stable feature definitions before emitting packed arrays. Keep PFB1 feature ordinals bound to a versioned feature map; never encode source or OBO identity as a nibble.
5. Compare lexical Top-K against the baseline before adding PageRank or GPU execution. Treat any graph score as advisory, and require the same frozen candidate map for CPU/GPU comparisons.

No OBO, keyword-corpus, feature-registry, PostgreSQL, or runtime changes were made by this review.
