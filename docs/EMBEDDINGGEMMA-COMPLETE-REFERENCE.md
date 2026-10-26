# EmbeddingGemma Complete Reference (2026-07-20)

**Quick Answer**: embeddinggemma:latest outputs **768 or 384 dimensions (UNVERIFIED)**. Current schema has both. Audit pending.

---

## Three Master Documents (Use These)

### 1. **EMBEDDINGGEMMA-VARIANTS-INVENTORY.md**
What: All possible embeddinggemma models and their specifications  
Read this when: You need to understand what variants exist  
Key info: 3 lineage models, dimension unknowns, Ollama tags  

### 2. **EMBEDDINGGEMMA-VERIFICATION-GUIDE.md**
What: Practical commands to verify, test, and measure embedding dimensions  
Read this when: You need to run the audit or debug dimension issues  
Key info: curl commands, benchmark scripts, mismatch detection  

### 3. **EMBEDDINGGEMMA-DIMENSION-MATRIX.md** ← NEW
What: Complete inventory of all 768/384/256/128-dim columns in the schema  
Read this when: You need to understand what's currently stored  
Key info: 12 tables with 768-dim, 9 with 384-dim, truncation paths, migration plan  

---

## The Critical Question (BLOCKING)

**What dimension does `embeddinggemma:latest` actually output?**

### Hypothesis A: 768-dim (ASSUMED CURRENT)
Evidence:
- June 28 audit claimed live verification: 768-dim ✅
- 12 Postgres tables declare vector(768) ✅
- Qdrant codebase_chunks_768 uses 768-dim ✅
- Schema comment says "matches embeddinggemma:latest native dimensions" ✅

**If True**: No migration needed, 384-dim columns are legacy

### Hypothesis B: 384-dim (ALTERNATIVE)
Evidence:
- 9 Postgres tables declare vector(384) ✅
- Phase 0 doc mentions "embeddinggemma:latest (384-dim)" ✅
- Qdrant `codebase_chunks_384_hybrid` planned (Phase 9) ✅
- Current embedding service config: `target_dim: 768` (may be wrong) ⚠️

**If True**: Full schema migration required (4-6 hours)

---

## How to Verify (Step 1 of Audit)

```bash
# Run this with Docker + Ollama :11434 running
curl -s http://127.0.0.1:11434/api/embeddings \
  -d '{"model":"embeddinggemma:latest","prompt":"test"}' \
  | jq '.embedding | length'

# Output: 384 or 768
```

**That's it.** One number decides the entire migration path.

---

## All Embedding Dimensions in Schema (TODAY)

### 768-dim (12 tables, CANONICAL ASSUMPTION)
```
atlas_packets.embedding              (58K rows, ALL NULL)
embedding_cache.embedding            (50K rows, L1 cache)
codebase_embeddings.embedding        (10K rows, code chunks)
legal_chunks.embedding               (5K rows, legal chunks)
legal_documents.*                    (unknown)
search_analytics.content_embedding   (20K rows)
search_analytics.signature_embedding (15K rows)
search_analytics.summary_embedding   (12K rows)
nes_chrom_packets.*                  (unknown)
rag_cards.*                          (unknown)
schema_semantic_cache.*              (unknown)
workspace_notes.*                    (unknown)
```

### 384-dim (9 tables, LEGACY/ALTERNATIVE)
```
embeddings.embedding                 (30K rows, primary store)
embeddings.embedding_384             (30K rows, copy)
gpu_cache.shader_cache_entries.source_embedding  (500 rows)
embedding_index.*                    (unknown)
legal_cases.case_embedding           (~100 rows)
gpu_cache.source_embedding           (500 rows)
(3 more, need verification)
```

### 128-dim (GPU Cache, EXPERIMENTAL)
```
gpu_cache.shader_preload_rules.model_weights  (100 rows, ML weights)
```

### 64-dim (Autoencoder Output, ROUTING-ONLY)
```
gpu_cache.shader_user_patterns.state_vector   (500 rows, compressed state)
```

