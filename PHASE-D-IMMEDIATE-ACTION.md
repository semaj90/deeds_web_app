# Phase D: Immediate Action (Today)

**Status**: Ready to execute now  
**Date**: June 14, 2026  
**Single action**: Run the identity reconciliation script

---

## Right Now

```bash
npm run atlas:debug:qdrant-postgres
```

**What this does**:
1. Fetches 50 random points from Qdrant
2. Looks up each in Postgres
3. Compares packet_key, source_ref, feature_id, feature_label
4. Reports agreement percentage
5. Exits with code 0 (PASS >95%) or 1 (FAIL <95%)

**Time**: ~2 minutes

**Output files**:
- `docs/reports/qdrant-postgres-mismatch-debug.json` (machine-readable)
- `docs/reports/qdrant-postgres-mismatch-debug.md` (human-readable)

---

## If Exit Code = 0 (PASS: Agreement >95%)

✅ Identity is consistent

**Next steps** (execute in order):
```bash
npm run atlas:scope:whole                      # Phase 1: Scope
npm run atlas:packets:whole:dry                # Phase 2: Packets dry (review)
npm run atlas:packets:whole:apply              # Phase 3: Packets apply
npm run atlas:turbovec:export                  # Phase 4: TurboVec export
npm run atlas:turbovec:smoke                   # Phase 5: TurboVec smoke
npm run atlas:qdrant:whole-sync:dry            # Phase 6: Qdrant sync dry
npm run atlas:retrieval:e2e                    # Phase 7: E2E retrieval
```

Then:
```bash
# Higher-hop Neo4j enrichment (Phase E, Lane 1)
# (script to be created)

# Autoencoder 768→64 (Phase E, Lane 2)
# (script to be created)

# SOM 20×20 (Phase E, Lane 3)
# (script to be created)

# Karpathy reindex (Phase E, Lane 4)
# (script to be created)

# Gemma4 topology-aware planning (Phase E, Lane 5)
# (integration point with ACE)
```

---

## If Exit Code = 1 (FAIL: Agreement <95%)

❌ Identity drift detected

**DO NOT PROCEED with**:
- ❌ Autoencoder training (will learn drift)
- ❌ SOM computation (will inherit corruption)
- ❌ Neo4j enrichment (will amplify mismatches)
- ❌ Karpathy reindex (blend will be corrupted)

**Instead**:
1. Read the mismatch report:
   ```bash
   cat docs/reports/qdrant-postgres-mismatch-debug.md
   ```

2. Identify which fields are drifting (packet_key vs feature_id vs source_ref)

3. Trace when drift occurred (which ingestion phase?)

4. Audit upsert logic in the mismatched path

5. Re-sync affected packets from Postgres to Qdrant

6. Re-run reconciliation:
   ```bash
   npm run atlas:debug:qdrant-postgres
   ```

7. Once agreement >95%, proceed with Phase D gates

---

## Prerequisites (Verify First)

```bash
# Postgres running
docker ps | grep postgres

# Qdrant running
curl http://localhost:6333/

# Node.js and npm available
node --version
npm --version

# Dependencies installed
npm list pg qdrant-client
```

---

## Success Looks Like

### PASS (Exit Code 0)
```
[INFO] === Qdrant ↔ Postgres Identity Reconciliation ===
[INFO] Fetching 50 random points from Qdrant...
[INFO] Fetched 50 points
[INFO] Fetching Postgres packets for 50 source_refs...
[INFO] Fetched 50 packets from Postgres
[INFO] Reconciling 50 Qdrant points with Postgres packets...

[INFO] [OK] src/lib/server/auth.ts
[INFO] [OK] src/lib/server/cache.ts
...

[INFO] === Summary ===
[INFO] Total points sampled: 50
[INFO] Agreements: 48
[INFO] Mismatches: 2
[INFO] Agreement %: 96.0%
[INFO] GATE: ✅ PASS (>95%)

[INFO] JSON report: docs/reports/qdrant-postgres-mismatch-debug.json
[INFO] Markdown report: docs/reports/qdrant-postgres-mismatch-debug.md

# Exit code: 0
```

### FAIL (Exit Code 1)
```
[INFO] === Qdrant ↔ Postgres Identity Reconciliation ===
...
[MISMATCH] src/lib/server/api.ts: packet_key, feature_id
[MISMATCH] src/lib/server/db.ts: source_ref
...

[INFO] === Summary ===
[INFO] Total points sampled: 50
[INFO] Agreements: 35
[INFO] Mismatches: 15
[INFO] Agreement %: 70.0%
[INFO] GATE: ❌ FAIL (<95%)

[WARN] Investigation required:
[WARN] 1. Check which fields are drifting
[WARN] 2. Trace when drift occurred
[WARN] 3. Audit upsert logic
[WARN] 4. Re-sync from Postgres
[WARN] 5. Re-run reconciliation

# Exit code: 1
```

---

## The Gate

**One question**: Are Qdrant and Postgres agreeing on packet identity?

**If yes**: Execute Phase D gates → Phase E enrichment → Topology-aware agent OS

**If no**: Fix identity drift first → Then proceed

---

## Files Reference

| File | Purpose |
|------|---------|
| `scripts/atlas/debug-qdrant-postgres-mismatch.mjs` | The reconciliation script (434 lines) |
| `docs/reports/qdrant-postgres-mismatch-debug.json` | Generated: machine-readable report |
| `docs/reports/qdrant-postgres-mismatch-debug.md` | Generated: human-readable report |
| `npm run atlas:debug:qdrant-postgres` | Run reconciliation (50 samples) |
| `npm run atlas:debug:qdrant-postgres:verbose` | Run with detailed output |

---

## The Principle

**Identity first. Enrichment second.**

Don't train models on corrupted data. Don't enrich with wrong neighbors. Don't rank with false authority.

Verify truth at the foundation. Build topology on solid ground.

---

**Run it now.**
```bash
npm run atlas:debug:qdrant-postgres
```

**Report back**: Exit code (0 or 1) + screenshot of the final summary.

Then we know whether Phase D gates are safe to execute or whether identity drift needs investigation first.
