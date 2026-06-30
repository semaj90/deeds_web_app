# Post-Batch: Quick Command Reference

**TL;DR**: Run these commands in order after `[Complete]` appears in `.tmp/batch.log`.

---

## ✅ Pre-Check (30 seconds)

```bash
# Verify batch file size (should be 500MB+)
ls -lh .tmp/gemma4-production-summaries.ndjson

# Verify line count (should be ~57977)
wc -l .tmp/gemma4-production-summaries.ndjson
```

---

## 1️⃣ Import to Postgres (10 min)

```bash
cd sveltekit-frontend

# Dry-run first
POSTGRES_PASSWORD=123456 npx tsx ../scripts/atlas/analysis-pass-orchestrator.mts

# Execute
POSTGRES_PASSWORD=123456 npx tsx ../scripts/atlas/analysis-pass-orchestrator.mts --apply

# Verify
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) FROM analysis_pass_results WHERE pass_key='gemma4_summary_v1';"
```

**Expected**: `57976` rows

---

## 2️⃣ Warm Redis Cache (2.5 min)

```bash
cd /path/to/repo/root

# Dry-run first
REDIS_PASSWORD=redis node scripts/atlas/bitfrost-packet-upsert-optimized.mjs \
  sveltekit-frontend/.tmp/gemma4-production-summaries.ndjson --dry-run

# Execute (with cleanup of old keys)
REDIS_PASSWORD=redis node scripts/atlas/bitfrost-packet-upsert-optimized.mjs \
  sveltekit-frontend/.tmp/gemma4-production-summaries.ndjson --cleanup

# Verify
docker exec legal-ai-valkey redis-cli DBSIZE
docker exec legal-ai-valkey redis-cli ZCARD "bifrost:index:all"
```

**Expected**: 
- DBSIZE: `150000+` keys
- ZCARD: `57976` packets in index

---

## 3️⃣ Final Verification (5 min)

```bash
# Postgres count
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) FROM analysis_pass_results WHERE pass_key='gemma4_summary_v1';"

# Redis count
docker exec legal-ai-valkey redis-cli ZCARD "bifrost:index:all"

# Sample L1 cache hit
docker exec legal-ai-valkey redis-cli KEYS "bifrost:packet:*" | head -1 | \
  xargs docker exec -i legal-ai-valkey redis-cli GET | jq '.' | head -10

# Feature index stats
docker exec legal-ai-valkey redis-cli KEYS "bifrost:feature:*" | wc -l
```

**Expected**:
- Postgres: `57976`
- Redis: `57976`
- Feature indexes: `1000+`

---

## 🎯 Success = All Counts Match

**Status**: 🟢 SESSION 96 COMPLETE

---

## 🚨 If Something Fails

**Revert Postgres**:
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "DELETE FROM analysis_pass_results WHERE pass_key='gemma4_summary_v1' AND created_at > NOW() - INTERVAL '1 hour';"
```

**Revert Redis**:
```bash
docker exec legal-ai-valkey redis-cli DEL "bifrost:*"
```

Then re-run with `--dry-run` first to verify before executing.

---

**Total Time**: ~32.5 hours (batch) + 20 minutes (post-batch) = ~33 hours

**Batch Started**: June 29, 2026 ~21:50 UTC  
**Expected Completion**: July 1, 2026 ~06:00 UTC (batch), ~06:20 UTC (post-batch)