# Startup Quick-Fix Guide (5 min)

## The Problem
- ❌ Postgres missing tables: `parent_atlas_documents`, `agent_traces`, `concept_evidence`
- ❌ Caddy health check timeout on dev server
- ❌ GPU override file doesn't exist
- ⏳ NATS and LangGraph not wired (optional)

---

## Fix #1: Apply Missing Schema Migrations (2 min)

```bash
cd sveltekit-frontend

# Generate missing migrations
npx drizzle-kit generate postgres

# Review what will be applied
cat drizzle/0NNN_*.sql | head -50

# Apply safely
npx drizzle-kit migrate postgres

# Verify
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "\dt parent_atlas_documents"
# Expected: table found ✅
```

---

## Fix #2: Increase Caddy Timeout (1 min)

**File**: `docker-compose.yml`

Find the `caddy` service and add:
```yaml
caddy:
  environment:
    - CADDY_GLOBAL_TIMEOUT=10s
```

Then restart:
```bash
docker compose restart caddy
```

---

## Fix #3: Create GPU Override (2 min) — Optional

Create file: `docker-compose.gpu.override.yml`

```yaml
version: '3.8'

services:
  # Disable CPU Ollama when GPU active
  ollama:
    profiles: ["disabled"]
  
  # Enable TensorRT-LLM
  tensorrt-llm:
    image: nvcr.io/nvidia/tensorrt-llm:latest
    container_name: legal-ai-tensorrt
    runtime: nvidia
    environment:
      - NVIDIA_VISIBLE_DEVICES=all
      - NVIDIA_DRIVER_CAPABILITIES=compute,utility
      - TRT_LLM_PORT=8099
    ports:
      - "8099:8099"
    profiles: ["gpu"]
```

Then use:
```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.override.yml --profile gpu up -d
```

---

## Fix #4: Verify Everything Works (1 min)

```bash
# 1. Core services running
docker ps --filter name=legal-ai | grep -c legal-ai
# Expected: 9-12 containers (depending on profile)

# 2. Postgres healthy
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT 1;"
# Expected: 1 row

# 3. Valkey healthy
docker exec legal-ai-valkey valkey-cli ping
# Expected: PONG

# 4. Qdrant healthy
curl -s http://localhost:6333/health | jq .ok
# Expected: true

# 5. Start SvelteKit
cd sveltekit-frontend && npm run dev
# Expected: listening on http://localhost:5173
```

---

## Total Time: ~7 minutes

✅ All core services healthy  
✅ Schema migrations applied  
✅ Dev server responsive  
⏳ NATS/LangGraph optional (Phase 85)  
⏳ GPU optional (if needed)

---

## If Something Still Fails

See: `docs/STARTUP-ERRORS-AUDIT-2026-06-28.md` (detailed troubleshooting)

Run diagnostic:
```bash
# Check all services
docker compose ps

# View logs for errors
docker compose logs --tail=100 postgres rabbitmq

# Check missing tables
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "\dt" | grep -i parent_atlas
```

---

**Status**: Ready for deployment ✅
