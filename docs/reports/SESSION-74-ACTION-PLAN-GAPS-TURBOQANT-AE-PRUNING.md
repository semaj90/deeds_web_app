# Session 74+ Action Plan — TurboQuant + AE + Canonical Pruning

**Date**: June 23, 2026 (Session 74 end)  
**Objective**: Close gaps between Neo4j graph, Graphify JSON, and canonical file pruning  
**Timeline**: Phases ready for Session 75+ execution  
**Blocking**: None (all infrastructure ready)

---

## Quick Gap Summary

| Gap | Current | Target | Blocker | Solution |
|-----|---------|--------|---------|----------|
| Neo4j nodes | 17,995 | 18,829 (+834) | No | P4 Phase 1 (Directory + Feature nodes) |
| Neo4j edges | 12,944 | 40,000+ (+27,056) | No | P4 Phase 2-3 (IMPLEMENTS_FEATURE, IN_DIRECTORY, SOM) |
| Tree node linkage | Postgres only | Neo4j + Graphify | No | Join atlas_tree_nodes + export JSON |
| AE 64-dim latents | None | 17,995 vectors | No | PyTorch training (post-P4) |
| Gemma4 summaries | None | 17,995 summaries | No | PowerShell batch script (existing?) |
| Canonical pruning | 15GB bloat | 250MB canonical | No | MapReduce join + safe deletion |

---

## Phase 1: MapReduce Join for Canonical Packets (Session 75)

**Goal**: Create `canonical_packets.ndjson` with complete source_ref → feature_id → tree_node_id lineage

### Data Flow

```
Postgres atlas_packets (17,995)
  ├─ packet_key, source_ref, feature_id, feature_label, directory_path
  └─ file_path, function_symbol, community_id, som_cluster

   ↓ [JOIN on feature_id]

Postgres atlas_feature_labels (~512)
  ├─ feature_label, community_id, created_at
  └─ ...

   ↓ [JOIN on packet_key]

Postgres atlas_tree_nodes (8,823)
  ├─ tree_node_id, parent_id, depth, node_type (doc/chunk)
  └─ summary, created_at

   ↓ [GROUP BY feature_id, directory_path, community_id]

Output: canonical_packets.ndjson (17,995 lines, ~120MB)
  {
    "packet_key": "ace:packet:auth:001",
    "source_ref": "src/lib/server/auth.ts",
    "feature_id": "auth.sessions",
    "feature_label": "Authentication Sessions",
    "directory_path": "src/lib/server",
    "file_path": "src/lib/server/auth.ts",
    "function_symbol": "validateSession",
    "community_id": "comm:auth:001",
    "som_cluster": "som:g020r005",
    "tree_node_id": "tree:chunk:auth:001",
    "tree_depth": 3,
    "tree_parent": "tree:doc:auth",
    "confidence": 0.95,
    "created_at": "2026-06-23T12:00:00Z"
  }
```

### Implementation Options

**Option A: Node.js MapReduce** (fastest, can run on main thread)

```javascript
// scripts/atlas/canonical-packets-mapreduce.mjs
import pg from 'pg';
import fs from 'fs';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function mapReduceCanonical() {
  console.log('Map Phase: Load all packets...');
  const packets = await pool.query(
    'SELECT * FROM atlas_packets'
  );
  const featureMap = new Map(); // feature_id → feature_label
  
  console.log('Load Feature Labels...');
  const features = await pool.query(
    'SELECT DISTINCT feature_id, feature_label FROM atlas_packets WHERE feature_id IS NOT NULL'
  );
  features.rows.forEach(f => featureMap.set(f.feature_id, f.feature_label));
  
  console.log('Load Tree Nodes...');
  const treeMap = new Map(); // packet_key → tree_node_id
  const treeNodes = await pool.query(
    'SELECT * FROM atlas_tree_nodes WHERE referenced_packet_key IS NOT NULL'
  );
  treeNodes.rows.forEach(t => treeMap.set(t.referenced_packet_key, t.id));
  
  console.log('Reduce Phase: Join and output...');
  const output = fs.createWriteStream('canonical_packets.ndjson');
  
  for (const packet of packets.rows) {
    const canonical = {
      packet_key: packet.packet_key,
      source_ref: packet.source_ref,
      feature_id: packet.feature_id,
      feature_label: featureMap.get(packet.feature_id),
      directory_path: packet.directory_path,
      file_path: packet.file_path,
      function_symbol: packet.function_symbol,
      community_id: packet.community_id,
      som_cluster: packet.som_cluster,
      tree_node_id: treeMap.get(packet.packet_key),
      confidence: 0.95,
      created_at: new Date().toISOString()
    };
    output.write(JSON.stringify(canonical) + '\n');
  }
  output.end();
  
  console.log('✅ canonical_packets.ndjson written');
  await pool.end();
}

mapReduceCanonical();
```

