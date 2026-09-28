# Parent Atlas Python Graph Runtime

This package contains transport contracts and thin calls into graph libraries. It does not own graph
identity, source/workspace revisions, canonical persistence, or algorithm
implementations.

`GraphNodeKeyV1` and `GraphOrdinalMapV1` are owned by the existing Parent Atlas
TypeScript contracts. Python executors consume an already-frozen ordinal
projection and must return noncanonical receipts. The compatibility module
`atlas_compute/typed_graph_runtime.py` continues to expose its existing API.

`networkx_executor.py` exposes PageRank and weighted SSSP by delegating to the
existing compatibility implementation; it adds no graph math or alternate
identity. For PageRank comparisons, NetworkX is the CPU reference and cuGraph is the RAPIDS
GPU executor. `pagerank_parity.py` compares only outputs bound to the same graph
revision, input checksum, and explicit graph-ordinal-map checksum; it also verifies
the per-backend output checksums and compares scores by ordinal, never row order.
This helper is a comparison gate, not a production PageRank owner.

cuVS/CAGRA is a vector-neighbor search executor, not a PageRank backend. SIMT
PageRank kernels remain a separate experimental challenger and require a measured
capability/performance gap plus CPU/cuGraph parity before use. DuckDB may analyze
immutable Parquet/JSON receipts offline; it does not own graph identity, ranking,
or cache state. GPU memory/cache residency is runtime state and is not persisted
as canonical evidence.

Do not add hand-written PageRank, traversal, community-detection, or other
graph math here. Future cuGraph/cuVS executor wiring remains behind the GR7
parity gate in `parent-atlas-graph-runtime-enhancement`.
