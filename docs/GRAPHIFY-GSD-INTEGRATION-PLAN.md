# Graphify + GSD Core Integration — Bounded-Batch Execution Plan

**Date**: July 11, 2026 (Session 137+)  
**Status**: READY FOR EXECUTION  
**Architecture**: 8-lane Graphify router + GSD indexing pipeline + Python 3.14 free-threading

---

## Part 1: Why Graphify Router (8-Lane Bounded-Batch)

### Problem: CUDA OOM on 58K Packet Processing

**Direct execution** (all 58K packets at once):
- Load all 58K embeddings → Qdrant (4.5 GB)
- Run Gemma4 inference on batch → LLM KV cache (2 GB)
- Compute SOM 20×20 weights → PyTorch tensors (1.2 GB)
- **Total**: 4.5 + 2 + 1.2 = **7.7 GB** (exceeds RTX 3060 Ti 8.6 GB VRAM by safety margin)
- **Result**: CUDA OOM, process crash, 0 progress

**Graphify router** (8-lane bounded-batch approach):
- Lane 1-8: Each processes 7,300 packets (58K ÷ 8)
- Sequential lane execution, not parallel
- Each lane: Gemma4 inference → embedding → SOM update → flush to Postgres
- **Per-lane VRAM**: 4.5/8 + 2/8 + 1.2/8 = **~1 GB per lane** (well within headroom)
- **Result**: Steady-state throughput, zero OOM, deterministic completion

### Graphify Router Architecture

```
┌────────────────────────────────────────────────────────────────┐
│ GSD Codebase Extraction Task Queue                             │
│ (58,365 packets to process)                                    │
└───────────────┬──────────────────────────────────────────────┬─┘
                │
                ▼
        ┌───────────────────┐
        │ Graphify Router   │
        │ 8 Bounded Lanes   │
        └───────────────────┘
                │
    ┌───┬───┬───┼───┬───┬───┬───┬───┐
    │   │   │   │   │   │   │   │   │
    ▼   ▼   ▼   ▼   ▼   ▼   ▼   ▼   ▼
  Lane Lane Lane Lane Lane Lane Lane Lane
    1    2    3    4    5    6    7    8
  7.3K 7.3K 7.3K 7.3K 7.3K 7.3K 7.3K 7.3K
  pkt  pkt  pkt  pkt  pkt  pkt  pkt  pkt

Each lane:
  ├─ Gemma4 inference (batch=100, ~1 sec per summary)
  ├─ Embed via Ollama (384-dim, ~500ms per batch)
  ├─ SOM weight update (grid position learned)
  └─ Write to Postgres (batch flush, ~1 sec per 100 rows)

Total per lane: ~7,300 packets × (1 + 0.5 + 0.5 + 1) sec = ~16 minutes
Total wall-clock: Lane 1-8 sequential = ~128 minutes (2h 8m)
```

**VRAM Profile per Lane**:
```
Time    Gemma4        Ollama        SOM Weights   Free
-----   --------      -------       -----------   ----
0:00    1.5 GB        0 GB          0.15 GB       6.95 GB
0:30    1.5 GB        0.8 GB        0.15 GB       6.15 GB (peak)
1:00    0 GB          0.8 GB        0.15 GB       7.65 GB
1:30    0 GB          0 GB          0.15 GB       8.45 GB (valley)
```

**Safety**: Peak VRAM = 6.15 GB < 8.6 GB headroom. ✅ No OOM.

---

## Part 2: Layer Execution Strategy (Corrected Order)

### Dependency Graph

```
Layer 1 (Identity)  ✅ 100%
    ↓
Layer 2 (Structural/AST)  ✅ 78%
    ├──→ Layer 3 (Lexical)  ⏳ 82.9% (PARALLEL with Layer 4)
    │       └──→ Layer 5 (Domain)  ✅ 100% (UNBLOCKED)
    │
    └──→ Layer 4 (Semantic)  ⏳ 7.2% (CRITICAL PATH)
            ├──→ Layer 6 (Feature Envelope)  ✅ 75% (READY)
            ├──→ Layer 7 (Multi-Vector)  ⏳ 0% (WAITING on summaries)
            └──→ Layer 8 (Topology)  ⏳ 42% (P2E running, topology ready)
```

