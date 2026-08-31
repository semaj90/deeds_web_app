# Proposal — Parent Atlas cuGraph Full PageRank Artifact

## Why

The deployed `:8098` cuGraph runtime already computes the complete V-length PageRank dataframe before the interactive endpoint selects a bounded top-K result. Persisting that bounded selection under the promoted `pagerank` metric would confuse partial challenger coverage with canonical full-graph coverage.

This change separates interactive bounded PageRank from full-vector parity artifacts and keeps the GPU-local dense vertex coordinate explicitly projection-local until a durable GraphOrdinal bridge is independently proven.

## Ownership

- `cugraph.pagerank` owns GPU execution only.
- The frozen graph projection owns node identity/revisions.
- `projectionOrdinal` is the dense local GPU coordinate from the loaded projection; it is **not** yet GraphOrdinal.
- `nodeKey` is the shared CPU/GPU parity identity.
- Arrow IPC owns the immutable full-vector transport artifact, not canonical graph truth.
- Canonical `pagerank` promotion requires a separate parity/promotion receipt.

## API split

- `POST /v1/graph/pagerank` remains bounded interactive execution (`TOP_K_SHADOW`).
- A future explicit full-vector artifact operation reuses the already-computed/cached full PageRank dataframe and emits an Arrow IPC file. It must not trigger a second PageRank kernel for the same parameter/revision key.

## Full-vector artifact

Columns are exactly:

- `projectionOrdinal` (`uint32`)
- `nodeKey` (`utf8`)
- `score` (`float64`)

The artifact intentionally excludes `packetKey`; packet collapse occurs only after graph-node parity/promotion.

## Promotion rule

`pagerank_cugraph_shadow` remains the only legal metric name for bounded cuGraph persistence until a full-vector parity receipt proves exact node-set/revision coverage and a separately frozen numeric parity policy passes.