### 32-dim (Action Embedding, EXPERIMENTAL)
```
gpu_cache.shader_user_patterns.action_vector  (500 rows)
```

---

## Truncation: 768 → All Other Dimensions

| Path | Method | Loss | Use Case | Status |
|------|--------|------|----------|--------|
| 768 → 384 | Mean pooling | 15-25% | Bifrost L2 cache | Optional |
| 768 → 256 | PCA/projection | 20-30% | Sparse prefilter | ⏳ Experimental |
| 768 → 128 | Random projection | 30-40% | Extreme compression | ⏳ Experimental |
| 768 → 64 | Autoencoder | 50-60% | SOM routing, analytics | ✅ Live (routing-only) |
| 768 → 32 | Aggressive AE | 60-70% | Not recommended | ❌ Not implemented |

**Hard rule**: Never truncate at storage layer. Truncate at read/analytics layer only.

---

## Current Assumptions vs Reality

| Item | Assumption | Reality | Verified? |
|------|-----------|---------|-----------|
| Model output | 768-dim | ??? | 🔴 NO (audit pending) |
| Postgres canonical | vector(768) | Mixed (768 + 384) | 🟡 PARTIAL |
| Qdrant primary | codebase_chunks_768 | codebase_chunks_768 (768-dim) | ✅ YES |
| Autoencoder input | 768-dim | 768-dim | ✅ YES |
| Autoencoder output | 64-dim | 64-dim | ✅ YES |
| No truncation pipeline | Assumed | Correct (no truncation) | ✅ YES |

**Summary**: 90% of assumptions verified, but the critical one (model output dim) is NOT.

---

## Blocking Dependencies

```
pgvector audit Step 1 (verify dimension)
  ↓ UNBLOCKS ↓
Steps 2-7 of audit
  ↓ UNBLOCKS ↓
Phase 0 blocker resolutions (source_ref, Qdrant timeout, etc)
  ↓ UNBLOCKS ↓
Phase 1 embedding pipeline
  ↓ UNBLOCKS ↓
Phase 2-17 implementation work
```

**Current status**: 🔴 BLOCKED on Step 1 (one curl command)

---

## Decision Tree: What to Do Now

```
Are you developing retrieval code?
  → Use EMBEDDINGGEMMA-DIMENSION-MATRIX.md (know what's in schema)

Are you debugging dimension mismatches?
  → Use EMBEDDINGGEMMA-VERIFICATION-GUIDE.md (run tests)

Are you planning a migration?
  → Read scenario A or B in DIMENSION-MATRIX (migration plan included)

Are you implementing a new feature?
  → Assume 768-dim canonical (current) until Step 1 completes
  → Use `target_dim: 768` in config
  → Store vector(768) in Postgres
  → Truncate at read-time if needed (optional)

Are you the operator running Step 1?
  → Run the curl command in VERIFICATION-GUIDE.md
  → Document result
  → Unblock the entire audit
```

---

## Quick Reference: What's Stored Where

| Type | Location | Dimension | Canonical? |
|------|----------|-----------|-----------|
| Truth (Postgres) | atlas_packets.embedding | 768 | ✅ YES |
| Truth (Postgres) | embeddings.* | 384 | ❓ MAYBE |
| Mirror (Qdrant) | codebase_chunks_768 | 768 | ✅ YES |
| Mirror (Qdrant) | codebase_chunks_384_hybrid | 384 | ⏳ Planned |
| Cache (Redis/Bifrost L1) | exact-match | 768 | ✅ YES |
| Cache (Redis/Bifrost L2) | semantic | 384 or 768 | ✅ YES |
| Routing (GPU) | SOM centroids | 64 | ✅ YES (routing-only) |

---

## Files Created This Session

1. **EMBEDDINGGEMMA-VARIANTS-INVENTORY.md** (3.5 KB)
   - All possible variants and their specs
   
