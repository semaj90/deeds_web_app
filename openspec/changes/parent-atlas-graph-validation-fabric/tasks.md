# Tasks — Parent Atlas Graph Validation Fabric

## GRAPH_SNAPSHOT_PARITY — CLOSED 2026-08-12

- [x] Frozen snapshot exporter (`nodes.parquet`/`edges.parquet`/`manifest.json`) —
      `sveltekit-frontend/scripts/atlas/export-graph-snapshot-parity-parquet.mts`. Large-file path
      uses DuckDB's native JSON reader (never Node `JSON.parse` on the 486MB corpus).
- [x] NetworkX CPU oracle + direct cuGraph GPU oracle, both with matching `--scores-out`/
      `--louvain-out` NDJSON contracts — `python/graph_snapshot_parity_networkx_oracle.py`,
      `python/graph_snapshot_parity_cugraph_oracle.py`.
- [x] `atlas-rapids-cu13` WSL2 RAPIDS env repaired (cuBLAS/nvidia-cublas version-skew bug, single
      targeted `pip install --force-reinstall --no-deps nvidia-cublas` fix). No new env needed.
- [x] Real cross-backend PageRank parity on full 162,234-node/108,156-edge corpus: top-50 overlap
      1.0, Spearman 1.0, max delta 4.9e-9.
- [x] Real cross-backend Louvain parity: exact `gpu_node_id` join (0 missing/duplicate both
      sides), ARI=1.0, NMI=1.0, community counts exact match, modularity to 10 decimals.
- [x] 5 real bugs fixed in the cuGraph oracle before trusting the Louvain result (unweighted-graph
      bug, deprecated `max_iter`, insufficient dense-ID proof, isolated-node double-count risk,
      oracle self-reported `PROVEN`→`EXECUTED` governance fix — only the joining orchestrator may
      claim cross-backend parity).
- [x] Receipt: `sveltekit-frontend/docs/reports/graph-snapshot-parity/receipt.json`, `status: PASS`.
- [x] Environment + file-relationship map: `sveltekit-frontend/docs/reports/graph-snapshot-parity/ENVIRONMENT-AND-FILE-MAP.md`.
- Commits: `647627d7a8` (parity close), plus supporting commits earlier same session.

**STOP boundary respected**: did not broaden into Leiden/HITS/BFS/SSSP, workstation compute
policy, RMM pooling, or ablation studies — those remain open per this proposal's own build order,
items 12+.

## Still open (not started this session)

- [ ] `graph_pagerank_nx_cugraph` mode (NetworkX-API dispatch to cuGraph backend) — proposal
      distinguishes this from direct cuGraph as a *compatibility dispatch validation*, not the
      runtime owner. Not implemented; direct cuGraph is proven, nx_cugraph dispatch is not.
- [ ] Leiden, HITS, BFS, SSSP parity modes.
- [ ] `GraphGpuContext`-reused-across-algorithms architecture exists in the cuGraph oracle
      (builds directed+undirected graph once, reuses for PageRank/components/Louvain) but does
      NOT yet expose per-stage benchmark receipts (parquet_read_ms/graph_build_ms/kernel_ms are
      computed and returned in the raw oracle JSON, but nothing persists/aggregates them yet).
- [ ] `ATLAS_COMPUTE_POLICY_V1` workstation scheduling (one heavy-compute-family at a time) — not
      implemented.
- [ ] Ablation studies (does PageRank/Louvain/AST/process/SOM actually improve retrieval) — none
      run.
- [ ] Registering `GRAPH_SNAPSHOT_PARITY`, the cuGraph oracle, and the two cuVS audit findings
      (see `ace-hyperrag-chr97-graphify-audit` change) in
      `docs/architecture/runtime-ownership-registry.json` — not done.

## GPU results are a validation benchmark, not canonical graph authority

Per this proposal's own hard rule: these results do NOT get promoted into canonical graph
persistence (`atlas_graph_authority_scores`, `page_rank_score` writes, etc.) until the separate
identity gates (GS1_12, semantic vector ownership exceptions, `SOURCE_REVISION_INDEX_SAFETY_PROVEN`)
close. That work is tracked elsewhere (`parent-atlas-workstation-todo.md`), not in this change.