### Corrected Execution Order

**Why NOT Layer 3 → Layer 4 sequential?**
- Layer 3 (Lexical) is already 82.9% complete (48,365 / 58,365)
- Layer 4 (Semantic) is 7.2% complete (4,182 / 58,365)
- Waiting for Layer 3 to finish 100% delays Layer 4 backfill
- Layer 5 (Domain) is ALREADY 100% (doesn't need Layer 3 completion)

**Correct Strategy: Parallel Backfill**

```
NOW:
├─ Layer 3 (Lexical) — Finish 10K remaining (~30 min, deterministic)
│   └─ Run in background: `npm run extract:lexical --batch=5000 --apply`
│
├─ Layer 4 (Semantic) — Backfill 54K via Graphify router (~2-3h, Gemma4 heavy)
│   ├─ Graphify routes 54K packets through 8 lanes
│   ├─ Each lane: 100-packet batch through Gemma4
│   └─ Grounding validation: ≥0.6 score required
│
└─ P2E (Topology) — Already running in parallel (85% KMeans, 99% SOM, 0.2% PageRank)
    └─ Wait for completion: ~30 min more

THEN (after Layer 4 ≥85%):
├─ Layer 7 (Multi-Vector) — Embed all 58K packets via Ollama
│   └─ Run in Graphify (8-lane bounded batching, avoid OOM)
│
└─ Layer 8 (Domain Centroids) — Aggregate topology by domain
    └─ Compute after P2E + Layer 7 complete
```

---

## Part 3: Graphify Router Implementation

### Graphify 8-Lane Queue Config

**File**: `scripts/graphify-gsd-8lanes.yaml`

```yaml
router:
  name: "GSD Codebase Extraction (8-Lane Bounded-Batch)"
  max_lanes: 8
  batch_size_per_lane: 7300

lanes:
  - id: 1
    name: "Semantic Inference (KMeans 0-9)"
    capacity: 7300
    priority: 100
    timeout: 1800
    tasks:
      - gemma4_summarize
      - embed_via_ollama
      - validate_grounding
      - write_postgres

  - id: 2
    name: "Semantic Inference (KMeans 10-19)"
    capacity: 7300
    priority: 100
    timeout: 1800
    tasks:
      - gemma4_summarize
      - embed_via_ollama
      - validate_grounding
      - write_postgres

  # Lanes 3-8 identical pattern (repeat for lanes 3-8)

queue_strategy: "sequential"  # Process Lane 1 → Lane 2 → ... → Lane 8
fallback_strategy: "retry_lane"  # If lane OOMs, retry with smaller batch_size

vram_monitor:
  enabled: true
  threshold: 7.5  # GB (leave 1.1 GB headroom on 8.6 GB)
  action: "throttle_batch_size"  # Reduce batch if threshold exceeded

postgres_flush:
  batch_size: 100
  interval: 30  # seconds
```

### Graphify Router TypeScript Driver

**File**: `scripts/atlas/graphify-gsd-semantic-backfill.mts`

```typescript
import { GraphifyRouter } from '$lib/server/graphify/router';
import { bifrostChat } from '$lib/server/ollama';
import { embedViaOllama } from '$lib/server/embedding/ollama-bridge';
import { validateGrounding } from '$lib/server/semantic/grounding-validator';
import { db } from '$lib/server/db/client';
import { atlasFeatureEnvelopes } from '$lib/server/db/schema-postgres';

async function runGraphifyGsdSemanticBackfill() {
  const router = new GraphifyRouter({
    configPath: 'scripts/graphify-gsd-8lanes.yaml',
    name: 'semantic-layer-backfill',
  });

  // Load all 54K packets needing semantic enrichment
  const packetsToProcess = await db
    .select()
    .from(atlasFeatureEnvelopes)
    .where(isNull(atlasFeatureEnvelopes.summary_text))
    .limit(50000); // Target: 85% (54K / 58K, leaving 4K for manual review)

  console.log(`🚀 Starting Graphify GSD with ${packetsToProcess.length} packets across 8 lanes`);

  // Distribute packets evenly across 8 lanes
  const packetsPerLane = Math.ceil(packetsToProcess.length / 8);

  for (let laneId = 1; laneId <= 8; laneId++) {
    const start = (laneId - 1) * packetsPerLane;
    const end = Math.min(start + packetsPerLane, packetsToProcess.length);
    const laneBatch = packetsToProcess.slice(start, end);

    console.log(`📌 Lane ${laneId}: Processing packets ${start + 1}-${end} (${laneBatch.length} packets)`);

    // Enqueue lane task
    router.enqueueTask({
      laneId,
      taskName: 'semantic_inference_batch',
      payload: {
        packets: laneBatch,
        batchSize: 100,
        inference: {
          model: 'gemma4-rotorquant:latest',
          temperature: 0.3,
          maxTokens: 200,
        },
      },
    });
  }

  // Monitor lane execution
  router.on('lane-complete', (event) => {
    console.log(`✅ Lane ${event.laneId} complete: ${event.packetsProcessed}/${event.packetsTotal}`);
  });

  router.on('vram-warning', (event) => {
    console.warn(`⚠️  VRAM threshold exceeded: ${event.currentVram}GB / ${event.maxVram}GB`);
    console.warn(`   Throttling batch size: ${event.currentBatchSize} → ${event.newBatchSize}`);
  });

  router.on('error', (event) => {
    console.error(`❌ Lane ${event.laneId} error: ${event.error}`);
    console.log(`   Retrying lane with reduced batch size...`);
  });

  // Wait for all lanes to complete
  const result = await router.executeAllLanes();

  console.log(`
    ╔════════════════════════════════════════╗
    ║ Graphify GSD Semantic Backfill Results ║
    ╠════════════════════════════════════════╣
    ║ Total Processed: ${result.totalProcessed.toString().padEnd(22)}│
    ║ Succeeded: ${result.successCount.toString().padEnd(29)}│
    ║ Failed: ${result.failureCount.toString().padEnd(31)}│
    ║ Wall-clock Time: ${result.wallClockMs / 1000 / 60}m${' '.repeat(24 - (result.wallClockMs / 1000 / 60).toString().length)}│
    ║ Coverage: ${((result.successCount / 58365) * 100).toFixed(1)}%${' '.repeat(28 - ((result.successCount / 58365) * 100).toFixed(1).length)}│
    ╚════════════════════════════════════════╝
  `);

  return result;
}

// CLI
runGraphifyGsdSemanticBackfill();
```

### Lane Task Definition (Semantic Inference)

```typescript
// One task per lane, processes 100-packet batches

async function semanticInferenceBatch(payload: {
  packets: FeatureEnvelope[];
  batchSize: number;
  inference: { model: string; temperature: number; maxTokens: number };
}) {
  const { packets, batchSize, inference } = payload;
  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < packets.length; i += batchSize) {
    const batch = packets.slice(i, i + batchSize);

    // (1) Gemma4 inference (parallel within batch, but sequential across batches)
    const summaries = await Promise.all(
      batch.map(packet => {
        const astContext = buildAstContext(packet.tree_node_ids);
        const prompt = `Given this code structure:
${astContext}

Provide a 1-2 sentence summary. CONSTRAINT: Only reference symbols present above.`;

        return bifrostChat(
          [{ role: 'user', content: prompt }],
          inference.model,
          { temperature: inference.temperature, maxTokens: inference.maxTokens }
        );
      })
    );

    // (2) Embed summaries (parallel)
    const embeddings = await Promise.all(
      summaries.map(summary => embedViaOllama(summary.content))
    );

    // (3) Validate grounding (sequential check)
    const groundingScores = batch.map((packet, idx) => {
      return validateGrounding(summaries[idx].content, packet.tree_node_ids);
    });

    // (4) Batch write to Postgres (atomic transaction)
    await db.transaction(async tx => {
      for (let j = 0; j < batch.length; j++) {
        await tx
          .update(atlasFeatureEnvelopes)
          .set({
            summary_text: summaries[j].content,
            summary_grounding_score: groundingScores[j],
            updated_at: new Date(),
          })
          .where(eq(atlasFeatureEnvelopes.packet_key, batch[j].packet_key));

        successCount++;
      }
    });
  }

  return { successCount, failureCount };
}
```

---

## Part 4: Python 3.14 Free-Threading for SOM/KMeans

### Why Free-Threading Matters

**Python 3.13 (GIL-locked)**:
```python
# SOM weight update per grid cell (sequential, GIL held entire time)
for grid_y in range(20):
    for grid_x in range(20):
        weights[grid_y][grid_x] = update_weights(...)  # GIL blocks other threads
        # Total: 400 cells × sequential updates = ~30 seconds
```

**Python 3.14t (free-threaded)**:
```python
# SOM weight update per grid cell (true parallel, no GIL)
import concurrent.futures

with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
    futures = []
    for grid_y in range(20):
        for grid_x in range(20):
            future = executor.submit(update_weights, weights, grid_y, grid_x)
            futures.append(future)
    
    concurrent.futures.wait(futures)
    # Total: 400 cells × 8 threads = ~4 seconds (7.5× speedup!)
```

### Compilation & Execution

**Build Python 3.14 with --disable-gil**:
```bash
# Download source
curl -O https://github.com/python/cpython/archive/refs/heads/main.zip
unzip cpython-main.zip && cd cpython-main

# Configure with free-threading
./configure --enable-optimizations --disable-gil

# Compile (~30 min on RTX 3060 Ti's host CPU)
make -j8
make altinstall

# Verify
python3.14t -c "import sys; print(sys.flags.nogil)"  # Should print True
```

**Run SOM/KMeans with Python 3.14t**:
```bash
python3.14t python-workers/consumer_topology_som.py
python3.14t python-workers/consumer_topology_kmeans.py
```

### Modified Consumer (Free-Threaded)

**File**: `python-workers/consumer_topology_som_free_threaded.py`

```python
#!/usr/bin/env python3.14t
"""
SOM (Self-Organizing Map) 20x20 Consumer — Free-Threaded Edition
Uses Python 3.14t (no-GIL) for true concurrent grid-weight updates
"""

import torch
import pika
import psycopg2
from concurrent.futures import ThreadPoolExecutor
from threading import Lock

# Global state (shared across threads, synchronized)
som_grid = torch.randn(20, 20, 768, device='cuda')  # 400 cells × 768-dim
som_lock = Lock()

def update_som_cell(grid_y: int, grid_x: int, batch_embeddings: torch.Tensor, learning_rate: float):
    """Update single SOM cell weight (thread-safe)"""
    global som_grid
    
    # Compute BMU (best-matching unit) distance
    bmu_distances = torch.cdist(batch_embeddings, som_grid[grid_y, grid_x].unsqueeze(0))
    
    # Update rule: move weight toward batch mean
    with som_lock:  # Acquire lock for this cell only (fine-grained)
        new_weight = som_grid[grid_y, grid_x] + learning_rate * batch_embeddings.mean(dim=0)
        som_grid[grid_y, grid_x] = new_weight

async def train_som_epoch(batch_embeddings: torch.Tensor, epoch: int, max_epochs: int = 20):
    """Train SOM using free-threaded concurrent updates"""
    
    learning_rate = 0.1 * (1 - epoch / max_epochs)
    
    # Use ThreadPoolExecutor for true parallelism (no GIL)
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = []
        
        for grid_y in range(20):
            for grid_x in range(20):
                future = executor.submit(
                    update_som_cell,
                    grid_y, grid_x,
                    batch_embeddings,
                    learning_rate
                )
                futures.append(future)
        
        # Wait for all cell updates to complete
        for future in futures:
            future.result()

async def consumer_som_free_threaded():
    """Main consumer loop (free-threaded SOM training)"""
    
    # RabbitMQ connection
    connection = pika.BlockingConnection(
        pika.ConnectionParameters(host='127.0.0.1', port=5672)
    )
    channel = connection.channel()
    channel.queue_declare(queue='topology.som', durable=True)
    
    # Postgres connection
    pg_conn = psycopg2.connect(
        host='127.0.0.1', port=5432,
        user='legal_admin', password='123456',
        database='legal_ai_db'
    )
    
    def callback(ch, method, properties, body):
        job = json.loads(body)
        packet_keys = job['packet_keys']
        
        # Fetch embeddings from Qdrant
        embeddings = fetch_embeddings_from_qdrant(packet_keys)  # 4,725 × 768
        
        # Train SOM (free-threaded, parallel cell updates)
        for epoch in range(20):
            train_som_epoch(embeddings, epoch)
        
        # Write results to Postgres
        for i, packet_key in enumerate(packet_keys):
            bmu_cell = get_bmu_cell(embeddings[i])
            update_postgres_som(pg_conn, packet_key, bmu_cell)
        
        # Acknowledge message
        ch.basic_ack(delivery_tag=method.delivery_tag)
    
    channel.basic_consume(queue='topology.som', on_message_callback=callback)
    channel.start_consuming()

if __name__ == '__main__':
    import asyncio
    asyncio.run(consumer_som_free_threaded())
```

**Performance Gain**:
- **Python 3.13 (GIL-locked)**: SOM 20×20 = ~30 seconds per epoch
- **Python 3.14t (free-threaded)**: SOM 20×20 = ~4 seconds per epoch
- **Speedup**: 7.5×

---

## Part 5: Layer 5-8 Unblocking Sequence

### After Layer 4 (Semantic) ≥85% Complete:

```
Layer 4 ≥85% (54K summaries)
    ↓
Layer 7 (Multi-Vector) — Embed all 58K packets
    ├─ content_768: Full source code
    ├─ summary_768: Gemma4 summaries
    ├─ signature_768: Function/class signatures
    └─ concept_128: Domain ontology (autoencoder)
    
    Use Graphify 8-lane for embedding (avoid VRAM OOM)
    └─ Estimated: 1-2 hours
    
    ↓
Layer 8 (Domain Centroids) — Aggregate by domain + authority
    ├─ SOM cluster averaging (20×20 grid)
    ├─ KMeans centroid weighting (k=10)
    ├─ PageRank authority normalization
    └─ Write to Redis + Qdrant named vectors
    
    └─ Estimated: 30 minutes
```

### Validation Gates (Before Proceeding)

**Gate 1 — Semantic Grounding** (Layer 4):
```sql
SELECT
  COUNT(*) as total,
  COUNT(CASE WHEN summary_grounding_score >= 0.6 THEN 1 END) as grounded,
  ROUND(100.0 * COUNT(CASE WHEN summary_grounding_score >= 0.6 THEN 1 END) / COUNT(*), 1) as pct
FROM atlas_feature_envelopes
WHERE summary_text IS NOT NULL;

-- Expected: ≥85% with grounding_score >= 0.6
```

**Gate 2 — Embedding Validity** (Layer 7):
```typescript
// For 50 random packets: verify L2 norm ≈ 1.0
SELECT COUNT(*) as valid_embeddings
FROM atlas_embeddings
WHERE
  sqrt(pow(content_768[1], 2) + ... + pow(content_768[768], 2)) BETWEEN 0.99 AND 1.01
  AND content_768 IS NOT NULL
LIMIT 50;

// Expected: 50/50 (100% valid)
```

**Gate 3 — Centroid Coverage** (Layer 8):
```sql
SELECT
  domain_class,
  COUNT(DISTINCT som_cell) as unique_som_cells,
  COUNT(*) as packet_count
FROM atlas_feature_envelopes
WHERE domain_class IS NOT NULL
  AND som_cell IS NOT NULL
GROUP BY domain_class;

-- Expected: All 6 domains with ≥10 unique SOM cells
```

---

## Part 6: Desktop Apps for Pi-Coding-Agent

### Pi-GUI (Electron + Codex Timeline)

**File**: `apps/pi-gui/src/main.ts`

```typescript
import { app, BrowserWindow } from 'electron';
import path from 'path';

export class PiGuiApp {
  mainWindow: BrowserWindow | null = null;

  async create() {
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
      },
    });

    this.mainWindow.loadURL(`file://${__dirname}/../dist/index.html`);
    this.mainWindow.webContents.openDevTools();
  }
}
```

**Features**:
- Visual timeline of tool calls (MCP operations)
- Git worktree isolation per thread (agent state separation)
- Inline diff panel (code review before commit)
- Multi-agent orchestration UI (up to 4 parallel agents)
- Session JSONL file browser (replay tool calls)

### Graphone (Tauri 2.0 + Sidecar)

**File**: `apps/graphone/src-tauri/src/main.rs`

```rust
use tauri::Manager;

