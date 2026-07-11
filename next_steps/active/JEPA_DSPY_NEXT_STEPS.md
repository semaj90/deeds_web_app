# JEPA + DSPy Next Steps

**Status**: ACTIVE  
**Updated**: July 10, 2026  
**Scope**: Packet-JEPA evaluation, DSPy placement, and reranker promotion gate

---

## Current Decision

Do **not** wire `packet_jepa_similarity` into XGBoost or the MLP reranker yet.

The current JEPA slice is useful as an experiment lane, but it is not promotion-ready because the evaluation cohort is still dominated by the currently available packet vector surface rather than a clean, canonical 384d packet embedding cohort.

Promotion rule:

1. Raise canonical packet embedding coverage.
2. Re-run the same evaluation on a real 384d packet cohort.
3. Only promote JEPA if it beats the baseline on held-out `MRR` and `NDCG@10`.

If JEPA does not beat the baseline on those held-out metrics, it stays experimental and out of the production reranker.

---

## Representation Ladder

Use the vector surfaces in this order:

```text
EmbeddingGemma 384d
  canonical semantic retrieval cohort
latent128
  representation-learning / compression staging
latent64
  routing, clustering, SOM, compact cache feature
```

Keep `source_ref` as provenance only. Do not use it as identity.

---

## Why It Stays Out Of Reranking For Now

- Current packet coverage is not yet the right cohort for a fair JEPA promotion decision.
- `packet_jepa_similarity` is a derived experiment signal, not canonical truth.
- XGBoost/MLP should not absorb a weak feature and then force downstream recovery work.
- The correct sequence is coverage first, evaluation second, promotion last.

---

## Placement In The Stack

### Canonical retrieval stack

`source_ref -> packet_key -> features/metrics -> dense+sparse retrieval -> RRF -> reranker -> synthesis`

### JEPA role

Packet-JEPA is a representation-learning experiment that may add one more reranker feature later:

- `packet_jepa_similarity`

It does **not** replace:

- `packet_key`
- `source_ref`
- `feature_id`
- `title_id`
- BM25
- Qdrant cosine
- Neo4j topology
- SOM locality

### DSPy role

DSPy sits **above** retrieval/ranking as a module optimizer.

Use DSPy later to optimize module behavior such as:

- Retrieve
- Rank
- Validate
- Explain

Do **not** use DSPy as a substitute for:

- canonical packet identity
- feature extraction
- metric storage
- HMM state routing

---

## Concrete TODO Recommendations

### P0 — Coverage before promotion

- [ ] Raise canonical packet embedding coverage in `atlas_packets` / `atlas_packet_metrics`
- [ ] Verify the cohort is truly 384d packet embeddings, not a mixed fallback lane
- [ ] Re-export deterministic JEPA training pairs from the corrected cohort
- [ ] Re-run all three baselines on the same held-out split:
  - [ ] 384d cosine baseline
  - [ ] PCA/AE latent baseline
  - [ ] Packet-JEPA 128

### P0.5 — Gradient-checkpoint trade-off benchmark

Do not assume checkpointing is beneficial. Measure it as a separate experiment lane.

Benchmark matrix:

| Profile | Precision | Checkpointing | Microbatch |
|---|---|---|---|
| A | FP32 | Off | 256 |
| B | FP16 AMP | Off | 256 |
| C | FP16 AMP | On | 256 |
| D | FP16 AMP | On | 512 or highest safe |
| E | FP16 AMP | On | smaller batch + accumulation |

Record for each profile:

- peak allocated VRAM
- peak reserved VRAM
- examples/second
- step latency
- epoch latency
- final validation loss
- gradient norm
- NaN/Inf count
- OOM count
- checkpoint size

Promotion gates:

- Peak VRAM falls by at least 20%, or checkpointing stays off.
- Validation loss regression stays below 1%.
- No NaN or Inf gradients.
- Throughput loss is measured and accepted.
- Resume-from-checkpoint reproduces the next step within tolerance.
- Model artifact includes training config and corpus hash.
- Gradient checkpointing defaults off for inference.

### P1 — Evaluation gate

- [ ] Record held-out `Recall@10`
- [ ] Record held-out `MRR`
- [ ] Record held-out `NDCG@10`
- [ ] Record `domain_classification_f1`
- [ ] Block promotion unless JEPA beats the 384d baseline on both `MRR` and `NDCG@10`

### P2 — Only after the gate passes

- [ ] Add `packet_jepa_similarity` as an optional reranker feature
- [ ] Re-run offline ranking evaluation with and without JEPA
- [ ] Confirm no regression on non-JEPA packets
- [ ] Keep a feature flag around JEPA-driven reranking

### P3 — DSPy after retrieval is stable

- [ ] Add DSPy experiments only after deterministic retrieval is stable
- [ ] Limit DSPy to prompt/module optimization
- [ ] Keep HMM as the deterministic repair-state router
- [ ] Keep XGBoost/MLP as the ranking-policy layer, not the source-of-truth layer

---

## Recommended Command Slice

Run the same bounded evaluation flow after embedding coverage improves:

```bash
npm run atlas:jepa:pairs:apply
npm run atlas:jepa:train:apply
npm run atlas:jepa:score:apply
```

Then compare the held-out report against the 384d baseline before any reranker wiring.

---

## Promotion Gate

JEPA is allowed into the reranker only when all of the following are true:

- canonical packet embedding coverage is materially improved
- evaluation cohort is real 384d packet data
- held-out `MRR` improves over baseline
- held-out `NDCG@10` improves over baseline
- no retrieval regression appears on the validation slice

Until then:

- JEPA remains experimental
- DSPy remains optional
- production reranking stays with the current deterministic + evaluated feature set
