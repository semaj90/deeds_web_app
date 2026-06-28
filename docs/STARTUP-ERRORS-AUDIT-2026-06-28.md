# Startup Errors Audit — June 28, 2026

**Scope**: GPU support, cuVS, NATS, LangGraph, VS Code workspace issues  
**Status**: 🟡 Partial (schema gaps, missing GPU override)

---

## 1. Database Schema Errors

### ❌ Missing Tables (Postgres)

| Error | Table | Status | Action |
|-------|-------|--------|--------|
| `relation "parent_atlas_documents" does not exist` | parent_atlas_documents | MISSING | Needs migration |
| `relation "agent_traces" does not exist` | agent_traces | MISSING | Needs migration |
| `relation "concept_evidence" does not exist` | concept_evidence | MISSING | Needs migration |
| `column "endpoint" of relation "api_audit_log" does not exist` | api_audit_log.endpoint | MISSING COLUMN | Needs ALTER TABLE |
| `column "community_confidence" does not exist` | (unknown table) | MISSING COLUMN | Needs ALTER TABLE |

### ✅ Existing Tables (Live)
- ✅ atlas_packets (canonical, 18,046 rows)
- ✅ atlas_tree_nodes (8,823 rows)
- ✅ atlas_topology_index (3,251 rows)
- ✅ qdrant_sync_status (operational)

**Recommendation**: Apply missing migrations before full startup.

```bash
# Check which migrations are pending
cd sveltekit-frontend
npx drizzle-kit generate postgres

# Review generated SQL before applying
drizzle/0NNN_*.sql  # Review these files

# Apply safely
npx drizzle-kit migrate postgres
```

---

## 2. Docker Compose Configuration

### ✅ Available Profiles

| Profile | Services | GPU | Status |
|---------|----------|-----|--------|
| (default) | 5 core (postgres, valkey, qdrant, rabbitmq, caddy) | No | ✅ Running |
| `full` | +14 (neo4j, nats, go-search, go-embed, etc) | No | ⏳ Buildable |
| `gpu` | +tensorrt-llm | Yes | ❌ No override file |
| `seaweedfs` | +4 seaweedfs services | No | ✅ Running |

### ❌ Missing GPU Override

**Issue**: No `docker-compose.gpu.override.yml` exists

**Command fails**:
```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.override.yml up -d
```

**Fix**: Create override file or use profile directly:

```bash
# Instead of override file, use profile:
docker compose --profile gpu up -d

# Or create minimal override:
version: '3.8'
services:
  ollama:
    profiles: ["default"]  # Disable when GPU active
```

**Note**: TensorRT-LLM and Ollama GPU contend for VRAM. Cannot run simultaneously.

---

## 3. Service Health Issues

### 🟡 Valkey/Redis Warnings

```
[warning] At prepare fork callback, suspend writer worker thread pool
[warning] At prepare fork callback, suspend reader worker thread pool
[warning] At prepare fork callback, suspend gRPC
```

**Status**: Non-blocking (fork callback warnings, valkey-search module warning)  
**Action**: Acceptable for development; monitor for production

### 🟡 Caddy Reverse Proxy Timeout

```
{"error":"Get \"http://host.docker.internal:5173/api/health\": 
  net/http: request canceled (Client.Timeout exceeded)"}
```

**Cause**: SvelteKit dev server at :5173 not responding fast enough to health checks  
**Fix**:
1. Increase Caddy timeout in docker-compose.yml
2. Or ensure dev server is warm before startup

```yaml
caddy:
  environment:
    - HEALTHCHECK_INTERVAL=10s  # Increase from default 5s
    - HEALTHCHECK_TIMEOUT=5s
```

### ✅ RabbitMQ Warnings

- Deprecated feature warning (management_metrics_collection)
- Message store rebuilding indices (expected on restart)
- Non-blocking; safe to ignore

---

## 4. GPU Support Status

### ❌ Missing Components

| Component | Status | Notes |
|-----------|--------|-------|
| TensorRT-LLM image | Not in docker-compose.yml | Needs to be added to gpu profile |
| cuVS (NVIDIA vector search) | Not defined | Not yet integrated |
| CUDA compatibility check | Not automated | Manual CUDA 12.1 verification needed |
| GPU allocation policy | Not defined | No memory cap or prioritization |

### ⏳ To Enable GPU

**Step 1**: Verify CUDA 12.1 available
```bash
nvidia-smi
# Expected: CUDA Capability 8.6+ (RTX 3060 Ti = 8.6 ✅)
```

**Step 2**: Create GPU override or define in docker-compose.yml
```yaml
tensorrt-llm:
  image: nvcr.io/nvidia/tensorrt-llm:latest
  runtime: nvidia
  environment:
    - NVIDIA_VISIBLE_DEVICES=all
    - NVIDIA_DRIVER_CAPABILITIES=compute,utility
  profiles: ["gpu"]
```

**Step 3**: Verify mutual exclusivity
```bash
# Cannot run both simultaneously
docker compose stop ollama       # Stop CPU Ollama
docker compose --profile gpu up -d tensorrt-llm
```

---

## 5. NATS Integration Status

### ✅ NATS Container

| Config | Value | Status |
|--------|-------|--------|
| Image | nats:latest | ✅ Available |
| Port | 4222 | ✅ Exposed |
| Volume | nats_data:/data | ✅ Persistent |
| Profile | full, gpu | ✅ Defined |

### ⏳ NATS Wiring

