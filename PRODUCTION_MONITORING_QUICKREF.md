# Production Monitoring Quick Reference

**Last Updated**: April 13, 2026
**System**: 3-Tier Cache (Redis L1 + Bifrost L2 + Ollama L3)

---

## Daily Health Checks (2 minutes)

### 1. Check All Services Status
```bash
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "deeds|phase66|bifrost|qdrant"
```
**Expected**: All show "Up" + "(healthy)" status

---

### 2. Check Cache Performance
```bash
# Redis L1 stats
docker exec deeds-redis-prod redis-cli INFO stats | grep -E "keyspace_hits|keyspace_misses"

# Calculate hit rate: hits / (hits + misses)
# Target: >70%
```

---

### 3. Check GPU Status
```bash
nvidia-smi --query-gpu=memory.used,utilization.gpu --format=csv,noheader
```
**Expected**:
- Idle: ~2800 MiB, 0-5%
- Active: 4000-6000 MiB, 80-100%

---

### 4. Check Ollama Model
```bash
curl -s http://localhost:11434/api/tags | grep gemma4-legal-fast
```
**Expected**: `"name":"gemma4-legal-fast:latest"` appears

---

## Quick Performance Test

### Test L1 Cache (30 seconds)
```bash
cd sveltekit-frontend
node scripts/tests/test-l1-cache.mjs
```

**Expected Output**:
```
Run 1 (Cold):  2,872ms
Run 2 (Warm):  2ms (1436× faster) ✅
Run 3 (Hot):   6ms (479× faster) ✅

🎉 L1 Redis Cache: WORKING!
```

**If fails**: See troubleshooting below ↓

---

## Performance Metrics Dashboard

### Target Baselines (Your RTX 3060 Ti)

| Metric | Target | Acceptable | Alert If |
|--------|--------|------------|----------|
| L1 cache hit latency | 2-6ms | <50ms | >100ms |
| L3 cold inference | 2.8s | <5s | >10s |
| Cache hit rate | >85% | >70% | <50% |
| GPU VRAM (idle) | 2.8GB | <4GB | >7GB |
| GPU VRAM (active) | 4-6GB | <7GB | >7.5GB |
| Redis memory | <2GB | <3GB | >4GB |
| Qdrant cache points | Growing | >7 | Decreasing |

---

## Common Issues & 30-Second Fixes

### 🔴 Issue: Slow responses (all >5s)

**Quick check**:
```bash
curl http://localhost:11434/api/tags
```

**Fix**:
```bash
# Restart Ollama (Windows Services or system tray)
# Then verify: curl http://localhost:11434/api/tags
```

---

### 🔴 Issue: Cache not hitting (all ~3s)

**Quick check**:
```bash
docker exec deeds-redis-prod redis-cli ping
```

**Fix**:
```bash
# Restart Redis
docker restart deeds-redis-prod

# Restart dev server
Ctrl+C
npm run dev
```

---

### 🔴 Issue: GPU out of memory

**Quick check**:
```bash
nvidia-smi
```

**Fix**:
```bash
# Unload unused models
curl -X DELETE http://localhost:11434/api/delete \
  -d '{"name":"unused-model-name"}'

# Or restart Ollama to clear VRAM
```

---

### 🔴 Issue: Bifrost timeout errors

**Quick check**:
```bash
curl http://localhost:3040/health
```

**Fix**:
```bash
# Restart Bifrost
docker restart legal-ai-bifrost

# Wait 30 seconds, then test
curl http://localhost:3040/health
```

---

## Emergency Rollback (1 minute)

### Disable Cache Entirely
```bash
# Edit .env
echo "BIFROST_ENABLED=false" >> sveltekit-frontend/.env

# Restart server
Ctrl+C
npm run dev
```

**Result**: Falls back to direct Ollama (slower but reliable)

---

## Weekly Maintenance (10 minutes)

### 1. Check Redis Memory Growth
```bash
docker exec deeds-redis-prod redis-cli INFO memory | grep used_memory_human
```
**If >3GB**: Consider increasing maxmemory or adjusting TTL

