# Graphify canonical regeneration review — 2026-11-01

**Verdict: ARTIFACT_REPLACEMENT_VERIFIED; SOURCE_LINEAGE_AND_GRAPHIFY_ADMISSION_UNVERIFIED.** This read-only review did not launch, stop, or alter an indexer; remove a lock; touch Redis; or run downstream materialization.

## Observed state

- No `node.exe` command line matching `index-codebase-fast` was active at inspection time. `sveltekit-frontend/docs/graph/.codebase-graph.lock` was absent.
- The canonical `codebase-graph.json` was last written at `2026-11-01 21:49:11 UTC`, is 40,285,280 bytes, and hashes to `F85C6C27722FEDCCC423836960F4946929392E5303285BE12C52858B2D0BF4CC`. This differs from the previously reported original hash prefix `5325902f29d1f9b1`.
- The canonical JSON carries run ID `2026-11-01T21-44-29-668Z-13244`. Its matching receipt at `sveltekit-frontend/docs/graph/.build/codebase-graph.2026-11-01T21-44-29-668Z-13244.receipt.json` records `validated: true`, `published: true`, `isCanonicalScope: true`, `fileCount: 36568`, and `generatedAt: 2026-11-01T21:49:09.083Z`. A streaming count of `rel` fields also returned 36,568.
- Receipt `snapshotSourceRoot` and `workspaceRevision` are both null. Therefore the regenerated graph has no verified source snapshot/revision binding. `published: true` records the requested mode; the matching run ID in the canonical JSON proves that the JSON rename did occur, but neither field proves source authority or Graphify admission.
- `codebase-map.md` was updated at `21:49:12 UTC` and contains generated time `2026-11-01T21:49:09.055Z`; SHA-256 is `16EFAE15F63623411AAD744E68E0132C88FC33482BF554C6429BB3882F47C56`. It is contemporaneous with the graph, but the graph receipt does not independently bind the Markdown hash.
- Local indexer validation only checks that the parsed `files` array is nonempty and its count equals the in-memory scan count. It does not establish per-file checksums, a non-null workspace revision, or Graphify admission. The graph JSON serialization contains paths/metadata but no per-file source digest.
- The graph reports G4 `routesWithoutAuth: 32`, while the generated Markdown's API-only list reports 31 and prints only the first 30 entries. The source confirms these are different populations: `gateStats.routesWithoutAuth` counts server routes generally; `noAuthApis` counts API routes. Treat both as diagnostic counts, not a single reconciled number.
- G15's reported `ssrUnsafeCount: 0` is not a valid full-workspace result: the local script sets `ROOT` to the parent repository for this run, but computes the count only for paths beginning `src/`; this workspace's SvelteKit application files are under `sveltekit-frontend/src/`. The check therefore excludes the app source. Do not rely on this G15 zero.
- The same artifact reports G5 with 2 body-parsing API routes missing Zod, G16 with 84 server routes lacking test pairing, and G20 with 17 cyclic import pairs. These are indexer observations, not independently revalidated against a revision-bound source manifest in this review.

## Interpretation and next gate

The second attempt is no longer an unknown process outcome: it completed far enough to replace the canonical graph JSON, and the matching receipt exists. However, it published a full-workspace scan with **no workspace revision or snapshot root**, and at least one reported gate (G15) is invalidated by a scope-prefix bug. Treat this as a newly generated but lineage-unqualified diagnostic artifact, not as an admitted current-source Graphify snapshot. Do not run another index, Redis indexing, Graphify materialization, Qdrant promotion, or scheduled maintenance to compensate.

Before any future canonical regeneration, require a trusted immutable workspace revision/snapshot manifest, verify every included source against that manifest, bind JSON and Markdown outputs to one receipt/checksum set, and validate Graphify admission independently. The user-reported `--skip-redis` flag is not recorded in the receipt; the local script honors that flag by making `rset` a no-op, but Redis non-mutation was not independently read back here.

**Evidence limits:** the process/lock checks are a point-in-time observation. This review did not parse the 40 MB graph into memory, verify all source paths/content, query Redis, or inspect any live Graphify authority table.
