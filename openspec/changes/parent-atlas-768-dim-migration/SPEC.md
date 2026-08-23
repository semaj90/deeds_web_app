# 768-dim Canonical Migration — Script Inventory

**Date**: 2026-08-11
**Status**: UNBLOCKED, 2026-08-23 — the target this inventory needs is now settled. This doc's
premise ("768-dim is canonical") went through a later reversal-and-reversal (see
`openspec/changes/codereview-semantic-dimension-regression-aug22/tasks.md` section 1 for the full
5-round history) but the operator's final 2026-08-23 decision confirms `semantic_768` as canonical
— the same target this inventory already assumed. **The A/B/C/D classification work below can now
proceed** against its original premise. Two things changed since this doc was written that should
be folded in before executing: (1) the truncation rule is now explicit — a 512d/384d derived lane
is fine, but only if produced from an already-indexed, already-validated 768d source, never
speculatively; (2) this inventory's original 50-file grep cap was hit and never re-run at a higher
limit — do that before treating the sample below as complete. Still genuinely not yet triaged or
executed past the sampling stage — this note removes the blocker, it doesn't do the work.
**Owner**: james
**Trigger**: root CLAUDE.md "Embedding Dimensions Policy" (2026-07-27) declares
768-dim (`embeddinggemma:latest`) canonical; 384-dim is a legacy/optional
routing lane only, never primary. Found while auditing
`docs/PHASE-3-GPU-ACCELERATION-ROADMAP.md` (dated 2026-07-19, predates the
policy by 8 days — already fixed, see `parent-atlas-graph-analysis-contract`).

## Hard rule before touching any file below

