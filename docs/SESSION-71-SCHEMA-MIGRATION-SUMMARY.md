# Session 71: Agent Memory Schema Migration Summary

**Date**: June 23, 2026  
**Status**: ✅ MIGRATION & TEST READY

---

## What Was Delivered

### 1. Corrected Migration (`drizzle/manual/0053_agent_memory_refactor_many_to_many.sql`)

**Problem**: Old 0050 attempt had packets flattened on `agent_memory_registry` row (denormalization).

**Solution**: 
- Move packets to separate `agent_memory_packets` (many:many table)
- Drop old 0050, replace with canonical 0053
- Avoids repeating task_id 13,481 times in large batches

**Tables created**:
```
agent_memory_registry
  ├─ id (bigserial PK)
  ├─ task_id, story_id, agent (ownership)
  ├─ trace_id, retrieval_strategy, gpu_eligible, status
  ├─ cache_namespace, metadata
  └─ UNIQUE(task_id, agent)

agent_memory_packets (many:many)
  ├─ id (bigserial PK)
  ├─ registry_id (FK → agent_memory_registry.id)
  ├─ packet_key, source_ref, feature_id (identity chain)
  ├─ qdrant_point_id, qdrant_collection, qdrant_vector_dim
  ├─ retrieval_path, topology, manifold4d (full payload)
  ├─ superseded_by_packet, superseded_reason
  └─ UNIQUE(registry_id, packet_key)

mcp_trace_ownership
  ├─ trace_id (text UNIQUE)
  ├─ task_id (indexed, NO FK — agents too dynamic)
  ├─ agent, prompt_hash, tool_calls[]
  ├─ packet_keys[], proof_hash
  └─ status ('OPEN' | 'CLOSED' | 'FAILED')

gpu_eligibility_gate
  ├─ task_id, packet_key (per-packet verification, NO FK)
  ├─ identity_stable, claim_valid, supersedes_passed
  ├─ source_ref_preserved, feature_id_preserved
  ├─ retrieval_path_intact, qdrant_payload_matches_postgres
  ├─ vector_dim_correct, cpu_fallback_exists
  ├─ batch_bounded, proof_not_degraded (CRITICAL)
  ├─ eligible, verdict
  └─ Indexes: (task_id, created_at DESC), (verdict)

retrieval_provenance
  ├─ task_id, trace_id
  ├─ packet_keys[], retrieval_path[], proof_hash
  ├─ proof_quality (0.0-1.0), quality_delta
  └─ Indexes: (task_id, created_at DESC)

retrieval_eval_times
  ├─ task_id, packet_key, retrieval_strategy
  ├─ cpu_latency_ms, gpu_latency_ms
  ├─ proof_quality_cpu, proof_quality_gpu (CRITICAL)
  ├─ quality_preserved (boolean: gpu >= cpu)
  └─ Indexes: (task_id, created_at DESC), (task_id, packet_key)

atlas_story_proofs
  ├─ story_id
  ├─ proof_hash (UNIQUE), retrieval_strategy
  ├─ agent_list[], quality_score, reusable
  └─ MATM paper backing: shared proofs for agent population
```

**All indexes, constraints, GIN indexes (topology, manifold4d)** included.

---

### 2. Comprehensive Test (`tests/agent-memory-schema-matching.spec.ts`)

**What it validates**:

✅ **Layer 0: Postgres Canonical Truth**
- Registry with ownership metadata
- Many:many packets without denormalization
- Packet identity (packet_key + source_ref + feature_id) stable across rows

✅ **Temporal Payload Density**
- Most recent rows have fuller payload than older rows
- Compute payload_density = count(non-null fields) / total_fields
- Assertion: recent.density >= older.density

✅ **NES-Arch Layer Alignment**
- Redis (bitfrost:agent:* keys) caches ownership metadata
- Postgres is source of truth
- Packet identity survives all layers

✅ **Do-Not-Repeat-Ourselves (DNRO) Registry**
- Before tool execution, check bitfrost:tool:{tool_name}:{packet_keys_hash}
- Reuse if quality_score >= candidate
- Skip redundant LLM calls / tool executions / GPU work

✅ **GPU Eligibility Verification**
- Fetch retrieval_eval_times for CPU baseline
- Assert: proof_quality_gpu >= proof_quality_cpu
- FAIL gpu_eligibility_gate if proof degraded (trade accuracy for speed)

**Run test**:
```bash
npm run test -- agent-memory-schema-matching
# or
vitest tests/agent-memory-schema-matching.spec.ts
```

---

### 3. Architecture Documentation (`nes-arch-agent-memory-closure.md`)

Unifies two separate hierarchies:
- **NES-Arch memory bank** (Redis → Qdrant → Postgres → CouchDB)
- **Agent social memory** (task claims → ownership → GPU eligibility → proof)

Freezes the canonical stack:
```
Layer 0: Task Ownership (Postgres) — source of truth
  ↓ agent_memory_registry + agent_memory_packets
Layer 1: Hot Cache (Redis) — bitfrost:agent:{task/story/packet/trace/feature}
  ↓ O(1) ownership checks
Layer 2: Qdrant Payload (bank-switched ROM) — codebase_chunks_768 with identity tags
  ↓ vector search + identity metadata
Layer 3: CouchDB (cartridge ROM) — wiki:note:dir:* immutable audit trail
  ↓ permanent record
```

---

## Before Running (Prerequisites)

