# Parent Atlas RTX GPU Lab — gates

## GPU0 environment proof
- [ ] Existing `atlas-rapids-cu13` located.
- [ ] RTX visible from WSL via CuPy.
- [ ] cuDF/cuGraph/cuML/cuVS import.
- [ ] NetworkX >=3.4.
- [ ] nx-cugraph import.
- [ ] PyArrow import.
- [ ] Do not recreate environment if already valid.

## GPU1 CPU oracle
- [ ] Export one frozen graph edge list.
- [ ] NetworkX PageRank baseline.
- [ ] NetworkX BFS/Dijkstra baseline.
- [ ] DAG ancestors/descendants baseline where applicable.

## GPU2 nx-cugraph parity
- [ ] Same NetworkX code with GPU backend.
- [ ] PageRank parity.
- [ ] BFS parity.
- [ ] Dijkstra parity.
- [ ] ancestors/descendants parity.
- [ ] Record unsupported NetworkX functions instead of emulating silently.

## GPU3 native cuGraph
- [ ] PageRank.
- [ ] Louvain.
- [ ] Leiden.
- [ ] Compare against Neo4j GDS / NetworkX on frozen revision.

## GPU4 Arrow data plane
- [ ] CSV/DB export -> Arrow IPC.
- [ ] Arrow -> cuDF.
- [ ] Preserve canonical IDs/revisions.
- [ ] JSON remains debug/API, not GPU matrix transport.

## GPU5 cuVS exact
- [ ] semantic_768 numpy/Arrow matrix.
- [ ] brute-force exact top-k oracle.
- [ ] Compare Qdrant top-k.

## GPU6 CAGRA
- [ ] Build CAGRA on same vectors.
- [ ] Recall@k vs exact.
- [ ] latency/QPS/VRAM/build time.

## GPU7 IVF-PQ
- [ ] Build IVF-PQ on same vectors.
- [ ] Recall@k vs exact.
- [ ] memory/index-size comparison with CAGRA.

## Promotion
No GPU algorithm becomes production owner until:
- same frozen input;
- canonical identity preserved;
- parity/relevance metric recorded;
- no unexplained result drift;
- production owner decision explicitly documented.