**Do not blanket find-replace 384→768.** Root CLAUDE.md explicitly documents
a legitimate secondary 384/Warden-Nomic routing lane for cost-optimized
re-ranking under VRAM pressure — that lane is *supposed* to say 384. The
task is to classify each file as:
- **A. Primary/canonical lane hardcoded to 384** (bug — should be 768)
- **B. Legitimate secondary routing lane** (correct as-is — leave alone)
- **C. Test/fixture comparing both dims** (correct as-is — leave alone)
- **D. Migration/backfill tooling that explicitly converts 384↔768** (correct
  as-is by definition — these scripts' whole job is bridging the two)

Only category A is a real bug. Do not assume category from filename alone
(e.g. `train-som-384.mts` is almost certainly A, but `pca-baseline-768-to-384.mjs`
is almost certainly D — verify before editing either).

## Collection: `scripts/atlas/` (50-file grep cap hit — this list is a
## sample, not exhaustive; re-run the grep below with a higher limit)

```
scripts/atlas/audit-embedding-dimensions.mjs          -- likely C (audit tool, compares dims)
scripts/atlas/parent-atlas-semantic-768-backfill.mjs   -- likely D (768 backfill, "384" probably in a comparison/legacy-read path)
scripts/atlas/audit-latent-representation-identity.mjs -- unclassified
scripts/atlas/qdrant-parity-repair.test.mjs            -- likely C (test)
scripts/atlas/qdrant-parity-repair-core.mjs            -- unclassified
scripts/atlas/duckdb/build-vector-index-lanes.mts      -- unclassified
scripts/atlas/duckdb/freeze-vector-snapshot-5k.mts     -- unclassified
scripts/atlas/duckdb/freeze-vector-snapshot.mts        -- unclassified
scripts/atlas/duckdb/freeze-vector-snapshot-5k-768.mts -- likely D (768 in filename already)
scripts/atlas/arrow-batch-export.mjs                   -- unclassified
scripts/atlas/rebuild-gemma4-summaries-768.mjs         -- likely D (768 in filename already)
scripts/atlas/build-turbovec-512-4bit.mts              -- likely B (512-dim, different lane entirely — NOT a 384/768 issue, verify separately)
scripts/atlas/qdrant-provision-768v2.mjs               -- likely D (768 in filename already)
scripts/atlas/restore-qdrant-768-from-postgres.mjs     -- likely D (768 in filename already)
scripts/atlas/create-qdrant-codebase-768.mjs           -- likely D (768 in filename already)
scripts/atlas/train-kmeans-768.mts                     -- likely D (768 in filename already) — see also train-kmeans-384.mts below, may be intentional dual-lane pair
scripts/atlas/persist-kmeans-centroids.mjs             -- unclassified
scripts/atlas/audit-qdrant-representations.mjs         -- likely C (audit tool)
scripts/atlas/materialize-addressable-packets.mjs      -- unclassified
scripts/atlas/phase109a-check-representation-contract-drift.mts -- likely C (drift check, compares dims by design)
scripts/atlas/sparse/lib/collection-guard.mjs          -- unclassified
scripts/atlas/phase108d-embeddings-backfill-full.mts   -- likely D (phase108d is documented 768 backfill work, see MEMORY.md)
scripts/atlas/phase108d-select-and-prove-packet.mts    -- likely D (same phase)
scripts/atlas/phase108d-single-packet-proof.mts        -- likely D (same phase)
scripts/atlas/phase108d-qdrant-single-point-upsert.mts -- likely D (same phase)
scripts/atlas/reconcile-semantic-contracts.mjs         -- unclassified
scripts/atlas/gate-4-semantic-enrichment.mts           -- unclassified
scripts/atlas/build-rust-slot-manifest.mts             -- unclassified
scripts/atlas/parent-atlas-workstation-status.mjs      -- likely C (status/reporting tool)
scripts/atlas/prewarm-compact-cache.mjs                -- unclassified
scripts/atlas/duckdb/validate-domain-snapshot.mts      -- likely C (validator)
scripts/atlas/prove-one-packet-vector-lineage.mts      -- likely C (proof/audit tool)
scripts/atlas/lib/redis-client-factory.mjs             -- unclassified, low priority (likely unrelated "384" match, e.g. port number)
scripts/atlas/phase-108d-proof-matrix.mts              -- likely D (same phase108d family)
scripts/atlas/backfill-qdrant-identity-payload.mts     -- unclassified
scripts/atlas/phase108d-proof-matrix.mts               -- likely D (duplicate of phase-108d-proof-matrix.mts? check for actual dupe)
scripts/atlas/qdrant-backfill-artifact-kind.mjs        -- unclassified
scripts/atlas/phase-108-semantic-enrichment.mts        -- likely D (phase108 family, 768 semantic work)
scripts/atlas/pca-baseline-768-to-384.mjs              -- CATEGORY D by definition (filename says exactly what it does — PCA projection FROM 768 TO 384, this is the legitimate secondary-lane producer)
scripts/atlas/vector-governance-inventory.mjs          -- likely C (governance/audit tool — candidate to EXTEND for this very migration)
scripts/atlas/graphify-langgraph-pipeline.mjs          -- unclassified
scripts/atlas/populate-karpathy-scores.mjs             -- unclassified, "384" likely unrelated (score value, not dim)
scripts/atlas/gate-2-tag-768dim-usage.mts              -- likely C (768-dim usage gate — check if it validates a hard boundary against 384 leaking into primary lane)
scripts/atlas/smoke-phase3-routing.mts                 -- likely C (smoke test)
scripts/atlas/smoke-embedding-contract.mts             -- likely C (smoke test)
scripts/atlas/smoke-vector-lane-registry.mts           -- likely C (smoke test)
scripts/atlas/freeze-vector-snapshot-5k.mts            -- unclassified (duplicate path of the duckdb/ one above? verify)
scripts/atlas/persist-cluster-manifests.mts            -- unclassified
scripts/atlas/train-som-384.mts                        -- ⚠️ CATEGORY A CANDIDATE — filename hardcodes 384 for SOM training, exactly the pattern flagged in PHASE-3-GPU-ACCELERATION-ROADMAP.md. HIGHEST PRIORITY to verify/fix.
scripts/atlas/train-kmeans-384.mts                     -- ⚠️ CATEGORY A CANDIDATE — same pattern for KMeans. HIGHEST PRIORITY to verify/fix.
```

**Re-run needed**: `Grep` hit its 50-file result cap on `scripts/atlas/` —
this list is NOT exhaustive. Next session should re-run with a higher
`head_limit` (or per-subdirectory) to get the true full set.

## Collection: `sveltekit-frontend/src/lib/server/` (50-file cap hit,
## also not exhaustive — this is LIBRARY code, treat individually, do NOT
## bulk-edit)

```
retrieval/promote-results.ts
atlas/graph/graph-snapshot-materializer.spec.ts     -- likely C (spec/test)
atlas/okf-topic-ingestion.ts
embedding/semantic-lineage.spec.ts                  -- likely C (spec/test)
retrieval/search-runtime.ts
hyperrag/hyperrag-projection-contract.ts
retrieval/search-lanes.ts                           -- likely B (this is probably WHERE the legitimate 384 secondary lane is defined — read this first)
config/vector-config.ts                             -- likely B or the canonical dimension config itself — HIGH PRIORITY to read first, this may be the single source of truth for the whole list below
cache/redis-cache-aggressive.ts
retrieval/parallel-orchestrator.ts
atlas/graph/graph-snapshot-postgres.spec.ts         -- likely C (spec/test)
retrieval/retrieve-candidates.ts
retrieval/__tests__/embedding-dimension-gate.test.ts -- likely C (test — may already correctly assert 768 canonical / 384 secondary, READ FIRST as a spec of intended behavior)
retrieval/__tests__/embedding-service.test.ts        -- likely C (test)
retrieval/embedding-service.ts                      -- HIGH PRIORITY — likely the actual embedding call site
retrieval/rrf-integration.ts
ollama.ts                                            -- HIGH PRIORITY — embedding API call site per root CLAUDE.md Ollama rules
retrieval/feature-envelope.ts
db/schema/atlas-packets.ts                           -- HIGH PRIORITY — schema-level dim declarations
retrieval/service.ts
retrieval/types.ts
retrieval/adapters/bm42-sparse-retriever.ts          -- likely B/unrelated (BM42 is sparse, not dense-dim)
vector/qdrant-manager.ts                             -- HIGH PRIORITY — Qdrant collection dim config
atlas/contracts/dense-lane-policy.ts                 -- HIGH PRIORITY — literally named "dense-lane-policy", likely the canonical policy file itself
retrieval/hyperrag-fusion-service.ts
retrieval/hmm-tool-selector.ts
retrieval/soft-routing-orchestrator.ts
retrieval/go-service-integration.ts
gpu/turbovec-kmeans-launcher.ts
ingest/ingest-packet-schema.ts
evaluation/model-contracts.ts
embedding/embedding-validator.ts                     -- HIGH PRIORITY — likely enforces the dim invariant
config/embedding-config.ts                           -- HIGH PRIORITY — likely the actual config source of truth
atlas/contracts/retrieval-candidate.ts
retrieval/rrf-fuse.ts
ai/code-intel-service.ts
retrieval/rrf-contract.ts
ace/features/feature-extraction-orchestrator.ts
agent/autonomous-agent.ts
retrieval/unified-orchestrator.ts
cache/ace-cursor-cache.ts
agent/outbox-worker.ts
db/schema-postgres.ts                                -- HIGH PRIORITY — main Drizzle schema, vector column dims
atlas/contracts/classification-ledger-writer.spec.ts -- likely C (spec/test)
atlas/contracts/classification-envelope-v1.spec.ts   -- likely C (spec/test)
atlas/contracts/classification-envelope-v1.ts
atlas/retrieval/recommendation-smoke.spec.ts         -- likely C (spec/test)
atlas/qdrant-collection-contracts.spec.ts            -- likely C (spec/test)
atlas/qdrant-collection-contracts.ts                 -- HIGH PRIORITY — Qdrant collection dim contract
vector/vector-index-registry.ts                      -- HIGH PRIORITY — likely the index/dim registry
```

**Re-run needed**: same 50-file cap issue as above.

## Recommended triage order (not yet started)

1. Read `config/vector-config.ts`, `config/embedding-config.ts`,
   `atlas/contracts/dense-lane-policy.ts`, `vector/vector-index-registry.ts`
   FIRST — these four are the most likely single sources of truth. If they
   already correctly encode "768 primary, 384 secondary," most of the other
   40+ files are just *consumers* of that config and don't need individual
   edits — the bug (if any) would be isolated to these 4.
2. Verify `scripts/atlas/train-som-384.mts` and
   `scripts/atlas/train-kmeans-384.mts` — these are the two clearest
   category-A candidates (filename hardcodes 384 as if canonical). Check
   whether they're dead/superseded by `train-kmeans-768.mts` (which already
   exists) or still actively invoked by any npm script.
