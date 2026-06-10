# Gate 2 Failure Diagnostic

**Issue**: neo4j-graph-enrich.mjs reported success but Qdrant payloads have 0% community_id

## Step-by-Step Diagnostic

### 1. Check if neo4j-graph-enrich ran at all
```bash
ls -lh sveltekit-frontend/memory/graphify/gds/*.json | tail -3
# Should show recent 2539fec52b3e.json from the apply run
```

### 2. Check what neo4j-graph-enrich Phase 5 said it did
```bash
jq '.result.phase_5_qdrant_patches' sveltekit-frontend/memory/graphify/gds/2539fec52b3e.json
# Should show patch counts like: {matched: 2681, total: 36005, ...}
```

### 3. Manually test Qdrant payload fetch
```bash
# Get one point ID from Qdrant
curl -s 'http://127.0.0.1:6333/collections/codebase_chunks_768/points?limit=1' | \
  jq '.result.points[0].id' > /tmp/point_id.txt

# Fetch that point's payload
POINT_ID=$(cat /tmp/point_id.txt)
curl -s "http://127.0.0.1:6333/collections/codebase_chunks_768/points/$POINT_ID" | \
  jq '.result.payload | keys'

# Look for: community_id should be in the list
```

### 4. Check Postgres for matching centroid_id
```sql
-- Are centroids being set in Postgres?
SELECT COUNT(DISTINCT centroid_id) as unique_centroids
FROM atlas_feature_map
WHERE centroid_id IS NOT NULL;

-- Should show ~700 distinct communities
```

### 5. Check Neo4j for communityId assignment
```bash
# Via HTTP API
curl -s -u neo4j:neo4j123 'http://127.0.0.1:7474/db/neo4j/tx' \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"statements":[{
    "statement":"MATCH (f:CodebaseFile) WHERE f.communityId IS NOT NULL RETURN COUNT(f) as nodes_with_community"
  }]}'

# Look for: nodes_with_community should be > 0
```

### 6. Find what neo4j-graph-enrich.mjs actually did (parse the output)
```bash
# Check the GDS phase 5 output in detail
cat > /tmp/check-phase5.js << 'JS'
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('sveltekit-frontend/memory/graphify/gds/2539fec52b3e.json', 'utf8'));

console.log('Phase 5 Results:');
console.log('  Type:', typeof data);
console.log('  Keys:', Object.keys(data).slice(0, 10));
console.log('  Has qdrant? ', 'qdrant' in data);
console.log('  Has patches?', data.qdrantPatches ? 'Yes' : 'No');

if (data.qdrantPatches) {
  console.log('\nQdrant Patches:');
  console.log(JSON.stringify(data.qdrantPatches, null, 2).slice(0, 500));
}
JS
node /tmp/check-phase5.js
```

## Most Likely Root Causes

### Case A: Phase 5 didn't run
**Indicator**: neo4j-graph-enrich.mjs exited before Phase 5
**Fix**: Check for errors in stdout/stderr from the apply run

### Case B: Qdrant patches ran but failed silently
**Indicator**: qdrantPatches shows 0 matched, 0 written
**Fix**: neo4j-graph-enrich.mjs Phase 5 has `catch(err) { /* skip */ }`
**Action**: Modify Phase 5 to throw on Qdrant errors

### Case C: Qdrant received patches but they didn't stick
**Indicator**: Patches reported successful but payloads still empty
**Fix**: Check Qdrant collection write permissions
**Verification**: Try manual payload update via HTTP
```bash
curl -X PATCH 'http://127.0.0.1:6333/collections/codebase_chunks_768/points' \
  -H 'Content-Type: application/json' \
  -d '{"points_selector":{"ids":[<POINT_ID>]},"payload":{"community_id":42}}'
```

### Case D: Cursor position reset between batches
**Indicator**: Only first batch patched successfully
**Fix**: Check neo4j-graph-enrich.mjs batch pagination logic

## Confirmation Test

After applying fix:
```bash
# Run gates again
node scripts/atlas/phase-2b-validation-gates.mjs --verify --verbose

# Gate 2 should now show:
# ✅ Qdrant Payload Coverage
#    8/10 points have community_id (80.0%) — target: 80%
```

## Files to Review

1. `scripts/atlas/neo4j-graph-enrich.mjs` lines 560-620 (Phase 5: Qdrant patching)
2. `scripts/atlas/neo4j-graph-enrich.mjs` lines 240-260 (Louvain community detection)
3. `sveltekit-frontend/memory/graphify/gds/2539fec52b3e.json` (Phase 5 output)