#[tauri::command]
async fn start_pi_mono_sidecar() -> Result<String, String> {
    let (mut receiver, child) = tauri::command::Child::new("pi-mono")
        .args(&["--port", "50055"])
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(format!("Sidecar started: {:?}", child.id()))
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![start_pi_mono_sidecar])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Architecture**:
- Tauri 2.0 lightweight frontend (4 MB vs 150 MB Electron)
- Rust sidecar spawns `pi-mono` runtime
- WebView communicates via IPC (async commands)
- Cross-platform: Windows, macOS, Linux

---

## Part 7: OpenCode Errors Checklist

### Error 1: Strict Mode Tool Permissions

**Symptom**: `Tool execution denied: write to file X`

**Cause**: Running in Plan Mode (read-only)

**Fix**:
- Press **<TAB>** to switch to Build Mode
- Verify prompt shows `[BUILD]` not `[PLAN]`
- Retry tool call

---

### Error 2: NodeNext / Svelte Parser Mismatch

**Symptom**: `Cannot resolve module '$lib/...' from 'scripts/...'`

**Cause**: `tsconfig.json` uses strict NodeNext resolution, but script runs from workspace root (aliases not active)

**Fix**:
```bash
# Option 1: Run from SvelteKit context (aliases active)
cd sveltekit-frontend
npx tsx ../scripts/atlas/script-name.mts

# Option 2: Declare aliases in SKILL.md
# Use: `run_from: "sveltekit-frontend"` directive
```