**Option B: SQL + Drizzle** (more reliable, uses DB aggregation)

```sql
-- scripts/atlas/canonical-packets-join.sql
SELECT
  ap.packet_key,
  ap.source_ref,
  ap.feature_id,
  ap.feature_label,
  ap.directory_path,
  ap.file_path,
  ap.function_symbol,
  ap.community_id,
  ap.som_cluster,
  atn.id AS tree_node_id,
  atn.depth AS tree_depth,
  atn.parent_id AS tree_parent,
  0.95::float AS confidence,
  ap.created_at
FROM atlas_packets ap
LEFT JOIN atlas_tree_nodes atn ON ap.packet_key = atn.referenced_packet_key
ORDER BY ap.packet_key
LIMIT 17995;
```

**Execution**:
```bash
npm run atlas:canonical:mapreduce         # Option A (Node.js)
# OR
npm run atlas:canonical:sql > canonical_packets.ndjson  # Option B (SQL)
```

---

## Phase 2: Validate Graphify JSON Export (Session 75)

**Goal**: Export Neo4j post-P4 to JSON and compare against canonical_packets.ndjson

### Steps

**2.1 Execute P4 Neo4j Redesign** (60 min)
- Phase 1: Identity nodes (Directory, Feature)
- Phase 2: Topology edges (IMPLEMENTS_FEATURE, IN_DIRECTORY)
- Phase 3: Archive old topology (SIMILAR_TOPOLOGY → ARCHIVED_TOPOLOGY)

**2.2 Export Neo4j Graph to JSON**

```cypher
// neo4j-export-graphify.cypher
MATCH (n)
OPTIONAL MATCH (n)-[r]->(m)
RETURN {
  nodes: COLLECT(DISTINCT {
    id: n.id,
    label: labels(n)[0],
    type: labels(n)[0],
    properties: properties(n)
  }),
  edges: COLLECT(DISTINCT {
    source: startNode(r).id,
    target: endNode(r).id,
    type: type(r),
    properties: properties(r)
  })
} AS graphify
```

**2.3 Compare JSON Schemas**

```javascript
// scripts/atlas/compare-graphify-canonical.mjs
import { readFileSync } from 'fs';

const canonical = readFileSync('canonical_packets.ndjson', 'utf-8')
  .split('\n')
  .filter(l => l)
  .map(l => JSON.parse(l));

const graphifyJson = JSON.parse(readFileSync('neo4j-graphify-export.json', 'utf-8'));

// Gap analysis
const canonicalIds = new Set(canonical.map(p => p.packet_key));
const graphifyIds = new Set(graphifyJson.nodes.map(n => n.properties.packet_key));

console.log('Canonical nodes:', canonical.length);
console.log('Graphify nodes:', graphifyJson.nodes.length);
console.log('Gap (missing in Graphify):', 
  canonical.filter(p => !graphifyIds.has(p.packet_key)).length
);

// Field coverage
const fieldsNeeded = ['packet_key', 'source_ref', 'feature_id', 'tree_node_id', 'community_id'];
const coverage = {};
fieldsNeeded.forEach(field => {
  const count = canonical.filter(p => p[field]).length;
  coverage[field] = `${count}/${canonical.length} (${(100*count/canonical.length).toFixed(1)}%)`;
});
console.log('Field Coverage:', coverage);
```

---

## Phase 3: PyTorch AE Training (Session 75–76)

**Goal**: Train 768-dim → 64-dim autoencoder for memory-efficient packet representation

### Pipeline

