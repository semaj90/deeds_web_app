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

## GPU3a spectral challenger
- [x] Add bounded spectral request/response contract and non-mutating sidecar route.
- [x] Preserve graph/projection revisions, topology hash, ordinal identity, and
      explicit non-authority status.
- [ ] Activate WSL2 RAPIDS and prove cuGraph spectral execution on the frozen SM86 fixture.
- [ ] Compare CPU/reference and cuGraph assignments with the same ordinal checksum.
- [ ] Record RAPIDS/cuGraph/cuVS/CUDA/driver versions and GPU memory observations.
- [ ] Keep Qdrant/Valkey/Neo4j projections read-only until parity passes.

## GPU0a numerical ownership
- [x] Keep TypeScript limited to descriptors, revisions, ordinals, Zod gates,
      admission, and receipt verification.
- [x] Move low-rank length-squared reduction and sampling to the Python/PyTorch
      owner in `python/atlas_compute/low_rank.py`.
- [ ] Prove CPU/PyTorch-CUDA parity on the same frozen CandidateOrdinal artifact.
- [x] Bounded PyTorch CPU↔CUDA low-rank parity fixture; full-corpus artifact
      parity remains open.
- [x] Read-only `256 × 768` prefix of `vector-snapshot-5k-768` returned
      `PARITY_PROVEN` with `semantic_768` lineage.
- [ ] Run the complete frozen artifact with CandidateOrdinal-map checksum and
      persist a revision-qualified, non-authority receipt.
- [x] Execute the complete read-only `5,000 × 768` `semantic_768` artifact.
- [x] Full frozen `5,000 × 768` artifact passes the scale-aware CPU/CUDA
      parity gate: max relative singular-value delta `1.97203e-4`, relative
      reconstruction-error delta `4.44651e-5`, and valid sample bounds.
- [x] Join the full receipt to the complete CandidateOrdinal map using the
      frozen ordered-`packet_key` checksum
      `b77644ae7a9f87ebb08a8a26e990f76acc003df06a145ace36db59885c84bfd2`;
      retain `canonical_authority=false`. Absolute singular-value delta
      `1.17798e-2` remains diagnostic backend variance.
- [ ] Add cuBLASLt/custom CUDA only after a measured profiler bottleneck exists.

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