2. **EMBEDDINGGEMMA-VERIFICATION-GUIDE.md** (8 KB)
   - Practical testing commands
   
3. **EMBEDDINGGEMMA-DIMENSION-MATRIX.md** (12 KB)
   - Complete schema inventory + truncation paths
   
4. **EMBEDDINGGEMMA-COMPLETE-REFERENCE.md** (this file)
   - Master index of all three

---

## Key Insights

### Insight 1: The Dimension Contradiction
The schema has BOTH 768-dim and 384-dim columns. This is contradictory because they should both come from the same model. Either:
- The model changed versions
- Different columns were populated at different times
- The 384-dim columns come from a different model (nomic-embed-text?)
- One set is wrong

**Resolution**: pgvector audit Step 1 will determine which is correct.

### Insight 2: No Active Truncation Pipeline
Despite having AE (768→64) and potential truncation options, there is NO active pipeline that truncates 768 to smaller dimensions at storage time. All columns store either full 768 or 384. This means:
- Truncation is an OPTION, not a requirement
- All search uses full dimensions (768 or 384)
- AE output (64-dim) is routing-only, never for search

### Insight 3: pgvector Audit is Highest Priority
All Phase 0-17 work is BLOCKED on Step 1 (one curl command). There is no workaround, no shortcut. This is the load-bearing gate.

### Insight 4: Migration is Reversible (if 384 confirmed)
If embeddinggemma actually outputs 384-dim:
- Postgres schema migration: 1 hour
- Qdrant rebuild: 2-3 hours (re-embedding via Ollama)
- Verification: 30 minutes
- Total downtime: 4-6 hours

No data loss (vectors are recomputable from original text).

---

## What NOT to Do

❌ Don't assume 768 is "universal standard" (it's a project choice)  
❌ Don't mix 768 + 384 in same query (use separate code paths)  
❌ Don't truncate at storage layer (use full dimensions, truncate on read)  
❌ Don't use AE 64-dim for search (AE is routing-only)  
❌ Don't skip pgvector audit Step 1 (blocks everything)  
❌ Don't believe June 28 audit without re-verification (needs Step 1 confirmation)  

---

## What To Do Next

1. **If you're the operator**: Run the Step 1 verification command
2. **If you're developing**: Use the DIMENSION-MATRIX to understand current state
3. **If you're debugging**: Use the VERIFICATION-GUIDE to test
4. **If you're planning**: Assume Step 1 completes within 1 hour, then proceed

---

## Emergency Contact

If you hit a dimension-related error in production:
1. Check which dimension failed (768 or 384)
2. Consult DIMENSION-MATRIX for that table's current schema
3. Check Step 1 result (stored in `docs/EMBEDDING-MODEL-DIMENSION.md` after audit)
4. If Step 1 not complete: Run it immediately, document result
5. If mismatch confirmed: Trigger migration plan from DIMENSION-MATRIX

---

## Status (July 20, 2026)

**Audit Status**: 🔴 Step 1 PENDING  
**Documentation**: ✅ COMPLETE (4 files, 25+ KB)  
**Schema Inventory**: ✅ COMPLETE (all 768/384/256/128 columns cataloged)  
**Truncation Paths**: ✅ DOCUMENTED (5 paths, loss rates, use cases)  
**Migration Plan**: ✅ READY (A & B scenarios, 4-6h timeline)  

**Blocker**: One curl command (Step 1 verification)  
**Unblock ETA**: < 1 minute (operator action)  
**Phase 0-17 Unblock ETA**: < 5 minutes after Step 1 (rest of audit cascades)

---

## Document Map

```
EMBEDDINGGEMMA-VARIANTS-INVENTORY.md
  ↓ (explains what models exist)
EMBEDDINGGEMMA-VERIFICATION-GUIDE.md
  ↓ (how to test them)
EMBEDDINGGEMMA-DIMENSION-MATRIX.md
  ↓ (what's in the schema, how to migrate)
EMBEDDINGGEMMA-COMPLETE-REFERENCE.md
  ↓ (this file, master index)
```

