# PF4B divergent embedding duplicate matrix — 2026-10-04

## Scope and method

Read-only PostgreSQL census of `analysis_pass_results` rows with
`pass_type='embedding'`, grouped by `(packet_key, pass_type, input_hash)`
using null-safe input-hash matching. Included groups have multiple rows and
more than one distinct stored `output::text` fingerprint. The output SHA-256
below hashes the exact PostgreSQL `jsonb::text` serialization. The query ran
inside `BEGIN READ ONLY` and ended with `ROLLBACK`.

Result: **9 groups, 21 rows**. Each group has two distinct stored output
metadata variants. Three groups have three rows, where one variant repeats.
The persisted output is metadata (`embedding_dim`, `embedding_norm`, and
batch status), not the embedding vector; therefore vector-output equality or
divergence cannot be established from this table.

## Identity-dimension findings

| Dimension | Observation | Classification |
| --- | --- | --- |
| Packet/pass | Same `packet_key`, `pass_type=embedding`, and `pass_key=embeddinggemma_summary_embed_v1` within each group | Same logical label only |
| Input | `input_hash` is NULL on all 21 rows | `SAME_INPUT` unproven |
| Stored output | Two distinct metadata JSON hashes in every group; differences are in `embedding_norm` | `DIFFERENT_OUTPUT` for metadata; vector output unknown |
| Producer | `provenance.source=queue_consumer_embedding_batch` throughout; no producer ID or revision | `PRODUCER_UNKNOWN` (same label is not producer identity) |
| Source revision | `source_revision` NULL on all rows; `source_ref`/`feature_id` repeat within each group | `SAME_SOURCE_REVISION` unknown |
| Pass revision | `pass_revision` NULL on all rows | `SAME_PASS_REVISION` unknown |
| Prompt/config | `prompt_hash`, `temperature`, and `max_tokens` NULL; model tag is `embeddinggemma:latest` without artifact revision | Configuration equivalence unproven |
| Execution | Row IDs and `queue_message_id` values differ. Source constructs `queue_message_id` as `${packet_key}:${Date.now()}`; no broker/attempt identity, execution ID, analysis-job ID, or evidence ID is present | `SAME_EXECUTION` unknown |
| Upstream references | Provenance contains a packet-key join plus source/feature fallback, but no upstream result/execution receipt reference | Not available to explain divergence |

Within the three-row groups, one row pair has identical stored metadata while
the other two comparisons differ: IDs `1062`/`1068`, `1025`/`1030`, and
`1063`/`1070`. These are `IDENTICAL_OUTPUT_PROVEN` only for the stored JSON
metadata; they still do not prove a retry or equal embedding vectors.

## Per-group source binding

| Packet key | `source_ref` | `feature_id` |
| --- | --- | --- |
| `packet:0003260092b1` | `sveltekit-frontend/memory/runs/2026-05-29T04-11-06/llm_synthesis_mapping.json` | `sveltekit-frontend.llm_synthesis_mapping` |
| `packet:0003850e84ca` | `sveltekit-frontend/docs/obsidian-vault/Files/tests__cases-sub-routes.spec.md` | `sveltekit-frontend.tests__cases-sub-routes.spec` |
| `packet:0003ab694534` | `sveltekit-frontend/docs/obsidian-vault/Files/tests__routes__auto__api__cache__metrics.test.md` | `sveltekit-frontend.tests__routes__auto__api__cache__metrics.test` |
| `packet:0003dda5e534` | `neschrom97/cards/93f973562fff24ed.json` | `neschrom97.93f973562fff24ed` |
| `packet:000fde9311af` | `sveltekit-frontend/src/routes/api/ai/bifrost/+server.ts` | `sveltekit-frontend.+server` |
| `packet:005c92019c46` | `neschrom97/cards/e60e5d78cdd9ddfb.json` | `neschrom97.e60e5d78cdd9ddfb` |
| `packet:006e1c69acdd` | `sveltekit-frontend/src/lib/components/ContextConfirmModal.svelte` | `sveltekit-frontend.ContextConfirmModal` |
| `packet:00777e098597` | `sveltekit-frontend/docs/obsidian-vault/Files/package-lock.md` | `sveltekit-frontend.package-lock` |
| `packet:0077b5e38487` | `neschrom97/cards/4be059302a12c124.json` | `neschrom97.4be059302a12c124` |

Do not infer retry from the ~8–47 second timestamp spacing. Do not deduplicate
or classify as legitimate executions. The records prove distinct row inserts
and different stored normalization metadata, not whether executions were
retries or independent runs.

## Row evidence

`output_sha256` covers the stored output JSON metadata only, not an embedding
vector. `queue_message_id` is recorded as observed, not accepted as a verified
execution identity.

