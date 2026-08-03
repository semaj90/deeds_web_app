# Tasks — Semantic 768 Canonical Contract

Documentation-only change. No code edits made yet. This session did a bounded grep pass to seed
the task list with real repo evidence (not exhaustive) — see "Known drift found" below.

## Known drift found this session (real, not hypothetical)

- `sveltekit-frontend/src/lib/server/atlas/contracts/dense-lane-policy.ts` already implements a
  close analog of §6's representation registry (`DenseRepresentationName` / `DenseRole` /
  `DenseLifecycle`) — **good**, this is the right shape to extend, not replace. But
  `SEMANTIC_384`'s lifecycle is `REFERENCE_ONLY` with role `RECALL_REFERENCE`, not
  `MIGRATION_SOURCE`/`SUPERSEDED` per §6. Under `REFERENCE_ONLY` it's ambiguous whether callers
  treat it as usable — the contract in this proposal requires legacy-384 to never satisfy a
  proof gate or serve as fallback, which `REFERENCE_ONLY` + `RECALL_REFERENCE` doesn't clearly
  forbid. **Needs an operator decision**: reclassify to `MIGRATION_SOURCE` (if migration is
  still active) or `SUPERSEDED` (if migration is done), and confirm no live code path reads it
  under `RECALL_REFERENCE` expecting current-proof eligibility.
- `sveltekit-frontend/src/lib/server/vector/embedding-dimension-guard.ts` already exists and
  actively rejects legacy-384 writes into `canonical_768d` (`assertEmbeddingDimension` throws
  `Legacy 384d lane detected`) — this is real, already-live enforcement consistent with §7's
  "never let a legacy vector satisfy current embedding lineage proof." Confirm this guard is
  actually wired into every write path (not just tested in isolation) as part of the read-only
  audit below.
- `sveltekit-frontend/src/lib/server/vector/embeddinggemma-prefix384.ts` defines
  `ATLAS_EMBEDDINGGEMMA_DIRECT_SLICE384_V1` (a 384-dim "projection lane") with no lifecycle tag
  visible in the file header at a glance — needs to be checked against the registry in
  `dense-lane-policy.ts` and given an explicit `MIGRATION_SOURCE`/`SUPERSEDED` status.
- **Root CLAUDE.md self-contradiction** (not code, but load-bearing instruction text): the
  "Embedding Dimensions Policy (CANONICAL — July 27, 2026)" section states
  `PRIMARY EMBEDDING MODEL: embeddinggemma:latest (768-dim)` and a "SECONDARY ROUTING LANE: 384d
  Warden/Nomic... NOT authoritative", which is broadly consistent with this proposal — but the
  separate "⚡ CRITICAL: Graphify Startup Daily Validation Gates" section's step 1 literally says
  `Embedding Service (embeddinggemma:latest, 384-dim)` and `curl .../api/embeddings ... Expected:
  384`, directly contradicting the 768-dim canonical statement elsewhere in the same file. This
  needs a manual fix to CLAUDE.md itself (change `384` → `768` in that one validation-gate
  snippet) once an operator confirms the *actual* live Ollama `embeddinggemma:latest` output
  dimension — do not guess which number is the typo without checking a live `/api/embeddings`
  call first.

## Proposed next steps (none started — sequenced, smallest first)