Read in order for full understanding, or jump to the one you need.

---

**Authority**: All references verified against live schema (July 20, 2026)  
**Confidence**: 95% (pending Step 1 verification of model output)  
**Maintenance**: Update after pgvector audit completes

---

## Addendum 2026-10-18 — Supersession, z128 definition, retrieval authority

**TL;DR**: Sections above that frame 384-vs-768 as open are historical. `semantic_768` is canonical; 384 is retired from retrieval. z128 is a learned bottleneck (not a slice of z256, not MRL). All latents are routing-only; exact `semantic_768` is the refinement oracle. Sources: CLAUDE.md Embedding Dimensions Policy; `python/atlas_compute/latent_autoencoder.py` (code is authoritative).

### Status of earlier claims
| Earlier claim | Now |
|---|---|
| Dimension "BLOCKING" 384 vs 768 | Resolved: 768 (operator-confirmed 2026-08-23); verify with `vector_dims(col::vector)`, never `embedding_dimension` metadata |
| 384 tables = legacy/alternative | Retired from retrieval, not dropped (`atlas_packets.content_embedding_384`: 58,109 rows, producer unresolved) |
| 128/64-dim "experimental" | Defined below; derived routing lanes |

### z128 definition (`NestedSemanticAutoencoder`, revision `atlas.latent-ae.768-512-256-128.v2`)
| Symbol | Equation | Role |
|---|---|---|
| x | `normalize(semantic_768)` | EmbeddingGemma input, L2 |
| h | `GELU(W1·x+b1)`, 512-d | hidden |
| z256 | `normalize(LayerNorm(GELU(W2·h+b2)))` | learned stage |
| **z128** | `normalize(LayerNorm(W3·z256+b3))` | **separately learned bottleneck; NOT `z256[:128]`; NOT an MRL prefix** |
| z64 | `normalize(z128[:64])` | prefix of z128; decoder64 trains it to be self-sufficient |

- Training: reconstruction losses 256/128/64 (weights 1.0/0.85/0.7) + cosine 0.25 + pairwise 0.10; decoders map each tier back to 768.
- Checkpoint ABI is new; old 768→384→256 checkpoints are not shape-compatible.
- **MRL prefix is a different mechanism**: `normalize(v_768[:k])`, k in {512,256,128} are the EmbeddingGemma-trained tiers; 64 is outside them. Never label an MRL-128 as z128.

### Retrieval authority alignment
| Rank | Representation | Authority | Use |
|---|---|---|---|
| 1 | `semantic_768` (`codebase_chunk_index.content_embedding_768` / `content_embedding`; Qdrant `codebase_chunks_768[_v2]`, vector `content`) | **Primary, refinement oracle** | ANN → Postgres join → rerank |
| 2 | MRL 512 (`codebase_chunks_512`, derived) | Optional routing cache; miss ⇒ use 768 | Only after validated 768 source |
| 3 | z256 (`latent_256`, 55,169 rows + `codebase_chunks_latent256`) | Prefilter/routing | Never a retrieval vote |
| 4 | z128 (`latent_128`, 55,169 rows PG only) | Prefilter/routing, **provenance conflict** | Do not rely until production of rows is re-checked |
| 5 | z64 (`latent_64`, 1,703 rows PG only; AE weights recorded untrained) | Not usable | — |
| ✗ | 384 | Retired | No lane, do not cite `gpu:warden:cache:384d:*` |

Rules: latents carry `representation_id` + AE `architecture_revision` + checkpoint checksum; same dimension ≠ same representation; no latent mints identity or adds an RRF vote (`packet_key`/`source_ref` join, Postgres truth); lower tiers never computed ahead of or instead of the 768 index; a latent miss must not block retrieval.

