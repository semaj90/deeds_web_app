# Phase 110: Quick Start Guide

## 1. Apply Migration (Static Schema)
```bash
cd sveltekit-frontend
npm run drizzle:migrate
```
✓ Creates 8 tables with 5 seed representations (all CANDIDATE/UNVERIFIED)

---

## 2. Run Phase 1 Probing
```bash
npm run phase110:init
```
✓ Probes Ollama :11434  
✓ Updates UNVERIFIED → STATIC_VERIFIED  
✓ Logs all results

**Dry-run first:**
```bash
npm run phase110:init:dry
```

---

## 3. Run Tests
```bash
npm run phase110:test
```
✓ Validates schema, immutability, fallback, lane selection

---

## 4. Test Dual-Lane Retrieval
```bash
# Start dev server if not running
npm run dev

# In another terminal:
npm run retrieval:dual-lane:test
```
✓ Embeds query, queries both 768d + 384d lanes, fuses with RRF

---

## 5. Verify Status

### Check all representations
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db << SQL
SELECT representation_id, output_dimensions, lifecycle_status, verification_status
FROM atlas_representations ORDER BY output_dimensions DESC;
SQL
```

### Check providers
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db << SQL
SELECT provider_id, representation_id, endpoint_url, health_status
FROM atlas_representation_providers;
SQL
```

---

## Expected Results After Phase 1

| Field | Before | After |
|-------|--------|-------|
| Representations | 5 | 5 |
| Lifecycle Status | CANDIDATE (all) | CANDIDATE (all) |
| Verification Status | UNVERIFIED (all) | STATIC_VERIFIED (all if Ollama up) |
| Providers | 1 (ollama_local) | 1 (ollama_local, HEALTHY) |

---

## Next Steps (Phases 2-6)

- **Phase 2**: Paired output testing → determine 384 derivation method
- **Phase 4**: Qdrant audit → reconcile with live collection
- **Phase 5**: Retrieval ablation → measure quality across dimensions
- **Phase 6**: Select primary → promote one representation to ACTIVE + PRODUCTION_VERIFIED

---

## Files Created

- ✅ `drizzle/0152_atlas_representations_registry_revised.sql` (migration)
- ✅ `src/lib/server/representations/representation-registry-service.ts` (service)
- ✅ `scripts/atlas/phase110-init-and-probe.mts` (Phase 1 script)
- ✅ `src/routes/api/retrieval/dual-lane/+server.ts` (Phase 109 endpoint)
- ✅ `tests/phase110-integration.test.ts` (tests)
- ✅ `docs/PHASE-110-END-TO-END-IMPLEMENTATION.md` (full guide)

---

## Key Concepts

| Term | Definition |
|------|-----------|
| **Lifecycle** | CANDIDATE → ACTIVE → DEPRECATED → RETIRED (semantic adoption) |
| **Verification** | UNVERIFIED → STATIC_VERIFIED → SAMPLE_VERIFIED → PRODUCTION_VERIFIED (evidence) |
| **Representation** | Model + dimensions + normalization (semantic identity) |
| **Provider** | Runtime endpoint (Ollama, ONNX, gRPC, etc.) |
| **Fallback** | Alternate provider or dimension for retrieval |
| **Lane** | Retrieval context (code_semantic, doc_summary, mobile, etc.) |
| **RRF** | Reciprocal Rank Fusion (combines 768d + 384d rankings) |

---

## Troubleshooting

**Migration fails?**  
→ Check: `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "TABLE atlas_representations;"`

**Phase 1 probe finds no reps?**  
→ Verify: `npm run schema:inspect | grep atlas_representations`

**Ollama probe fails?**  
→ Check: `curl http://127.0.0.1:11434/api/tags | jq '.models[].name'`

**Immutability trigger blocks update?**  
→ Expected! Create new representation_id for semantic changes.

**Dual-lane retrieval returns 400?**  
→ Check: `curl http://127.0.0.1:6333/collections | jq '.result | length'`

---

## Performance

- Migration: ~2-3s
- Phase 1 probe: ~15-30s (5 reps × 3s/Ollama call)
- Dual-lane retrieval: ~200-400ms (embedding + 2 queries + RRF)
- DB lookup: <1ms (indexed)

---

## Full Documentation

→ `docs/PHASE-110-END-TO-END-IMPLEMENTATION.md`