| Component | Status | Notes |
|-----------|--------|-------|
| SvelteKit NATS client | ⏳ Not found | Need to wire in +server.ts routes |
| Message subjects | ⏳ Not defined | atlas.packets.*, langraph.*, etc. |
| Consumer groups | ⏳ Not wired | Need consumer registration |

**To enable**:
```bash
# 1. Start NATS
docker compose --profile full up -d nats

# 2. Verify it's listening
docker exec legal-ai-nats nats server info

# 3. Wire Node.js client
import { connect } from "nats";
const nc = await connect({ servers: "nats://localhost:4222" });
```

---

## 6. LangGraph Status

### ❌ Missing Implementation

| Component | Status | Evidence |
|-----------|--------|----------|
| LangGraph import | Not found | `rg langgraph src/ = 0 hits` |
| LangGraph nodes | ❌ Not defined | No state machine wiring |
| LangGraph executor | ❌ Not wired | No +server.ts integration |
| LangGraph to NATS bridge | ❌ Not defined | No event emission |

### 📋 To Implement

1. **Create LangGraph worker** (`src/lib/server/langgraph/worker.ts`)
2. **Define state machine** (8 nodes: load → validate → retrieve → synthesize → cache → write → emit → done)
3. **Wire to NATS** (publish trace checkpoints on `atlas.packets.validated` subject)
4. **Add API route** (`src/routes/api/langgraph/+server.ts`)
5. **Test with `/api/langgraph/execute?task=gan-validate`**

**See**: `packages/atlas-core/src/langgraph/worker.ts` (reference implementation from Session 83)

---

## 7. VS Code Workspace Issues

### ✅ Configuration Present

| Setting | Value | Status |
|---------|-------|--------|
| TypeScript SDK | sveltekit-frontend/node_modules/typescript/lib | ✅ Configured |
| Python venv | .venv/Scripts/python.exe | ✅ Configured |
| CMake (C++ CUDA) | simd-bridge/cpp | ✅ Configured |
| Prettier formatting | ✅ Auto-format on save | ✅ Active |

### 🟡 Potential Issues

1. **Multiple compose files warning**:
   ```
   Found multiple config files: docker-compose.yml, docker-compose.yaml
   Using docker-compose.yml
   ```
   **Fix**: Delete docker-compose.yaml (prefer .yml extension)

2. **Python venv not activated**:
   - If `.venv` doesn't exist, create: `python -m venv .venv`
   - Activate: `.venv/Scripts/activate.ps1` (PowerShell)

3. **CMake C++ IntelliSense**:
   - Requires Visual Studio 2022 + CUDA 12.1 dev tools
   - CMakePresets.json configured for windows-cuda

---

## 8. Startup Sequence (Recommended)

### Phase 1: Core Services (5 min)
```bash
docker compose up -d postgres valkey qdrant rabbitmq caddy
# Verify: docker ps | wc -l  (should show 5)
```

### Phase 2: Schema Migrations (2 min)
```bash
cd sveltekit-frontend
npx drizzle-kit migrate postgres
# Check for errors on missing tables
```

### Phase 3: Full Profile (10 min)
```bash
docker compose --profile full up -d
# Excludes GPU; includes NATS, Neo4j, Go services
```

### Phase 4: GPU (Optional, 5 min)
```bash
# Only if GPU needed AND Ollama not running
docker compose stop ollama
docker compose --profile gpu up -d tensorrt-llm
```

### Phase 5: SvelteKit Dev Server (2 min)
```bash
cd sveltekit-frontend
npm run dev  # Starts at http://localhost:5173
```

---

## 9. Error Resolution Priority

| Priority | Issue | Est. Time | Action |
|----------|-------|-----------|--------|
| 🔴 P0 | Missing schema tables | 5 min | Apply drizzle migrations |
| 🔴 P0 | Caddy health check timeout | 10 min | Increase timeout or warm dev server |
| 🟡 P1 | GPU override file missing | 15 min | Create or use `--profile gpu` |
| 🟡 P1 | NATS wiring incomplete | 30 min | Wire Node.js client + subjects |
| 🟡 P1 | LangGraph not implemented | 2 hrs | Implement state machine + API |
| 🟢 P2 | Valkey fork warnings | N/A | Non-blocking, acceptable warnings |
| 🟢 P2 | Multiple compose files | 1 min | Delete docker-compose.yaml |

---

## 10. Quick Verification Commands

```bash
# Check running containers
docker ps --filter name=legal-ai | wc -l

# Check Postgres schema
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "\dt" | wc -l

# Check Redis/Valkey
docker exec legal-ai-valkey valkey-cli ping

# Check Qdrant
curl -s http://localhost:6333/health | jq .

# Check NATS (after `--profile full`)
docker exec legal-ai-nats nats server info

# Check SvelteKit dev server
curl -s http://localhost:5173/api/health

# Check Caddy reverse proxy
curl -s https://localhost:5178/api/health -k
```

---

## Summary

**Status**: 🟡 Partial (core running, schema gaps, GPU/LangGraph pending)

**To ship**:
1. ✅ Apply missing database migrations (5 min)
2. ✅ Increase Caddy health check timeout (2 min)
3. ⏳ Wire NATS client (30 min, optional for Phase 85)
4. ⏳ Implement LangGraph orchestrator (2 hrs, Phase 85 milestone)
5. ⏳ Enable GPU support (15 min, optional)

**Critical path**: Schema + Caddy timeout = 7 min to full startup.

---

**Next**: Review schema migrations needed in `sveltekit-frontend/drizzle/`
