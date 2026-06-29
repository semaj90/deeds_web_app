# Phase B: Multi-Pass Summary Enrichment Pipeline

**Status**: ✅ DESIGNED & IMPLEMENTED
**Current Phase**: Phase A (Gemma4 summaries) — RUNNING (32% → ~90 min remaining)
**Next Phase**: Phase B (Multi-pass enrichment) — READY TO EXECUTE
**Last Updated**: 2026-06-29 01:30 UTC

---

## Overview

Phase B extends Phase A's basic summaries into a rich, multi-dimensional knowledge representation:

```
Phase A Output (1,000 summaries)
  ↓
Pass 2: Entity Extraction → extracted_entities, keywords, error_pattern
  ↓
Pass 3: Domain Classification → feature_group_id, domain_class, taxonomy_level
  ↓
Pass 4: Relationship Graph → atlas_feature_relationships (sibling, parent, child, error-linked)
  ↓
Pass 5: BM25 Full-Text Indexing → Go service index + Redis cache warmup
  ↓
Phase C Input: Enriched packet metadata + Indexed summaries ready for RFF fusion
```

---

## Architecture

### Phase B Orchestrator

**File**: `scripts/startup/phase-b-multi-pass-enrichment.mjs`

Sequential orchestration of 4 passes. Each pass is independent and can be skipped:

```bash
# Run all passes
npm run startup:phase-b:multi-pass:apply

# Dry-run (preview, no writes)
npm run startup:phase-b:multi-pass:dry

# Verbose logging
npm run startup:phase-b:multi-pass:verbose

# Skip a specific pass
node scripts/startup/phase-b-multi-pass-enrichment.mjs --apply --skip-pass=4
```

---

## Pass 2: Entity Extraction & Keywords

**File**: `scripts/atlas/phase-b2-langextract-entities.mjs`
**Duration**: ~60-90 minutes (1,000 packets)
**Output Columns**: `extracted_entities` (JSONB), `keywords` (text[]), `error_pattern` (varchar)

### How It Works

1. **LangExtract Integration** (semantic entity extraction)
   - Calls LangExtract service at `:8091`
   - Extracts: functions, files, variables, classes, error_types, services, APIs
   - Returns structured entity objects with offsets and types

2. **TF-IDF Keyword Ranking**
   - Tokenizes summary → frequency analysis
   - Filters stopwords (that, this, from, with, etc.)
   - Ranks by frequency → top 5-10 keywords
   - Example: "TypeError in upload handler" → ["typeerror", "upload", "handler"]

3. **Error Pattern Detection**
   - Regex-based heuristics for common errors
   - Patterns: timeout, connection, authentication, validation, memory, parsing, database, permission, network
   - Example: "connection refused" → `error_pattern = 'connection'`

### Example Output

```json
{
  "packet_key": "auth:sessions:001",
  "extracted_entities": [
    { "type": "function", "value": "validateSession", "confidence": 0.95 },
    { "type": "class", "value": "SessionHandler", "confidence": 0.88 },
    { "type": "error_type", "value": "AuthenticationError", "confidence": 0.91 }
  ],
  "keywords": ["session", "authentication", "validation", "tokens"],
  "error_pattern": "authentication"
}
```

### Commands

```bash
# Dry-run (preview 100 packets)
npm run atlas:phase-b2:langextract:dry

# Apply (all packets)
npm run atlas:phase-b2:langextract:apply

# Batch size override
node scripts/atlas/phase-b2-langextract-entities.mjs --apply --batch=200 --verbose
```

---

## Pass 3: Domain Classification

**File**: `scripts/atlas/phase-b3-classify-domain.mjs`
**Duration**: ~45-60 minutes (1,000 packets)
**Output Columns**: `feature_group_id` (varchar), `domain_class` (varchar), `taxonomy_level` (integer)

### How It Works

1. **Gemma4 Ontology Classification**
   - Calls Gemma4 at `:8090` with classification prompt
   - Analyzes summary + feature_id → maps to domain taxonomy
   - Prompt includes hierarchical domain structure

