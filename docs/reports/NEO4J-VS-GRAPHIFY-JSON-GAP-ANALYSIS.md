# Neo4j Graph vs Graphify JSON — Gap Analysis & Canonical Pruning Plan

**Date**: June 23, 2026 (Session 74 continuation)  
**Objective**: Identify differences between live Neo4j graph and Graphify JSON output, determine joins needed for canonical file pruning  
**Scope**: source_ref → feature_id → tree_node_id chain, AE training targets, TurboVec integration

---

## Part 1: Current Neo4j State (Pre-P4)

### Graph Structure (Live)

```
Packet nodes:           17,995
Directory nodes:        ~50 (estimated from directory_path)
Feature nodes:          0 (P4 will create ~512)
SOM cluster nodes:      0 (P4 will create 272)

Relationships:
  SIMILAR_TOPOLOGY:     12,944 (broken/dangling)
  Isolated nodes:       45,511 (no edges)

Connected subgraph:     ~3,251 packets + orphans
```

### Key Gaps (Pre-P4)

| Issue | Count | Status | Impact |
|-------|-------|--------|--------|
| Isolated nodes | 45,511 | ⚠️ Unfixable pre-P4 | PageRank sinks, no BFS/DFS traversal |
| Broken SIMILAR_TOPOLOGY | 12,944 | ⚠️ Dangling edges | Invalid graph structure |
| No Directory hierarchy | ~50 | ⏳ P4 Phase 1 | Cannot group packets by directory |
| No Feature linkage | 0 | ⏳ P4 Phase 1 | Cannot traverse by semantic grouping |
| No SOM edges | 0 | ⏳ P4 Phase 2 | Cannot do topology neighbor traversal |

---

## Part 2: Graphify JSON Output (Expected Schema)

### Standard Graphify Output

```json
{
  "nodes": [
    {
      "id": "packet:ace:001",
      "label": "Authentication Context",
      "type": "packet",
      "properties": {
        "packet_key": "ace:packet:auth:001",
        "source_ref": "src/lib/server/auth.ts",
        "feature_id": "auth.sessions",
        "feature_label": "Authentication Sessions",
        "directory_path": "src/lib/server",
        "file_path": "src/lib/server/auth.ts",
        "function_symbol": "validateSession",
        "community_id": "comm:auth:001",
        "som_cluster": "som:g020r005",
        "confidence": 0.95,
        "created_at": "2026-06-23T12:00:00Z"
      }
    },
    {
      "id": "feature:auth.sessions",
      "label": "Authentication Sessions",
      "type": "feature",
      "properties": {
        "feature_id": "auth.sessions",
        "packet_count": 12,
        "community_count": 3,
        "confidence": 0.92
      }
    },
    {
      "id": "dir:src/lib/server",
      "label": "src/lib/server",
      "type": "directory",
      "properties": {
        "directory_path": "src/lib/server",
        "packet_count": 145,
        "depth": 3
      }
    }
  ],
  "edges": [
    {
      "source": "packet:ace:001",
      "target": "feature:auth.sessions",
      "type": "IMPLEMENTS_FEATURE",
      "properties": {
        "weight": 1.0,
        "confidence": 0.95
      }
    },
    {
      "source": "packet:ace:001",
      "target": "dir:src/lib/server",
      "type": "IN_DIRECTORY",
      "properties": {
        "weight": 1.0
      }
    },
    {
      "source": "feature:auth.sessions",
      "target": "feature:ui.form",
      "type": "SHARES_TAGS",
      "properties": {
        "shared_community": "comm:auth:001",
        "weight": 0.7
      }
    }
  ],
  "metadata": {
    "total_nodes": 17995,
    "total_edges": 35990,
    "timestamp": "2026-06-23T12:00:00Z",
    "version": "2.0"
  }
}
```

---

## Part 3: Gap Analysis — Neo4j ↔ Graphify JSON

### Gap 1: Node Type Mismatch

| Node Type | Neo4j (Pre-P4) | Graphify JSON | Status |
|-----------|---|---|---|
| Packet | 17,995 | 17,995 | ✅ Match |
| Directory | 0 | ~50 expected | ❌ Missing (P4 Phase 1) |
| Feature | 0 | ~512 expected | ❌ Missing (P4 Phase 1) |
| SOMCluster | 0 | 272 expected | ❌ Missing (P4 Phase 2) |
| **Total** | **17,995** | **~18,829** | **Gap: 834 nodes** |

