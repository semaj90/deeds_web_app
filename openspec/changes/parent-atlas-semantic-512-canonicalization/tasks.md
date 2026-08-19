# Parent Atlas semantic_512 canonicalization — proof sequence

Operator correction (2026-08-19): the persisted EmbeddingGemma test corpus that actually exists is 512-dimensional; a production/canonical 768-dimensional Qdrant corpus was not created. Do not promote an assumed 768 store merely because EmbeddingGemma's native output is 768.

Live-storage correction (2026-08-19): the read-only S180-6B audit proved that live `atlas_packets` has complete `source_ref` but **no literal `source_revision` column**. Do not synthesize source revision from `workspace_revision`, `representation_revision`, vector dimension, timestamps, or Qdrant point IDs. Source freshness is a separate mutation-awareness proof.

Historical-512 correction (2026-08-19): `scripts/atlas/phase-embedding-lanes-qdrant-sync.mts` created `codebase_chunks_512` with `point.id = codebase_chunk_index.id`, but its payload used placeholder identity: `packet_key=packet:<id>` and `source_ref=content_hash.slice(0,16)`. Therefore the existing 512 vectors may be reusable, but their old payload identity is not authoritative.

## Frozen representation contract

```text
EmbeddingGemma native output (768)
        |
        | MRL prefix [0:512] + L2 re-normalize
        v
semantic_512                 CANONICAL PERSISTED SEMANTIC REPRESENTATION
        |
        +--> Qdrant codebase_chunks_512 / cosine        online ANN candidate executor
        +--> cuVS brute_force / cosine                  exact bounded oracle
        |
        +--> Autoencoder 512 -> 256 -> 64
                         |
                         v
                     latent_64                          ROUTING ONLY
                         |
                         +--> cuML KMeans (seeded)
                         +--> routing centroids/cluster IDs
                         +--> codebase_topology_64_v2
```

Candidate buckets `32/64/128/256/512` are row counts and are unrelated to semantic vector dimensionality.

## Source / mutation contract

```text
source_ref
   |
   +--> graph snapshot node content hash
   +--> current packet/source hash when same hash contract is proven
   +--> git_mutation_provenance.source_refs[] / changed_files[]
   +--> snapshot created/finalized time
   +--> topology hash
   v
MutationAwarenessReceiptV1
   |
   +--> FRESH
   +--> UNKNOWN
   +--> STALE
   +--> MISSING
```

Rules:

- `semantic_512`, legacy 768 metadata, `latent_64`, workspace revision and representation revision are **representation/state lineage**, not source freshness.
- `FRESH`: rankable and eligible for later exact source/AST/type promotion.
- `UNKNOWN`: rankable for recall, but exact source promotion remains blocked/degraded until current source evidence is hydrated.
- `STALE`: excluded from execution candidates and ContextManifest; rehydrate/reindex first.
- `MISSING`: excluded from execution candidates; restore canonical packet/source first.
- A graph snapshot fallback hash derived from packet metadata MUST NOT be compared to a later raw source SHA-256 as though both hashes had the same contract.
- Git/source paths are slash-normalized for mutation matching but case is preserved.

## Reconciliation contract

The historical 512 payload must be repaired through proven joins rather than trusted directly:

```text
Qdrant codebase_chunks_512 point.id
               |
               v
codebase_chunk_index.id
               |
       +-------+--------+
       |                |
       v                v
   source_ref      content_hash
       |                |
       +-------+--------+
               v
       atlas_packets candidates
               |
       strong identifiers converge?
          /                 \
        yes                  no
         |                    |
         v                    v
     ADMITTED           REVIEW / REJECTED
         |
         v
SourceVersionReceiptV1
+
Semantic512ReconciliationReceiptV1
```

Match policy:

- expected canonical packet key from `source_ref + content_hash` is strongest;
- `content_hash -> packet_id` and `Qdrant point.id -> artifact_id` are corroborating strong identifiers;
- `source_ref` alone is insufficient and is `REVIEW`;
- ambiguous top matches are `REVIEW`;
- missing chunk/packet, conflicting source ref, or invalid/non-512 vector is not admitted;
- reconciliation runs in PostgreSQL `REPEATABLE READ` read-only mode and records `pg_current_snapshot()`;
- every reconciled row records a float32 semantic vector digest so later training detects a changed Qdrant vector;
- Qdrant payload mutation is a separate optional operator step and requires the reviewed dry-run manifest checksum.

## Identity rules

- PostgreSQL owns packet/source identity.
- Qdrant point IDs, KNN row ordinals, KMeans labels, and latent vectors never mint identity.
- `packet_key` is mandatory for exact-KNN row identity. `source_revision` is optional because no canonical live owner exists today.
- Source freshness is proven by `MutationAwarenessReceiptV1` / `SourceVersionReceiptV1`, not by the KNN identity manifest.
- `tree_node_id` is conditional structural evidence and may be null until its Tree-sitter/GIS owner resolves it; never fabricate it.
- `feature_label` is derived classification evidence and may be null; KNN/KMeans/PageRank never produce it.
- Every admitted AE row must cite `packet_key`, true `source_ref`, `semantic_512`, source-version receipt ID, reconciliation receipt ID, and its semantic vector digest.
- Every `latent_64` row must preserve the reconciliation/source-version receipt IDs and cite `source_representation_id=semantic_512` plus `autoencoder_revision`.
- Every KMeans assignment must cite the latent/AE revision, reconciliation receipt, algorithm revision and fixed random seed.

## Proof gates