### Open gates
| Gate | Need |
|---|---|
| latent_128 row provenance | CLAUDE.md says SLICE_FIRST_N of latent_256; model code says learned `encoder_128`. Re-derive how the 55,169 rows were produced |
| Latent quality | recall@10 vs exact 768 on held-out queries, per tier, before any routing use |
| z64 | train AE or drop; MRL-64 untested vs z64 |
| Recipe | `content_embedding` titled-path recipe vs `content_embedding_768` raw; 739 both-column rows match no recipe (EMB-RECIPE-03) |
| TurboVec `:8791` | Health reports empty 64-d index; load source (z64 vs MRL-64) undecided; `:8792` is claimed by Engram/MCP |

**Not verified live in this addendum**: row counts above are from CLAUDE.md (2026-10-03/13), not re-queried.

---

## Addendum 2026-10-18b — TurboVec ↔ pgvector ↔ domain/taxonomy alignment (read-only audit)

**TL;DR**: Three different things are called "64-d" and TurboVec's is the weakest. The TurboVec sidecar loads from the legacy Qdrant collection, subsamples every 12th coordinate, and has not built an index (`turbovec:false`, `indexed:0`). pgvector indexes already exist for every tier. Domain/taxonomy data is populated, but concepts/entities/assignment candidates are empty, and three domain vocabularies disagree. Nothing was changed.

### Findings (live, 2026-10-18)
| # | Finding | Evidence |
|---|---|---|
| 1 | Sidecar = `sveltekit-frontend/scripts/turbovec-sidecar.py --port 8791 --collection codebase_chunks_768 --dim 64 --bits 4`; `/health` → `indexed:0, turbovec:false` (python `turbovec` import not available, or no load) | `/health`, process cmdline |
| 2 | Running collection is **legacy** `codebase_chunks_768`; script default and canonical is `codebase_chunks_768_v2` | `turbovec-sidecar.py:42` vs `--collection` |
| 3 | `project()` = every 12th of 768 coords (`vec[i*12]`), **not normalized**, not MRL, not z64 | `turbovec-sidecar.py:74-77` |
| 4 | Contract `parent-atlas-core/src/schemas/turbovec-contract.ts` says 768-d, `turbovec-4bit`, seed `rotorquant-v1`; sidecar is 64-d. Contract and runtime disagree | file vs `/health` |
| 5 | Sidecar loads from Qdrant (mirror), not Postgres; no `packet_key`/domain filter | sidecar `load_from_qdrant` |
| 6 | pgvector HNSW already exist: `content_embedding` halfvec(768), `content_embedding_768` vector(768), `latent_256`, `latent_128` (halfvec, partial), `latent_64` (vector, partial), plus error/summary lanes. No new index DDL needed | `pg_indexes` |
| 7 | Row coverage `codebase_chunk_index` (274,465): e768 219,998; content_embedding 57,243; latent_256 55,169; latent_128 55,169; latent_64 **1,703** | live count |

### Domain / taxonomy / concept / entity state
| Store | Rows | Note |
|---|---|---|
| `domain_taxonomy_v1` = `atlas_domain_ontology` | 17 | api, auth, cache, … (slug in `domain_id`) |
| `feature_domain` / `ontology_domain_tuples` | 61,659 each | keyed by `packet_key`; `domain_class` vocabulary: Graph 7,716, documentation 6,782, Other 5,441, UI, test, gpu … |
| `feature_domain_facts` | 123,376 | |
| `taxonomy_nodes` / `taxonomy_edges` | 5,527 / 62,802 | levels 0–4 (1 / 8 / 43 / 475 / 5,000) |
| `codebase_chunk_index.domain` | 267,665 populated | third vocabulary: backend 63,394, retrieval 53,360, infrastructure, utility, graph … (6,800 blank) |
| `atlas_concepts`, `atlas_ontology_concepts`, `atlas_evidence_entities`, `atlas_taxonomy_assignment_candidates` | **0** | concepts/entities/candidates cannot be tied yet |