3. Re-run both grep sweeps without the 50-file cap for a complete list.
4. Classify remaining files A/B/C/D per the rule above — do NOT bulk edit.

## Implementation attempt (2026-08-11) — findings, not fixes

Verified the two flagged category-A candidates directly:

- **`scripts/atlas/train-som-384.mts`**: reads a hardcoded
  `data/atlas-ml/snapshot_5k_384dim.parquet` file (Phase 2, Step 10 —
  old, self-contained pipeline). `grep` across the entire repo for
  `train-som-384` finds **zero callers** in `package.json` or any other
  script — only self-reference and two doc/memory mentions. **This is dead
  code, not a live bug.**
- **`scripts/atlas/train-kmeans-384.mts`** and
  **`scripts/atlas/train-kmeans-768.mts`**: same check — **zero npm-script
  callers for either file.** KMeans training currently has **no wired entry
  point at all**, in either dimension.
- **The live SOM path** is `scripts/atlas/train-som-20x20.mjs`, invoked via
  `package.json`'s `atlas:som:train`, `atlas:phase16:som:dry`,
  `atlas:phase16:som:apply`. This was already fixed to `--dim 768` earlier
  in this session (see `parent-atlas-graph-analysis-contract/tasks.md`
  "Patch (pending)" section) — no further action needed here.