```python
# scripts/ai/train_ae_som.py
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
import numpy as np
from qdrant_client import QdrantClient

# Step 1: Load embeddings from Qdrant
client = QdrantClient('http://localhost:6333')
points = client.scroll('codebase_chunks_768', limit=17995)[0]

embeddings = np.array([p.vector for p in points])  # (17995, 768)
packet_keys = np.array([p.payload['packet_key'] for p in points])

# Step 2: Load SOM assignments
som_assignments = load_som_clusters()  # (17995,) with values [0..399]
som_one_hot = torch.nn.functional.one_hot(
    torch.tensor(som_assignments), 
    num_classes=400
).float()

# Step 3: Create dataset
embeddings_tensor = torch.tensor(embeddings, dtype=torch.float32)
dataset = TensorDataset(embeddings_tensor, som_one_hot)
loader = DataLoader(dataset, batch_size=64, shuffle=True)

# Step 4: Define model
class SOMAutoencoder(nn.Module):
    def __init__(self):
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Linear(768, 256),
            nn.ReLU(),
            nn.Linear(256, 128),
            nn.ReLU(),
            nn.Linear(128, 64)
        )
        self.som_project = nn.Linear(64, 400)
        self.decoder = nn.Sequential(
            nn.Linear(400, 256),
            nn.ReLU(),
            nn.Linear(256, 128),
            nn.ReLU(),
            nn.Linear(128, 768)
        )
    
    def forward(self, x):
        latent = self.encoder(x)
        som_cell = self.som_project(latent)
        recon = self.decoder(som_cell)
        return recon, som_cell, latent

model = SOMAutoencoder()
optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
criterion_recon = nn.MSELoss()
criterion_som = nn.MSELoss()

# Step 5: Training loop
for epoch in range(100):
    total_loss = 0
    for batch_emb, batch_som in loader:
        recon, som_cell, latent = model(batch_emb)
        
        loss_recon = criterion_recon(recon, batch_emb)
        loss_som = criterion_som(som_cell, batch_som) * 0.1
        loss = loss_recon + loss_som
        
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        
        total_loss += loss.item()
    
    if epoch % 10 == 0:
        print(f"Epoch {epoch}: Loss={total_loss / len(loader):.4f}")

# Step 6: Extract and cache latents
model.eval()
with torch.no_grad():
    latents = model.encoder(embeddings_tensor).numpy()  # (17995, 64)

# Step 7: Save to Redis
import redis
r = redis.Redis(host='localhost', port=6379)
for i, key in enumerate(packet_keys):
    latent_bytes = latents[i].astype(np.float32).tobytes()
    r.hset('ae:latent:64', key, latent_bytes)

print(f"✅ Cached {len(packet_keys)} 64-dim latents in Redis")
```

**Expected Performance**:
- Training time: 15–30 min (on RTX 3060 Ti)
- Inference time: <1ms per packet (CPU)
- Cache size: 17,995 × 64 × 4 bytes = 4.6MB (vs 13.7MB for 768-dim)
- Reconstruction loss: <0.05 MSE (acceptable)

---

## Phase 4: Gemma4 Batch Summarization (Session 76)

**Goal**: Generate token-efficient 1-2 sentence summaries for all 17,995 packets

### PowerShell Script Template (Needs Creation or Discovery)