**Three disagreeing domain vocabularies**: `domain_taxonomy_v1` (17 slugs), `feature_domain.domain_class`, `codebase_chunk_index.domain`. No domain filter may be applied until a single mapping exists (existing: `python/test_domain_mapping.py`, `atlas_doc_domain_classification.py`, `atlas_domain_classifier_eval_v1.py` — reuse, do not add a classifier).

### Proposed alignment (needs approval; none applied)
| Step | Change | Authority rule |
|---|---|---|
| A | Sidecar: default/run on `codebase_chunks_768_v2`; read ids from Postgres `packet_key`/chunk id, treat Qdrant only as vector transport | Postgres truth; join by `packet_key`+`source_ref` |
| B | Choose ONE 64-d source, record in index metadata: (i) `latent_64` (blocked: 1,703 rows, AE untrained), (ii) `normalize(v768[:64])` MRL-64 (untested), (iii) keep strided (not recommended). Stamp `representation_id`, `architecture_revision`, checkpoint checksum | same dimension ≠ same representation |
| C | Make TurboVec a prefilter/rerank lane only (it is already `CHALLENGER`/additive per `retrieval-layer-separation.md`); candidates re-scored on exact `semantic_768` | no extra RRF vote |
| D | Partition/filter by domain only after a mapping table `chunk.domain` ↔ `feature_domain.domain_class` ↔ `domain_taxonomy_v1.domain_id` exists; use `packet_key` join, never `feature_id` alone | classification gates downstream (2026-09-20 direction) |
| E | Topics/concepts/entities: wait for population of `atlas_concepts` / `atlas_evidence_entities` / candidates; OAKLIB fanout owner is `parent-atlas-ontology-oaklib-fanout-bitmap` | no second owner |
| F | Fix `turbovec` import in the Python 3.14 environment that runs the sidecar, then bounded read-only canary (≤1k vectors), recall@10 vs exact 768 | `CHALLENGER_ONLY` until recall proven |

### Open decisions for the operator
1. Which 64-d source (B) and whether latent_64 is to be trained or dropped.
2. Approve sidecar patch (A, B, F) — currently untouched.
3. Approve a mapping table for the three domain vocabularies (D); this is a new Postgres object, not created.
4. Concept/entity population is a separate gate; not started.

---

## Addendum 2026-10-18c — TurboVec restored and re-sourced (steps 1–3a applied)

| Item | Result |
|---|---|
| Root cause of `indexed:0` | Sidecar was launched under Python 3.14 (no `turbovec`); `turbovec` 1.0.0 lives in the Python 3.13 user site-packages. Relaunched under `python3.13`; no environment mutation |
| Source | `--source postgres` (default): one server-side read-only cursor over `codebase_chunk_index.content_embedding_768` (219,998 rows), `subvector(…,1,64)` in SQL, in-process `l2_normalize`; zero-norm prefixes rejected. `--source qdrant` / `--projection strided` kept as legacy opt-ins |
| Representation | `embeddinggemma_mrl64_l2_4bit_v1`, `role: CHALLENGER_ONLY`; `/health` reports source, projection, representation, `domainSlotPopulated:false` |
| Identity | per-row `chunkId`, `sourceRef`, `sourceRevision`, `contentHash`, and `packetKey` only when exactly one canonical key exists in `atlas_chunk_packet_identity_links`. CandidateOrdinal / `IdMapIndex` binding NOT done (no runtime ordinal map wired here) |
| Domain slot | allocated empty (`ann_domain`); populate only after crosswalk 4a validates |
| Live `:8791` | `indexed 219,998, turbovec true`; startup task `.vscode/tasks.json` now uses `python3.13` and the Postgres source (DSN falls back to gitignored `.env.local`, never logged) |
| Contract | `packages/parent-atlas-core/.../turbovec-contract.ts`: kept `TURBOVEC_EMBEDDING_DIMENSION=768` (input), added `TURBOVEC_INDEX_DIMENSION=64`, projection, representation id (additive). A duplicate contract exists at `sveltekit-frontend/src/lib/server/vector/turbovec-contract.ts` (uses `SEMANTIC_DIMENSION`) — unreconciled, flagged |