**Revised conclusion**: the original "category A bug" framing was wrong for
these two files. They're not live 384-dim bugs to patch — they're orphaned
duplicates (same pattern CLAUDE.md's "Duplication Prevention" rule warns
about repeatedly in this codebase). The real open questions are:

1. **Are `train-som-384.mts` / `train-kmeans-384.mts` / `train-kmeans-768.mts`
   safe to archive** (per root CLAUDE.md Archival Rules — move to
   `deeds_labs/archive/`, don't delete) since nothing calls them? Or does
   something outside `package.json`/grep's reach still depend on them
   (manual CLI invocation, a cron job, a doc-instructed manual step)?
2. **Is KMeans training actually needed live**, and if so, which of the two
   orphaned files (384 or 768) should be wired into `package.json` — or
   does neither work correctly and both need a rewrite?

**RESOLVED (2026-08-11)**: user chose to archive all three, not wire any.
Found before archiving: `kmeans-chunk-cluster.py` (GPU/RAPIDS) is the live,
already-wired canonical KMeans path (`atlas:kmeans:{dry,apply,apply:k64,
apply:k256}` etc., with centroid writeback + Qdrant payload backfill +
summary enrichment) — `train-kmeans-768.mts` would have been a second
competing owner if wired, which root CLAUDE.md's Duplication Prevention
rule prohibits. All three archived per Archival Rules (SHA-256 + manifest
entry in `docs/archive-manifest.json`, copies in
`deeds_labs/archive/2026-08-11/`, originals removed from `scripts/atlas/`):
`train-som-384.mts`, `train-kmeans-384.mts`, `train-kmeans-768.mts`.

The 4 "source of truth" config files (`vector-config.ts`,
`embedding-config.ts`, `dense-lane-policy.ts`, `vector-index-registry.ts`)
from the triage plan above were **not yet read** — that's the next concrete
step for a fresh session with full context budget. The remaining 90+ files
in the two collections above are also still unclassified.

## Explicitly NOT done in this pass

No files were read or edited in this inventory pass — this is a raw grep
result, not a verified classification. Every "likely X" tag above is a
guess from filename pattern only, not a code read. Treat this document as
a work queue, not a set of confirmed findings.
