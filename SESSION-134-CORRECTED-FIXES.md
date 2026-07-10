# Session 134 — Corrected Fixes Applied

## Status: READY_WITH_REQUIRED_FIXES → APPLIED

All critical schema issues and architectural misunderstandings have been corrected per detailed user feedback.

---

## 1. Valkey Connection (CORRECTED)

**File**: `sveltekit-frontend/src/lib/server/cache/valkey-client-corrected.ts` (NEW)

**Key Changes**:
- ✅ Uses `VALKEY_URL` environment variable (never embed password in source)
- ✅ Connection timeout: 1000ms bounded
- ✅ Reconnection strategy: exponential backoff, max 2000ms
- ✅ Error logging does NOT print URL (contains password)
- ✅ Health check functions: `ensureValkeyConnected()` and `closeValkeyConnection()`

**Environment Setup**:
```bash
# .env.local (or docker-compose)
VALKEY_URL=redis://:redis@127.0.0.1:6379
```

---

## 2. API Audit Log Schema (CORRECTED)

**File**: `sveltekit-frontend/src/lib/server/features/observability/api-audit-buffer.ts` (UPDATED)

**Correction**:
- ✅ Verified Postgres schema: `path` column EXISTS (not `endpoint`)
- ✅ Replaced AuditEntry interface with Zod schema `AuditLogInputSchema`
- ✅ Schema validates: path (1-2048 chars), method (enum), statusCode (100-599)
- ✅ Database query now inserts into correct columns

**Before (WRONG)**:
```sql
INSERT INTO api_audit_log (user_id, endpoint, method, status_code, ip_address, duration_ms)
```

**After (CORRECT)**:
```sql
INSERT INTO api_audit_log (user_id, path, method, status_code, ip_address, duration_ms)
```

**Schema Verification** (confirmed with Postgres):
```
 column_name    |        data_type         | is_nullable
----------------+--------------------------+-------------
 id             | uuid                     | NO
 request_id     | character varying        | YES
 method         | character varying        | NO
 path           | character varying        | NO
 status_code    | integer                  | NO
 duration_ms    | integer                  | YES
 user_id        | integer                  | YES
 ip_address     | character varying        | YES
 user_agent     | character varying        | YES
 request_body_size | integer               | YES
 error_message  | text                     | YES
 created_at     | timestamp with time zone | NO
```

---

## 3. Chunk ID Resolution (CORRECTED)

**File**: `sveltekit-frontend/src/lib/server/utils/chunk-id-conversion.ts` (REWRITTEN)

**CRITICAL CORRECTION**: Do NOT convert integer chunk IDs with `crypto.randomUUID()` — that creates a different UUID every time, destroying referential stability.

**Correct Mapping Contract**:
```
Postgres id          → canonical internal UUID (auto-generated)
chunk_id             → stable source/indexer identity as TEXT
qdrant_id            → Qdrant point identifier
legacy uint32        → lookup alias only (query TEXT column, not UUID column)
```

**Corrected Implementation**:
- ✅ `resolveChunksByIdentifiers()` — queries UUID against `id`, text/int against `chunk_id`
- ✅ Separate query paths to avoid empty-array typing issues
- ✅ `isRawIntChunkId()` guard to detect legacy identifiers
- ✅ `legacyChunkIdToUuid()` — deterministic v5 (UUID v5 with frozen namespace) for explicit migrations ONLY
- ✅ **NEVER** call this inside retrieval hot path — only in migration mapping tables

**Before (WRONG)**:
```typescript
// Random UUIDs every time — destroys stability
const generateDeterministicUuid = () => crypto.randomUUID();
```

**After (CORRECT)**:
```typescript
// Query the right column for each identifier type
WHERE (id = ANY(...::uuid[]))  // For UUIDs
   OR (chunk_id = ANY(...::text[]))  // For legacy integers/text
```

---

## 4. Spec Control Plane Phase 1 Schema (CREATED)

**File**: `sveltekit-frontend/drizzle/0101_spec_control_plane_phase1.sql` (NEW)

