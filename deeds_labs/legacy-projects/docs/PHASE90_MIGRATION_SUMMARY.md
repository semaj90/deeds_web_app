# 🛡️ Database Migration Safety Summary

**Date**: 2025-12-03
**Action**: Database schema migration review

---

## ✅ SAFE TO RUN:

### 📁 `drizzle/migrations/0001_yorha_schema.sql`
**Status**: ✅ **COMPLETELY SAFE**

**What it does**:
- Creates 6 new `yorha_*` tables
- Adds indexes and foreign keys
- NO DROP statements
- NO TRUNCATE statements
- Uses `IF NOT EXISTS` (idempotent)

**Run with**:
```bash
psql -h localhost -U postgres -d deeds_db -f sveltekit-frontend/drizzle/migrations/0001_yorha_schema.sql
```

**Tables created**:
1. `yorha_cases` - Case management
2. `yorha_evidence_nodes` - Evidence board graph nodes
3. `yorha_evidence_connections` - Evidence relationships
4. `yorha_chat_sessions` - Chat history
5. `yorha_chat_messages` - Message storage
6. `yorha_system_metrics` - Performance monitoring

---

## ❌ DANGEROUS - DO NOT RUN:

### 📁 `drizzle/0008_clammy_frightful_four.sql`
**Status**: ⛔ **DESTRUCTIVE**

**Drops**:
- `code_embeddings` (vector data)
- `knowledge_base` (knowledge graph)
- `legal_analysis_cache` (analysis results)
- `rag_documents` (RAG system)
- `vector_similarity_queries` (search history)

### 📁 `drizzle/20250910183346_fearless_mercury.sql`
**Status**: ⛔ **EXTREMELY DESTRUCTIVE**

**Drops**: (partial list)
- `evidence` ← **CRITICAL**
- `users` ← **CRITICAL**
- `legal_documents` ← **CRITICAL**
- `citations` ← **CRITICAL**
- `legal_precedents`
- `rag_sessions`
- `sessions`

### 📁 `drizzle/20251025072351_rare_jane_foster.sql`
**Status**: ⛔ **DESTRUCTIVE**

**Drops**:
- `error_logs`
- `ai_engine_status`
- `gpu_inference_messages`
- `gpu_inference_sessions`

---

## 🔧 How to Fix Dangerous Migrations

### Option 1: Use Safe YoRHa Only
```bash
# Just run the safe one
psql -f sveltekit-frontend/drizzle/migrations/0001_yorha_schema.sql
```

### Option 2: Comment Out Dangerous Parts

Edit files like `0008_clammy_frightful_four.sql`:

```sql
-- BEFORE (DANGEROUS):
DROP TABLE "code_embeddings" CASCADE;
DROP TABLE "knowledge_base" CASCADE;

-- AFTER (SAFE):
-- DROP TABLE "code_embeddings" CASCADE;  -- Commented for safety
-- DROP TABLE "knowledge_base" CASCADE;   -- Commented for safety

-- Keep this part:
CREATE TABLE IF NOT EXISTS new_feature (...);
```

### Option 3: Backup First (ALWAYS)
```bash
# ALWAYS backup before migrating
pg_dump deeds_db > backup_$(date +%Y%m%d_%H%M%S).sql
```

---

## 📊 What You Have Now

### Existing Tables (KEEP):
- `users` - User accounts
- `evidence` - Evidence records
- `legal_documents` - Legal docs
- `citations` - Citation data
- `knowledge_base` - Knowledge graph
- `code_embeddings` - Vector embeddings

### What YoRHa Adds:
- `yorha_cases` - New case system
- `yorha_evidence_nodes` - Visual evidence board
- `yorha_evidence_connections` - Relationship graph
- `yorha_chat_*` - Chat integration
- `yorha_system_metrics` - Monitoring

### Relationship:
```
Old: evidence          New: yorha_evidence_nodes
     ↓                      ↓
Old: legal_documents   New: yorha_cases
     ↓                      ↓
Old: citations         New: yorha_evidence_connections

BOTH SYSTEMS COEXIST - NO CONFLICT!
```

---

## 🚀 Recommended Action

**Right now**:
```bash
# 1. Backup
pg_dump -h localhost -U postgres deeds_db > backups/pre_yorha_$(date +%Y%m%d).sql

# 2. Apply safe YoRHa schema
psql -h localhost -U postgres -d deeds_db -f sveltekit-frontend/drizzle/migrations/0001_yorha_schema.sql

# 3. Verify
psql -h localhost -U postgres -d deeds_db -c "\dt yorha_*"
```

**Later** (when ready to cleanup):
- Create "Phase 91 - Legacy Cleanup" migration
- Migrate old data to YoRHa tables first
- Then drop old tables (after verification)

---

## 📝 Files Created

- `docs/PHASE90_DB_MIGRATION_SAFETY.md` - Full guide
- `docs/PHASE90_MIGRATION_SUMMARY.md` - This file

---

**Status**: ✅ You have a SAFE migration path
**Action**: Review `PHASE90_DB_MIGRATION_SAFETY.md`
**Risk**: 🟢 LOW if using YoRHa schema only
