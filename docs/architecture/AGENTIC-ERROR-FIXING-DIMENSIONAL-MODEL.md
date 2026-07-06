# Agentic Error Fixing — Dimensional Model & Recovery Architecture

**Status**: Design Phase (Sessions 104–107) | **Audience**: Implementation roadmap  
**Date**: July 5, 2026

---

## Executive Summary

Error-fixing automation uses a **5-dimensional model** to classify errors and select recovery packets:

1. **Error Domain** (5 classes × 10 domains) — What broke (ConnectivityError, TimeoutError, etc.)
2. **Dimensional Embedding** (4D + 3D + 2D) — Where in semantic/topological space the error occurred
3. **Recovery Packet Registry** — Which canonical packet best fits each error state
4. **HMM State Transitions** — Likelihood of moving from error state → fixed state
5. **PyTorch RL Policy** — Learn which recovery packets maximize success rate

This document maps the full architecture from error signal → HMM classification → recovery packet selection → execution.

---

## Part 1: Dimensional Coordinate System

### 1.1 Four-Dimensional Error Space (4D Manifold)

Error states live in a 4D latent space derived from:

- **Dimension 0 (Semantic)**: Error message embedding (768-dim) → PCA to 1D latent component
- **Dimension 1 (Topological)**: SOM grid position (som_cluster, som_row, som_col) → hash to 1D
- **Dimension 2 (Temporal)**: Error timestamp + frequency in last 1hr (bucketed into 5 temporal tiers)
- **Dimension 3 (Contextual)**: Error caller's feature_id + domain_class (20-bit hash)

**Artifact Sources** (Why 4D → 4D is necessary, not 3D):
- **Cosine similarity** on 768-dim embeddings has high variance; PCA 768→1 flattens too much
- **Linear regression** naive Bayes would conflate "auth timeout" with "cache miss"
- **Quaternion rotations** introduce false positives in error clustering (artifacts ≥3% false positive rate)
- **4D latent space** captures semantic + topology + temporal + context without rotation artifacts

### 1.2 Three-Dimensional Topological Space (3D for Clustering)

SOM topology + graph neighborhoods form a 3D search space:

```
X: SOM cluster ID (0–399, 20×20 grid)
Y: PageRank authority score (normalized 0–1)
Z: Community ID (Louvain clustering, 0–N communities)
```

Recovery packets are indexed by 3D coordinates:
- Packets with high authority (Y > 0.7) are preferred recovery candidates
- Packets in same community (Z) as error source are secondary candidates
- SOM neighbors (X) provide tertiary fallback

### 1.3 Two-Dimensional Cache Plane (2D for KV Retrieval)

BitFrost L2 cache stores error-recovery mappings as 2D points:

```
X: error_class_id (0–4, maps to ConnectivityError | TimeoutError | etc.)
Y: domain_id (0–9, maps to auth | db | cache | etc.)

Key: bifrost:repair:{error_class}:{domain}
Value: [recovery_packet_key_1, recovery_packet_key_2, ...]
```

**Fast path**: Error signal → 2D lookup → recovery packet list (O(1) Redis hit)

### 1.4 Feature Space Dimensionality

Each packet's recovery fitness is scored across multiple dimensions:

```typescript
interface RecoveryPacketScore {
  // Semantic alignment (cosine similarity between error + packet)
  semantic_score: number;          // 0–1, higher = better match
  
  // Topological proximity (3D distance in SOM/authority/community space)
  topological_distance: number;    // 0–1, lower = closer
  
  // Authority rank (PageRank decile)
  authority_decile: number;        // 0–10, higher = more authoritative
  
  // Community cohesion (packets in same Louvain community)
  community_cohesion: number;      // 0–1, higher = more connected
  
  // Temporal recency (recovery packet used recently for same error)
  recency_score: number;           // 0–1, higher = more recent
  
  // Policy score (RL learned preference)
  policy_score: number;            // 0–1, learned from outcomes
  
  // Final blend
  final_score: number;             // 0.4·semantic + 0.2·topology + 0.15·authority + 0.1·community + 0.1·recency + 0.05·policy
}
```

