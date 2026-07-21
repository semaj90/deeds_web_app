---
type: runbook
title: Deep Research Admin Dashboard Setup & Operations
id: runbook/admin-dashboard-setup
status: active
owners:
  - legal-ai-team
source_refs:
  - sveltekit-frontend/src/routes/(app)/admin/deep-research/
  - docs/DEEP-RESEARCH-ADMIN-SETUP.md
related:
  - system/deep-research
  - runbook/ml-ranking-validation
---

# Deep Research Admin Dashboard Setup & Operations

## Quick Start

### 1. Access Dashboard

```
URL: http://127.0.0.1:5173/admin/deep-research
Requires: Admin or Prosecutor role
Expected: Empty task list on first load
```

### 2. Create Test Task (via API)

```bash
curl -X POST http://127.0.0.1:5173/api/research/deep \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are the key requirements for evidence admissibility?",
    "rank_model": "xgboost",
    "include_web_search": true,
    "include_ldr": true,
    "top_k": 5
  }'

# Response:
# {
#   "taskId": "uuid-...",
#   "status": "pending",
#   "createdAt": "2026-07-20T...",
#   "estimatedDuration": "30-60 seconds"
# }
```

### 3. Monitor Task Progress

Visit `/admin/deep-research` dashboard. Click on task row to expand details:
- **Results**: All ranked candidates with scores, URLs, metadata
- **Synthesis**: Generated legal answer with key findings and citations
- **Errors**: Any errors encountered during execution

### 4. Actions

- **Retry**: Reset task to `pending` status (restarts pipeline)
- **Delete**: Remove task and all related results (cascading delete)

## Architecture Overview

### Components

| Component | Role | Port | Status |
|-----------|------|------|--------|
| **SvelteKit App** | Frontend + API | 5173 | ✅ |
| **PostgreSQL 18** | Canonical storage | 5432 | ✅ |
| **Qdrant** | Vector search | 6333 | ✅ |
| **Ollama** | Embeddings | 11434 | ✅ |
| **llama-server** | Gemma4 synthesis | 8090 | ✅ |
| **Miniforge ML** | XGBoost ranking | 8095 | ✅ |

### Database Schema

**6 Core Tables** (all verified live):

```sql
-- Main task tracking
CREATE TABLE ldr_research_tasks (
  id UUID PRIMARY KEY,
  user_id INTEGER NOT NULL,
  query TEXT NOT NULL,
  query_hash VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL,  -- pending|running|completed|failed
  rank_model VARCHAR(32),        -- xgboost|naive_bayes
  include_web_search BOOLEAN,
  include_ldr BOOLEAN,
  top_k INTEGER DEFAULT 5,
  created_at TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  ml_score REAL,
  error_message TEXT,
  ...
);

-- Ranked search results
CREATE TABLE ldr_research_results (
  id UUID PRIMARY KEY,
  task_id UUID REFERENCES ldr_research_tasks(id) ON DELETE CASCADE,
  rank INTEGER,               -- Position in final ranking
  source VARCHAR(32),         -- qdrant|bm25|ldr|firecrawl
  score REAL,                 -- Final score [0, 1]
  source_ref TEXT,            -- File path or URL
  summary TEXT,               -- Snippet or truncated content
  url TEXT,
  statute_tags TEXT[],        -- e.g., ['FRE 801', '18 USC 1001']
  publish_date TIMESTAMP WITH TIME ZONE,
  metadata JSONB,
  ...
);

-- Synthesis results
CREATE TABLE ldr_synthesis (
  id UUID PRIMARY KEY,
  task_id UUID UNIQUE REFERENCES ldr_research_tasks(id) ON DELETE CASCADE,
  synthesis_text TEXT NOT NULL,
  key_findings JSONB,         -- Array of {finding, type, source_id}
  cited_result_ids UUID[],    -- References to ldr_research_results
  confidence REAL,            -- [0, 1] confidence score
  ...
);

-- ML ranking cache
CREATE TABLE ml_ranking_cache (
  id UUID PRIMARY KEY,
  task_id UUID REFERENCES ldr_research_tasks(id) ON DELETE CASCADE,
  model VARCHAR(32),          -- xgboost|naive_bayes
  scores_json JSONB,          -- Cached ML scores
  timestamp TIMESTAMP WITH TIME ZONE,
  ttl_seconds INTEGER DEFAULT 86400,  -- 24h cache
  ...
);

-- GPU clustering (optional)
CREATE TABLE ml_clustering (
  id UUID PRIMARY KEY,
  task_id UUID REFERENCES ldr_research_tasks(id) ON DELETE CASCADE,
  cluster_id INTEGER,
  centroid_vector VECTOR(768),
  member_count INTEGER,
  ...
);

-- Comprehensive audit log
CREATE TABLE deep_research_audit_log (
  id UUID PRIMARY KEY,
  task_id UUID REFERENCES ldr_research_tasks(id) ON DELETE CASCADE,
  stage VARCHAR(32),          -- retrieval|ranking|synthesis|quality
  decision JSONB,
  timestamp TIMESTAMP WITH TIME ZONE,
  ...
);
```

