# Current-Corpus Promotion Preflight 🟢

**Generated:** 2026-06-02T04:31:41.497Z
**Mode:** DRY-RUN — no mutations
**Overall:** 0 errors · 0 warnings · 0 info

---

## Corpus Inventory

### deep-import-edges.jsonl

| Metric | Count |
|--------|-------|
| Total edges | 81,136 |
| Resolved internal | 19,374 |
| External (EXTERNAL:*) | 61,762 |
| Dynamic imports | 4,721 |
| Re-exports | 1,868 |
| Unique sourceRefs | 15,730 |
| Backslash norm mismatches | **0** ✓ |

### codebase-graph.json

| Metric | Count |
|--------|-------|
| Files in array | 5,253 |
| Header claimed | 5,253 |
| Routes | 1,064 |
| Svelte components | 812 |
| Test files | 169 |
| With auth guard | 1,198 |
| With Zod validation | 1,330 |
| With Drizzle refs | 776 |
| Svelte 4 legacy | 0 |
| SSR-unsafe | 1 |
| Localhost hardcoded | 0 ✓ |
| Duplicate rels | **0** ✓ |

### Route Atlas

| Metric | Count |
|--------|-------|
| Routes tracked | 250 |
| Auth-required | 206 |
| With paired tests | 250 |
| Gapped / fail-open | 28 |
| Datastores referenced | ACE, Redis, Qdrant, Neo4j, TurboVec |

### Repo-Root Atlas

| Metric | Value |
|--------|-------|
| Files (repo-wide) | 34,792 |
| API count | 5,529 |
| Qdrant collections | codebase_chunks_768, codebase_chunks_64d, glyph_atlas, task_distillates, docs_chunks, error_notes |
| Import map entries | 50 |

---

## Promotion Candidates

### Postgres `parent_atlas_documents`

- **Candidates:** 2,148 rows
- **Est. size:** 5034 KB
- **Safe to promote:** ✅ Yes

### Qdrant `codebase_chunks_768`

- **Candidates:** 1,570 vectors
- **Dim:** 768
- **Ollama embed calls needed:** ~157 (batch-10)
- **Command:** `npm run graphify:semantic`

### Redis Hot SourceRef Packets

- **Candidates:** 200 keys (top-200 by fanIn)
- **Key pattern:** `ace:hot:sourceref:{sha8}`
- **TTL:** 24h
- **Est. memory:** ~160 KB

### Neo4j Edges

| Edge type | Count | Status |
|-----------|-------|--------|
| IMPORTS (from deep-import-edges) | 19,374 | Pending phase5 sync |
| HANDLES_ROUTE | 250 | Pending phase5 sync |
| USES_DB | 467 | ✅ Synced (phase3) |
| USES_TOOL | 1,032 | ✅ Synced (phase4) |

### SeaweedFS Blobs

- **Candidates:** 577 files (tests + large components)
- **Est. total:** ~40766 MB

---

## Blockers

✅ No blockers — corpus is ready for promotion.

---

## Next Commands

```bash
# 1. Close the sourceRef normalization gap (safe, in-place):
node scripts/atlas/normalize-sourcerefs.mjs --write

# 2. Promote to Postgres parent_atlas_documents (upsert-safe):
node scripts/atlas/promote-to-postgres.mjs --table parent_atlas_documents --dry-run
node scripts/atlas/promote-to-postgres.mjs --table parent_atlas_documents

# 3. Embed + upsert qdrant_codebase_chunks (batched, resumable):
npm run graphify:semantic

# 4. Write Redis hot sourceRef packets:
node scripts/atlas/load-parent-atlas-to-redis.mjs --hot-sourcerefs-only

# 5. Sync IMPORTS edges to Neo4j (phase5):
node scripts/atlas/phase5-neo4j-sync.mjs --dry-run
node scripts/atlas/phase5-neo4j-sync.mjs
```

---

*Report: `memory/agent-runs/current-corpus-promotion-preflight.json`*