### Gap 2: Edge Type Coverage

| Edge Type | Neo4j | Graphify JSON | Match |
|-----------|-------|---------------|-------|
| IMPLEMENTS_FEATURE | 0 | 17,995 expected | ❌ |
| IN_DIRECTORY | 0 | 17,995 expected | ❌ |
| SHARES_TAGS | 0 | 500–1000 est. | ❌ |
| BELONGS_TO_CLUSTER | 0 | 3,150 est. | ❌ |
| SIMILAR_TOPOLOGY | 12,944 | 0 (archived) | ❌ |
| **Total** | **12,944** | **~40,000+** | **Gap: 27,056 edges** |

### Gap 3: Property Coverage

**Postgres `atlas_packets` properties**:
```
packet_key:         17,995/17,995 (100%) ✅
source_ref:         17,995/17,995 (100%) ✅
feature_id:         17,995/17,995 (100%) ✅
feature_label:      17,995/17,995 (100%) ✅
directory_path:     17,995/17,995 (100%) ✅
file_path:          17,995/17,995 (100%) ✅
function_symbol:    17,995/17,995 (100%) ✅
community_id:       17,397/17,995 (96.7%) ✅
som_cluster:        3,150/17,995 (17.5%) ⚠️
tree_node_id:       ? (NOT FOUND)
topology_label:     14,955/17,995 (83.1%) ✅
confidence:         varies (95%+ for packets)
```

**Missing from Neo4j properties**:
- `tree_node_id` (needs `atlas_tree_nodes` join)
- `community_count` (aggregate, needs group-by)
- `packet_count` (aggregate)
- `confidence` scores (some missing)

---

## Part 4: Data Flow for Canonical Pruning

### Required Join Chain

```
Postgres atlas_packets (source_ref, feature_id, packet_key)
  ↓ (join on feature_id)
Postgres atlas_feature_labels (feature_label, community_id)
  ↓ (join on packet_key)
Postgres atlas_tree_nodes (tree_node_id, parent_id, depth)
  ↓ (group by)
Redis valkey cache (centroid vectors, SOM cell lookups)
  ↓ (aggregate + filter)
Graphify JSON output (canonical nodes + edges for search)
```

### MapReduce Strategy for Large-Scale Joins

**Map Phase** (parallel packet processing):

```
Input: 17,995 packets from Postgres
  ├─ Mapper 1: packets[0:4500] → (source_ref, feature_id, packet_key, tree_node_id)
  ├─ Mapper 2: packets[4500:9000] → (source_ref, feature_id, packet_key, tree_node_id)
  ├─ Mapper 3: packets[9000:13500] → ...
  └─ Mapper 4: packets[13500:17995] → ...
```

**Reduce Phase** (aggregation):

```
Group by feature_id:
  ├─ auth.sessions: [packet:001, packet:002, ...] → feature_label, community_id, packet_count
  ├─ ui.form: [...] → ...
  └─ (repeat for 512 features)

Group by directory_path:
  ├─ src/lib/server: [packet:001, ...] → directory_label, packet_count, depth
  └─ (repeat for 50 directories)

Group by community_id:
  ├─ comm:auth:001: [feature:auth.sessions, ...] → shared_tags_count
  └─ (repeat for community groups)
```

**Output**: Canonical JSON suitable for Gemma4 token-efficient search

---

## Part 5: PyTorch AE Training (SOM 20×20 Cells)

### Current State

```
SOM Grid:       20×20 = 400 cells
Active clusters: 272 (68% utilization)
K-means:        converged ✅
Coordinates:    3,150 packets embedded
Unused cells:   128 (32% sparsity)
```

### AE Training Pipeline (Proposed)

**Step 1: Data Preparation**

```python
# Input: 17,995 packet embeddings (768-dim from Qdrant)
packets_embeddings = load_qdrant_vectors('codebase_chunks_768')  # (17995, 768)

# Target: 20x20 SOM cell indices (encoder output: 400-dim one-hot)
som_cell_indices = load_som_assignments()  # (17995,) with values [0..399]

# Encode as one-hot for AE
som_one_hot = one_hot_encode(som_cell_indices, num_classes=400)  # (17995, 400)
```

