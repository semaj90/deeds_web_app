# Phase 19: Schema Bridge & Join Strategy

**Status**: PLANNING (Phase 19D dependency)  
**Generated**: 2026-05-30T02:45:00Z

---

## Problem Statement

Phase 19 has extracted 20 features and generated 20 kanban tasks into Neo4j/Qdrant/Redis infrastructure. However, **durable persistence requires understanding the Postgres schema state**:

- **UUID vs Integer Split** (existing problem from earlier sessions):
  - `users.id` = integer (Lucia auth)
  - 24 tables with `user_id uuid` (broken FK links)
  - 16 tables with `user_id integer` (correct FK links)
  - Need: consolidate before Phase 19D joins

- **Phase 19 Artifacts → Postgres Bridge**:
  - Feature → task → repair relationships live in Neo4j
  - But we need **durable Postgres storage** for compliance + audit trails
  - CSV exports exist (nodes.csv, tasks.csv, fixes.csv)
  - Question: **How to ingest CSVs into Postgres?**

- **pgvector Integration**:
  - Drizzle schema has vector columns (768-dim, cosine distance)
  - Qdrant payloads ready (20 embeddings)
  - But no **Postgres table** to mirror the vectors
  - Question: **Which table stores feature embeddings?**

- **Event Listener During Export**:
  - You mentioned: "kmeans clustering to Qdrant collections, Redis Bitfrost"
  - Implication: **realtime event pipeline during CSV export**
  - Question: **Should we emit events (RabbitMQ) as we write CSVs, or post-hoc after archival?**

---

## Current Schema State (Session 2026-05-30)

### Tables with user_id columns (44 total, 3 types)

| Type | Count | Examples | FK Status |
|------|-------|----------|-----------|
| `integer` | 16 | sessions, evidence.uploaded_by, documents, cases(wait—cases is uuid!) | ✅ Correct to users.id |
| `uuid` | 24 | cases(!), evidence.user_id, chat_messages, audit_log | ❌ Broken (uuid ≠ integer) |
| `text` | 3 | admin_ai_chat_sessions, agent_actions | ~ Accepts string IDs |

### Immediate blocker:
**cases.user_id is uuid** but users.id is integer → all case queries return 0 rows for Lucia users.

---

## Phase 19D Join Requirements

To persist Phase 19 artifacts to Postgres durably:

### Option 1: Create Dedicated Phase 19 Tables

```sql
-- Core feature table (mirrored from phase19_features CouchDB doc)
CREATE TABLE phase19_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id varchar(100) UNIQUE NOT NULL,
  label varchar(200) NOT NULL,
  kind varchar(50) NOT NULL,
  confidence real NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  file_count integer DEFAULT 0,
  source_refs text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Kanban tasks (mirrors phase19_tasks CouchDB)
CREATE TABLE phase19_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id varchar(20) UNIQUE NOT NULL,
  feature_id varchar(100) NOT NULL REFERENCES phase19_features(feature_id),
  title varchar(300) NOT NULL,
  priority varchar(20) NOT NULL CHECK (priority IN ('HIGH', 'MEDIUM', 'LOW')),
  kanban_status varchar(20) NOT NULL,
  confidence real NOT NULL,
  created_at timestamptz DEFAULT now(),
  INDEX (feature_id, priority)
);

-- Repairs (mirrors phase19_repairs CouchDB)
CREATE TABLE phase19_repairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_id varchar(20) UNIQUE NOT NULL,
  task_id varchar(20) NOT NULL REFERENCES phase19_tasks(task_id),
  title varchar(300) NOT NULL,
  error_types text[] DEFAULT '{}',
  suggested_command text,
  priority varchar(20) NOT NULL,
  confidence real NOT NULL,
  status varchar(20) DEFAULT 'PENDING_REVIEW',
  created_at timestamptz DEFAULT now()
);

-- Feature embeddings (mirror from Qdrant codebase_chunks_768)
CREATE TABLE phase19_feature_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id varchar(100) UNIQUE NOT NULL REFERENCES phase19_features(feature_id),
  embedding vector(768) NOT NULL,
  similarity_tags text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  INDEX (embedding vector_cosine_ops) USING hnsw  -- for ANN search
);
```