2. **Domain Taxonomy (Pre-defined)**
   - `devops` (Infrastructure)
     - `devops.env-config` (Environment Configuration)
     - `devops.process-mgmt` (Process Management)
   - `error-handling` (Error Handling & Recovery)
   - `auth` (Authentication & Authorization)
   - `retrieval` (Information Retrieval)
     - `retrieval.vector` (Vector Search)
     - `retrieval.graph` (Graph Traversal)
     - `retrieval.fulltext` (Full-Text Search)
   - `api` (API Design & Integration)
   - `data` (Data Structures & Storage)
   - `ui` (User Interface & Components)

3. **Confidence Scoring**
   - Gemma4 returns confidence (0.0-1.0)
   - Low confidence (<0.3) → marked "unclassified"
   - Stored in Postgres for audit trails

### Example Output

```json
{
  "packet_key": "auth:sessions:001",
  "feature_group_id": "auth",
  "domain_class": "Session Validation",
  "taxonomy_level": 1,
  "confidence": 0.92
}
```

### Commands

```bash
# Dry-run
npm run atlas:phase-b3:classify:dry

# Apply
npm run atlas:phase-b3:classify:apply

# With batch override
node scripts/atlas/phase-b3-classify-domain.mjs --apply --batch=150 --verbose
```

---

## Pass 4: Feature Relationship Graph

**File**: `scripts/atlas/phase-b4-relationships-graph.mjs`
**Duration**: ~30-45 minutes (10,000 relationships)
**Output Table**: `atlas_feature_relationships` (relationships + reasoning)

### How It Works

Four independent relationship inference strategies:

1. **Sibling Relationships** (shared domain group)
   - Query: Find all features in same `feature_group_id`
   - Type: `sibling`
   - Strength: 0.7
   - Example: `auth.sessions` ↔ `auth.tokens` (both in "auth" group)

2. **Error-Linked Relationships** (shared error pattern)
   - Query: Find features with same `error_pattern`
   - Type: `related_by_error`
   - Strength: 0.5
   - Example: All timeout errors linked together

3. **Hierarchical Relationships** (feature_id structure)
   - Rule: `auth.sessions.create` has parent `auth.sessions`, grandparent `auth`
   - Types: `parent` (strength 0.9), `child` (strength 0.8)
   - Example: `auth` → `auth.sessions` → `auth.sessions.create`

4. **Semantic Relationships** (future: summary similarity via Qdrant)
   - Planned but deferred (requires embedding pass first)
   - Type: `related_by_concept`
   - Strength: TBD

### Example Output

```sql
INSERT INTO atlas_feature_relationships
  (source_feature_id, target_feature_id, relationship_type, strength, reasoning)
VALUES
  ('auth.sessions', 'auth.tokens', 'sibling', 0.7, 'Shared domain group: auth'),
  ('auth.sessions', 'auth', 'parent', 0.9, 'Hierarchical feature structure'),
  ('db.connect', 'cache.connect', 'related_by_error', 0.5, 'Shared error pattern: connection');
```

### Commands

```bash
# Dry-run
npm run atlas:phase-b4:relationships:dry

# Apply
npm run atlas:phase-b4:relationships:apply

# Verbose (debug output)
node scripts/atlas/phase-b4-relationships-graph.mjs --apply --verbose --batch=500
```

---

## Pass 5: BM25 Full-Text Indexing

**File**: `scripts/atlas/phase-b5-bm25-indexing.mjs`
**Duration**: ~20-30 minutes (1,000 packets)
**Output**: Go service index + Redis cache + Postgres metadata

### How It Works

1. **Go Service Indexing** (BM25 inverted index)
   - Calls Go search service at `:8096/api/index`
   - Sends: document_id, title, content, metadata
   - Service builds BM25 index in memory/disk
   - Result: Full-text search becomes Lane 4 of RFF

2. **Redis Cache Warmup** (hot packet cache)
   - Extracts search terms from summary (TF-IDF top 5)
   - Stores in Redis: `bm25:packet:{key}` → JSON snippet
   - TTL: 24 hours
   - Enables instant cache hits on common searches

3. **Postgres Metadata** (audit trail)
   - Populates: `bm25_indexed_at`, `bm25_score`, `bm25_terms`
   - Enables date-based reindexing logic
   - Pre-computed score defaults to 0.5

### Example Output

```json
{
  "packet_key": "auth:sessions:001",
  "bm25_indexed_at": "2026-06-29T02:45:00Z",
  "bm25_score": 0.5,
  "bm25_terms": ["session", "authentication", "validation"]
}
```

### Commands