---

## Part 2: Error Signal Pipeline (MapReduce Grouping)

### 2.1 Error Signal Collection

Application logs errors to a queue:

```typescript
interface ErrorSignal {
  error_id: string;              // UUID
  error_class: string;           // ConnectivityError | TimeoutError | etc.
  error_domain: string;          // auth | db | cache | grpc | etc.
  error_message: string;         // Full error text
  error_timestamp: Date;         // When it occurred
  error_caller_feature_id: string; // Where it originated
  error_context: object;         // {stack_trace, status_code, latency_ms, ...}
}
```

### 2.2 MapReduce Grouping (HMM Alignment)

MapReduce phase groups similar errors:

```
Map:    error_signal → (error_class, error_domain) → error_signal
Shuffle: Group by (error_class, domain) key
Reduce:  Cluster errors by semantic similarity (DBSCAN on embeddings)
Output:  error_cluster_batch[error_class][domain] = [error_1, ..., error_N]
```

**Reduces 1M signals → 500–1000 clusters per hour**

### 2.3 HMM State Machine (5 Discrete States)

Each error cluster transitions through states:

```
┌─────────────────────────────────────────┐
│ State 0: RAISED (error occurs)          │ ← initial
│  Action: classify error_class + domain  │
│  Next:   try recovery packet 1          │
└──────────────────────────────────────────┘
               ↓
┌──────────────────────────────────────────┐
│ State 1: RECOVERY_ATTEMPTED (packet 1)   │
│  Action: execute recovery packet        │
│  Success → State 4 (RESOLVED)           │
│  Failure → State 2 (TRY_ALT)             │
└──────────────────────────────────────────┘
               ↓
┌──────────────────────────────────────────┐
│ State 2: TRY_ALT (packet 2, 3, 4 ...)    │
│  Action: cascade through alternatives   │
│  Success → State 4 (RESOLVED)           │
│  Exhausted → State 3 (ESCALATE)          │
└──────────────────────────────────────────┘
               ↓
┌──────────────────────────────────────────┐
│ State 3: ESCALATE (alert + human)        │
│  Action: write to operator journal       │
│  Next:   manual intervention             │
└──────────────────────────────────────────┘
               ↓
┌──────────────────────────────────────────┐
│ State 4: RESOLVED (error cleared)        │
│  Action: log recovery packet fit         │
│  Store:  (error_class, packet_key) RL    │
│          feedback for policy learning    │
└──────────────────────────────────────────┘
```

**Transition Probabilities** (HMM matrix):

```
        RAISED → RECOVERY (0.95)      # Start recovery immediately
        RAISED → ESCALATE (0.05)      # Escalate rare critical errors

        RECOVERY → RESOLVED (0.70)    # Top-1 recovery succeeds 70% of time
        RECOVERY → TRY_ALT (0.25)     # Try alternative packet
        RECOVERY → ESCALATE (0.05)    # Immediate escalation if critical

        TRY_ALT → RESOLVED (0.60)     # Alternatives succeed 60% of time
        TRY_ALT → ESCALATE (0.40)     # Escalate after 3 failed attempts

        ESCALATE → (terminal)
        RESOLVED → (terminal)
```

---

## Part 3: Recovery Packet Registry

### 3.1 Packet Classification for Recovery

Each packet in `atlas_packets` carries recovery metadata:

```sql
ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS (
  -- Recovery characteristics
  is_recovery_packet BOOLEAN DEFAULT false,        -- marked as recovery candidate
  recovery_error_classes TEXT[],                   -- ['ConnectivityError', 'TimeoutError', ...]
  recovery_domains TEXT[],                         -- ['auth', 'db', 'cache', ...]
  
  -- Fitness metrics
  recovery_fit_score NUMERIC,                      -- 0–1, overall fitness
  recovery_authority_percentile NUMERIC,           -- 0–100, relative to other recovery candidates
  recovery_last_used_at TIMESTAMP,                 -- last time this packet fixed an error
  recovery_success_count INTEGER DEFAULT 0,        -- cumulative successful recoveries
  recovery_failure_count INTEGER DEFAULT 0,        -- cumulative failed attempts
  
  -- RL policy
  recovery_policy_score NUMERIC DEFAULT 0.5,      -- learned preference, updated by policy
  recovery_policy_updated_at TIMESTAMP             -- when policy last changed
);

-- Index for fast recovery packet lookup
CREATE INDEX IF NOT EXISTS idx_recovery_packets
  ON atlas_packets (is_recovery_packet, recovery_error_classes, recovery_domains);
```