```powershell
# scripts/generate-packet-summaries.ps1

param(
    [int]$BatchSize = 50,
    [int]$MaxTokens = 50,
    [string]$Model = "gemma4-rotorquant:latest",
    [string]$LlamaUrl = "http://127.0.0.1:8090",
    [string]$InputFile = "canonical_packets.ndjson",
    [string]$OutputFile = "canonical_packets_with_summaries.ndjson",
    [switch]$DryRun,
    [switch]$Resume
)

# Load packets
Write-Host "Loading packets from $InputFile..."
$packets = @()
foreach ($line in Get-Content $InputFile) {
    if ($line.Trim()) {
        $packets += ($line | ConvertFrom-Json)
    }
}

Write-Host "Total packets: $($packets.Count)"

# Skip if resuming
$startIndex = 0
if ($Resume -and (Test-Path $OutputFile)) {
    $resumeCount = (Get-Content $OutputFile | Measure-Object -Line).Lines
    $startIndex = $resumeCount
    Write-Host "Resuming from packet $startIndex"
}

# Batch summarization
$batch = @()
$processedCount = 0

for ($i = $startIndex; $i -lt $packets.Count; $i++) {
    $packet = $packets[$i]
    $batch += @{
        packet_key = $packet.packet_key
        prompt = "Summarize for search (1-2 sentences, <50 tokens): " +
                 "$($packet.feature_label) in $($packet.source_ref) [$($packet.function_symbol)]"
    }
    
    if ($batch.Count -ge $BatchSize -or $i -eq $packets.Count - 1) {
        # Call Gemma4 with batch
        Write-Host "Processing batch of $($batch.Count) packets..."
        
        if (-not $DryRun) {
            foreach ($item in $batch) {
                $response = Invoke-RestMethod `
                    -Uri "$LlamaUrl/v1/chat/completions" `
                    -Method POST `
                    -ContentType "application/json" `
                    -Body (ConvertTo-Json @{
                        model = $Model
                        messages = @(@{
                            role = "user"
                            content = $item.prompt
                        })
                        max_tokens = $MaxTokens
                        stream = $false
                        temperature = 0.3
                    })
                
                # Attach summary to packet
                $idx = $packets | Where-Object { $_.packet_key -eq $item.packet_key }
                $idx.summary = $response.choices[0].message.content
                
                # Write to output file
                $idx | ConvertTo-Json | Add-Content $OutputFile
                $processedCount++
                
                Write-Progress -Activity "Summarizing packets" `
                    -Status "$processedCount / $($packets.Count)" `
                    -PercentComplete ([math]::Min(100, 100 * $processedCount / $packets.Count))
            }
        }
        else {
            Write-Host "DRY RUN: Would summarize $($batch.Count) packets"
            $batch | ForEach-Object { $_.prompt | Out-Host }
        }
        
        $batch = @()
    }
}

Write-Host "✅ Done. Output: $OutputFile with $processedCount summaries"
```

**Usage**:
```powershell
# Test with 10 packets
.\scripts\generate-packet-summaries.ps1 -BatchSize 10 -DryRun

# Full run (900K tokens ≈ 30 min on Gemma4)
.\scripts\generate-packet-summaries.ps1 -BatchSize 50

# Resume interrupted run
.\scripts\generate-packet-summaries.ps1 -Resume
```

**Token Budget**:
- 17,995 packets × 50 tokens/summary = 900,000 tokens
- Gemma4 on RTX 3060 Ti: ~100 tokens/sec → ~150 min (2.5 hours)
- With batch optimization: ~1.5 hours

---

## Phase 5: Canonical Pruning (Session 76–77)

**Goal**: Identify and safely delete non-canonical files, reduce repo bloat 15GB → 250MB

### Pruning Workflow

**5.1 Validation**

```javascript
// scripts/atlas/validate-canonical-coverage.mjs

const canonical = new Set(
  readFileSync('canonical_packets_with_summaries.ndjson', 'utf-8')
    .split('\n')
    .filter(l => l)
    .map(l => JSON.parse(l).packet_key)
);

const allFiles = globSync('src/**/*.ts', 'src/**/*.svelte');

const coverage = {
  canonical: 0,
  partial: 0,
  orphaned: 0,
  files: []
};

for (const file of allFiles) {
  const packets = extractPacketsFromFile(file);
  const matchCount = packets.filter(p => canonical.has(p.packet_key)).length;
  
  if (matchCount === packets.length) coverage.canonical++;
  else if (matchCount > 0) coverage.partial++;
  else coverage.orphaned++;
  
  coverage.files.push({
    file,
    total_packets: packets.length,
    canonical_packets: matchCount,
    safe_to_delete: matchCount === 0
  });
}

console.log(`Coverage: ${coverage.canonical} canonical, ${coverage.partial} partial, ${coverage.orphaned} orphaned`);
console.log(`Safe to delete: ${coverage.orphaned} files (${coverage.orphaned * 5}KB estimated)`);
```

**5.2 Safe Deletion**

```bash
# Generate deletion manifest
npm run atlas:canonical:manifest > deletion_manifest.json

# Review before committing
git diff deletion_manifest.json

# Apply deletion (with undo option)
npm run atlas:canonical:delete

# Tag and archive
git tag archive/orphaned-files-session-76
```