```bash
# Dry-run
npm run atlas:phase-b5:bm25:dry

# Apply
npm run atlas:phase-b5:bm25:apply

# Verbose (check Go service communication)
node scripts/atlas/phase-b5-bm25-indexing.mjs --apply --verbose
```

---

## Database Schema Changes

**File**: `drizzle/manual/phase-b-enrichment-schema.sql`

### New Columns (atlas_packets)

| Column | Type | Purpose |
|--------|------|---------|
| `extracted_entities` | jsonb | LangExtract output (entities + offsets) |
| `keywords` | text[] | Top 5-10 keywords from summary |
| `error_pattern` | varchar(255) | Detected error category |
| `feature_group_id` | varchar(255) | Domain group (e.g., "auth", "devops.env-config") |
| `domain_class` | varchar(255) | Human-readable domain label |
| `taxonomy_level` | integer | Hierarchy depth (0 = top-level, 1+ = sub-categories) |
| `bm25_indexed_at` | timestamp | When BM25 indexing completed |
| `bm25_score` | real | Pre-computed BM25 relevance (0.0-1.0) |
| `bm25_terms` | text[] | Extracted search terms for index |

### New Tables

**`atlas_feature_relationships`** (relationship graph)

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid | Primary key |
| `source_feature_id` | varchar(255) | From feature |
| `target_feature_id` | varchar(255) | To feature |
| `relationship_type` | varchar(50) | sibling, parent, child, related_by_error, related_by_concept |
| `strength` | real | Confidence 0.0-1.0 |
| `reasoning` | text | Why this edge exists |
| `created_at` | timestamp | Timestamp |
| `updated_at` | timestamp | Last update |

**`atlas_domain_ontology`** (taxonomy reference)

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid | Primary key |
| `group_id` | varchar(255) | Unique ID (e.g., "auth", "devops.env-config") |
| `group_label` | varchar(255) | Human-readable label |
| `parent_group_id` | varchar(255) | Parent in hierarchy (NULL for top-level) |
| `description` | text | What this domain covers |
| `taxonomy_level` | integer | Depth in hierarchy |
| `confidence` | real | Default confidence for classifications |
| `examples` | text[] | Example features in this group |

**`atlas_enrichment_progress`** (audit trail)

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid | Primary key |
| `pass_number` | integer | 2, 3, 4, or 5 |
| `pass_name` | varchar(100) | Human-readable name |
| `total_packets` | integer | Processed count |
| `processed_packets` | integer | Success count |
| `failed_packets` | integer | Error count |
| `started_at` | timestamp | Start time |
| `completed_at` | timestamp | End time |
| `duration_minutes` | real | Total duration |
| `status` | varchar(50) | in_progress, completed, failed |

---

## Execution Timeline

**Phase A**: ~90 minutes (batch 32/100 → completion)
**Phase B Pass 2**: ~75 minutes (entity + keywords + error patterns)
**Phase B Pass 3**: ~60 minutes (domain classification)
**Phase B Pass 4**: ~40 minutes (relationship inference)
**Phase B Pass 5**: ~25 minutes (BM25 indexing + cache warmup)

**Total Phase B**: ~200 minutes (~3.3 hours)
**Phase A + B Combined**: ~290 minutes (~4.8 hours)

**Expected Completion**: Phase A done ~02:45 UTC, Phase B complete ~06:00 UTC

---

## Verification

### SQL Audit Queries

```sql
-- Phase B Pass 2 Progress
SELECT
  COUNT(*) as total,
  COUNT(CASE WHEN extracted_entities != '[]'::jsonb THEN 1 END) as with_entities,
  COUNT(CASE WHEN keywords IS NOT NULL THEN 1 END) as with_keywords,
  COUNT(CASE WHEN error_pattern IS NOT NULL THEN 1 END) as with_error_pattern
FROM atlas_packets;

-- Phase B Pass 3 Progress
SELECT
  COUNT(*) as total,
  COUNT(CASE WHEN feature_group_id IS NOT NULL THEN 1 END) as classified,
  COUNT(DISTINCT feature_group_id) as unique_groups
FROM atlas_packets;

-- Phase B Pass 4 Progress
SELECT
  relationship_type,
  COUNT(*) as count,
  ROUND(AVG(strength), 2) as avg_strength
FROM atlas_feature_relationships
GROUP BY relationship_type
ORDER BY count DESC;

-- Phase B Pass 5 Progress
SELECT
  COUNT(*) as total,
  COUNT(CASE WHEN bm25_indexed_at IS NOT NULL THEN 1 END) as indexed,
  COUNT(CASE WHEN bm25_terms IS NOT NULL THEN 1 END) as with_terms
FROM atlas_packets;

-- Domain ontology
SELECT group_id, group_label, taxonomy_level
FROM atlas_domain_ontology
ORDER BY taxonomy_level, group_id;
```