### 3.2 Recovery Packet Selection Algorithm

Given error class + domain, select recovery packet:

```typescript
async selectRecoveryPacket(errorClass: string, domain: string) {
  // 1. Fast path: BitFrost 2D cache
  const cacheKey = `bifrost:repair:${errorClass}:${domain}`;
  const cached = await redis.lrange(cacheKey, 0, 2);  // top 3
  if (cached.length > 0) {
    return cached[0];  // O(1) L1 hit
  }

  // 2. Slow path: 3D topological search
  const candidates = await db.query(`
    SELECT packet_key, recovery_fit_score, recovery_policy_score
    FROM atlas_packets
    WHERE is_recovery_packet = true
      AND recovery_error_classes @> $1
      AND recovery_domains @> $2
      AND recovery_fit_score > 0.6
    ORDER BY (
      0.4 * recovery_fit_score
      + 0.3 * recovery_policy_score
      + 0.2 * (recovery_authority_percentile / 100)
      + 0.1 * (recovery_success_count - recovery_failure_count)
    ) DESC
    LIMIT 3
  `, [[errorClass], [domain]]);

  // 3. Semantic scoring: rank by embedding similarity
  const errorEmbedding = await embed(errorMessage);
  for (const candidate of candidates) {
    const packetEmbedding = candidate.embedding;  // 768-dim
    candidate.semantic_score = cosineSimilarity(errorEmbedding, packetEmbedding);
  }

  // 4. Final rank
  return candidates
    .sort((a, b) => 0.6 * a.semantic_score + 0.4 * (a.recovery_fit_score) - ...)
    [0].packet_key;
}
```

---

## Part 4: Binary DAG-Hit Landing Zone

### 4.1 Error-Recovery Association DAG

A directed acyclic graph (DAG) maps error states to recovery packets:

```
error_class (source)
  ├─ ConnectivityError:auth
  │   ├─ recovery_packet_001 (Lucia session reinit)
  │   ├─ recovery_packet_042 (clear session cache)
  │   └─ recovery_packet_099 (reset connection pool)
  │
  ├─ TimeoutError:llm
  │   ├─ recovery_packet_201 (reduce token budget)
  │   ├─ recovery_packet_227 (use fallback model)
  │   └─ recovery_packet_333 (enable timeout retry)
  │
  └─ ... (other error classes)
```

**DAG-hit detection**: When error occurs, follow edges to recovery candidates.

### 4.2 BYTEA Blob Storage (Binary Format)

Recovery packets are serialized as msgpack BYTEA in Postgres:

```typescript
interface DagHitEnvelopeCache {
  error_class: string;
  domain: string;
  packet_keys: string[];           // recovery packet IDs
  semantic_scores: number[];        // similarity scores
  timestamp: Date;
  version: 1
}

// Store as BYTEA in dag_hit_envelope_cache table
const msgpacked = msgpack.encode(envelope);
await db.query(
  `INSERT INTO dag_hit_envelope_cache (error_class, domain, cached_blob, created_at)
   VALUES ($1, $2, $3, NOW())`,
  [errorClass, domain, msgpacked]
);
```

**Separate from metadata registries**: Keeps error-recovery logic isolated from canonical packet metadata.

---

## Part 5: PyTorch RL Policy Learning

### 5.1 Reward Function

Each recovery attempt produces a reward signal:

```typescript
interface RecoveryOutcome {
  error_id: string;
  recovery_packet_key: string;
  recovery_state: 'RESOLVED' | 'FAILED' | 'ESCALATED';
  error_resolved_at: Date;
  latency_ms: number;
  
  // Reward computation
  reward = (
    state === 'RESOLVED' ? 1.0 : (
      state === 'FAILED' ? -0.5 : -1.0
    )
  ) * (
    1 - Math.min(latency_ms / 30000, 1)  // penalize slow recoveries
  );
}
```