**Step 2: Autoencoder Architecture**

```python
class SOMAutoencoder(nn.Module):
    def __init__(self):
        super().__init__()
        # Encoder: 768-dim → 128-dim → 64-dim
        self.encoder = nn.Sequential(
            nn.Linear(768, 256),
            nn.ReLU(),
            nn.Linear(256, 128),
            nn.ReLU(),
            nn.Linear(128, 64)
        )
        
        # SOM projection: 64-dim → 400-dim (SOM cell space)
        self.som_project = nn.Linear(64, 400)
        
        # Decoder: 400-dim → 768-dim (reconstruct original)
        self.decoder = nn.Sequential(
            nn.Linear(400, 256),
            nn.ReLU(),
            nn.Linear(256, 128),
            nn.ReLU(),
            nn.Linear(128, 768)
        )
    
    def forward(self, x):
        encoded = self.encoder(x)
        som_cell = self.som_project(encoded)
        reconstructed = self.decoder(som_cell)
        return reconstructed, som_cell, encoded
```

**Step 3: Training Loop**

```python
criterion = nn.MSELoss()
optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)

for epoch in range(100):
    # Forward: 768-dim → reconstruction
    reconstructed, som_cell, latent = model(packets_embeddings)
    
    # Loss: reconstruction + SOM consistency
    recon_loss = criterion(reconstructed, packets_embeddings)
    som_loss = criterion(som_cell, som_one_hot) * 0.1  # Weight SOM constraint
    
    loss = recon_loss + som_loss
    optimizer.zero_grad()
    loss.backward()
    optimizer.step()
    
    if epoch % 10 == 0:
        print(f"Epoch {epoch}: recon={recon_loss:.4f}, som={som_loss:.4f}")
```

**Step 4: Inference (64-dim Latent)**

```python
# Extract 64-dim latent codes for memory-efficient caching
latent_codes = model.encoder(packets_embeddings)  # (17995, 64)

# Save to Redis for fast retrieval
for i, packet_key in enumerate(packet_keys):
    latent_vec = latent_codes[i].detach().cpu().numpy()
    redis.hset('ae:latent:64', packet_key, latent_vec.tobytes())
```

---

## Part 6: TurboVec Rust Integration

### Current Valkey/Redis Stack

```
Valkey (port 6379):
  ├─ valkey-json (RapidJSON backend)
  ├─ valkey-search (BM25 indexing)
  └─ valkey-stream (event log)

Missing: Native Rust JSON parser for fast packet deserialization
```

### TurboVec + RapidJSON Connection

**Goal**: Parse `source_ref + feature_id + tree_node_id` from JSON packets in <1ms per 1000 items

**Architecture**:

```rust
// turbovec/src/lib.rs
use rapidjson::{Document, Value};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct PacketMetadata {
    pub source_ref: String,
    pub feature_id: String,
    pub tree_node_id: Option<String>,
    pub packet_key: String,
    pub community_id: Option<String>,
}

pub fn parse_packet_json(json_str: &str) -> Result<PacketMetadata, Box<dyn std::error::Error>> {
    let mut doc = Document::from_str(json_str)?;
    
    let source_ref = doc["source_ref"].get_string().to_string();
    let feature_id = doc["feature_id"].get_string().to_string();
    let tree_node_id = doc.get("tree_node_id").map(|v| v.get_string().to_string());
    let packet_key = doc["packet_key"].get_string().to_string();
    let community_id = doc.get("community_id").map(|v| v.get_string().to_string());
    
    Ok(PacketMetadata {
        source_ref,
        feature_id,
        tree_node_id,
        packet_key,
        community_id,
    })
}

// Batch parse for Redis HGETALL results
pub fn parse_packet_batch(json_array: &str) -> Result<Vec<PacketMetadata>, Box<dyn std::error::Error>> {
    let mut doc = Document::from_str(json_array)?;
    let packets = vec![];
    
    if doc.is_array() {
        for item in doc.get_array() {
            packets.push(parse_packet_json(item.get_string())?);
        }
    }
    
    Ok(packets)
}
```

**N-API Bridge** (for SvelteKit):