**Expected Reduction**:
- 17,995 canonical packets + summaries: ~120MB
- Canonical JSON exports (Neo4j + Graphify): ~100MB
- Supporting tables (tree nodes, features): ~30MB
- **Subtotal**: ~250MB (canonical)
- **Deleted**: ~14.75GB (82% reduction)

---

## Current PowerShell Script Status

### Known Scripts (Found)

- ✅ `scripts/launch-turboquant.ps1` — TurboQuant server launcher (mentioned in CLAUDE.md)
- ✅ `sveltekit-frontend/scripts/health/quick-health.ps1` — Health check
- ✅ Various setup/diagnostic scripts

### Missing/Needed

- ❌ `scripts/generate-packet-summaries.ps1` — **NEED TO CREATE** (Session 75)
- ❌ `scripts/canonical-packets-mapreduce.mjs` — **NEED TO CREATE** (Session 75)
- ❌ `scripts/validate-canonical-coverage.mjs` — **NEED TO CREATE** (Session 76)

---

## Execution Timeline

| Phase | Duration | Dependencies | Status |
|-------|----------|---|---|
| **P4** | 60 min | P3 (metadata sync) | ✅ Queued for Session 75 |
| **Phase 1: MapReduce** | 30 min | P4 complete | ⏳ Session 75 |
| **Phase 2: Graphify JSON** | 20 min | Phase 1 + P4 | ⏳ Session 75–76 |
| **Phase 3: AE Training** | 30 min | Qdrant live | ⏳ Session 76 |
| **Phase 4: Gemma4 Summaries** | 90 min | AE latents optional | ⏳ Session 76–77 |
| **Phase 5: Canonical Pruning** | 60 min | Phase 4 + validation | ⏳ Session 77 |
| **Total** | ~350 min (~6 hours) | Sequential | ✅ Ready to start |

---

## Key Files to Create/Update

| File | Purpose | Status |
|------|---------|--------|
| `scripts/generate-packet-summaries.ps1` | Gemma4 batch inference | ❌ Create |
| `scripts/atlas/canonical-packets-mapreduce.mjs` | MapReduce join | ❌ Create |
| `scripts/atlas/canonical-packets-join.sql` | SQL alternative | ❌ Create |
| `scripts/ai/train_ae_som.py` | PyTorch AE training | ❌ Create |
| `scripts/atlas/compare-graphify-canonical.mjs` | Gap analysis | ❌ Create |
| `scripts/atlas/validate-canonical-coverage.mjs` | Pruning validation | ❌ Create |
| `canonical_packets.ndjson` | MapReduce output | ❌ Generated |
| `canonical_packets_with_summaries.ndjson` | Post-Gemma4 | ❌ Generated |
| `neo4j-graphify-export.json` | Neo4j post-P4 export | ❌ Generated |

---

## Success Criteria

### Phase 1: MapReduce ✅
- [ ] `canonical_packets.ndjson` created with 17,995 entries
- [ ] All fields present: packet_key, source_ref, feature_id, tree_node_id
- [ ] Field coverage >= 95% across all critical fields

### Phase 2: Graphify JSON ✅
- [ ] Neo4j post-P4 exports to JSON successfully
- [ ] Node count: 18,829 (±100)
- [ ] Edge count: 40,000+ (±5,000)
- [ ] Gap analysis shows <5% coverage difference

### Phase 3: AE Training ✅
- [ ] Model converges (loss < 0.05)
- [ ] 17,995 64-dim latents cached in Redis
- [ ] Cache size < 5MB

### Phase 4: Gemma4 Summaries ✅
- [ ] All 17,995 packets have summaries
- [ ] Average summary length: 40–60 tokens
- [ ] Summaries are token-efficient and searchable

### Phase 5: Canonical Pruning ✅
- [ ] 17,995 packets fully mapped to files
- [ ] Deletion manifest created + reviewed
- [ ] Repo size reduced from 15GB to 250MB
- [ ] No functional code lost (all canonical)

---

## Conclusion

All gaps identified, all solutions designed, all scripts ready to implement. **No blockers** — P4 completion will unlock all downstream phases.

**Next Session Target**: Execute P4 + Phase 1 (MapReduce) in parallel for fast gap closure.

---

**Generated**: June 23, 2026 (Session 74 end)  
**Status**: ✅ **ACTION PLAN COMPLETE**  
**Ready for**: Session 75 execution
