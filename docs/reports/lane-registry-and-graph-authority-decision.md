# Lane Registry and Graph Authority Decision

Date: 2026-07-22

## Decision

Build the workstation as a layered semantic organization and evidence system for Go Retrieval.

Do not collapse retrieval, clustering, authority, documentation grounding, and workflow state into one classifier or one Graphify script.

## Lane registry

The registry now separates the active vector lanes by contract and role:

| Lane | Contract | Role | Status |
| --- | --- | --- | --- |
| Retrieval projection | `atlas-embeddinggemma-direct-slice384-v1` | canonical | active |
| Native source embeddings | `embeddinggemma-full768-v1` | native | active |
| Routing latent | `atlas-autoencoder-768x64-v1` | derived | active |
| Topology projection | `atlas-topology-embedding-128-v1` | derived | active |
| Fixer memory | `fixer-memory-768-v1` | native | active |
| Attention reranker | `attention-reranker-768-v1` | native | active |
| Legacy content vector | `legacy-content-768-v1` | legacy | compatibility only |
| Legacy error vector | `legacy-error-768-v1` | legacy | compatibility only |
| Legacy signature vector | `legacy-signature-768-v1` | legacy | compatibility only |

The registry file is:

- `sveltekit-frontend/src/lib/server/vector/lane-registry.ts`

## PageRank split

PageRank remains a derived authority feature.

Required split:

- `pagerank_raw` for stationary PageRank output
- `pagerank_l1` for explicit L1Norm-normalized authority mass
- `authority_percentile` for graph-snapshot relative rank
- `authority_band` for coarse routing bands
- `authority_score` only as a legacy compatibility alias, not as the contract name

Current graph scripts still mix these values in the write path. That is the next graph gate, not the current lane registry gate.

## Catchblock inventory

Targeted source/doc scans were run in the high-signal directories.

Observed result:

- no `catchblock` matches were found in the focused source/doc passes
- the repo-wide sweep was too broad to complete in one pass

So the inventory is **not globally proven**, but the known high-value lanes did not surface any `catchblock` usage.

## Why this split matters

- Canonical retrieval should remain 384-dim and explicit.
- Native 768 lanes must be tagged as native, not implied canonical.
- Legacy 768 lanes must remain callable until migration, but they should not masquerade as the current contract.
- 64-dim latent vectors are routing features, not semantic truth.
- 128-dim topology vectors are structural projections, not domain labels.
- PageRank is authority evidence, not meaning evidence.

## Next steps

1. Split PageRank raw, L1, percentile, and band writes.
2. Retire `authority_score` and `page_rank_score` as primary contract names.
3. Tag the remaining graph consumers as raw-authority or legacy consumers.
3. Promote the lane registry into the Go Retrieval evidence selection contract.
4. Re-run the workstation audit after graph lanes are separated.
5. Add a tighter catchblock inventory script if the repo-wide scan remains too broad.
