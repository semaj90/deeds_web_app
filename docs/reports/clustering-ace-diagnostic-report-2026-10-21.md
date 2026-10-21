# Clustering baseline and ACE diagnostic bridge (2026-10-21)

**Status:** diagnostic component milestones only. Cohort UNQUALIFIED_COMPARISON. Not production admission. aceAdmissionEligible is false for every packet. No writes, no GPU run, no :8090 changes, no commit.

## D1 Audit
- Rows match manifest and matrix checksum: True / True
- Non-finite values: 0; max norm deviation 1.45e-08
- Distinct files in sample: 11479
- Caveat: sveltekit-frontend/memory/runs (3371 rows) and scripts/api-cleanup/reports (1179) are generated artifacts and dominate the sample. Clusters may reflect generated output.
- Embedding recipe: UNKNOWN per row.

## D2 CPU baselines (same frozen matrix, Python 3.13)

| Method | k | dims | mean ARI | silhouette (cos, 2k) | same-cluster NN | empty | size min-max | sec |
|---|---|---|---|---|---|---|---|---|
| kmeans_full768 | 16 | 768 | 0.5795 | 0.0779 | 0.7435 | 0 | 620-1417 | 5.87 |
| kmeans_full768 | 32 | 768 | 0.6439 | 0.0701 | 0.706 | 0 | 129-899 | 5.08 |
| kmeans_full768 | 64 | 768 | 0.5875 | 0.066 | 0.6672 | 0 | 54-447 | 10.96 |
| kmeans_full768 | 128 | 768 | 0.5234 | 0.0772 | 0.5943 | 0 | 12-308 | 15.05 |
| minibatch_full768 | 32 | 768 | 0.4311 | 0.0632 | 0.6795 | 0 | 120-903 | 6.29 |
| minibatch_full768 | 64 | 768 | 0.4491 | 0.0599 | 0.6374 | 0 | 65-505 | 11.15 |
| spherical_pca128_train | 32 | 128 | 0.6777 | 0.1314 | 0.7405 | 0 | 187-846 | 1.96 |

- PCA-128 is fitted on the training split only. Spherical KMeans on unit vectors is Euclidean KMeans ordering, not a distinct algorithm.
- Silhouette stays between 0.05 and 0.13. Cluster boundaries are weak at every setting.
- Source-held-out (file-level split; leakage check passed): k=32 same-cluster NN 0.6147; k=64 0.572. Held-out scores are lower than in-sample; that is the honest figure for unseen source.
- The PCA row's NN and silhouette are in a different space; compare its stability, not its absolute values.
- Peak working set 695.1 MiB.
- MiniBatchKMeans is less stable (ARI 0.43-0.45) than full KMeans.

## D3 Symbol-registry coverage (6,640-file denominator)
- Current rule (kinds function, class, variable, method, interface, type): **4584 / 6,640 = 69.04%**
- 12 files were rejected by the sidecar for size (200,000 character limit; generated protobuf). 4 are empty.
- Finding: the sidecar labels top-level const declarators as kind fragment, node_type variable_declarator. The current rule never counts them. On a 300-file sample of proposal-only .ts files, 284 of 300 (94.7%) carry named declarations under a node-type rule.
- Projected coverage under the node-type rule: about 81.69%. This is a sample projection, not a measured result. The rule is not changed here; the rule and threshold need a decision.
- Svelte: 933 proposal-only files. This is a Svelte LSP qualification gap, not a parser gap.
- Owners to use first: Svelte compiler (host-only, compiler-semantic-resolver-v1.mjs) and sidecar Tree-sitter on :8095. No new parser proposed.
- No full-corpus AST writes were run.

## D4 Diagnostic ACE proposal adapter
- Module: scripts/atlas/clustering-ace-diagnostic-adapter-v1.mjs (pure; imports only node:crypto).
- Does not implement the SearchRuntime production owner. Does not mint canonical packet keys.
- Run on 50 real sample rows: proposed 50, rejected 0, admission-eligible 0, source revision qualified 0, identity keys unique True, checksum reproducible True.

## D5 Tests
- node --test scripts/atlas/clustering-ace-diagnostic-adapter-v1.test.mjs: 11 of 11 pass. Covers determinism, label invariance, no fabricated labels, fail-closed revisions, placeholder rejection, vector validation, missing identity, held-out leakage, no I/O imports, and non-canonical output.

## Blockers
1. No revision-qualified cohort: 0 chunk rows have source or workspace revisions. Backfill is deferred until after Phase 20.
2. GPU (cuML KMeans): RESOURCE_BLOCKED. Needs an approved window; :8090 not stopped.
3. Symbol coverage rule decision (current 69.04% vs projected about 81.69%); threshold 80 vs 90 still open.
4. Phases E (DAG), F (MCP lookup) and the SOM 20x20 comparison are not started.
5. Production admission needs independent receipts. None exist.

## Next safe command
node --test scripts/atlas/clustering-ace-diagnostic-adapter-v1.test.mjs
