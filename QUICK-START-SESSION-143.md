# Quick Start — Session 143 (Ready-to-Execute Checklist)

**Last Updated**: Session 142 (July 25–26, 2026)  
**Status**: ✅ Code ready | ⏳ Waiting for operator to apply fixes

---

## 5-Minute Fix: Get RabbitMQ Working

**Choose one option:**

### Option A: Accept existing guest credentials (fastest)
```bash
export RABBITMQ_URL=amqp://guest:guest@127.0.0.1:5672
export RABBITMQ_MGMT_USER=guest
export RABBITMQ_MGMT_PASS=guest

npm run dev
```

### Option B: Reset RabbitMQ volume (clean, ~15 min)
```bash
docker compose down -v rabbitmq_data
docker compose up -d legal-ai-rabbitmq
sleep 10

# Then use: legal_admin:secret123 (as in docker-compose.yml)
```

**Verify it worked**:
```bash
node scripts/verify-rabbitmq-config.mjs
# Should print: ✅ RabbitMQ configuration verified!
```

---

## 15-Minute Task: Run Qdrant Audit

```bash
# After RabbitMQ is healthy (above)
node scripts/atlas/qdrant-postgres-identity-audit.mjs --ledger qdrant-alignment-ledger.ndjson

# Review results (scroll to end for summary)
tail -100 qdrant-alignment-ledger.ndjson
```

**What to look for**:
- `exact_matches: >= 13000` — good
- `unknown_identities: <= 37000` — expected (many points without Postgres backlinks)
- No errors in console output

**If audit passes**: Proceed to Phase 108 backfill planning  
**If audit fails**: Check RabbitMQ fix worked first

---

## Long-Term: Implement Diagnostics (4–6 hours, Session 143+)

**Blueprint**: `SESSION-142-RUNTIME-DIAGNOSTICS-SPEC.md` (20 parts, implementation-ready)

**Start**: `scripts/runtime/lib/` (new directory for diagnostics tools)

**First 3 modules to implement**:
1. `runtime-environment-probe.mjs` — Discover services from Docker + env
2. `rabbitmq-diagnostics.mjs` — Test AMQP & management API independently
3. `error-correlate.mjs` — Merge logs + health results → incidents

**After those 3**: Remaining 17 parts become clearer

---

## Files You'll Need

| File | Purpose |
|------|---------|
| `ENVIRONMENT-AND-SERVICES-STATUS.md` | Current service status |
| `SESSION-142-RABBITMQ-AUTH-FIX.md` | Root cause: why auth failed |
| `SESSION-142-RUNTIME-DIAGNOSTICS-SPEC.md` | Blueprint: what to build |
| `SESSION-142-ACTION-SUMMARY.md` | Detailed execution plan |
| `scripts/verify-rabbitmq-config.mjs` | Health check (you'll run this) |
| `scripts/atlas/qdrant-postgres-identity-audit.mjs` | Qdrant audit (you'll run this) |
| `src/lib/server/env.server.ts` | Already fixed ✅ |

---

## Status Board

| Item | Status | Command |
|------|--------|---------|
| Environment fix | ✅ DONE | (check `env.server.ts` line 72) |
| RabbitMQ health script | ✅ DONE | `node scripts/verify-rabbitmq-config.mjs` |
| Qdrant audit script | ✅ DONE | `node scripts/atlas/qdrant-postgres-identity-audit.mjs` |
| Diagnostics spec | ✅ DONE | Read `SESSION-142-RUNTIME-DIAGNOSTICS-SPEC.md` |
| **RabbitMQ auth fix** | ⏳ WAITING | Run Option A or B above ⬆️ |
| **Qdrant audit** | ⏳ WAITING | After RabbitMQ is fixed |
| Diagnostics impl | ⏳ BACKLOG | After audit passes |
| Graphify resume | ⏳ BLOCKED | After all above ✅ |

---

## Success Criteria

- [ ] RabbitMQ `verify-rabbitmq-config.mjs` returns ✅
- [ ] Qdrant audit completes without errors
- [ ] Audit reports coverage ≥ 20%
- [ ] `npm run dev` connects to RabbitMQ without 403
- [ ] Ready to resume Graphify Stages 0–5

---

## If Something Breaks

1. **RabbitMQ still failing**: Check env vars are set with `echo $RABBITMQ_URL`
2. **Qdrant audit errors**: Verify Qdrant is running with `docker ps | grep qdrant`
3. **Dev server won't start**: Clear `.svelte-kit` cache and try again
4. **Need more help**: See `ENVIRONMENT-AND-SERVICES-STATUS.md` for detailed diagnostics

---

## Next: Session 143 Goals

- [ ] Fix RabbitMQ (5 min)
- [ ] Run Qdrant audit (15 min)
- [ ] Review audit results (10 min)
- [ ] Start diagnostics implementation (if time) OR resume Graphify (if ready)

**Estimated total time**: 30 min operational + 4–6 hours for diagnostics (optional)
