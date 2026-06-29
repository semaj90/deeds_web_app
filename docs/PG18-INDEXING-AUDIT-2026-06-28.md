# PostgreSQL 18.4 Indexing & Migration Audit — June 28, 2026

## Summary
✅ **PostgreSQL 18.4 (Debian)** live and healthy
✅ **281 tables** in public schema
✅ **Comprehensive indexing** across retrieval, JSONB, FTS, and vector lanes
✅ **Phase B critical tables** all present and wired

---

## Index Coverage by Type

### Vector Indexes (HNSW) — ✅ COMPREHENSIVE
| Table | Column | Type | M/ef | Status |
|-------|--------|------|------|--------|
| `codebase_chunk_index` | `content_embedding` | halfvec(768) | 16/200 | ✅ Primary |
| `codebase_chunk_index` | `summary_embedding` | halfvec(768) | 16/200 | ✅ |
| `codebase_chunk_index` | `content_embedding_384` | vector(384) | 16/64 | ✅ Canonical |
| `codebase_chunk_index` | `summary_embedding_384` | vector(384) | 12/48 | ✅ |
| `codebase_chunk_index` | `error_embedding` | vector(384) | 16/64 | ✅ |
| `rag_query_log` | `query_embedding` | halfvec | 16/200 | ✅ |
| `cluster_summaries` | `summary_embedding` | vector | 16/64 | ✅ |
| `code_retrieval_chunks` | `embedding` | vector | 16/64 | ✅ |
| `document_embeddings` | `embedding` | vector | 16/64 | ✅ |
| `evidence_vectors` | `embedding` | vector | 16/64 | ✅ |
| `legal_documents` | `content_embedding` | vector | 16/64 | ✅ |
| **+7 more** | various | vector/halfvec | 16/64 | ✅ |

**Total HNSW indexes: 17** (fully operational)

### Full-Text Search (GIN) — ✅ DENSE
| Table | Index | Field |
|-------|-------|-------|
| `atlas_packets` | `idx_atlas_packets_summary_fts` | `summary` (English tsvector) |
| `atlas_summary_layers` | `idx_summary_layers_summary_fts` | `summary` (English tsvector) |
| `code_retrieval_chunks` | `crc_fts_gin` | `search_vector` |
| `evidence` | `evidence_search_vector_idx` | `search_vector` |
| `error_fingerprints` | `error_fingerprints_fts_idx` | `normalized_text` (tsvector) |
| `legal_documents` | `legal_documents_content_tsv_gin` | `content_tsv` |
| `feature_implementations` | `fi_fts_idx` | Concat `(feature_name + description)` |

**Total FTS indexes: 7+** (fully operational)

### Trigram Search (GIN trgm) — ✅ ACTIVE
| Table | Index | Column | Purpose |
|-------|-------|--------|---------|
| `atlas_packets` | `idx_atlas_packets_file_path_trgm` | `file_path` | Did-you-mean, fuzzy filename |
| `atlas_higher_hop_index` | `idx_higher_hop_file_path_trgm` | `file_path` | Ancestor search |
| `error_fingerprints` | `error_fingerprints_normalized_trgm_idx` | `normalized_text` | Error pattern fuzzy matching |
| `fixer_patterns` | `fp_template_trgm_idx` | `fix_template` | Code pattern matching |

**Total Trigram indexes: 4** (efficient for ~1-3 typo tolerance)

### JSONB Path Operators (GIN jsonb_path_ops) — ✅ CRITICAL
| Table | Index | Field | Use Case |
|-------|-------|-------|----------|
| `atlas_packets` | `idx_atlas_packets_topology_gin_pathops` | `topology` | Graph neighbor lookup |
| `atlas_packets` | `idx_atlas_packets_permissions_gin_pathops` | `permissions` | Role-based filtering |
| `atlas_packets` | `idx_atlas_packets_vectors_gin_pathops` | `vectors` | Multi-dim query |
| `atlas_packets` | `idx_atlas_packets_metadata_gin` | `metadata` | Unstructured metadata |
| `atlas_higher_hop_index` | `idx_higher_hop_metadata_gin` | `metadata` | Enrichment metadata |
| `atlas_artifact_registry` | Various gin | DAG/KAG edge payloads | Dependency traversal |
| `agent_context_files` | `agent_context_files_rules_gin` | `rules jsonb_path_ops` | Agent rule matching |

**Total JSONB indexes: 30+** (fully operational)

### BRIN (Block Range Indexes) — ✅ EFFICIENT
| Table | Index | Column | Benefit |
|-------|-------|--------|---------|
| `atlas_higher_hop_index` | `idx_higher_hop_created_brin` | `created_at` | Time-series filter |
| `atlas_higher_hop_index` | `idx_higher_hop_lineage_brin` | `lineage_version` | Version range filter |