**Verification**:
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT tablename FROM pg_tables WHERE tablename LIKE 'ldr_%' OR tablename LIKE 'ml_%' OR tablename LIKE 'deep_%';"
# Expected: All 6 tables present
```

## Admin Dashboard Features

### Filtering

**Status dropdown**: Filter by `pending`, `running`, `completed`, `failed`
**User filter**: Show tasks for specific user
**Date range**: Filter by creation date

### Pagination

- Default: 50 tasks per page
- Navigation: Previous/Next buttons, page indicator
- Performance: 200–500ms page load on 50 tasks

### Expandable Details

Click any task row to expand:

**Results Panel**:
- Table with columns: Rank, Source, Score, URL, Statute Tags
- Copy button for each result
- Link to source document (where available)

**Synthesis Panel**:
- Full generated answer text
- Key Findings (bulleted list)
- Cited Sources (numbered references)
- Confidence score with color-coded indicator (red <0.6, yellow 0.6–0.8, green >0.8)

**Error Panel**:
- Error message (if task failed)
- Error trace (retrieval lane details)
- Retry button

### Inline Actions

**Retry** (pending/failed tasks only):
- Resets status to `pending`
- Clears synthesis (will re-run Gemma4)
- Keeps audit log (no data loss)

**Delete**:
- Cascading delete (removes task + results + synthesis + audit log)
- Confirmation required ("Are you sure?")
- No undo available

## Performance Targets

| Metric | Target | Notes |
|---|---|---|
| Page load | 200–500ms | 50 tasks, with relations |
| Task creation | 5ms | Async Postgres insert |
| Qdrant search | 50–100ms | HNSW ANN |
| BM25 search | 100–200ms | Full-text index |
| ML ranking | 100–500ms | XGBoost on 10–50 candidates |
| Gemma4 synthesis | 5–15s | Streaming generation |
| **Total E2E** | **30–60s** | All lanes parallel |

## Troubleshooting

### Dashboard shows 403 Forbidden

**Cause**: User doesn't have admin or prosecutor role

**Fix**:
```sql
SELECT role FROM users WHERE id = <user_id>;
-- Should return 'admin' or 'prosecutor'

-- If needed, grant role:
UPDATE users SET role = 'admin' WHERE id = <user_id>;
```

### No tasks appear

**Cause**: No tasks created yet, or all tasks deleted

**Fix**:
```bash
# Create a test task via API (see Quick Start section)
curl -X POST http://127.0.0.1:5173/api/research/deep ...

# Or verify tasks exist:
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) FROM ldr_research_tasks;"
```

### Page loads slowly

**Cause**: Database query performance issue, large number of tasks

**Fix**:
```bash
# Check query performance
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "EXPLAIN ANALYZE SELECT * FROM ldr_research_tasks LIMIT 50;"