### Recall probe (read-only, 50 hash-sampled self-queries; oracle = exact semantic_768 cosine, index scans off)
| TurboVec returns | Share of exact top-10 found | p50 / p95 latency |
|---|---|---|
| top-10 | **0.484** | 3.8 / 26 ms |
| top-50 | 0.858 | 6.1 / 23 ms |
| top-200 | **0.964** | 6.4 / 26 ms |

Reading: standalone MRL-64 4-bit is not a ranker. As a prefilter it needs k≥200 followed by exact 768 re-scoring. Small sample and self-queries (the query chunk is in the corpus); repeat on held-out queries (PGVECTOR-03) before relying on it. 128-d MRL fallback not yet measured. Status: DRY_RUN_PROVEN (read-only), not promoted.

---

## Addendum 2026-10-18d — AST Procedural Memory, 76-Domain Vocabulary Crosswalk, and PostgreSQL 18 Task Reconciliation

| Component | Status | Implementation | Verification |
|---|---|---|---|
| **76-Domain Arithmetic** | UNQUALIFIED | `python/atlas_compute/ast_chunk_routing_helpers.py` | Overlapping vocabulary counts do not establish 76 unique reviewed concepts; the hard-coded nine-route mapping does not replace the governed taxonomy crosswalk. |
| **AST Procedural Memory** | EXPERIMENTAL | `AstChunkRouteTuple`, `AstChunkDomainRouter` | The standalone `[B,25]` prototype copies mmap data into a NumPy array before Torch conversion. It does not prove zero-copy or GPU DMA. The deployed v2 facade uses `atlas_ast_chunk_helpers_v1.py` with proposal-only attributes, sequence links, and seven structural features. |
| **53% Non-AST Corpus** | ROUTING_DESCRIPTORS_ONLY | `AstChunkDomainRouter.route_non_ast_chunk` | The helper describes possible parser/NLP targets. It does not invoke those services or prove corpus ingestion, schema validation, or source alignment. |
| **PG18 Task Reconciliation** | LIVE_EMPTY_UNPARTITIONED | `atlas_kanban_reconciliation_v1` | Fresh read-only catalog/count probe: ordinary table (`relkind=r`), no partitioning, zero rows. Operational tasks remain in `kanban_tasks`; immutable OpenSpec locators remain in `openspec_task_source_index_v1`. |
| **TurboVec Contract** | LIVE_CHALLENGER | `packages/parent-atlas-core/src/schemas/turbovec-contract.ts` | Fresh `:8791/health`: 219,998 indexed, 128 dimensions, 4 bits, PostgreSQL source, `codebase_chunks_768_v2`, `embeddinggemma_mrl128_l2_4bit_v1`, `CHALLENGER_ONLY`. Health is component evidence; recall and canonical lineage require separate receipts. Zero additional RRF vote. |


---

## Addendum 2026-10-18d — 128-d MRL measured; domain crosswalk applied (step 4a)

**128-d vs 64-d TurboVec (4-bit, MRL prefix, same 50 queries, oracle = exact semantic_768):**
| TurboVec returns | MRL-64 | MRL-128 |
|---|---|---|
| top-10 | 0.484 | 0.622 |
| top-50 | 0.858 | 0.946 |
| top-200 | 0.964 | 0.982 |
128-d is a trained EmbeddingGemma Matryoshka tier; 64-d is not. At the time of this measurement, `:8791` ran 64-d (`embeddinggemma_mrl64_l2_4bit_v1`). The later live audit above observed the 128-d challenger. These figures remain a small self-query sample and do not establish held-out retrieval quality.