---

### 2. Check Cache Key Count
```bash
docker exec deeds-redis-prod redis-cli DBSIZE
```
**Expected**: 50K-200K keys

---

### 3. Check Qdrant Growth
```bash
curl -s http://localhost:6333/collections/llm_response_cache | grep points_count
```
**Expected**: Growing over time (more semantic cache entries)

---

### 4. Review Docker Logs for Errors
```bash
docker logs legal-ai-bifrost --tail 100 | grep -i error
docker logs legal-ai-qdrant --tail 100 | grep -i error
docker logs deeds-redis-prod --tail 100 | grep -i error
```
**Expected**: No critical errors

---

## Performance Optimization Commands

### Clear Stale Cache (if needed)
```bash
# Clear all Redis cache (will rebuild)
docker exec deeds-redis-prod redis-cli FLUSHDB

# Clear specific pattern (e.g., stale BullMQ keys)
docker exec deeds-redis-prod redis-cli --scan --pattern "bull:*" | \
  xargs -L 100 docker exec -i deeds-redis-prod redis-cli DEL
```

---

### Adjust Redis Memory Limit
```bash
# Set maxmemory to 3GB (from default 2GB)
docker exec deeds-redis-prod redis-cli config set maxmemory 3gb

# Verify
docker exec deeds-redis-prod redis-cli config get maxmemory
```

---

### Test Bifrost Semantic Cache
```bash
# Query 1 (cold)
curl -X POST http://localhost:5173/api/test/cache-demo \
  -H "Content-Type: application/json" \
  -d '{"query":"What is hearsay evidence?"}'

# Query 2 (exact match, should hit L1)
curl -X POST http://localhost:5173/api/test/cache-demo \
  -H "Content-Type: application/json" \
  -d '{"query":"What is hearsay evidence?"}'

# Query 3 (similar, should hit L2 semantic)
curl -X POST http://localhost:5173/api/test/cache-demo \
  -H "Content-Type: application/json" \
  -d '{"query":"Explain hearsay in legal terms"}'
```

---

## Key File Locations

| File | Purpose | Edit When |
|------|---------|-----------|
| `.env` | Environment config | Disable cache, change ports |
| `docker/bifrost/config.json` | Bifrost settings | Adjust threshold, TTL |
| `src/lib/server/ollama.ts` | Cache orchestrator | Debug cache logic |
| `src/lib/server/cache/redis-exact-match.ts` | L1 cache | Debug Redis issues |

---

## Contact & Escalation

### Logs for Debugging
```bash
# Dev server logs (if using PM2)
pm2 logs legal-ai-prod --lines 200

# Docker service logs
docker logs legal-ai-bifrost -f
docker logs deeds-redis-prod -f
docker logs legal-ai-qdrant -f
```

### Helpful Debug Commands
```bash
# Check all listening ports
netstat -an | grep LISTEN | grep -E "5173|6379|3040|6333|11434"

# Check disk space (if Redis fills)
df -h

# Check Docker disk usage
docker system df
```

---

## Performance Tracking Template

### Daily Log Format
```
Date: 2026-04-13
Time: 7:00 AM

Redis Hit Rate: 78% (155K hits, 45K misses)
Avg Response Time: 850ms
GPU VRAM: 3.2GB / 8GB
Qdrant Points: 42
Issues: None

Actions Taken: None
```

### Weekly Summary Format
```
Week: April 7-13, 2026

Total Requests: 1.2M
Cache Hit Rate: 82% (avg)
Avg Response Time: 720ms (avg)
Uptime: 99.8%

Top 3 Queries:
1. "What is hearsay?" - 15K requests
2. "Explain discovery process" - 12K requests
3. "Define probable cause" - 9K requests

Optimizations Made:
- Increased Redis maxmemory to 3GB
- Adjusted Bifrost threshold from 0.82 to 0.85

Issues Resolved:
- None
```

---

**Quick Reference Version**: 1.0
**System Status**: ✅ PRODUCTION READY

Keep this file handy for daily operations! 📊