### Option 2: Join to Existing Codebase Tables

If you want Phase 19 features to link to existing codebase entities:

```sql
-- Link Phase 19 features to existing code_entities
CREATE TABLE phase19_code_entity_links (
  feature_id varchar(100) NOT NULL REFERENCES phase19_features(feature_id),
  entity_id uuid NOT NULL REFERENCES code_entities(id),  -- your existing table
  link_type varchar(50) NOT NULL,  -- 'contains', 'uses', 'defines'
  confidence real NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (feature_id, entity_id, link_type)
);
```

### Option 3: Augment Existing evidence/documents/cases Tables

Link Phase 19 tasks to user-owned entities:

```sql
-- Add phase19_task_id to evidence (optional)
ALTER TABLE evidence
  ADD COLUMN phase19_task_id varchar(20) REFERENCES phase19_tasks(task_id);

-- Add phase19_feature_id to documents
ALTER TABLE documents
  ADD COLUMN phase19_feature_id varchar(100) REFERENCES phase19_features(feature_id);
```

---

## Event Listener Strategy (RabbitMQ)

When exporting Phase 19 artifacts, emit events at each step:

```javascript
// During archive-to-couchdb.mjs --apply:

// 1. On feature registry save
await rabbitmq.publish('phase19.features.ingested', {
  type: 'phase19_features_ingested',
  featureCount: 20,
  avgConfidence: 0.735,
  timestamp: now(),
  sourceRefs: ['atlas-feature-registry.json']
});

// 2. On each task save
for (const task of tasks) {
  await rabbitmq.publish('phase19.tasks.created', {
    taskId: task.taskId,
    featureId: task.featureId,
    priority: task.priority,
    timestamp: now()
  });
}

// 3. Trigger downstream pipelines
await rabbitmq.publish('phase19.complete', {
  stage: 'archival_complete',
  artifactsArchived: {
    features: 1,
    tasks: tasks.length,
    repairs: repairs.length
  },
  nextSteps: ['kmeans_clustering', 'qdrant_reindex', 'neo4j_sync']
});
```

Consumers:
- `kmeans_clustering` — subscribe to `phase19.features.ingested`, re-cluster Qdrant
- `qdrant_reindex` — subscribe to `phase19.tasks.created`, update HNSW index
- `redis_cache_warm` — subscribe to `phase19.complete`, pre-populate Redis

---

## Recommended Path Forward (Phase 19D)

### Step 1: Resolve UUID → Integer Split (BLOCKER)

Before joining Phase 19 to Postgres:

```bash
# Run existing audit to confirm current state
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "
  SELECT table_name, column_name, data_type
  FROM information_schema.columns
  WHERE column_name IN ('user_id', 'uploaded_by') AND table_schema='public'
  ORDER BY data_type, table_name;
"
```

**Decision needed**:
- Path A: Convert `users.id` to uuid (multi-day refactor)
- Path B: Convert 24 uuid `user_id` columns to integer (0-downtime if low-row)
- Path C: Two-tier identity (keep both, use `users.uuid` for cross-system links)

**Recommend**: Path C (preserve identity, add new column)

```sql
-- Add uuid column to users (if not exists)
ALTER TABLE users ADD COLUMN uuid uuid DEFAULT gen_random_uuid() UNIQUE;

-- Now both exist: users.id (integer, for Lucia) + users.uuid (for analytics)
-- Phase 19 tasks can reference either via foreign key
```

### Step 2: Create Phase 19 Tables

Choose Option 1 (dedicated tables) for isolation + auditability.

```bash
cd sveltekit-frontend
cat > drizzle/0016_phase19_schema.sql << 'EOF'
-- Phase 19 Features, Tasks, Repairs schema
CREATE TABLE IF NOT EXISTS phase19_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id varchar(100) UNIQUE NOT NULL,
  ...
)
EOF

npx drizzle-kit migrate
```

### Step 3: Ingest CSVs → Postgres

