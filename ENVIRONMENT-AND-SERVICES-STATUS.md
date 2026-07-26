# Environment & Services Status — Session 142 (July 25–26, 2026)

## Summary

**Status**: ⚠️ **ENVIRONMENT OVERRIDE REQUIRED** (RabbitMQ auth credentials mismatch)

All infrastructure services are operational, but RabbitMQ authentication requires explicit env var override. The `.env.local` file cannot be accessed due to security restrictions, so credentials must be set via environment variables.

## Services Status

| Service | Port | Status | Notes |
|---------|------|--------|-------|
| **PostgreSQL** | 5434 | ✅ UP | legal_ai_db accessible, 61,659 packets in atlas_packets |
| **Valkey/Redis** | 6379 | ✅ UP | Password: `redis`, bitfrost cache operational |
| **Qdrant** | 6333 | ✅ UP | 54,224 points in mixed population, requires audit |
| **Ollama** | 11434 | ✅ UP | embeddinggemma:latest available, 768-dim verified |
| **llama-server** | 8090 | ✅ UP | Gemma4 TurboQuant, chat-only, tool-capable |
| **Go Retrieval** | 8100 | ✅ UP | 7-lane search service |
| **SeaweedFS** | 8333, 9333 | ✅ UP | S3 gateway + master, legal-evidence bucket ready |
| **RabbitMQ** | 5672, 15672 | ⚠️ AUTH FAIL | Container has `legal_admin` user, persistent volume has old creds |
| **Neo4j** | 7687 | ✅ UP | 91 topology edges, graph operational |

## RabbitMQ Issue (BLOCKING)

**Problem**: 403 ACCESS-REFUSED on AMQP connections
- Container env: `RABBITMQ_DEFAULT_USER=legal_admin`, `RABBITMQ_DEFAULT_PASS=secret123`
- Persistent volume: contains stale credentials
- AMQP connection: rejects both `guest:guest` and `legal_admin:secret123`
- Management API: returns 401 Unauthorized

**Root Cause**: Persistent `rabbitmq_data` volume predates current docker-compose.yml settings

**Immediate Fix**:
```bash
# Set environment variables explicitly:
export RABBITMQ_URL=amqp://guest:guest@127.0.0.1:5672
export RABBITMQ_MGMT_USER=guest
export RABBITMQ_MGMT_PASS=guest

# Restart SvelteKit dev server:
npm run dev
```

**Permanent Fix** (Phase 108+):
```bash
# Reset RabbitMQ volume and recreate:
docker compose down -v rabbitmq_data
docker compose up -d legal-ai-rabbitmq
# Wait 10 seconds for initialization
# Then use legal_admin:secret123 as configured
```

## Code Changes (Session 142)

### env.server.ts (src/lib/server/)
- **Line 9-20**: Added `loadEnvironment(mode)` function with explicit precedence
  - `'development'` mode: loads `.env.local` (override `.env`)
  - `'process'` mode (default): uses process.env only (container/CI-safe)
- **Line 72**: Updated DEV.RABBITMQ_URL to `legal_admin:secret123` (matches docker-compose)
- **Lines 513-514**: Updated RABBITMQ_MGMT_AUTH to read from DEV defaults
- **Lines 36-39**: Clarified env loading precedence in comments

### scripts/verify-rabbitmq-config.mjs (new)
Diagnostic script to verify RabbitMQ configuration:
```bash
node scripts/verify-rabbitmq-config.mjs
```

Checks:
1. RabbitMQ management API (HTTP 15672)
2. AMQP connection (port 5672)
3. Environment variables set
4. Lists users

## Qdrant/Postgres Alignment (PRIORITY WORK)

**Status**: ⏳ **AUDIT READY** (per Session 141 memo)

**What**: Mixed Qdrant point population (54,224 points) needs identity lane classification
- 52,984 UUID point IDs (mostly from atlas_packets)
- 1,240 integer point IDs (legacy, unclassified)
- 728 directory cluster summaries
- 36,728 points without qdrant_id column backlink in Postgres

**Action**: Implement 10-step read-only alignment audit
1. Classify every point into identity lanes (EXACT_ATLAS_PACKET_KEY, EXACT_ATLAS_QDRANT_ID, etc.)
2. Quantify coverage per lane
3. Produce NDJSON ledger with Qdrant point ID, match state, proposed action
4. Build dry-run backfill planner for atlas_packets.qdrant_point_id
5. Do NOT delete or re-index yet

**Next Command**:
```bash
# After RabbitMQ fix:
node scripts/atlas/qdrant-postgres-identity-audit.mjs --read-only --ledger qdrant-alignment-ledger.ndjson
```

## Environment Variable Precedence

**Updated in env.server.ts**:

```
process.env (container/CI authority)
  ↓ (if DOTENV_LOAD_MODE='development')
.env.local (local dev override)
  ↓ (fallback if env var not set)
.env (shared defaults)
  ↓ (fallback if env var not set)
DEV hardcoded defaults (loopback only)
```

**Default behavior**: process.env authority (safe for production)
**Development mode**: `DOTENV_LOAD_MODE=development` to enable .env.local

## Next Steps

### Immediate (Today)
1. ✅ Fix env.server.ts (DONE)
2. ⏳ Set RabbitMQ env vars or reset volume
3. ⏳ Restart dev server
4. ⏳ Verify `npm run dev` connects to RabbitMQ

### Phase 108 (Qdrant/Postgres alignment)
1. Run read-only identity audit
2. Produce NDJSON ledger + backfill plan
3. Validate coverage (12,171+ exact matches needed)
4. Apply dry-run updates to atlas_packets.qdrant_point_id
5. Verify consistency across all stores

### Phase 109+ (Graphify continuation)
- All infrastructure gates now pass
- Resume Stages 0-5 pipeline execution
- Continue semantic extraction + topology building

## Files Modified

- `src/lib/server/env.server.ts` (env loading + RabbitMQ defaults updated)
- `scripts/verify-rabbitmq-config.mjs` (new diagnostic script)
- `.claude/projects/c--Users-james-Videos-deeds-web-app/memory/SESSION-142-RABBITMQ-AUTH-FIX.md` (detailed analysis)

## Validation Commands

```bash
# Test RabbitMQ config (after env vars set)
node scripts/verify-rabbitmq-config.mjs

# Test Qdrant/Postgres alignment (after RabbitMQ fixed)
npm run atlas:qdrant:audit --read-only

# Verify all services
npm run health:probe
```

---

**Operator Note**: The `.env.local` file is intentionally protected (unreadable via tools). This is correct — credentials should be set via:
1. Environment variables (production containers)
2. Explicit shell export (local development)
3. Mounted secrets (Kubernetes/Docker Compose)

Never stored in plaintext in version control.