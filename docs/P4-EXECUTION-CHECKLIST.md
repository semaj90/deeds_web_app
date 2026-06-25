# P4 Execution Checklist: SOM Topology Fix + Proof-of-Truth

**Status**: Ready to Execute (Session 81)  
**Estimated Duration**: ~30 minutes total  
**Owner**: James Woodard  
**Date**: 2026-06-25

---

## Pre-Flight Checks

### 1. Verify Services are Running
```bash
# Neo4j: Check connectivity
docker ps | grep neo4j
# Should show: legal-ai-neo4j (Up)

# PostgreSQL: Check connectivity
docker ps | grep postgres
# Should show: legal-ai-postgres (Up)

# Redis: Check connectivity
docker ps | grep redis
# Should show: legal-ai-redis (Up)

# Ollama: Check inference services
curl http://127.0.0.1:11434/api/tags
# Should return: { "models": [ { "name": "embeddinggemma:latest" }, ... ] }

# Gemma4 llama-server (if using TurboQuant)
curl http://127.0.0.1:8090/v1/models
# Should return: { "object": "list", "data": [ { "id": "gemma4-*", ... } ] }
```

### 2. Verify SOM Cells Exist in Neo4j
```bash
docker exec legal-ai-neo4j cypher-shell -u neo4j -p PASSWORD <<'CYPHER'
MATCH (c:SOMCell)
RETURN count(c) AS cell_count,
       min(c.x) AS min_x, max(c.x) AS max_x,
       min(c.y) AS min_y, max(c.y) AS max_y
LIMIT 1;
CYPHER
# Expected: cell_count = 400, min_x = 0, max_x = 19, min_y = 0, max_y = 19
```

### 3. Verify atlas_packet_registry Exists
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  "SELECT COUNT(*) as packet_count FROM atlas_packet_registry LIMIT 1;"
# Expected: 18047 (or close)
```

---

## Execution Steps

### Step 1: Fix SOM Grid Topology (5 minutes)

**Command**:
```bash
npm run atlas:p4:topology:fix
```

**Expected Output**:
```
🔗 Connecting to Neo4j...
  ✓ Connected

🔍 [P4] Checking existing SOM topology...
  ✓ SOMCell nodes found: 400
  ✓ X range: [0, 19]
  ✓ Y range: [0, 19]
  ✓ Existing SOM_GRID_NEIGHBOR edges: 0

⚙️  [P4] Creating Moore neighborhood edges...
  ✓ SOM_GRID_NEIGHBOR edges created: ~1200

📊 [P4] Topology verification...
  ✓ Total SOM cells: 400
  ✓ Average neighbors per cell: 6.50
  ✓ Min neighbors (corners): 3
  ✓ Max neighbors (center): 8
  ✓ Total directed edges: ~2400

✅ P4: SOM Grid Topology FIXED

📝 Next Steps:
   1. Run: npm run atlas:p4:pagerank:apply
   2. Verify PageRank scores are discriminative (not all 0.15)
   3. Run: npm run atlas:p4:attention (recompute attention)
   4. Run: npm run atlas:p4:karpathy (recompute blend)
```

**Verification**:
```bash
# Verify edges were created
docker exec legal-ai-neo4j cypher-shell -u neo4j -p PASSWORD \
  "MATCH ()-[r:SOM_GRID_NEIGHBOR]->() RETURN count(r) AS edge_count;"
# Expected: ~2400 directed edges
```

---

### Step 2: Recompute PageRank (10 minutes)

**Command**:
```bash
npm run atlas:p4:pagerank:apply
```

**Expected Behavior**:
- Runs Neo4j GDS PageRank algorithm on SOM_GRID_NEIGHBOR subgraph
- Writes scores to `atlas_som_cell_scores` table
- Caches in Redis at `atlas:pagerank:som:scores`

**Verification**:
```bash
# Check that scores are now DISCRIMINATIVE (not all 0.15)
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  "SELECT 
    COUNT(DISTINCT pagerank_score) as unique_scores,
    MIN(pagerank_score) as min_score,
    MAX(pagerank_score) as max_score,
    AVG(pagerank_score) as avg_score
  FROM atlas_som_cell_scores;"