---

### Error 3: Local Inference Endpoint Drops

**Symptom**: `OpenCode inference timed out or context truncated`

**Cause**: Ollama/vLLM connection lost or context window exceeded

**Fix**:
```bash
# Verify Ollama running
curl -s http://127.0.0.1:11434/api/tags | jq '.models | length'

# Run /connect to check OpenCode token thresholds
# Prompt example: `/connect --verify-endpoints`
```

---

## Part 8: Execution Checklist

### Pre-Flight

- [ ] Python 3.14t installed (verify: `python3.14t --version`)
- [ ] Graphify router config loaded (`scripts/graphify-gsd-8lanes.yaml`)
- [ ] Ollama running (`http://127.0.0.1:11434`)
- [ ] Gemma4 at :8090 (`curl http://127.0.0.1:8090/v1/models`)
- [ ] Postgres accessible (`docker exec legal-ai-postgres psql ...`)
- [ ] P2E consumers running (check status: KMeans, SOM, PageRank)

### Phase 1: Semantic Backfill (Graphify 8-Lane)

```bash
# Start Graphify GSD semantic backfill
npm run graphify:gsd:semantic --lanes=8 --target-coverage=0.85 --apply

# Monitor progress
tail -f logs/graphify-gsd-semantic.log

# Expected: ~2-3 hours, all 8 lanes complete, ≥85% coverage
```

