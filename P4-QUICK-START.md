# P4.1 Quick Start (45 Minutes)

**Goal**: Index all 3,251 packet summaries + titles to unblock P4.2+  
**Prerequisites**: llama-server, Postgres, (optional) Valkey

---

## 🚀 Execute in Order

### 1️⃣ Start Infrastructure (2 min)

```bash
# Start llama-server (TurboQuant Gemma4 @ :8090)
npm run turbo:start:detached

# Wait for model to load (~10s)
sleep 10

# Verify connection
curl http://127.0.0.1:8090/v1/models | jq .data[0].id
# Expected: gemma4-legal-iq4xs-direct.gguf
```

### 2️⃣ Test Environment (2 min)

```bash
npm run test:p4:summary-indexing

# Expected: 12 passed, 0 failed
```

### 3️⃣ Dry-Run (15 min)

```bash
# Test packet summaries (first 100, no DB writes)
npm run atlas:summaries:packets:dry

# Test titles (first 100, no DB writes)
npm run atlas:titles:extract:dry
```

### 4️⃣ Production Apply (25 min)

```bash
# Apply summaries to ALL 3,251 packets (llama-server required)
npm run atlas:summaries:packets:apply
# ⏱️ ~15-25 min

# Apply titles to ALL 3,251 packets (fast)
npm run atlas:titles:extract:apply
# ⏱️ ~1-2 min

# Create BM25 indexes for full-text search
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -f drizzle/manual/0047_bm25_packet_summary_index.sql
# ⏱️ ~1 min
```

### 5️⃣ Validate (5 min)

```bash
# Re-run test suite
npm run test:p4:summary-indexing:verbose

# Expected: All 12 tests PASS, coverage 100%
```

---

## ✅ Success Indicators

```bash
# All 3 should return 3251:
psql -tc "SELECT COUNT(summary) FROM atlas_packets WHERE summary IS NOT NULL;"
psql -tc "SELECT COUNT(title) FROM atlas_packets WHERE title IS NOT NULL;"
psql -tc "SELECT COUNT(*) FROM atlas_packets;"

# BM25 search should be fast (<10ms):
psql -tc "SELECT * FROM atlas_packets WHERE summary % 'auth' LIMIT 1;" | time

# Test queries:
psql -c "SELECT packet_key, title, substring(summary, 1, 80) FROM atlas_packets WHERE title IS NOT NULL LIMIT 3;"
```

---

## 🆘 Troubleshooting

| Issue | Fix |
|-------|-----|
| `llama-server connection refused` | `npm run turbo:start:detached` + wait 10s |
| `Postgres connection error` | `docker restart legal-ai-postgres` |
| `Timeout during summaries` | `npm run atlas:summaries:packets:apply --batch=50 --concurrency=4` |
| `BM25 index fails (pg_trgm missing)` | `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "CREATE EXTENSION pg_trgm;"` |

---

## 📚 Full Docs

- **Detailed Guide**: `docs/P4-PHASE-1-SUMMARY-INDEXING-COMPLETE.md`
- **Execution Checklist**: `docs/P4-NEXT-STEPS-COMPLETE-CHECKLIST.md`
- **Session Summary**: `SESSION-82-P4-IMPLEMENTATION-SUMMARY.md`

---

## 🎯 Why This Matters

**Before P4.1**: SOM clustering is geometric-only (no semantic meaning)  
**After P4.1**: SOM learns semantic centroids (auth, db, ui clusters are meaningful)

This unblocks:
- ✅ P4.2: AE training (768→64 latent compression)
- ✅ P4.3: 4D topology (SOM grid + latent space)
- ✅ P4.4: Multi-hop retrieval (concept + authority navigation)

---

**Total Time**: ~45 min  
**Status**: Production-Ready ✅
