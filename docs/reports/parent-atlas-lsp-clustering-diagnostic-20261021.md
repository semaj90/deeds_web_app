# Parent Atlas Svelte LSP and CPU Clustering Diagnostic

**Status:** Diagnostic only. No production admission or durable AST/vector/ACE writes.

## Svelte LSP

- The four-file frozen fixture covers Svelte 5 runes, module/instance TypeScript, Unicode, and CRLF. It returned stable symbol sets on two runs and showed embedded-TypeScript definitions beyond the small Tree-sitter chunk set. Three synthetic LSP symbols had invalid spans and were rejected. Receipt: `.tmp/atlas/svelte-lsp-fixture-v1/probe-receipt-run2.json`.
- The full-project control copied 25,544 files / 473,214,507 bytes with zero hash mismatches, linked the installed Svelte dependencies, and generated `.svelte-kit/tsconfig.json`. The TypeScript-plugin `documentSymbol` request timed out after 306,864 ms and again after 60,015 ms on the same server. Receipt: `.tmp/atlas/prepared-svelte-lsp-warm-1792554994675.json`.
- The separate 35-symbol minimal-project result is not full-workspace semantic qualification. The full project has no frozen package lock; Vite config resolution also fails on `unocss/vite`, but this has not been proven to cause the LSP timeout.
- The existing resolver exposes document symbols and definition requests, but no references request. Span-correct fixture symbols do not establish repository-wide definitions/references.
- Result: `SVELTE_LSP_SNAPSHOT_QUALIFIED` remains unmet. Embedded TypeScript extraction and NLP receipts keep their independent diagnostic status.

## Read-Only Cohort Check

- `codebase_chunk_index`: 274,465 rows; 274,428 vectors; zero populated `source_revision`, `workspace_revision`, or `representation_revision` fields. No chunk qualifies through those columns.
- A separate `atlas_source_refs` sample of 4,000 rows matched 3,352 current-disk hashes and mismatched 648. This sample is not a frozen-snapshot/revision proof and is not an eligible cohort.
- Receipts: `.tmp/atlas/corpus-clustering-v1/p1-revision-counts-current.txt` and `.tmp/atlas/corpus-clustering-v1/p1-lineage-probe-current.json`.

## CPU Stability Sweep

The experiment verifies and uses the existing frozen 19,990 × 768 F32 matrix; no vector export or database query occurs during fitting. Matrix checksum: `sha256:5aa0f499139195390738a95d920fcd421b6e9626fc5c1f23f23432bd7e25eb3e`. Cohort remains `UNQUALIFIED_COMPARISON`.

Settings: CPU-only; CUDA disabled; KMeans and MiniBatchKMeans plus a custom spherical KMeans implementation; `k = 16, 32, 64, 128`; seeds 42, 7, 123; five initializations per seed; max 100 iterations. Silhouette uses the same deterministic 2,000-row subset; neighbor retention uses 2,000 query rows and exact top-10 cosine neighbors.

| Algorithm | k | Mean pairwise ARI | Mean cosine silhouette | Same-cluster top-10 rate | Minimum cluster size | Fit time |
|---|---:|---:|---:|---:|---:|---:|
| KMeans | 16 | 0.621 | 0.065 | 0.741 | 287 | 0.7 min |
| KMeans | 32 | 0.625 | 0.071 | 0.705 | 120 | 1.3 min |
| KMeans | 64 | 0.625 | 0.075 | 0.666 | 44 | 1.6 min |
| KMeans | 128 | 0.529 | 0.069 | 0.618 | 20 | 3.3 min |
| MiniBatchKMeans | 16 | 0.448 | 0.068 | 0.720 | 301 | 0.1 min |
| MiniBatchKMeans | 32 | 0.414 | 0.060 | 0.684 | 122 | 0.2 min |
| MiniBatchKMeans | 64 | 0.475 | 0.069 | 0.643 | 7 | 0.3 min |
| MiniBatchKMeans | 128 | 0.429 | 0.059 | 0.601 | 4 | 0.9 min |
| SphericalKMeans | 16 | 0.649 | 0.079 | 0.735 | 166 | 4.6 min |
| SphericalKMeans | 32 | 0.733 | 0.073 | 0.703 | 125 | 3.5 min |
| SphericalKMeans | 64 | 0.600 | 0.082 | 0.666 | 20 | 3.5 min |
| SphericalKMeans | 128 | 0.538 | 0.073 | 0.622 | 1 | 3.8 min |

Peak process RSS was approximately 446 MiB; total fit time was 23.7 minutes. No empty clusters were observed. Spherical `k=32` was most stable in this comparison, but silhouettes remain low (0.059–0.082); this is not evidence for semantic domains, taxonomy labels, or improved judged-query Recall@10. Receipt: `.tmp/atlas/corpus-clustering-v1/kmeans-stability-sweep-v2-1792557216.json` (`sha256:9b18c971c0aed0f7305f6adab7a41214ebc5babcd1f085baddb538b678aacf1f`); reproducible runner: `.tmp/atlas/corpus-clustering-v1/k-sweep-stability-v2.py`.

## ACE Boundary

The existing clustering adapter proposed 50 diagnostic packets and found zero revision-qualified or ACE-admission-eligible rows; it performed zero writes. This does not constitute a Svelte-feature-specific `ContextManifest`. No production manifest or DAG was built because the source/representation cohort remains unqualified. Existing receipt: `.tmp/atlas/corpus-clustering-v1/d4-diagnostic-run-receipt.json`.

## Next Gates

1. Diagnose why full-project Svelte TypeScript-plugin requests time out; keep the 35-symbol minimal control and four-file fixture diagnostic-only.
2. Finish the frozen source scan against its corrected 2,682-row eligible manifest. Latest independent checkpoint: 1,088 processed, 1,594 remaining, 427 explicit exclusions, zero failures or writes; `.tmp/atlas/indexed-source-server-coverage-chain-v1.json` (page 136, `.tmp/atlas/indexed-source-batch-1792559106451.json`).
3. Resolve source/workspace/representation provenance through its authoritative writer or independently verified receipts; do not infer it from current disk byte matches.
4. Only then build a source-qualified query-to-ContextManifest slice and evaluate cluster-filtered retrieval on judged queries.

**Stores:** no PostgreSQL, Qdrant, cache, Neo4j, or production embedding writes. No CUDA resource window, Graphify promotion, or QLoRA training was used.