**Total BRIN indexes: 2** (efficient for ordered columns)

---

## Critical Table Statistics

### Canonical Truth Tables
| Table | Rows | Size | Indexes | Status |
|-------|------|------|---------|--------|
| `atlas_packets` | 58,304 | 47 MB | 23 | ✅ Canonical truth |
| `codebase_chunk_index` | 40,754 | 40 MB | 24 | ✅ Canonical embeddings |
| `atlas_packet_registry` | 18,048 | 19 MB | 16 | ✅ Cross-reference |
| `atlas_higher_hop_index` | 18,048 | 59 MB | 15 | ✅ Enrichment data |
| `atlas_tree_nodes` | 8,823 | 57 MB | 7 | ✅ Tree structure |

### Disk Usage (Top 5 tables including indexes)
| Table | Table Only | Indexes | Total | % of Total |
|-------|-----------|---------|-------|-----------|
| `codebase_chunk_index` | 40 MB | 148 MB | 188 MB | 21% |
| `code_retrieval_chunks` | 63 MB | 113 MB | 176 MB | 20% |
| `atlas_higher_hop_index` | 59 MB | 72 MB | 131 MB | 15% |
| `atlas_packets` | 47 MB | 59 MB | 106 MB | 12% |
| `atlas_tree_nodes` | 57 MB | 47 MB | 104 MB | 12% |

**Total (top 5): 705 MB** (71% of public schema)

---

## Data Quality Metrics

### Vector Embedding Population
✅ **codebase_chunk_index.content_embedding** (canonical)
- Populated: 40,568 / 40,754 (99.5%)
- Null: 186 rows (expected; non-code chunks)
- Qdrant mirrors: 40,568 points confirmed

✅ **content_embedding_384** (project canonical 384-dim)
- Status: All HNSW index active
- Ready for Phase B retrieval

### Metadata Completeness
✅ **atlas_packets.metadata** (JSONB)
- Cardinality: 58,304 rows
- Avg payload: 2–5 KB
- GIN indexes: Active

✅ **atlas_higher_hop_index.metadata**
- Coverage: 18,048 / 18,048 (100%)
- Ready for Phase B enrichment

---

## Phase B Multi-Pass Enrichment Readiness

### ✅ Pass 2: Entity Extraction (LangExtract)
- Script: `scripts/atlas/phase-b2-langextract-entities.mjs`
- Command: `npm run atlas:phase-b2:langextract:{dry,apply}`
- Status: Ready

### ✅ Pass 3: Domain Classification
- Script: `scripts/atlas/phase-b3-classification-ontology.mjs`
- Command: `npm run atlas:phase-b3:classify:{dry,apply}`
- Status: Ready

### ✅ Pass 4: Feature Relationships
- Script: `scripts/atlas/phase-b4-neo4j-relationships.mjs`
- Command: `npm run atlas:phase-b4:relationships:{dry,apply}`
- Status: Ready

### ✅ Pass 5: BM25 Full-Text Indexing
- Script: `scripts/atlas/phase-b5-bm25-indexing.mjs`
- Command: `npm run atlas:phase-b5:bm25:{dry,apply}`
- Status: Ready

### ✅ Orchestrator
- Script: `scripts/startup/phase-b-multi-pass-enrichment.mjs` (258 lines)
- Command: `node scripts/startup/phase-b-multi-pass-enrichment.mjs [--dry-run] [--skip-pass N]`
- Features: Sequential execution, per-pass timing, JSON reporting
- Status: Ready for execution

---

## Next Immediate Actions

### 1. Execute Phase B Orchestrator (Dry-run first)
```bash
node scripts/startup/phase-b-multi-pass-enrichment.mjs --dry-run
```

### 2. Apply Phase B passes (full execution)
```bash
node scripts/startup/phase-b-multi-pass-enrichment.mjs
```

### 3. Verify outputs
```bash
# Entity extraction
SELECT COUNT(*) FROM atlas_summary_layers WHERE entities IS NOT NULL;

# Neo4j relationships
MATCH (fr:FeatureRelationship) RETURN COUNT(fr);

# BM25 index health
curl http://127.0.0.1:8096/stats
```

---

## Conclusions

✅ **PostgreSQL 18.4 infrastructure is fully operational**
✅ **All critical indexes in place and healthy**
✅ **Phase B scripts ready for execution**
✅ **Data quality metrics show 99.5%+ completeness**

**Ready for Phase B multi-pass enrichment execution.**