# Create index if missing
CREATE INDEX idx_ldr_tasks_created ON ldr_research_tasks(created_at DESC);
```

### ML ranking returns 500 error

**Cause**: Miniforge sidecar (:8095) not running or connection refused

**Fix**:
```bash
# Check sidecar health
curl http://127.0.0.1:8095/health

# If down, restart:
cd sveltekit-frontend/scripts/ml/ml_sidecar/
python server.py --port 8095 --gpu
```

### Gemma4 synthesis takes >15 seconds

**Cause**: Model latency, GPU overloaded, or KV cache thrashing

**Fix**:
```bash
# Check Gemma4 status
curl http://127.0.0.1:8090/v1/models | jq '.data[0]'

# Check GPU memory
nvidia-smi

# If VRAM low, restart llama-server with smaller context:
llama-server.exe -m gemma4-legal-iq4xs-direct.gguf -c 4096 -ngl 99 ...
```

### Synthesis text is empty or invalid

**Cause**: Gemma4 generating zero tokens (timeout or thinking-only response)

**Fix**:
```bash
# Test Gemma4 directly
curl -X POST http://127.0.0.1:8090/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemma4-legal-iq4xs-direct.gguf",
    "messages": [{"role": "user", "content": "Hello"}],
    "max_tokens": 16,
    "stream": false
  }'

# If empty, check server logs and restart
```

## Operational Runbooks

### Daily Startup Checklist

```bash
# 1. Verify Docker containers
docker ps | grep legal-ai

# 2. Check Postgres
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT 1;"

# 3. Verify Qdrant
curl http://127.0.0.1:6333/

# 4. Start Ollama (embeddings)
ollama serve

# 5. Start Gemma4 (synthesis)
llama-server.exe -m gemma4-legal-iq4xs-direct.gguf -c 65536 -ngl 99 ...

# 6. Start ML sidecar
cd scripts/ml/ml_sidecar && python server.py --port 8095 --gpu

# 7. Start SvelteKit dev server
npm run dev

# 8. Test dashboard
curl http://127.0.0.1:5173/admin/deep-research
# Expected: 200 OK, HTML response
```

### Weekly Cleanup

```sql
-- Archive old completed tasks (older than 30 days)
INSERT INTO ldr_research_tasks_archive 
SELECT * FROM ldr_research_tasks 
WHERE status = 'completed' AND completed_at < NOW() - INTERVAL '30 days';

DELETE FROM ldr_research_tasks 
WHERE status = 'completed' AND completed_at < NOW() - INTERVAL '30 days';

-- Vacuum (defragment) tables
VACUUM ANALYZE ldr_research_tasks;
VACUUM ANALYZE ldr_research_results;
VACUUM ANALYZE ldr_synthesis;

-- Clear old audit logs (>90 days)
DELETE FROM deep_research_audit_log 
WHERE timestamp < NOW() - INTERVAL '90 days';
```

### Monthly Performance Audit

```bash
# Check dashboard load time
time curl http://127.0.0.1:5173/admin/deep-research > /dev/null

# Verify all services healthy
for port in 5432 6333 8090 8095 11434; do
  echo "Port $port: $(curl -s http://127.0.0.1:$port/health || echo 'DOWN')"
done

# Check database size
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT pg_size_pretty(pg_database_size('legal_ai_db'));"

# Verify no orphaned data
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) FROM ldr_research_results WHERE task_id NOT IN (SELECT id FROM ldr_research_tasks);"
# Expected: 0
```

## Reference Documentation

- [Deep Research Index](../docs/DEEP-RESEARCH-INDEX.md) — Master reference
- [Completion Summary](../docs/DEEP-RESEARCH-COMPLETION-SUMMARY.md) — Architecture overview
- [Task Checklist](../docs/DEEP-RESEARCH-TASK-CHECKLIST.md) — 6-phase workflow