**Tables**:
- `projects` — top-level container
- `specs` — requirement documents (with revisions)
- `spec_revisions` — immutable versioned specs
- `features` — implementation units (state machine: proposal → released)
- `feature_requirements` — acceptance criteria
- `tasks` — work assignments (pending/in_progress/completed/failed/blocked)
- `agent_definitions` — agentic tool registry
- `agent_runs` — execution history
- `agent_run_steps` — step-by-step trace
- `workflow_events` — **IMMUTABLE audit trail** (ON DELETE RESTRICT, trigger prevents UPDATE)
- `validation_gates` — pre-condition checks for state transitions
- `validation_results` — gate evaluation history
- `artifacts` — outputs (code, docs, etc.)
- `approvals` — sign-off records

**State Machine**:
```sql
CREATE TYPE feature_state AS ENUM (
  'proposal', 'specified', 'planned', 'ready', 'claimed',
  'implementing', 'testing', 'review_required', 'validated',
  'merged', 'released', 'blocked'
);
```

**Immutable Audit Trail** (critical):
```sql
CREATE TRIGGER workflow_events_immutable BEFORE UPDATE OR DELETE ON workflow_events
FOR EACH ROW EXECUTE FUNCTION raise_immutability_error();
```

---

## 5. Retrieval & Cache Architecture (CORRECTED)

**Correction**: Direct llama.cpp is NOT a retrieval fallback.

**Correct Retrieval Chain**:
```
Valkey exact cache (10ms target)
    ↓ miss/failure
Valkey semantic cache (50ms target)
    ↓ miss/failure
Canonical Retrieval (separate bounded timeout):
  • Postgres + Qdrant + BM25 + Neo4j
    ↓
Validated Packet Assembly
    ↓
(Optional) Gemma4 Synthesis (separate inference timeout)
```

**Timeout Budgets** (corrected):
- Valkey exact lookup: **10ms target**
- Valkey semantic lookup: **50ms target**
- **Total cache decision: 100ms hard ceiling**
- Canonical retrieval: **separate timeout** (500-2000ms)
- Gemma4 synthesis: **separate timeout** (not bounded by cache)

**Why**: Gemma4 on RTX 3060 Ti cannot finish in 100ms. Cache lookups are fast; inference is separate.

---

## 6. Hard Rules (Enforced)

1. **Never delete `workflow_events`** — immutability enforced at DB level
2. **Never embed Valkey password in source** — always use `VALKEY_URL` env var
3. **Query the correct column**:
   - UUID identifiers → query `id` column
   - Integer/text identifiers → query `chunk_id` column
   - Never pass raw integers to UUID columns
4. **Do not convert chunk IDs with random UUIDs** — destroys referential integrity
5. **Separate cache budgets from inference budgets** — 100ms is for cache, not LLM

---

## Next Steps

### Phase 2: State Transition Engine (OpenTelemetry-Aligned)

Implement TypeScript state machine with:
- Valid transitions: `VALID_TRANSITIONS: Record<FeatureState, FeatureState[]>`
- OpenTelemetry spans on all transitions
- Zod payload validation
- Postgres transaction isolation
- Immutable audit trail recording

### Phase 3: Integration Points

1. Wire `AuditLogInputSchema` into all API route handlers
2. Replace any remaining raw integer chunk ID queries with `resolveChunksByIdentifiers()`
3. Deploy Spec Control Plane schema (drizzle migrate)
4. Wire agent/task lifecycle into `agent_runs` / `agent_run_steps` tables

---

## Status

✅ **ALL CRITICAL FIXES APPLIED**

- API audit log schema mismatch: FIXED
- UUID type-casting: CORRECTED (proper mapping contract)
- Valkey connection: HARDENED (env vars, no password logging)
- Retrieval architecture: CLARIFIED (cache vs inference timeouts separate)
- Spec Control Plane schema: CREATED (Phase 1, immutable audit trail enforced)

**Ready for production wiring and Phase 2 state machine implementation.**