# Expected: unique_scores > 50, min_score < 0.15, max_score > 0.15
```

**Expected Output Example**:
```
unique_scores | min_score | max_score | avg_score
---|---|---|---
127 | 0.078 | 0.243 | 0.150
```

---

### Step 3: Recompute Attention Scores (5 minutes)

**Command**:
```bash
npm run atlas:p4:attention
```

**Expected Behavior**:
- Recomputes attention-weighted scoring for SOM cells
- Writes to `atlas_som_cell_attention_scores` table
- Caches in Redis at `atlas:attention:som:scores`

**Verification**:
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  "SELECT 
    COUNT(*) as attention_score_count,
    AVG(attention_score) as avg_attention,
    MAX(attention_score) as max_attention
  FROM atlas_som_cell_attention_scores;"

# Expected: attention_score_count = 400
```

---

### Step 4: Recompute Karpathy Authority Blend (5 minutes)

**Command**:
```bash
npm run atlas:p4:karpathy:apply
```

**Expected Behavior**:
- Blends: 0.40·PageRank + 0.30·Attention + 0.20·Frequency + 0.10·Provenance
- Writes to `atlas_som_cell_karpathy_scores` table
- Caches in Redis at `atlas:karpathy:som:scores`

**Verification**:
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  "SELECT 
    COUNT(*) as karpathy_count,
    AVG(karpathy_score) as avg_blend,
    MIN(karpathy_score) as min_blend,
    MAX(karpathy_score) as max_blend
  FROM atlas_som_cell_karpathy_scores;"

# Expected: karpathy_count = 400, scores are discriminative (not all identical)
```

---

### Step 5: Run P4 Proof-of-Truth Orchestrator (40 seconds)

**Command**:
```bash
npm run atlas:p4:proof
```

**Expected Output**:
```
═══════════════════════════════════════════════════════════════
🎯 P4 PROOF-OF-TRUTH ORCHESTRATOR
═══════════════════════════════════════════════════════════════
Timestamp: 2026-06-25T...
Proofs dir: .proofs/p4

🔄 Executing 4 parallel lanes...

✅ Lane 1: P0: Identity Frozen
   Duration: Xms
   Status: PASS (exit code 0)
   ✓ P0.1-Lineage-Frozen
      Requirement: All 3,251 packets have stable packet_key
   ✓ P0.2-Directory-Stable
      Requirement: Zero directory path duplicates
   ✓ P0.3-Cold-Storage-Manifest
      Requirement: Cold storage backup consistent

✅ Lane 2: P1: Agentic Error Fixing
   Duration: Xms
   Status: PASS (exit code 0)
   ✓ P1-Error-Audit
   ✓ P1-Error-Plan
   ✓ P1-Error-Apply

✅ Lane 3: P2: Rust N-API Parser
   Duration: Xms
   Status: PASS (exit code 0)
   ✓ P2-Rust-Build
   ✓ P2-N-API-Addon
   ✓ P2-TypeScript-Bridge

✅ Lane 4: P4: Higher-Hop + Karpathy
   Duration: Xms
   Status: PASS (exit code 0)
   ✓ P3-Qdrant-v2-Payloads
   ✓ P4-SOM-Topology
   ✓ P4-Karpathy-Authority

🔐 GLOBAL GATES (P0-P4 Completion)
   ✅ P0-Complete
      Identity frozen + lineage verified
   ✅ P1-Complete
      Error audit/plan/apply infrastructure ready
   ✅ P2-Complete
      Rust N-API addon built and callable
   ✅ P3P4-Complete
      Qdrant v2 + Higher-hop + Karpathy authority wired

═══════════════════════════════════════════════════════════════
🎉 P0-P4 PROOF-OF-TRUTH: PASS
Total Duration: 41.3s
═══════════════════════════════════════════════════════════════

📝 Manifest saved: .proofs/p4/manifest-2026-06-25-...json
```

**Exit Code**: `0` = SUCCESS

---

## Post-Execution Verification

### Verification Query: All P4 Gates

```bash
# Run this to confirm all P4 data is correct

docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db <<'SQL'
-- P4 Gate 1: SOM topology edges exist (Neo4j side)
-- Manual check via orchestrator

-- P4 Gate 2: PageRank scores are discriminative
SELECT 
  'PageRank (Gate 2)' as gate_name,
  COUNT(*) as cell_count,
  COUNT(DISTINCT pagerank_score) as unique_scores,
  MIN(pagerank_score) as min_score,
  MAX(pagerank_score) as max_score
FROM atlas_som_cell_scores;

-- P4 Gate 3: Attention scores computed
SELECT 
  'Attention (Gate 3)' as gate_name,
  COUNT(*) as cell_count,
  COUNT(DISTINCT attention_score) as unique_scores,
  AVG(attention_score) as avg_attention
FROM atlas_som_cell_attention_scores;