---

## Commands Reference

### Quick Start (All Passes)

```bash
cd sveltekit-frontend

# Dry-run all passes
npm run startup:phase-b:multi-pass:dry

# Apply all passes
npm run startup:phase-b:multi-pass:apply

# Verbose (detailed logging)
npm run startup:phase-b:multi-pass:verbose
```

### Individual Passes

```bash
# Pass 2: Entity Extraction
npm run atlas:phase-b2:langextract:dry
npm run atlas:phase-b2:langextract:apply

# Pass 3: Domain Classification
npm run atlas:phase-b3:classify:dry
npm run atlas:phase-b3:classify:apply

# Pass 4: Relationships
npm run atlas:phase-b4:relationships:dry
npm run atlas:phase-b4:relationships:apply

# Pass 5: BM25 Indexing
npm run atlas:phase-b5:bm25:dry
npm run atlas:phase-b5:bm25:apply
```

### Flags

```bash
# Dry-run (preview, no writes)
--dry-run

# Apply changes to database
--apply

# Batch size
--batch=200

# Verbose logging
--verbose

# Skip a specific pass
--skip-pass=3
```

---

## Success Criteria

✅ **Phase B Complete** when:
- Pass 2: 95%+ of packets have `extracted_entities` (>= 1 entity) or `error_pattern` detected
- Pass 3: 85%+ of packets classified into domain groups (feature_group_id != NULL)
- Pass 4: 2,000+ relationships created across all types
- Pass 5: 90%+ of packets indexed in Go service (bm25_indexed_at is set)

---

## Next Steps (Phase C)

Once Phase B completes:

```bash
# Verify all passes
SELECT * FROM v_phase_b_progress;

# Proceed to Phase C: RFF Lane Fusion
npm run startup:phase-c:with-rff-fusion

# Or manually run Phase C passes
npm run atlas:phase1:backfill:summary:apply    # Summary embeddings (384-dim)
npm run atlas:phase2:sync:rff:apply            # Sync to Qdrant
npm run atlas:phase4:rff:warm-cache:apply      # Redis cache warmup
npm run atlas:phase4:rff:verify:apply          # End-to-end RFF verification
```

---

## Architecture Diagram

```
┌─────────────────────────────────────┐
│  Phase A: Gemma4 Batch Summaries    │
│  1,000 packets × 1-2 sentence       │
└────────────┬────────────────────────┘
             ↓
     ┌───────────────┐
     │ Pass 2: Entities
     │ Keywords
     │ Error Patterns
     └───────┬───────┘
             ↓
     ┌───────────────┐
     │ Pass 3: Domain
     │ Classification
     │ Taxonomy Level
     └───────┬───────┘
             ↓
     ┌───────────────────────┐
     │ Pass 4: Relationships │
     │ Sibling/Parent/Child  │
     │ Error-linked edges    │
     └───────┬───────────────┘
             ↓
     ┌───────────────┐
     │ Pass 5: BM25
     │ Go Service
     │ Redis Cache
     └───────┬───────┘
             ↓
┌─────────────────────────────────────┐
│  Phase C: RFF Lane Fusion           │
│  Summary embeddings (384-dim)       │
│  Qdrant sync                        │
│  Cache warmup                       │
│  End-to-end verification           │
└─────────────────────────────────────┘
             ↓
┌─────────────────────────────────────┐
│  Ready for 5-Lane RFF Search        │
│  Lane 1: Content Semantic           │
│  Lane 2: Error Patterns             │
│  Lane 3: Code Signatures            │
│  Lane 4: BM25 Full-Text  ← Phase B  │
│  Lane 5: Neo4j Topology             │
└─────────────────────────────────────┘
```

---

**Status**: Ready to execute immediately after Phase A completion.
**Last Updated**: 2026-06-29 01:30 UTC
**Orchestrator**: scripts/startup/phase-b-multi-pass-enrichment.mjs