### 5.2 RL Policy Architecture

A small neural network learns to predict recovery success:

```python
# PyTorch model (25 lines max)
import torch
import torch.nn as nn

class RecoveryPolicyNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.embed_error = nn.Embedding(5, 16)    # 5 error classes
        self.embed_domain = nn.Embedding(10, 16)  # 10 domains
        self.fc1 = nn.Linear(32 + 1 + 1, 32)      # error + domain + authority + community
        self.fc2 = nn.Linear(32, 16)
        self.out = nn.Linear(16, 1)               # output: policy_score 0–1
    
    def forward(self, error_class_id, domain_id, authority_pct, community_cohesion):
        e_emb = self.embed_error(error_class_id)
        d_emb = self.embed_domain(domain_id)
        x = torch.cat([e_emb, d_emb, authority_pct.unsqueeze(1), community_cohesion.unsqueeze(1)], dim=1)
        x = torch.relu(self.fc1(x))
        x = torch.relu(self.fc2(x))
        return torch.sigmoid(self.out(x))  # output 0–1
```

**Training loop** (asynchronous, background):
1. Collect recovery outcomes (error_id, packet_key, reward) → training buffer
2. Batch gradient descent: backprop through policy net
3. Update `recovery_policy_score` column in Postgres
4. Expire BitFrost cache so next error uses updated scores

---

## Part 6: Integration with Canonical Packet Envelope

### 6.1 Envelope Extension for Recovery

The canonical feature envelope now includes recovery metadata:

```typescript
interface CanonicalRecoveryEnvelope extends CanonicalFeatureEnvelope {
  // Parent envelope fields (all 25 fields)
  packet_key: string,
  feature_id: string,
  // ... (all other canonical fields)
  
  // Recovery-specific fields
  is_recovery_packet: boolean,
  recovery_error_classes: string[],
  recovery_domains: string[],
  recovery_fit_score: number,
  recovery_policy_score: number,
  recovery_success_count: number,
  recovery_failure_count: number,
  recovery_last_used_at: Date | null,
}
```

### 6.2 Phase 8 Integration

Phase 8 writers already validate canonical shape; recovery annotation is a downstream enrichment:

1. **Phase 8A-C** (existing): Build canonical envelope ✅
2. **Phase 8D** (new): Tag recovery packets based on feature_id patterns
   - Look for `feature_id` matching recovery domain (e.g., `auth.sessions` → recovery domain `auth`)
   - Set `is_recovery_packet = true`
   - Set `recovery_error_classes` based on domain patterns
   - Set initial `recovery_fit_score` = PageRank authority

---

## Part 7: Execution Model (GPU/CPU/Async Separation)

### 7.1 CPU-Only Operations (Synchronous)

Error classification, HMM state transitions, recovery packet selection:
- **Where**: Main SvelteKit request thread
- **Cost**: 5–50ms per error

### 7.2 GPU Operations (Background)

Semantic similarity scoring, embedding distance calculation:
- **Where**: Background worker pool
- **Cost**: 100–500ms, non-blocking
- **Async**: Start on error, return top-1 immediately, refine in background

### 7.3 RL Policy Updates (Async, Background)

Collect outcomes, backprop through policy net, update Postgres:
- **Frequency**: Once per 100 errors or hourly
- **Latency**: 5–10 seconds, fully decoupled
- **Storage**: `recovery_policy_score` column + BitFrost cache invalidation

---

## Part 8: Data Completeness Roadmap

### Current Status (July 5, 2026)

| Field | Coverage | Status |
|-------|----------|--------|
| `feature_id` | 100% | ✅ Complete |
| `domain_class` | 100% | ✅ Complete |
| `title_id` | 100% | ✅ Complete |
| `tree_node_id` | 65.11% | ⏳ Backfill in progress |
| `concept_ids` | 0% | ⏳ LangExtract phase pending |
| `som_cluster` | 66.75% | ⏳ SOM training pending |

