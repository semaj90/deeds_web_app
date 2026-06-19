# Topology Validation Report

Report generated at: `2026-06-19T19:18:30Z`  
Status: **`PASS`**

This report validates the end-to-end alignment of the Autoencoder (AE), Kohonen Self-Organizing Map (SOM), Qdrant vector space, Postgres packet ledger (`atlas_packets`), and Valkey/Redis cache layers in the Parent Atlas pipeline.

---

## 1. SOM Cell Mapping Validation
- **Status**: **`PASS`**
- **Validations Checked**:
  - `som_index` is stored as an integer in Postgres.
  - Coordinate relations are verified: `som_row = floor(som_index / 20)` and `som_col = som_index % 20`.
  - Coordinates lie within the `20x20` cell grid bounds ($[0..19, 0..19]$).
  - Original `som_cluster` metadata is preserved.
- **Metrics**:
  - Total packets assigned: **781**
  - Grid dimensions: **20x20** (400 cells)
  - Occupied cells: **151 / 400** (Avg packets per occupied cell: **5.2**)
  - Postgres updates: **781** (0 skipped)

---

## 2. Dense Vector / Qdrant Payload Alignment
- **Status**: **`PASS`**
- **Validations Checked**:
  - Dense embedding dimension is **768** (`embeddinggemma:latest`).
  - Qdrant collection `codebase_chunks_768` vector size is 768.
  - Payload attributes (`packet_key`, `source_ref`, `feature_id`) exist in Qdrant scroll points.
  - Matches map perfectly to `atlas_packets` identifiers.
  - `latent_64` is marked as **routing-only** and never used as the primary retrieval vector.
- **Metrics**:
  - Canonical vectors processed: **781**
  - Writeback match rate: **100.00%** (781/781 matched successfully via exact Qdrant point ID or candidate fallback joins)

---

## 3. Autoencoder Latent Provenance
- **Status**: **`PASS`**
- **Validations Checked**:
  - AE input dimension (**768**) matches dense embedding dimension.
  - Autoencoder weights manifest files (`W_enc_768_128.npy`, `W_enc_128_64.npy`, `b_enc_128.npy`, `b_enc_64.npy`) exist.
  - Model metadata (`ae_meta.json`) is loaded, including validation loss.
  - Reconstruction loss metrics and training epoch bounds are stored in Postgres packet metadata.
- **Metrics**:
  - Best validation loss: **`0.000736`**
  - Compressed latent dimension: **64**
  - Latent index entries produced: **781**

---

## 4. HyperRAG Rerank Boundedness
- **Status**: **`PASS`**
- **Validations Checked**:
  - Retrieval candidate set is seeded strictly from dense vector search + BM25 + Neo4j.
  - SOM routing only reranks or filters existing retrieved candidates, never invents new candidates.
  - Topology rerank bonuses (`som_bonus`, `topology_bonus`) are bounded.
  - Gemma4 summaries properly cite `packet_key` and `source_ref` values.
- **Metrics**:
  - Strategy: **`fusion`**
  - Provenance tuples validated: **11**
  - Live HyperRAG retrieval latency: **~9576ms** (initial cold-start model load)

---

## 5. Redis / Bitfrost Pointer Safety
- **Status**: **`PASS`**
- **Validations Checked**:
  - Redis cache keys point back to canonical `packet_key` and `source_ref` values.
  - Cache hits confirm existence of actual Postgres database records.
  - Stale keys are invalidated upon graph version or cache epoch changes.
- **Metrics**:
  - Cell membership keys cached (`gpu:som:cell:*`): **151**
  - Individual coordinates cached (`gpu:som:packet:*`): **781**
  - Latent vectors cached (`gpu:autoencoder:latent_64:*`): **781**
  - Exact-match cache lookup latency: **64ms** (99% latency reduction)

---

## 6. Verification Commands Executed
- **Smoke test**: `npm run smoke:hyperrag-packet-rpc` — **`PASS`**
- **Retrieval E2E**: `npm run atlas:retrieval:e2e` — **`PASS`**
- **Join Audit**: `npm run atlas:phase16:join:audit` — **`PASS`**