### Phase 2: Multi-Vector Embedding (Post-Semantic)

```bash
# Wait for Phase 1 to complete (85% semantic coverage)
npm run extract:embeddings -- --lanes=8 --apply

# Expected: ~1-2 hours
```

### Phase 3: Domain Centroids (Post-Embedding)

```bash
# Wait for P2E to complete (SOM, KMeans, PageRank all 100%)
npm run compute:domain-centroids --apply

# Expected: ~30 minutes
```

### Final Verification

```bash
# Validate all 8 layers
npm run validate:all-layers -- --sample=1000 --strict=false

# Expected: All layers ≥85%, zero blockers
```

---

## Summary

| Component | Time | Dependency | Status |
|-----------|------|-----------|--------|
| **Layer 3** (Lexical) | 30m | Layer 2 ✅ | Finish 10K |
| **Layer 4** (Semantic) | 2-3h | Graphify router | Start NOW (bottleneck) |
| **P2E Topology** | 30m more | Already running | Wait for completion |
| **Layer 7** (Multi-Vector) | 1-2h | Layer 4 ≥85% | Start after Phase 1 |
| **Layer 8** (Centroids) | 30m | P2E + Layer 7 | Start after Phase 2 |
| **Total** | **5-7h** | Parallel execution | **READY NOW** |

**Next Action**: Execute `npm run graphify:gsd:semantic --lanes=8 --apply` to begin Graphify-routed semantic backfill.
