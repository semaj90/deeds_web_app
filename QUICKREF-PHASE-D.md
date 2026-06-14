# Phase D Quick Reference

**Single action**: 
```bash
npm run atlas:debug:qdrant-postgres
```

**What it checks**: Qdrant ↔ Postgres identity consistency (50 random points)

**Gate**: `agreement > 95%`

---

## Outcomes

| Exit Code | Meaning | Action |
|-----------|---------|--------|
| 0 | PASS (>95%) | Proceed with Phase D gates |
| 1 | FAIL (<95%) | Investigate identity drift |

---

## If PASS (0)

Execute Phase D gates:
```bash
npm run atlas:scope:whole              # 1. Scope
npm run atlas:packets:whole:dry        # 2. Packets dry (review)
npm run atlas:packets:whole:apply      # 3. Packets apply
npm run atlas:turbovec:export          # 4. TurboVec export
npm run atlas:turbovec:smoke           # 5. TurboVec smoke
npm run atlas:qdrant:whole-sync:dry    # 6. Qdrant sync dry
npm run atlas:retrieval:e2e            # 7. E2E retrieval
```

Then Phase E enrichment:
- Neo4j higher-hop edges
- Autoencoder 768→64
- SOM 20×20
- Karpathy reindex
- Gemma4 topology planning

---

## If FAIL (1)

Read the report:
```bash
cat docs/reports/qdrant-postgres-mismatch-debug.md
```

**Do NOT**:
- ❌ Train autoencoder (will learn drift)
- ❌ Build SOM (will inherit corruption)
- ❌ Enrich Neo4j (will amplify mismatches)
- ❌ Compute Karpathy (will rank wrong packets)

**Instead**:
1. Identify drifting fields
2. Trace when drift occurred
3. Audit upsert logic
4. Re-sync from Postgres
5. Re-run reconciliation

---

## The Principle

**Identity first. Enrichment second.**

Don't build topology on corrupted identity.

---

## Files

- Script: `scripts/atlas/debug-qdrant-postgres-mismatch.mjs`
- Report (JSON): `docs/reports/qdrant-postgres-mismatch-debug.json`
- Report (MD): `docs/reports/qdrant-postgres-mismatch-debug.md`

---

## Now

```bash
npm run atlas:debug:qdrant-postgres
echo $?
```

Check exit code. That tells you everything.