-- P4 Gate 4: Karpathy blend complete
SELECT 
  'Karpathy Blend (Gate 4)' as gate_name,
  COUNT(*) as cell_count,
  COUNT(DISTINCT karpathy_score) as unique_scores,
  AVG(karpathy_score) as avg_blend,
  MIN(karpathy_score) as min_blend,
  MAX(karpathy_score) as max_blend
FROM atlas_som_cell_karpathy_scores;

-- P4 Overall: All SOM cells have complete scoring
SELECT 
  COUNT(*) as total_cells,
  COUNT(CASE WHEN s.pagerank_score IS NOT NULL THEN 1 END) as cells_with_pagerank,
  COUNT(CASE WHEN a.attention_score IS NOT NULL THEN 1 END) as cells_with_attention,
  COUNT(CASE WHEN k.karpathy_score IS NOT NULL THEN 1 END) as cells_with_karpathy
FROM atlas_som_cell_scores s
LEFT JOIN atlas_som_cell_attention_scores a ON s.som_cell_id = a.som_cell_id
LEFT JOIN atlas_som_cell_karpathy_scores k ON s.som_cell_id = k.som_cell_id;
SQL

# Expected final row:
# total_cells | cells_with_pagerank | cells_with_attention | cells_with_karpathy
# 400         | 400                 | 400                  | 400
```

### Verification Query: Redis Cache

```bash
# Check all P4 scores are cached in Redis

docker exec legal-ai-redis redis-cli <<'REDIS'
HLEN atlas:pagerank:som:scores
HLEN atlas:attention:som:scores
HLEN atlas:karpathy:som:scores
REDIS

# Expected: 400, 400, 400
```

---

## Troubleshooting

### Issue: SOM cells not found
**Error**: `SOMCell nodes found: 0`
**Solution**:
1. Verify Neo4j container is running: `docker ps | grep neo4j`
2. Check if SOM was created: `docker exec legal-ai-neo4j cypher-shell -u neo4j -p PASSWORD "MATCH (c:SOMCell) RETURN count(c);"`
3. If 0: Run SOM training script first

### Issue: Edges already exist
**Error**: `Existing SOM_GRID_NEIGHBOR edges: N > 0`
**Solution**: Script detects existing edges and skips creation (correct behavior). Continue to Step 2.

### Issue: PageRank scores still uniform (all 0.15)
**Error**: `SELECT COUNT(DISTINCT pagerank_score) FROM atlas_som_cell_scores` returns 1
**Solution**:
1. Verify edges were created: `docker exec legal-ai-neo4j cypher-shell ... "MATCH ()-[r:SOM_GRID_NEIGHBOR]->() RETURN count(r);"`
2. Clear Neo4j GDS algorithm cache: Manual cache clear via neo4j-admin
3. Re-run: `npm run atlas:p4:pagerank:apply`

### Issue: Neo4j authentication fails
**Error**: `The client is unauthorized due to authentication failure`
**Solution**:
```bash
# Set credentials in environment
export NEO4J_USER=neo4j
export NEO4J_PASSWORD=your_password
npm run atlas:p4:topology:fix
```

---

## Success Criteria

**P4 Completion = All 5 steps execute without errors**

| Step | Command | Expected Duration | Exit Code |
|------|---------|------|-----------|
| 1. Topology Fix | `npm run atlas:p4:topology:fix` | ~5m | 0 |
| 2. PageRank | `npm run atlas:p4:pagerank:apply` | ~10m | 0 |
| 3. Attention | `npm run atlas:p4:attention` | ~5m | 0 |
| 4. Karpathy | `npm run atlas:p4:karpathy:apply` | ~5m | 0 |
| 5. Proof | `npm run atlas:p4:proof` | ~40s | 0 |
| **TOTAL** | **All steps** | **~25m** | **0** |

---

## After P4: Next Phases

### P5: GPU Acceleration Health (2 hours)
```bash
npm run atlas:p5:audit --verbose
# Checks: GPU availability, CUDA compatibility, N-API addon loading
```

### P6: Training Scripts (20 hours)
```bash
npm run atlas:p6:provision
# Creates: autoencoder training, SOM training, latent backfill scripts
```

### P7: Export Pipeline (42 hours)
```bash
npm run atlas:p7:provision
# Creates: QLoRA training, PPO reward modeling, GGUF quantization
```

---

**Reference**: [Session 81 Continuation Guide](./SESSION-81-CONTINUATION-GUIDE.md)  
**Proof Directory**: `.proofs/p4/manifest-*.json`  
**Timestamp**: Session 81, June 25, 2026
