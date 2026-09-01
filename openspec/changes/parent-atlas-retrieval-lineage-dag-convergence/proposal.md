## Why

The current repository has stronger semantic-reader and OaK execution pieces
than the older single-task backlog describes, but the remaining work is spread
across historical retrieval, lineage, projection, and DAG entries. A new change
is needed to make the active gates explicit without reopening completed proofs or
creating another identity/control plane.

## What changes

1. Reclassify retrieval work into impact accounting, semantic-reader ownership,
   projection identity, dry-run bridge reconciliation, bounded canary, and final
   ownership freeze.
2. Keep source lineage gates open until full namespace and upstream revision
   coverage are proven.
3. Decompose DAG execution into exact implementation-reference binding, strict
   read owners, retained bound arguments, deterministic replay, and
   ContextManifest linkage.
4. Add a representation tournament comparing canonical `semantic_768`, native
   MRL, and learned latent representations on the same admitted cohort.
5. Add promotion-grade retraining requirements for the nested autoencoder without
   promoting the existing checkpoint.

## Non-goals

- No packet or source identity invention.
- No `packet_id = packet_key` assumption.
- No Qdrant point ID as canonical identity.
- No deletion or replacement of legacy Qdrant points in the initial canary.
- No production writes until lineage, projection ownership, authorization, and
  rollback proofs pass.
- No new vector store, graph identity, scheduler, or agent framework.