- [x] S512-0 — Representation semantics frozen: persisted canonical `semantic_512`, model-native dimension recorded separately as 768.
- [x] S512-1 — Query projection implemented: first 512 EmbeddingGemma dimensions + explicit L2 re-normalization.
- [x] S512-2 — Qdrant bounded scorer targets existing `codebase_chunks_512` unnamed cosine collection and joins only by `packet_key` after reconciliation.
- [x] S512-3 — cuVS exact endpoint implemented with explicit `metric="cosine"`; legacy 768/sqeuclidean smoke endpoint remains separate.
- [x] S512-4 — SvelteKit synthesis can exact-rerank the same bounded Qdrant rows on cuVS; fails open when identity/GPU is unavailable.
- [x] S512-5 — Autoencoder trainer is `512 -> 256 -> 64` and now consumes only an admitted, checksum-verified reconciliation manifest; it re-retrieves exact Qdrant point IDs and verifies each semantic vector digest before training.
- [x] S512-6 — cuML KMeans executor runs over `latent_64`, with explicit `random_state`, algorithm revision, centroids, inertia, reconciliation receipt, and identity-preserving assignments.
- [x] S512-7 — Separate rebuildable `codebase_topology_64_v2` routing projection materializer preserves source/ref/reconciliation lineage and never mutates semantic_512 evidence.
- [x] S512-8 — Routed-topK evaluation endpoint reports Recall@K against full semantic_512 cuVS exact oracle and fails open to full exact corpus when routing is too narrow.
- [x] S512-9A — Live-schema source-version audit reconciled: `source_ref` exists; canonical `source_revision` does not. Fabrication is forbidden.
- [x] S512-9B — `MutationAwarenessReceiptV1` implemented over graph snapshot time/topology, trusted packet SHA parity, and tracked Git mutations.
- [x] S512-9C — Synthesis DAG excludes `STALE/MISSING` source occurrences before GPU bucket/ContextManifest construction and exposes UNKNOWN as degraded freshness.
- [x] S512-9D — Source-ref path normalization added for Git mutation matching; derived snapshot hash vs raw SHA mismatch is guarded.
- [x] S512-9E — cuVS exact-v2 identity decoupled from nonexistent `source_revision`; packet_key remains deterministic row identity and freshness is externally receipted.
- [x] S512-9F — AE/KMeans offline admission/materialization now uses `packet_key + source_ref + representation lineage + source-version/reconciliation receipts`; `source_revision` is never invented.
- [x] S512-9G — Read-only `codebase_chunks_512 -> codebase_chunk_index -> atlas_packets` reconciliation implementation added with ADMITTED/REVIEW/REJECTED classification, vector digests, Postgres snapshot receipt, deterministic manifest checksum, and checksum-gated optional Qdrant payload repair. **Runtime execution is still pending.**
- [ ] S512-10 — Execute live semantic_512 reconciliation + Qdrant smoke: collection dimension=512, cosine, nonzero rows, admitted/review/rejected counts, packet_key/source_ref coverage, and representation lineage reported. `source_revision` absence is not a failure.
- [ ] S512-11 — Execute live cuVS cosine-v2 proof on real admitted 512 rows and compare exact top-K with Qdrant HNSW Recall@K.
- [ ] S512-12 — Train AE on admitted real 512 corpus only after S512-10; reject if validation/neighborhood metrics fail threshold.
- [ ] S512-13 — Compare AE-64 against deterministic PCA-64 baseline on exact-neighbor Recall@K/MRR/NDCG and routing latency.
- [ ] S512-14 — Fit seeded KMeans, materialize routing projection, and measure cluster-route Recall@K against full 512 exact oracle.
- [ ] S512-15 — Promote routing only if it reduces candidate work without breaching retrieval recall budget; otherwise keep latent/KMeans reference-only.
- [ ] S512-16 — Exact promotion proves **current** source span + Tree-sitter structural identity + compiler-semantic evidence and resolves UNKNOWN freshness before LLM synthesis.
- [ ] S512-17 — Reconcile older 384/768 documentation, pgvector columns and enums only after runtime proof; do not break broad consumers with an unproven rename.

## Operator proof sequence

Read-only reconciliation (no DB or Qdrant writes):

```bash
python python/atlas_semantic512_reconcile.py \
  --manifest-out data/atlas-ml/semantic512-reconciliation.ndjson \
  --receipt-out data/atlas-ml/semantic512-reconciliation-receipt.json
```

Review `classificationCounts`, every `REVIEW`/`REJECTED` class, and the receipt's `manifestChecksum`. Only then, if payload repair is desired:

```bash
python python/atlas_semantic512_reconcile.py \
  --apply-payload \
  --expected-manifest-checksum <REVIEWED_SHA256>
```

Training is downstream of the reviewed receipt:

```bash
python python/atlas_semantic512_autoencoder_train.py \
  --reconciliation-manifest data/atlas-ml/semantic512-reconciliation.ndjson \
  --reconciliation-receipt data/atlas-ml/semantic512-reconciliation-receipt.json
```

Then KMeans/routing remains dry-run unless explicitly applied:

```bash
python python/atlas_semantic512_build_routing.py
python python/atlas_semantic512_build_routing.py --apply
```

## Promotion invariant

```text
source_ref mutation gate
      |
      +-- STALE/MISSING --> rehydrate, no DAG execution
      |
      +-- FRESH/UNKNOWN
              |
              v
Qdrant ANN candidate
      |
      v
cuVS semantic_512 exact cosine
      |
      +-- optional latent_64/KMeans routing feature
      +-- BM25 lexical feature
      +-- AST/compiler feature
      +-- PageRank/PPR graph feature
      v
CandidateFeatureMatrix
      v
exact current source/AST/type promotion
      v
ContextManifestV1
      v
synthesis
```

No derived executor gets an independent RRF vote merely because it uses a different backend. Vector dimensionality is never a source mutation/version signal.