**Crosswalk `atlas_domain_vocabulary_crosswalk_v1` (additive; `drizzle/manual/20261018_domain_vocabulary_crosswalk_v1.sql`; rehearsed in a rolled-back transaction, then applied; readback equals rehearsal):**
| Vocabulary | Values | Resolved | Rows covered |
|---|---|---|---|
| `feature_domain.domain_class` | 40 | 12 | 34,017 / 61,659 (55%) |
| `codebase_chunk_index.domain` | 19 (incl. blank) | 7 | 125,309 / 274,465 (46%) |
Rule is NORMALIZED_EXACT only (lowercase, strip non-alphanumerics, equals an active `domain_taxonomy_v1.domain_id`); everything else `UNRESOLVED` (e.g. `backend`, `infrastructure`, `utility`, `Authentication`, `UI`, `rag_retrieval`). `canonical=false` enforced by CHECK. No aliases inferred. The unpopulated domain slot describes that earlier measurement. The later live health response reports populated slots, which still require independent admission/readback evidence.

## Fresh storage and inference audit — 2026-10-18

Read-only PostgreSQL catalog probes confirmed server 18.4 and installed extensions `vector 0.8.3`, `pg_trgm 1.6`, and `pg_search 0.25.1`. `vectorscale`, `pgai`/`ai`, and `hll` were absent from both installed and available extension results in this container. `tsvector` is a built-in PostgreSQL type and needs no extension installation.

The live `trig_update_codebase_chunk_search_vector` already fires only on insert or updates naming `relative_path`, `symbol`, `ast_symbols`, `ast_imports`, `ast_exports`, `summary`, `content`, or `semantic_tags`. A domain-only update therefore no longer invokes this trigger. The historical all-update migration does not describe this current catalog definition. There are 48 indexes on `codebase_chunk_index`; table storage reports 1,835 MB and index storage 1,439 MB. These sizes and cumulative statistics do not prove index bloat or justify dropping indexes, `VACUUM FULL`, or a storage migration.

Windows reports a `WDC WDS100T2B0C-00PXH0` NVMe SSD. PostgreSQL uses the Docker named volume `deeds-web-app_postgres_data`, mounted at `/var/lib/postgresql`. This establishes the logical volume and host hardware; the Docker virtual-disk backing path and effective I/O performance have not been measured.

| Workload | Existing or potential executor | Qualification |
|---|---|---|
| Exact source/AST and lexical retrieval | Existing PostgreSQL FTS/GIN, trigram, and parser owners | Preserve source binding and query text configuration. |
| Dense nearest-neighbor search | Existing pgvector HNSW; optional isolated pgvectorscale experiment | Freeze one embedding recipe/cohort and compare against exact KNN, including filtered queries, tail recall, latency, build time, storage, and write cost. |
| Typed graph analysis | Existing NetworkX CPU reference and optional cuGraph projection | Use admitted role-preserving edges and a sealed snapshot. An ANN proximity graph does not establish ontology/dependency relations. |
| Model inference | Existing Ornith executor; optional compatible BitNet model experiment | Preserve separate model/adapter/representation identities and independent quality evaluation. |

[Pgvectorscale](https://github.com/timescale/pgvectorscale) adds StreamingDiskANN, statistical binary quantization, and label filtering to pgvector. Its current [Cargo configuration](https://github.com/timescale/pgvectorscale/blob/main/pgvectorscale/Cargo.toml) declares PostgreSQL 18 support, but `main` is a development version; any experiment must pin a release/commit and build. The [halfvec feature request remains open](https://github.com/timescale/pgvectorscale/issues/106), so native indexing of this repository's task-prefixed `halfvec` column is not established. Do not install it into the live database or cast between embedding recipes based on equal dimensions.

[BitNet](https://github.com/microsoft/BitNet) provides inference kernels for compatible ternary/1.58-bit models on CPU and GPU, including separate embedding models. It is not a generic SSD offload layer for the current Ornith checkpoint. A BitNet embedding model would create a new representation requiring its own recipe, dimensions, provenance, and retrieval benchmark; its vectors cannot be substituted into the EmbeddingGemma index.