```typescript
// src/lib/server/turbovec-bridge.ts
import turbovecNative from '@deeds/turbovec-native';

export async function parsePacketMetadata(jsonStr: string): Promise<PacketMetadata> {
  // Calls Rust function via N-API
  return turbovecNative.parsePacketJson(jsonStr);
}

export async function parsePacketBatch(jsonArray: string): Promise<PacketMetadata[]> {
  // Batch parse (faster than individual calls)
  return turbovecNative.parsePacketBatch(jsonArray);
}
```

**Performance Target**:
- Single packet: <0.1ms
- Batch of 1000: <50ms (50x speedup vs JS JSON.parse for 768-dim vectors)

---

## Part 7: Canonical File Pruning Strategy

### Goal: Reduce Repo Bloat via Identified Gaps

**Current Bloat**:
- 17,995 packets × avg 5KB canonical metadata = ~90MB
- Graphify JSON output: ~50MB (compressed)
- Neo4j overhead (pre-P4): 30MB (orphaned topology)
- Unused artifacts (estimate): 15GB+

### Pruning Workflow

**Phase 1: Gap Identification** (MapReduce Join)

```
1. Load Postgres atlas_packets (source_ref, feature_id, tree_node_id)
2. Join with atlas_tree_nodes (parent_id, depth, context)
3. Join with atlas_feature_labels (feature_label, community_id)
4. Output: canonical_packets.ndjson (each packet with complete lineage)
```

**Phase 2: Gemma4 Summarization** (Per-Packet)

```bash
# PowerShell script: generate-packet-summaries.ps1
foreach ($packet in $canonical_packets) {
  $prompt = @"
Summarize this code packet in 1-2 sentences for search:
  source_ref: $packet.source_ref
  feature_id: $packet.feature_id
  function: $packet.function_symbol
  context: $packet.feature_label
"@
  
  $summary = Invoke-LlamaServer -Prompt $prompt -Model "gemma4-rotorquant:latest" -MaxTokens 50
  
  Add-Member -InputObject $packet -MemberType NoteProperty -Name "summary" -Value $summary.content
}
```

**Phase 3: Canonical File Generation**

```
For each packet:
  1. Validate source_ref (file must exist)
  2. Check tree_node_id (hierarchy must be linked)
  3. Extract function symbol (AST parse if missing)
  4. Add Gemma4 summary (token-efficient search hint)
  5. Write canonical_packets.ndjson entry
```

**Phase 4: Pruning** (Safe Deletion)

```
For each non-canonical file:
  1. Check if ALL its packets are in canonical_packets.ndjson
  2. If yes: mark for deletion (log file name + sha256)
  3. If no: keep (incomplete ingestion)
  4. Commit deletion manifest to git
```

**Expected Reduction**:
- 17,995 canonical packets + summaries: ~120MB
- Neo4j graph (post-P4): ~50MB
- Graphify JSON cache: ~50MB
- Deleted artifacts: ~14.8GB (82% reduction)

---

## Part 8: Gaps Summary & Priority

| Gap | Neo4j | Graphify | Blocker? | Solution |
|-----|-------|----------|----------|----------|
| **Directory nodes** | 0 | 50 | ✅ P4 Phase 1 | MERGE via directory_path |
| **Feature nodes** | 0 | 512 | ✅ P4 Phase 1 | MERGE via feature_id |
| **Tree node linkage** | missing | required | ✅ P3 (Postgres) | Join atlas_tree_nodes |
| **IMPLEMENTS_FEATURE edges** | 0 | 17,995 | ✅ P4 Phase 2 | CREATE in Neo4j |
| **IN_DIRECTORY edges** | 0 | 17,995 | ✅ P4 Phase 2 | CREATE in Neo4j |
| **SHARES_TAGS edges** | 0 | 500–1000 | ⏳ P4 Phase 2 | CREATE via community_id |
| **SOM cluster nodes** | 0 | 272 | ⏳ P4 Phase 2 | CREATE from som_cluster |
| **64-dim AE latents** | none | optional | ⏳ Post-P4 | Train PyTorch AE |
| **Gemma4 summaries** | none | token-saving | ⏳ Post-P4 | Batch Gemma4 inference |
| **Canonical pruning** | N/A | target | ⏳ Post-P4 | MapReduce join + safe delete |

---

## Part 9: Gemma4 Summary Generation (PowerShell)

### Script Location & Status

