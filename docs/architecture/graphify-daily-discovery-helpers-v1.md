# Daily Graphify discovery helpers

Use these commands from `sveltekit-frontend` for routine repository discovery:

```powershell
npm run graphify:daily:inspect
npm run graphify:daily:inspect -- --sizes --hash-graphs
npm run graphify:daily:search -- --query ContextManifest --limit 12
npm run graphify:daily:search -- --query FunctionRegistryEntryV1 --include-untracked --limit 6
npm run graphify:daily:search -- --query tree_node_id --owner parent-atlas-retrieval-lineage-dag-convergence
npm run graphify:daily:search -- --query packetKey --receipt docs/reports/example.json
npm run graphify:daily:helpers:test
```

`inspect` counts physical root directories and tracked paths using NUL-delimited Git output. `--sizes` additionally measures working-tree file metadata by directory and counts missing files; unmeasured sizes/missing counts remain null. Installed dependencies and ignored contents are not traversed. Submodule Git links are reported separately. The membership checksum covers tracked path names, not source bytes or a canonical workspace revision. Discovery candidate counts are path/extension hints; current ignore rules and size limits still apply during `rg` execution.

Graph inspection reports file size, mtime, Git tracking, ignore rules, and a 24-hour mtime threshold. Optional hashing streams graphs up to 64 MiB, compares the root/app compatibility copies, and skips the large frozen parity snapshot. Equal hashes or recent mtimes do not qualify source lineage. The existing graph producer and consumer paths remain explicit in the output.

`search` first reads `docs/architecture/runtime-ownership-registry.json` and ranks its declarations by literal query-term overlap. Declared proof statuses are returned as declarations; a current live proof is not inferred. It searches an explicitly named OpenSpec ledger or receipt plus the focused topology/CUDA architecture TOCs, followed by bounded `rg` matches in:

- `sveltekit-frontend/src`
- `packages`
- `python`
- `simd-bridge`
- `scripts/atlas`

The source search obtains tracked paths from Git, applies source-extension and directory filters, then sends up to 250 filename-prioritized candidates in small batches to `rg`. `--include-untracked` additionally enumerates nonignored new source paths and can take longer in a large checkout. It excludes dependencies, environments, caches, build output, vendor, archives, generated docs/reports, symlinks and secret environment files. Only the exact requested report and owning `tasks.md` are searched outside that scope. Queries are literal strings passed as subprocess arguments with shell execution disabled. Results prioritize selected evidence, then filename-hint batches with path/line ordering; they are discovery suggestions, not SearchRuntime relevance scores or an extra RRF vote.

Default limits: 250 candidate source files, 20 matches (maximum 100), five matches per file, 2 MiB per source/evidence file, 320-character excerpts, ten seconds and 4 MiB subprocess output per search group. File sizes are checked before explicit-file `rg` calls; an explicitly selected oversized ledger/receipt fails with `SELECTED_EVIDENCE_EXCEEDS_2_MIB`. Each result reports its limits and whether the candidate/match bound truncated the search. `NO_MATCHES` means no matches within that declared scope. An unavailable/failed `rg` returns `SEARCH_FAILED` with a nonzero CLI exit, rather than an empty successful lane.

Output is JSON on stdout. To save a local receipt, pass `--output docs/reports/<new-name>.json`. Creation is exclusive: existing reports are preserved. The receipt distinguishes local artifact creation from source/datastore writes. No database, embedding, service, GPU, model, cache or workboard mutation is performed.

The existing `graphify:daily` maintenance command retains its lifecycle/admission checks and apply stages. These discovery commands do not invoke it. OpenSpec `tasks.md` remains the task ledger, and workboard generation remains with `build-openspec-workboard-v1.mjs`.

Checkout observations (2026-10-15 local / 2026-10-16 UTC): a routine inspection plus optional graph hashing completed in approximately 2.4 seconds; a bounded `SearchRuntime` search completed in approximately 2.6 seconds. Measuring sizes across all tracked paths took approximately 20 seconds in a separate run. These are local smoke timings, not a benchmark or retrieval-quality evaluation. The inspection reported 139 physical root directories, 34,731 tracked paths, and 4,696 tracked directory prefixes. The two compatibility graphs had matching hashes; their mtimes were stale. The frozen 486 MB parity snapshot was skipped by the hash cap.

Inspection receipt: `docs/reports/graphify-daily-discovery-inspect-20261016T023157929Z.json`. Successful source-search receipt: `docs/reports/graphify-daily-discovery-search-20261016T023817737Z.json`. Earlier timed-out discovery attempts are preserved as separate reports; the final helper uses a 250-file candidate budget and tracked-source discovery by default.

Implementation: `scripts/atlas/graphify-daily-discovery-v1.mjs` and `scripts/atlas/lib/graphify-daily-discovery-v1.mjs`. The latter reuses the existing `repo-scan-roots.mjs` exclusion policy for tracked-source inventory eligibility. Tests use isolated temporary Git repositories, actual `rg` queries and graph fixtures.
