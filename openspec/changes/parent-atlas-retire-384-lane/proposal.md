# Retire the 384 lane: migration proposal

Status: PROPOSED. No data, schema, or code changed by this proposal.

Evidence note (2026-10-12): the live packet and backup counts were revalidated in a read-only PostgreSQL 18.4 transaction. The receipt is `.tmp/atlas/production-hardening-seed-20261012/embedding-384-live-audit-v1.json`. It proves current counts only; it does not identify the vector producer, restore an archive, or authorize DDL.

## Why

`atlas_packets.content_embedding_384` (`vector(384)`) is populated on 58,109 of 61,718 rows (read-only verification 2026-10-12). Before this correction, `CLAUDE.md` incorrectly stated that the column was physically dropped; it now distinguishes retirement from active retrieval from physical schema removal. The original producer remains unidentified; current code has legacy references, but each must be classified as a writer, reader, or historical definition before claiming runtime reachability.

## Reported facts requiring revalidation

The table below reflects the bounded live database readback on 2026-10-12. It does not prove a full caller census or representation lineage.

| Item | Finding |
|---|---|
| Packet vector | `atlas_packets.content_embedding_384`, `vector(384)`, 58,109/61,718 populated; all sampled aggregate dimensions are exactly 384. |
| Backup table | `codebase_chunk_index_backup`, 10,077 rows, no populated 384 values. No live index definition mentions the 384 column. |
| Canonical packet vector | `atlas_packets.embedding` is populated on 61,659 rows. This is a distinct 768-D representation, not a conversion of the legacy values. |
| Reader change | `scripts/atlas/apply-naive-bayes-predictions.mjs` now derives `has_embedding` from `embedding` only; it does not select the 384 column. Other export/contracts/audit references remain to be classified. |
| Status (2026-10-12 local / 2026-10-13 UTC) | Naive Bayes `has_embedding` uses the 768 `embedding`; the Arrow exporter selects only that field, rejects non-768 dimensions, and has no 384 fallback. A 200-row scratch-only dry-run produced 200 semantic_768 rows with zero duplicate packet keys; no Arrow artifact was written. The legacy contract is retained only for historical decode (non-queryable, non-canonical; registry entries are `LEGACY_MIGRATION_ONLY`), and no in-repo `QdrantLane384` constructor was found. DEC-384-04 records archive-only retention; it does not authorize latent substitution. The column remains populated on 58,109 rows; no database drop, conversion, or backfill occurred. |
| Writers | The original producer for `atlas_packets.content_embedding_384` remains unknown. Several old Qdrant writers and provisioners have been disabled in source; complete CI and dynamic-caller coverage remains open. |
| Model that produced 384 values | Not established. Dimension alone cannot identify MiniLM, FastEmbed, or any other model. |
| Latent lanes | `codebase_chunk_index`: 55,169 `latent_256`, 55,169 `latent_128`, 1,703 `latent_64`. The chunk table has zero populated source/workspace/representation revision fields. `atlas_packets` has 7,522 `latent_64` bytea values but no packet-level `latent_256` or `latent_128` columns. These are different grains and not a drop-in replacement for packet vectors. |
| EmbeddingGemma vs MiniLM | EmbeddingGemma's official model card lists 768 output dimensions, MRL options 512/256/128, and a 2K input context. The `all-MiniLM-L6-v2` card lists 384 dimensions, default truncation beyond 256 word pieces, and training sequence length 128; the latter is not the same as a maximum-context statement. These models produce separate spaces; equal dimensions would not prove compatibility. |
| Ornith | Synthesis/tool-use model, not the embedding owner. The exact loaded artifact, served context configuration, and any sliding-window claim require a current local GGUF/`:8090` readback; the prior 512 sliding-window assertion is not verified. |

Model-card sources: [Google EmbeddingGemma](https://ai.google.dev/gemma/docs/embeddinggemma/model_card) and [Sentence Transformers all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2).

## Why `384 -> latent` is not a drop-in replacement

- Coverage and grain: chunk-level latent columns do not populate packet-level latent columns; packet `latent_64` is bytea and is not qualified by this audit. Replacing the 58,109 packet vectors would require a new producer/admission path, not a relabel or type cast.
- Semantics: the latent lanes are autoencoder outputs derived from 768. The naive Bayes classifier does not use the 384 vector: its features are text tokens, and the 384 column feeds only a presence flag, so removing it needs no retraining. The logistic-regression trainer reads the 768 `embedding`, not 384. A latent substitute would only matter for a feature that does use a vector.
- Policy: latent lanes are not identity and not retrieval authority. Using them to replace a retrieval-adjacent lane needs an owner decision.

## Proposed direction (decision required)

1. Freeze the 384 column: no new writes, guard enforced.
2. Classify each reader: keep as legacy export, migrate to a canonical input, or remove.
3. Replace the `has_embedding` presence check with a check on `atlas_packets.embedding` (768). Re-run the Naive Bayes apply step and compare predictions before and after.
4. Archive the 58,109 populated values to cold storage with a checksum manifest before any drop.
5. Drop the column only after steps 1–4 pass and the operator approves the drop.
6. Correct CLAUDE.md, which currently states the column was dropped.

Nothing in this proposal authorises a drop, a backfill, a write, or a new training run.