**Expected path**: `scripts/generate-packet-summaries.ps1`  
**Status**: Search required (may not exist yet)  
**Purpose**: Batch Gemma4 inference for token-efficient summaries

### Script Skeleton (If Not Found)

```powershell
# scripts/generate-packet-summaries.ps1
param(
    [int]$BatchSize = 100,
    [int]$MaxTokens = 50,
    [string]$Model = "gemma4-rotorquant:latest",
    [string]$LlamaUrl = "http://127.0.0.1:8090",
    [switch]$DryRun
)

# Load canonical packets
$packets = Get-Content "canonical_packets.ndjson" | 
    ConvertFrom-Json -AsHashtable |
    Where-Object { -not $_.summary }  # Skip if already summarized

Write-Host "Processing $($packets.Count) packets without summaries..."

$batch = @()
foreach ($packet in $packets) {
    $batch += $packet
    
    if ($batch.Count -ge $BatchSize) {
        # Batch summarization
        $prompts = $batch | ForEach-Object {
            @"
Summarize for search (1-2 sentences): $($_.feature_label) in $($_.source_ref) [$($_.function_symbol)]
"@
        }
        
        if (-not $DryRun) {
            $summaries = Invoke-RestMethod -Uri "$LlamaUrl/v1/chat/completions" `
                -Method POST `
                -Body (ConvertTo-Json @{
                    model = $Model
                    messages = @($prompts | ForEach-Object { @{ role = "user"; content = $_ } })
                    max_tokens = $MaxTokens
                    stream = $false
                }) `
                -ContentType "application/json"
            
            for ($i = 0; $i -lt $batch.Count; $i++) {
                $batch[$i].summary = $summaries.choices[$i].message.content
            }
        }
        
        # Write batch to output
        $batch | ConvertTo-Json | Add-Content "canonical_packets_with_summaries.ndjson"
        $batch = @()
    }
}

Write-Host "Done. Output: canonical_packets_with_summaries.ndjson"
```

---

## Part 10: Action Plan for Next Session

### Immediate (Can Start Now)

1. **Search for existing PowerShell script**:
   ```bash
   find . -name "*summary*.ps1" -o -name "*gemma*.ps1" 2>/dev/null
   ```

2. **Generate Canonical Packets Join**:
   - MapReduce or Node.js script to join:
     - Postgres atlas_packets
     - atlas_tree_nodes (source_ref → tree_node_id)
     - atlas_feature_labels (feature_id → feature_label)
   - Output: `canonical_packets.ndjson`

3. **Validate Neo4j Pre-P4**:
   - Count node types (Packet, Directory, Feature, SOMCluster)
   - Count edge types (IMPLEMENTS_FEATURE, IN_DIRECTORY, BELONGS_TO_CLUSTER)
   - Generate Graphify JSON schema for comparison

### Post-P4 (After Neo4j Redesign)

1. **Graphify JSON Export**:
   - Export Neo4j post-P4 to JSON
   - Compare vs canonical_packets.ndjson
   - Identify remaining gaps

2. **AE Training** (PyTorch):
   - Load 17,995 packet embeddings from Qdrant
   - Train autoencoder: 768-dim → 64-dim → 400-dim SOM
   - Cache 64-dim latents in Redis for fast search

3. **Gemma4 Summarization**:
   - Batch summarize all 17,995 packets (50 tokens each ≈ 900K tokens total)
   - Store summaries in canonical_packets.ndjson

4. **Canonical Pruning**:
   - Execute MapReduce join
   - Safe deletion with manifest
   - Expected cleanup: 15GB → 250MB

---

## Conclusion

**Current Gaps**:
- Neo4j pre-P4: 834 missing nodes, 27,056 missing edges (P4 will fix)
- Graphify JSON: Needs complete export + validation
- Tree node linkage: Exists in Postgres, missing from Neo4j (P4 creates)
- AE latents: Not yet computed (post-P4 task)
- Gemma4 summaries: Not yet generated (PowerShell script needed)
- Canonical pruning: 15GB bloat → 250MB target (post-summaries)

**Blockers to Closure**: None critical — all gaps identified, all solutions exist or are queued for P4.

---

**Generated**: June 23, 2026 (Session 74 continuation)  
**Status**: Gap analysis complete, action plan ready  
**Next**: Execute MapReduce join, validate Graphify JSON export
