# Parent Atlas Python Graph Runtime

This package contains transport contracts and, only when a separately gated
consumer is ready, thin calls into graph libraries. It does not own graph
identity, source/workspace revisions, canonical persistence, or algorithm
implementations.

`GraphNodeKeyV1` and `GraphOrdinalMapV1` are owned by the existing Parent Atlas
TypeScript contracts. Python executors consume an already-frozen ordinal
projection and must return noncanonical receipts. The compatibility module
`atlas_compute/typed_graph_runtime.py` continues to expose its existing API.

Do not add hand-written PageRank, traversal, community-detection, or other
graph math here. Future cuGraph/cuVS executor wiring remains behind the GR7
parity gate in `parent-atlas-graph-runtime-enhancement`.
