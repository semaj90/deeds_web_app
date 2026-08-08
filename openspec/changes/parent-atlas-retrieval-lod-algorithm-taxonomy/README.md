# parent-atlas-retrieval-lod-algorithm-taxonomy

Domain classification of the retrieval/ranking algorithm logic Parent Atlas needs long-term — a
DLSS/Tang-sampling-inspired "retrieval LOD" model (cheap coarse scan → oversample → progressively
exact rescore → learned promotion), organized into 12 algorithm domains with honest per-domain
status against the live `src/lib/server/retrieval/` tree. **Design/classification artifact only —
no code changes, no GPU/cuVS/cuGraph work authorized by this change.**

## Relationship to sibling changes (read these first — do not re-derive)

- **`parent-atlas-retrieval-fusion-reachability`** owns the *current* fusion-implementation census
  (13 duplicate/quasi-duplicate RRF owners) and is mid-flight (RF4 done, RF5 half-done, RF6 not
  started). This taxonomy's Domain 1 (Candidate Fusion) and Domain 5 (Ranking/Scoring) describe the
  **target** architecture RF6 should converge the 13 implementations toward — it does not replace
  or duplicate that census, and RF6 must finish before any of this taxonomy's Domain 1/5 build
  items start.
- **`parent-atlas-okf-knowledge-layers`** owns where durable, evidence-linked knowledge like this
  taxonomy actually lives long-term (OKF concept files under `docs/okf/parent-atlas/`, status
  vocabulary `PROVEN | PARTIAL_PROVEN | NOT_PROVEN | CONTRADICTED | STALE | MOCK | STUB | MISSING |
  BLOCKED`). This change reuses that vocabulary rather than inventing a new one, and registering
  this taxonomy as an actual OKF page is blocked on that change's `PARENT_ATLAS_KNOWLEDGE_GAP_AUDIT_V1`
  slice landing first.
- **`parent-atlas-graph-retrieval-proof`** owns `symbol_id`/`symbol_version_id`/`tree_node_id`
  identity lineage. Domain 2/3 (graph traversal, graph structural features) here depend on that
  identity split being proven — graph snapshot promotion is explicitly blocked there, so it's
  blocked here too.

## Hard boundary (per standing session instruction)

GPU/CAGRA/cuGraph/CUDA-GEMM/quantized-LOD work stays **deferred** until the identity/fusion
foundation in `parent-atlas-retrieval-fusion-reachability` (RF4–RF6) is proven. This document
exists so that when that foundation lands, the next architectural step is a classified plan instead
of an ad-hoc rediscovery — it is not a green light to start GPU work now.