| Row ID | Packet key | Input hash | Created at (UTC) | `embedding_norm` | Output SHA-256 | `queue_message_id` |
| ---: | --- | --- | --- | ---: | --- | --- |
| 952 | `packet:0003260092b1` | NULL | 2026-06-30T02:20:05.704703Z | 0.9999998638524673 | `3f46f3b4ca09d881bdd06845d910ffaa0aeb3061ff1e2fd845f7192b2aeb21ad` | `packet:0003260092b1:1782786005702` |
| 1065 | `packet:0003260092b1` | NULL | 2026-06-30T02:20:51.936960Z | 1.0000002308550429 | `436fea905de0fee43e3a2bfba2831095c44bbd744645b63eee19f95f44fd3644` | `packet:0003260092b1:1782786051935` |
| 953 | `packet:0003850e84ca` | NULL | 2026-06-30T02:20:05.710626Z | 0.9999997086166734 | `63d58d21c24743bb150c6f835c2088a7765f3cd3c187ab4fb033d35e22c17a5c` | `packet:0003850e84ca:1782786005710` |
| 1066 | `packet:0003850e84ca` | NULL | 2026-06-30T02:20:51.985511Z | 0.9999998638524673 | `3f46f3b4ca09d881bdd06845d910ffaa0aeb3061ff1e2fd845f7192b2aeb21ad` | `packet:0003850e84ca:1782786051984` |
| 954 | `packet:0003ab694534` | NULL | 2026-06-30T02:20:05.720179Z | 1.0000002542956548 | `eee89e87968902f6091dcb67793f5e2e7649c4792bcf0806a495629e68ad9564` | `packet:0003ab694534:1782786005720` |
| 1067 | `packet:0003ab694534` | NULL | 2026-06-30T02:20:52.033218Z | 0.9999997086166734 | `63d58d21c24743bb150c6f835c2088a7765f3cd3c187ab4fb033d35e22c17a5c` | `packet:0003ab694534:1782786052032` |
| 955 | `packet:0003dda5e534` | NULL | 2026-06-30T02:20:05.740564Z | 1.0000001031038313 | `135cae70ffe5524569598197e86dacffc8125a4d44f68eb6a5614a8a62cff2d4` | `packet:0003dda5e534:1782786005739` |
| 1069 | `packet:0003dda5e534` | NULL | 2026-06-30T02:20:52.094235Z | 1.0000002542956548 | `eee89e87968902f6091dcb67793f5e2e7649c4792bcf0806a495629e68ad9564` | `packet:0003dda5e534:1782786052093` |
| 969 | `packet:000fde9311af` | NULL | 2026-06-30T02:20:06.132181Z | 1.0000002535618973 | `ba4389460e154ea4a2defdc3f6e3559d095cd55f7e56d2c993857b6785485a40` | `packet:000fde9311af:1782786006132` |
| 1062 | `packet:000fde9311af` | NULL | 2026-06-30T02:20:51.906436Z | 1.000000079271269 | `baca980e80d27c0a3ce1f924714ff48e6ffc131255d9baf7a9998c88d66e274c` | `packet:000fde9311af:1782786051905` |
| 1068 | `packet:000fde9311af` | NULL | 2026-06-30T02:20:52.032440Z | 1.000000079271269 | `baca980e80d27c0a3ce1f924714ff48e6ffc131255d9baf7a9998c88d66e274c` | `packet:000fde9311af:1782786052000` |
| 1031 | `packet:005c92019c46` | NULL | 2026-06-30T02:20:12.471961Z | 0.9999998996055225 | `69d8fae00b79e64d0d4788406d6e726eb494958e9029f7e95ff31e91ff18aacc` | `packet:005c92019c46:1782786012471` |
| 1042 | `packet:005c92019c46` | NULL | 2026-06-30T02:20:49.538982Z | 1.000000079271269 | `baca980e80d27c0a3ce1f924714ff48e6ffc131255d9baf7a9998c88d66e274c` | `packet:005c92019c46:1782786049481` |
| 942 | `packet:006e1c69acdd` | NULL | 2026-06-30T02:20:03.957088Z | 1.000000019578303 | `0b7696a77ed94328a325d44c814034ee86af3e3b98517161176692b32162abb1` | `packet:006e1c69acdd:1782786003952` |
| 1025 | `packet:006e1c69acdd` | NULL | 2026-06-30T02:20:12.390273Z | 1.0000002308550429 | `436fea905de0fee43e3a2bfba2831095c44bbd744645b63eee19f95f44fd3644` | `packet:006e1c69acdd:1782786012389` |
| 1030 | `packet:006e1c69acdd` | NULL | 2026-06-30T02:20:12.457312Z | 1.0000002308550429 | `436fea905de0fee43e3a2bfba2831095c44bbd744645b63eee19f95f44fd3644` | `packet:006e1c69acdd:1782786012426` |
| 948 | `packet:00777e098597` | NULL | 2026-06-30T02:20:04.149485Z | 1.0000002535618973 | `ba4389460e154ea4a2defdc3f6e3559d095cd55f7e56d2c993857b6785485a40` | `packet:00777e098597:1782786004145` |
| 1063 | `packet:00777e098597` | NULL | 2026-06-30T02:20:51.916291Z | 1.0000001464415593 | `f01d88538b4e35dea6501aba363921e161f996be2fd92fe1bac5521450c5454f` | `packet:00777e098597:1782786051915` |
| 1070 | `packet:00777e098597` | NULL | 2026-06-30T02:20:52.096240Z | 1.0000001464415593 | `f01d88538b4e35dea6501aba363921e161f996be2fd92fe1bac5521450c5454f` | `packet:00777e098597:1782786052095` |
| 949 | `packet:0077b5e38487` | NULL | 2026-06-30T02:20:04.158217Z | 1.000000227774879 | `72aea733b6517e1a02ab3c65d8da43d61e48529f2dd3e1fef00194ad09aebd14` | `packet:0077b5e38487:1782786004158` |
| 1064 | `packet:0077b5e38487` | NULL | 2026-06-30T02:20:51.927366Z | 0.9999998307367316 | `242b3225f3826e773638a05493a53a2e4ba705133ca00aafc912ff59a6305407` | `packet:0077b5e38487:1782786051926` |

All rows have `batch_processed=true`, model tag `embeddinggemma:latest`, and
stored `embedding_dim=768`; the model artifact revision is not recorded. Group
source/feature pairs are preserved in the fallback join, but no exact source
bytes/revision are bound.

## Decision

Status: `DIVERGENT_OUTPUT_UNEXPLAINED` for all nine groups at the stored
metadata layer; underlying vector divergence and retry-vs-legitimate
execution remain unproven. Keep PF4B open. No deduplication, backfill,
uniqueness change, or database write was performed.
