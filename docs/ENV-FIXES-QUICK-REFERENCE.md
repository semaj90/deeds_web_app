# Environment Variables — Quick Fix Reference

**File**: `.env.local` (gitignored, must create manually)

---

## Copy-Paste .env.local Template

```bash
# ════════════════════════════════════════════════════════════════
# PHASE 2.5: SERVICE DEPENDENCIES FOR GAN DEEP AUDIT
# ════════════════════════════════════════════════════════════════

# ─────────────────────────────────────────────────────────────────
# 1. REDIS / VALKEY (BitFrost L1 cache for feature registry search)
# ─────────────────────────────────────────────────────────────────
REDIS_URL=redis://127.0.0.1:6379
REDIS_PASSWORD=redis

# ─────────────────────────────────────────────────────────────────
# 2. QDRANT (Tier 3 semantic search — Phase 3 only, optional)
# ─────────────────────────────────────────────────────────────────
QDRANT_URL=http://127.0.0.1:6333
QDRANT_API_KEY=

# ─────────────────────────────────────────────────────────────────
# 3. GO RETRIEVAL SERVICE (Retrieval coverage analysis, optional)
# ─────────────────────────────────────────────────────────────────
GO_RETRIEVAL_HTTP_URL=http://127.0.0.1:8100
GO_RETRIEVAL_HTTP_ENABLED=true

# ─────────────────────────────────────────────────────────────────
# POSTGRES (Already in .env, but reference here)
# ─────────────────────────────────────────────────────────────────
# DATABASE_URL=postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db
```

---

## Diagnostic Flow Chart

```
Is Phase 2.5 not working?
│
├─→ API returns degraded response (empty arrays)?
│   │
│   └─→ CHECK: Which services are down?
│       └─→ docker ps | grep -E "redis|qdrant|go-retrieval"
│
├─→ BitFrost cache not working?
│   │
│   └─→ REDIS ISSUE
│       ├─→ docker logs legal-ai-redis-prod
│       ├─→ docker restart legal-ai-redis-prod
│       └─→ Check .env.local: REDIS_URL + REDIS_PASSWORD
│
├─→ Tier 3 semantic search failing?
│   │
│   └─→ QDRANT ISSUE (Phase 3 only)
│       ├─→ docker logs legal-ai-qdrant
│       ├─→ docker restart legal-ai-qdrant
│       └─→ Check .env.local: QDRANT_URL
│
└─→ Retrieval coverage analysis not running?
    │
    └─→ GO RETRIEVAL ISSUE
        ├─→ docker logs go-retrieval-service
        ├─→ docker restart go-retrieval-service
        └─→ Check .env.local: GO_RETRIEVAL_HTTP_URL
            └─→ Verify GO_RETRIEVAL_HTTP_ENABLED=true
```

---

## One-Liner Health Checks

```bash
# Redis
docker exec legal-ai-redis-prod redis-cli PING

# Qdrant
curl -s http://127.0.0.1:6333/collections | jq .

# Go Retrieval (port varies: 8100 or 8096)
curl -s http://127.0.0.1:8100/health || curl -s http://127.0.0.1:8096/health

# All three at once
echo "=== Redis ===" && docker exec legal-ai-redis-prod redis-cli PING && \
echo "=== Qdrant ===" && curl -s http://127.0.0.1:6333/health && \
echo "=== Go Retrieval ===" && curl -s http://127.0.0.1:8100/health
```

---

## Restart All Services (if needed)

```bash
docker restart legal-ai-redis-prod legal-ai-qdrant go-retrieval-service

# Wait for startup
sleep 5

# Verify all three
docker ps | grep -E "redis|qdrant|go-retrieval" | grep -c "Up"
# Expected output: 3
```

---

## Common Error Messages & Fixes

### "Redis unavailable, continuing without cache"
```
❌ Problem: Redis is down or misconfigured
✅ Fix:
   1. docker restart legal-ai-redis-prod
   2. Verify .env.local: REDIS_URL + REDIS_PASSWORD
   3. Test: docker exec legal-ai-redis-prod redis-cli PING
```