1. **Database must exist**: `legal_ai_db` on localhost:5432 (or env-configured host)
2. **Redis must be running**: localhost:6379 (for test DNRO checks)
3. **Node.js + npm**: vitest already in devDependencies
4. **Postgres client**: psql available in PATH (for manual migration apply)

---

## How to Apply the Migration

### Option A: Let Drizzle apply it (recommended)
```bash
cd sveltekit-frontend
npm run migrate
# Drizzle auto-picks 0053_agent_memory_refactor_many_to_many.sql
```

### Option B: Manual apply via Docker
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  -f /path/to/drizzle/manual/0053_agent_memory_refactor_many_to_many.sql
```

### Option C: Manual apply via local psql
```bash
psql -U legal_admin -d legal_ai_db -h localhost -f drizzle/manual/0053_agent_memory_refactor_many_to_many.sql
```

---

## How to Run the Test

```bash
# From repo root
cd sveltekit-frontend
npm test -- agent-memory-schema-matching

# Or with coverage
npm test -- agent-memory-schema-matching --coverage

# Or watch mode
npm test -- agent-memory-schema-matching --watch
```

**Expected output**:
```
✓ Layer 0: Postgres Canonical Truth (2)
  ✓ should store registry with ownership metadata
  ✓ should insert many-to-many packets without denormalization

✓ Temporal Payload Density (2)
  ✓ most recent rows should have fuller payload than older rows
  ✓ should compute payload density metric

✓ NES-Arch Layer Alignment (3)
  ✓ Redis (Tiny RAM) should cache ownership metadata
  ✓ Postgres (Cartridge ROM) should be canonical source of truth
  ✓ Packet identity should survive all layers

✓ Do-Not-Repeat-Ourselves Registry (1)
  ✓ should find existing packet and reuse instead of re-creating

✓ GPU Eligibility Verification (1)
  ✓ should verify proof quality >= CPU baseline

PASS  agent-memory-schema-matching.spec.ts (8 tests, 0 failures, ~500ms)
```

---

## Fixing the Error You Found

**Error**: Old 0050 failed because `mcp_trace_ownership` and `gpu_eligibility_gate` tried to FK to `task_id`, but `task_id` is NOT unique (it's a text field, repeated across many packets/traces).

**Fix in 0053**:
- Drop 0050 entirely (`DROP TABLE ... CASCADE`)
- **No FK for mcp_trace_ownership**: just indexed `(trace_id, task_id)` — agents too dynamic
- **No FK for gpu_eligibility_gate**: just indexed `(task_id, packet_key, verdict)` — per-packet, not per-task
- `agent_memory_packets.registry_id → agent_memory_registry.id` is the ONLY FK (valid because registry.id is PK)

---

## Next: Wiring P3g to New Schema

Once migration + test PASS, update `Start-P3gBackfill.ps1`:

**Stage 1 (Agentic Claim)**:
```powershell
# Old (0050):
INSERT INTO agent_memory_registry
  (task_id, story_id, agent, status, packet_key, source_ref, feature_id)
  VALUES (...)

# New (0053):
INSERT INTO agent_memory_registry
  (task_id, story_id, agent, status)
  VALUES (...)
  RETURNING id

# Then batch-insert into agent_memory_packets (13,481 rows):
INSERT INTO agent_memory_packets
  (registry_id, packet_key, source_ref, feature_id, qdrant_point_id, qdrant_collection, ...)
  VALUES (?, ?, ?, ...), (?, ?, ?, ...), ...
```

**Stage 4 (BitFrost Cache)**:
```powershell
# Populate Redis after claim created:
bitfrost:agent:task:{task_id} = {
  owner: "claude"
  task_id: "P3G-QDRANT-BACKFILL"
  status: "VERIFYING"
  gpu_eligible: true
  packet_keys: [13,481 items]
  retrieval_strategy: "hyperrag_fusion"
}
# TTL 24h
```

**Stage 6 (Release)**:
```powershell
# Write MCP trace ownership + proof:
INSERT INTO mcp_trace_ownership
  (trace_id, task_id, agent, packet_keys[], proof_hash, status)

INSERT INTO atlas_story_proofs
  (story_id, proof_hash, agent_list[], quality_score, reusable)
```

---

## Validation Checklist

After migration + test PASS:

- [ ] `agent_memory_registry` table exists, UNIQUE(task_id, agent)
- [ ] `agent_memory_packets` table exists, UNIQUE(registry_id, packet_key)
- [ ] `mcp_trace_ownership` has UNIQUE(trace_id), no FK
- [ ] `gpu_eligibility_gate` has verdict CHECK constraint
- [ ] `retrieval_eval_times` has proof_quality_cpu / proof_quality_gpu (0.0-1.0)
- [ ] All indexes created (task_id DESC, created_at DESC, GIN for JSONB)
- [ ] Test suite runs clean (8/8 passing)
- [ ] Postgres canonical truth (Postgres is source, Redis is hot mirror)
- [ ] Temporal payload density validated (new > old)
- [ ] DNRO registry prevents redundant tool calls
- [ ] GPU eligibility: proof_not_degraded is CRITICAL gate

---

## Summary

| Item | Status |
|------|--------|
| Migration (0053) | ✅ Created, ready to apply |
| Test suite | ✅ Created (650 lines, 8 tests) |
| Documentation | ✅ `nes-arch-agent-memory-closure.md` |
| P3g wiring needed | ⏳ After test passes |
| Bitfrost cache wiring | ⏳ After test passes |
| DNRO checks | ⏳ After test passes |

**Next move**: Apply migration + run test. If 8/8 pass, wiring P3g + Bitfrost + DNRO is straightforward.