### Completion Order

1. **tree_node_id backfill** (AST-grep extraction, 1–2 days)
2. **concept_ids extraction** (LangExtract service, 2–4 hours)
3. **SOM 20×20 training** (K-means + SOM, 1–2 hours GPU time)
4. **Recovery annotation** (tag packets by domain, 30 min)
5. **RL policy training** (collect 100+ outcomes, 1 week)

---

## Part 9: Testing Strategy

### 9.1 Dry-Run Validation Gates

```bash
# Gate 1: Error signal generation
node scripts/atlas/validate-hmm-agentic-error.mjs --test-signal

# Gate 2: 2D cache plane
redis-cli KEYS 'bifrost:repair:*' | wc -l  # expect ≥ 40 keys

# Gate 3: 3D topological search
docker exec legal-ai-postgres psql -c "SELECT COUNT(*) FROM atlas_packets WHERE is_recovery_packet = true"

# Gate 4: HMM state transitions
node scripts/atlas/validate-hmm-agentic-error.mjs --verbose

# Gate 5: RL policy checkpoint
ls -la checkpoints/recovery_policy_*.pt | tail -1
```

### 9.2 E2E Test Case

```typescript
// Simulate error
const errorSignal = {
  error_class: 'ConnectivityError',
  domain: 'auth',
  message: 'Lucia session validation failed',
  caller_feature_id: 'auth.sessions'
};

// Select recovery packet
const recoveryPacket = await selectRecoveryPacket(errorSignal);
// Expected: packet_key matching auth domain, recovery_fit_score > 0.6

// Execute recovery
const outcome = await executeRecoveryPacket(recoveryPacket, errorSignal);
// Expected: outcome.state === 'RESOLVED' or 'FAILED'

// Log outcome for RL training
await logRecoveryOutcome({
  error_id: errorSignal.id,
  recovery_packet_key: recoveryPacket.key,
  state: outcome.state,
  latency_ms: outcome.latency
});
```

---

## Part 10: File Structure & NPM Scripts

### Files to Create

```
scripts/atlas/
├── lib/
│   ├── recovery-packet-registry.mjs       # Query recovery packets
│   ├── error-signal-classifier.mjs        # MapReduce error grouping
│   ├── hmm-state-machine.mjs              # HMM transitions
│   ├── recovery-selection.mjs             # 3D topological search
│   └── policy-net.mjs                     # RL policy inference
├── validate-hmm-agentic-error.mjs         # (already exists)
├── phase8d-recovery-annotation.mjs        # Tag recovery packets
├── train-recovery-policy.mjs              # RL training loop
└── execute-recovery-packet.mjs            # Worker that runs recovery
```

### NPM Scripts

```json
{
  "atlas:phase8d:recovery-tag:dry": "node scripts/atlas/phase8d-recovery-annotation.mjs --dry-run",
  "atlas:phase8d:recovery-tag:apply": "node scripts/atlas/phase8d-recovery-annotation.mjs --apply",
  "atlas:error:classify:test": "node scripts/atlas/validate-hmm-agentic-error.mjs --test-signal",
  "atlas:error:classify:verbose": "node scripts/atlas/validate-hmm-agentic-error.mjs --verbose",
  "atlas:recovery:train": "node scripts/atlas/train-recovery-policy.mjs",
  "atlas:recovery:execute": "node scripts/atlas/execute-recovery-packet.mjs --listen"
}
```

---

## Conclusion

This dimensional model provides a **structured, learnable framework** for error fixing:
- **4D latent space** encodes error semantics without rotation artifacts
- **3D topological search** finds recovery candidates efficiently
- **2D BitFrost cache** provides O(1) lookup for hot errors
- **HMM state machine** orchestrates recovery with clear failure modes
- **PyTorch RL** learns which packets work best for each error class over time

The architecture separates **classification (CPU)**, **search (GPU)**, and **RL training (async)** into independent pipelines, allowing each to scale independently.

**Next Steps (Session 105)**: Implement Phase 8D recovery annotation, then wire error signals from production logs into the HMM pipeline for live testing.