### "Go Retrieval service unreachable"
```
❌ Problem: Go Retrieval service down or port wrong
✅ Fix:
   1. docker ps | grep go-retrieval (check status)
   2. docker logs go-retrieval-service (check logs)
   3. Verify .env.local: GO_RETRIEVAL_HTTP_URL=http://127.0.0.1:8100
   4. Test: curl http://127.0.0.1:8100/health
```

### "Production hardening audit detected critical gaps"
```
❌ Problem: Missing database indexes (non-critical for dev)
✅ Fix:
   1. This is informational, not an error
   2. Hardening issues are returned in the response
   3. Remediation steps are provided in the response
   4. No action required for dev; address in production
```

### Empty token savings recommendations
```
❌ Problem: Feature registry query returned no results
✅ Why: This is normal for new databases
   1. Feature registry is populated over time as queries run
   2. First audit may have no similar patterns
   3. Recommendations improve with more usage
✅ Not a failure — expected behavior
```

---

## Env Variable Priority (Highest to Lowest)

### Redis
1. `REDIS_URL` (direct URL)
2. `VALKEY_URL` (Valkey bundle fallback)
3. Hardcoded: `redis://127.0.0.1:6379`

### Qdrant
1. `QDRANT_URL` (direct URL)
2. `QDRANT_HOST` + `QDRANT_PORT` (construct URL)
3. Hardcoded: `http://127.0.0.1:6333`

### Go Retrieval
1. `GO_RETRIEVAL_HTTP_URL` (direct URL)
2. `RETRIEVAL_HTTP_URL` (alias)
3. Hardcoded: `http://127.0.0.1:8100`

**To override**: Add to `.env.local` with highest-priority variable name.

---

## Dev vs Production

| Setting | Development | Production |
|---------|-------------|-----------|
| Redis | `localhost:6379` (unauth) | `redis://user:pass@prod-redis:6379` |
| Qdrant | `localhost:6333` (unauth) | `https://qdrant.prod.internal:6333` (auth) |
| Go Retrieval | `localhost:8100` (internal) | `https://go-retrieval.prod.internal` (internal) |
| Auth method | None (dev network) | mTLS / API key (production) |

**Never commit production URLs to `.env`** — use `.env.local` (gitignored).

---

## Testing After Fix

```bash
# 1. Start dev server
npm run dev

# 2. Test API route
curl -X POST http://localhost:5173/api/atlas/gan-audit/deep \
  -H "Content-Type: application/json" \
  -H "Cookie: sessionId=<your-session>" \
  -d '{
    "operation": "gan-audit",
    "dryRun": false,
    "verbose": true,
    "batchSize": 100,
    "includeTokenAnalysis": true,
    "includeFeatureRecommendations": true,
    "includeProductionHardening": true,
    "includeRetrievalAnalysis": true
  }'

# 3. Expect 200 response with audit results
# (or degraded response if services are down)
```

---

## If Still Broken

1. **Check Docker**:
   ```bash
   docker ps -a | grep -E "redis|qdrant|go-retrieval"
   ```

2. **Check Logs**:
   ```bash
   docker logs legal-ai-redis-prod --tail=50
   docker logs legal-ai-qdrant --tail=50
   docker logs go-retrieval-service --tail=50
   ```

3. **Check Network**:
   ```bash
   docker network ls
   docker network inspect bridge  # All containers should be here
   ```

4. **Check .env.local Syntax**:
   ```bash
   cat .env.local | grep -v "^#" | grep -v "^$"
   # Should show KEY=VALUE pairs only
   ```

5. **Ask for help**:
   - Post the service logs
   - Post your `.env.local` (with passwords redacted)
   - Post the API response body (with personal data redacted)

---

**Status**: ✅ Quick fix ready  
**Last Updated**: June 26, 2026 @ 19:35 UTC  
**Use**: Copy `.env.local` template, verify with health checks, restart if needed