```bash
# Copy CSV data into Postgres
\COPY phase19_features FROM '.tmp/nodes.csv' WITH (FORMAT csv, HEADER true);
\COPY phase19_tasks FROM '.tmp/tasks.csv' WITH (FORMAT csv, HEADER true);
\COPY phase19_repairs FROM '.tmp/fixes.csv' WITH (FORMAT csv, HEADER true);
```

### Step 4: Wire Event Listeners

Enhance `archive-to-couchdb.mjs`:

```bash
npm run phase19:archive:apply --emit-events

# Events published to RabbitMQ:
# - phase19.features.ingested
# - phase19.tasks.created (20 events)
# - phase19.repairs.proposed
# - phase19.complete
```

### Step 5: K-hop Graph Traversal (ACE Integration)

In ACE context-assembler, when retrieving context:

```cypher
-- Neo4j: Find feature + tasks + repairs for a query
MATCH (f:Feature {featureId: $queryFeature})
  -[:HAS_TASK]->(t:KanbanTask)
  -[:HAS_REPAIR]->(r:Repair)
RETURN f.label, t.priority, r.title
```

Then **join to Postgres** for user-scoped context:

```sql
-- Postgres: User's cases related to this feature
SELECT c.id, c.title, COUNT(t.id) as task_count
FROM cases c
JOIN phase19_tasks t ON c.phase19_feature_id = t.feature_id
WHERE c.user_id = $userId AND t.priority = 'HIGH'
GROUP BY c.id;
```

---

## Technology Alignment

| Technology | Role in Phase 19D |
|------------|-------------------|
| **Postgres** | Durable storage + audit trail (phase19_* tables) |
| **pgvector** | Vector search on feature embeddings (cosine distance) |
| **Drizzle** | Type-safe ORM for Postgres joins + migrations |
| **CouchDB** | Document archive (feature registry doc + task/repair docs) |
| **DuckDB** | Analytic queries on CSVs (gap analysis) |
| **Neo4j** | Graph topology (Feature → Task → Repair) |
| **Qdrant** | Semantic vector search (768-dim embeddings) |
| **Redis + Bitfrost** | L1 exact-match cache + L2 semantic cache |
| **RabbitMQ** | Event listeners (emit on archival completion) |

---

## Immediate Decisions Required

1. **CouchDB vs DuckDB vs Postgres for durable archival?**
   - CouchDB: Document DB, good for audit trails
   - DuckDB: Columnar, great for analytics on CSVs
   - Postgres: ACID compliance, native to your stack
   - **Recommend**: Postgres for compliance + DuckDB for analytics

2. **UUID vs Integer for user_id (Phase 19 ↔ Postgres join)?**
   - See Path A/B/C above
   - **Recommend**: Path C (two-tier identity)

3. **Event listeners during archival?**
   - Yes/No to RabbitMQ emissions?
   - **Recommend**: Yes (enables downstream k-means, Qdrant reindex)

4. **Create dedicated phase19_* tables or join to existing entities?**
   - Option 1 (dedicated): Isolated, auditable, easier to version
   - Option 2 (existing): Lighter, federated, harder to roll back
   - **Recommend**: Option 1 for Phase 19D

---

## Files to Create (Phase 19D Workstream)

1. `drizzle/0016_phase19_schema.sql` — phase19_features, phase19_tasks, phase19_repairs + pgvector embedding table
2. `scripts/atlas/ingest-phase19-csv.mjs` — CSV → Postgres ingestion
3. `scripts/atlas/phase19-event-emitter.mjs` — RabbitMQ event emission wrapper
4. `src/lib/server/ace/phase19-kag-bridge.ts` — ACE ↔ Phase 19 join logic
5. `memory/exports/phase19-schema-decisions.md` — Record UUID/identity decision

---

## Summary

**Phase 19C is complete (Neo4j/Qdrant payloads ready).  
Phase 19D requires resolving Postgres schema identity + wiring durable storage + event listeners.**

**Next**: Confirm your CouchDB URL/credentials OR select alternative (Postgres + DuckDB).

Then proceed with Phase 19D in this order:
1. Resolve UUID/integer split (1-2 hours)
2. Create phase19_* schema (30 min)
3. Ingest CSVs → Postgres (15 min)
4. Wire event listeners + RabbitMQ (1 hour)
5. Test ACE K-hop graph traversal (1 hour)