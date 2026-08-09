# Parent Atlas RTX GPU Lab

Purpose: add the missing GPU-oracle and parity files around the existing Parent Atlas stack.

This is NOT a new canonical graph or vector database.

Roles:
- NetworkX: CPU correctness oracle.
- nx-cugraph: zero/minimal-code GPU backend for supported NetworkX algorithms.
- cuGraph: native GPU graph analytics.
- cuVS brute force: exact vector oracle.
- cuVS CAGRA: GPU ANN candidate.
- cuVS IVF-PQ: compressed GPU ANN candidate.
- cuDF/CuPy: GPU tables/arrays.
- Apache Arrow IPC: columnar exchange format.
- Qdrant: production online vector retrieval.
- Neo4j/GDS/APOC: operational graph projection/query layer.
- Postgres: canonical truth/provenance.

Supported nx-cugraph categories in RAPIDS 26.06 include:
centrality, Louvain/Leiden, connected components, k-core/k-truss,
PageRank/HITS, many shortest paths, BFS traversal, and DAG ancestors/descendants.
Do not assume unsupported NetworkX APIs are GPU accelerated.

Promotion:
CPU oracle -> GPU parity -> latency/VRAM -> production experiment.