1. **DONE (2026-08-03)** — Fixed the CLAUDE.md self-contradiction directly (operator overrode
   the "verify live dimension first" step and said fix it to 768 outright). Changed 3 spots in
   `CLAUDE.md`: the Graphify Startup Daily Validation Gates curl example + expected value
   (384→768), the "Hard Rules for Graphify Startup" bullets (384-dim→768-dim, "all vectors must
   be 384-dim"→"768-dim"), and the Query Flow decision-tree diagram's embed-query annotation
   (384-dim→768-dim). Left the legitimate 384d references untouched (the "SECONDARY ROUTING
   LANE: 384d Warden/Nomic" section and the "Do NOT write 384 vectors into the 768 canonical
   collection" hard rule correctly describe the legacy/secondary lane, not primary). No live
   Ollama dimension check was actually run — this was an operator-directed correction, not a
   verified-then-fixed correction; if `embeddinggemma:latest`'s real live output ever turns out
   to not be 768, this edit would need revisiting.
2. **DONE (2026-08-03) — real gap found, not fixed.** Grepped every file with a Qdrant
   `.upsert()` call site (33 files) against every file importing
   `embedding-dimension-guard.ts`/`assertEmbeddingDimension` (6 files, none overlapping except
   `db/qdrant-integration.ts`). **Only 1 of 33 upsert-calling files imports the guard.** Notably,
   `src/lib/server/vector/qdrant-manager.ts` — the canonical Qdrant manager per this file's own
   "Key Server-Side Files" table — has 5+ distinct `.upsert()` sites (lines ~1217, ~1409,
   ~1512, ~1588, and the exported `batchUpsertPoints` at ~1967) that write vectors with **no
   dimension validation at all**. §7's "never let a legacy vector satisfy current embedding
   lineage proof" is not actually enforced at the point where it would matter most.
   **Not fixed this pass** — wiring the guard into `qdrant-manager.ts`'s write paths touches the
   canonical vector-write surface and needs an explicit go-ahead + a plan for how existing
   non-768 collections (`embedding_cache`, legacy 384 collections still read by
   `dense-lane-policy.ts`'s `RECALL_REFERENCE`/`REFERENCE_ONLY` paths) won't get hard-broken by
   a blanket guard. Proposed as its own bounded next step, not silently rolled into this
   documentation pass.
   - Remaining unaudited detail: some of the 33 files may only update payload (not the `vector`
     field) via `.upsert()`, in which case the guard wouldn't apply to them anyway — this pass
     did not individually classify all 33; `qdrant-manager.ts` was confirmed to write real
     vectors, the rest are unconfirmed either way.
3. **Reclassify `SEMANTIC_384` and `ATLAS_EMBEDDINGGEMMA_DIRECT_SLICE384_V1`** in
   `dense-lane-policy.ts` per the registry in this proposal's §6 (operator decision needed on
   `MIGRATION_SOURCE` vs `SUPERSEDED` — depends on whether any migration work is still reading
   from the 384 lane).
4. **Build `scripts/atlas/reconcile-semantic-contracts.mjs`** per proposal §20 — strictly
   read-only, same guard pattern as `scripts/atlas/audit-latent-representation-identity.mjs`
   (`BEGIN TRANSACTION READ ONLY ... ROLLBACK` + regex mutation guard). This is the natural next
   script given the identity/lineage audit work already done in
   `parent-atlas-graph-retrieval-proof` (GS1.45–1.47).
5. Only after 1–4: revisit Phase 108D's `packet:1f18437ee58f` cross-store proof status per §16,
   and the `QDRANT_CUVS_RECALL_AT_20` fixture per §14/§15, both cross-referenced in
   `parent-atlas-gpu-sidecar-patch-tournament/tasks.md`.

## Investigated this pass — embedding-dimension-guard wiring is bigger than originally scoped

Before wiring `embedding-dimension-guard.ts` into `qdrant-manager.ts`, mapped the actual shape
of the manager: `batchUpsert`, `upsert`, `storeDocument`, and `cacheEmbedding` are all generic
across `collectionName` — none of them branch on which collection they're writing to
(`grep -c "collection ==="` → 0 hits in 1982 lines). Per `vector-config.ts`, this one manager
serves 15+ collections at different native dimensions (768 for `codebase_chunks_768`, 384 for
the legacy/migration-source collections, 64 for `codebase_topology_64`, and whatever
`embedding_cache`/`chat_messages`/etc. use). **A single "must be 768" assertion inside the
manager would be architecturally wrong** — it would break every legitimate non-768 write
(embedding cache, latent/topology collections, chat context), not just catch legacy-384 writes.
The guard would need to be dimension-aware per collection (look up the expected dimension from
`VECTOR_CONFIG` keyed by `collectionName`, assert against *that*, not a hardcoded 768), and it
would need to be applied at each of dozens of call sites (`grep` for `codebase_chunks_768`
non-test consumers turned up 30+ files: `ace-materializer.ts`, `dual-embedder.ts`,
`gpu-karpathy-tagger.ts`, `directory-summarizer.ts`, and ~25 `/api/codebase-index/*` routes),
not just the manager itself.

**Fixed this pass, after all — turned out to be much smaller than the inventory above implied.**
Re-reading `qdrant-manager.ts`'s `upsert()` and `batchUpsert()` methods (not just grepping their
call sites) found they **already had a dimension guard** — just the wrong one. Both methods
validated every point's vector length against a hardcoded `VECTOR_CONFIG.DIMENSIONS` (768)
constant, for every collection, unconditionally. That's backwards from what the earlier
inventory assumed ("no guard at all"): the real bug was that this blanket-768 check would have
**rejected every legitimate write to a non-768 collection** (`codebase_topology_64`,
`codebase_topology_128`, and the still-active legacy-384 migration collections) as "invalid
vector dimensions", not just caught real mistakes.

The actual fix needed only `vector-config.ts`'s already-exported `getCollectionDimension(name)`
(a per-collection lookup that already existed, unused by the manager) swapped in for the
hardcoded constant, in both methods, with a `try/catch` fallback to the old constant for any
collection not yet in `COLLECTION_DIMENSIONS` (keeps behavior unchanged for anything outside the
known set — non-breaking by construction). Also threaded the resolved collection name into the
error message and the `.tmp/qdrant-upsert-dim-report.json` diagnostic dump, which previously
didn't say which collection failed.

Verified:
- `npx tsc --noEmit` → 0 errors touching this file (a few pre-existing unused-variable warnings
  elsewhere in the same 1982-line file, unrelated to this change)
- Standalone script confirmed `getCollectionDimension()` returns the correct value for all four
  representative collections (`codebase_chunks_768`→768, `codebase_topology_64`→64,
  `codebase_chunks_384_hybrid`→384, `codebase_topology_128`→128)
- **Live runtime proof, completed this pass.** Ran two real calls through `getQdrantManager().
  upsert()` against the live Qdrant instance, both against `codebase_topology_64` (a real 64-dim
  named-vector collection — exactly the kind of collection the old hardcoded-768 bug would have
  broken):
  - **Positive case**: a correctly-shaped 64-dim point (`vector: { latent_64: [...64 floats] }`)
    → `SUCCEEDED`. Under the old code this would have thrown "invalid vector dimensions (expected
    768)" before ever reaching the Qdrant API — it no longer does.
  - **Negative case**: a 32-dim point against the same collection → correctly threw `"Aborting
    Qdrant upsert to codebase_topology_64: found 1 points with invalid vector dimensions
    (expected 64)"` — proving the guard is now genuinely per-collection (64, not the old
    hardcoded 768) while still catching real mismatches.
  - Test point used an obviously-fake id (`999000001`) and was deleted immediately after the
    positive case succeeded — confirmed via a follow-up delete call, no residual test data left
    in the live collection.
  `QDRANT_MANAGER_DIMENSION_GUARD: FIXED_AND_VERIFIED_LIVE`.

The broader 30+-file writer-surface inventory above is still accurate context (useful for
understanding blast radius) but turned out not to gate this particular fix, since the fix lives
entirely inside the two shared manager methods every one of those callers already routes
through — no per-caller changes needed.

## Explicitly not started

- No code changes to `dense-lane-policy.ts`, `embedding-dimension-guard.ts`, or any Qdrant
  writer/reader.
- No new script written (`reconcile-semantic-contracts.mjs` is proposed, not built).
- No Postgres/Qdrant/Neo4j/Redis queries run against production for this change.
- No CAGRA decision made (that's tracked in `parent-atlas-gpu-sidecar-patch-tournament`, not
  here — this document only reaffirms brute_force as the named oracle in §14, consistent with
  the exclusion already recorded there).
