# Phase 85: Artifact Registry Implementation Spec

**Priority**: HIGHEST (blocks semantic diff, replay database, and fine-tuning)  
**Effort**: 40-60 hours  
**Timeline**: 1 week  
**Impact**: Closes feedback loop between generation and regeneration

---

## What Is an Artifact?

An **artifact** is anything generated FROM a packet or another artifact. Not the packet itself—what flows OUT of it.

```
Packet: auth.ts (static)
  ↓ (Gemma4 generates)
Artifact: summary ("Validates Lucia sessions...")
  ↓ (EmbeddingGemma generates)
Artifact: embedding (768-dim vector)
  ↓ (AutoEncoder compresses)
Artifact: latent64 (64-dim vector)
  ↓ (SOM assigns)
Artifact: som_cell (integer 0-399)
  ↓ (KarpathyBlender scores)
Artifact: karpathy_tags (JSONB with scores)
  ↓ (Materialized into cache)
Artifact: redis_cache (key: bitfrost:feature:auth.sessions)
  ↓ (Packaged for LLM)
Artifact: gemma4_prompt (full prompt text)
```

Each artifact has:
- **Identity**: artifact_id (UUID)
- **Lineage**: packet_key + depends_on_artifacts
- **Generator**: What made it (with version)
- **Content Hash**: SHA256 for dedup & diffing
- **Storage Location**: Where to find it
- **Validation**: GAN score if applicable

---

## Task 1: Create Schema (4 hours)

### 1.1 Main Table: `atlas_artifacts`

```sql
CREATE TABLE atlas_artifacts (
  -- Primary Key
  artifact_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Source & Classification
  packet_key VARCHAR(255) NOT NULL,
  feature_id VARCHAR(255) NOT NULL,
  artifact_type VARCHAR(50) NOT NULL CHECK (artifact_type IN (
    'summary',
    'embedding',
    'latent64',
    'som_cell',
    'karpathy_tags',
    'qdrant_payload',
    'redis_cache',
    'markdown',
    'documentation',
    'gemma4_prompt',
    'gemma4_output',
    'gpu_projection',
    'compiled_output',
    'test_results',
    'lint_report'
  )),
  
  -- Content Hashing (For Dedup & Diffing)
  content_hash VARCHAR(64),
  content_hash_algorithm VARCHAR(20) DEFAULT 'sha256',
  
  -- Generator Tracking (REPRODUCIBILITY)
  generator VARCHAR(100) NOT NULL CHECK (generator IN (
    'Gemma4',
    'EmbeddingGemma',
    'AutoEncoder',
    'SOMClusterer',
    'KarpathyBlender',
    'RedisWriter',
    'MarkdownGenerator',
    'CompilationTool',
    'TestRunner',
    'LinterTool',
    'GAN',
    'GemmaVision'
  )),
  generator_version VARCHAR(20) NOT NULL,       -- e.g., "gemma4-legal-iq4xs"
  generator_config JSONB,                       -- temperature, max_tokens, model params
  
  -- Lineage & Reproducibility
  git_commit VARCHAR(40),                       -- git SHA at generation time
  source_packet_hash VARCHAR(64),               -- SHA256 of source packet at generation time
  depends_on_artifacts UUID[],                  -- IDs of artifacts that fed this one (e.g., embedding depends on summary)
  supersedes_artifact_id UUID,                  -- If this replaces a prior artifact
  
  -- Validation
  gan_validated BOOLEAN DEFAULT false,
  gan_validation_score REAL,
  gan_validation_error TEXT,
  validation_timestamp TIMESTAMP,
  
  -- Storage Location
  storage_location VARCHAR(500),                -- file path, Qdrant point_id, Redis key, etc.
  storage_backend VARCHAR(50) CHECK (storage_backend IN (
    'filesystem',
    'qdrant',
    'redis',
    'postgres_jsonb',
    'seaweedfs',
    'memory'
  )),
  
  -- Metadata
  artifact_metadata JSONB,                      -- artifact-specific: qdrant_point_id, redis_key, file_path, etc.
  tags TEXT[],                                  -- for filtering & discovery: 'legal', 'patent', 'high-quality', etc.
  
  -- Audit Trail
  created_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(100),                      -- 'Gemma4', 'GAN', 'batch-job', etc.
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by VARCHAR(100),
  
  -- Constraints
  FOREIGN KEY (packet_key) REFERENCES atlas_packets(packet_key) ON DELETE CASCADE,
  
  -- Indexes (Critical for Fast Queries)
  UNIQUE (packet_key, artifact_type, generator_version)  -- One summary per packet per generator
);

CREATE INDEX idx_artifact_packet ON atlas_artifacts(packet_key);
CREATE INDEX idx_artifact_type ON atlas_artifacts(artifact_type);
CREATE INDEX idx_artifact_generator ON atlas_artifacts(generator, generator_version);
CREATE INDEX idx_artifact_git_commit ON atlas_artifacts(git_commit);
CREATE INDEX idx_artifact_hash ON atlas_artifacts(content_hash);
CREATE INDEX idx_artifact_created ON atlas_artifacts(created_at DESC);
CREATE INDEX idx_artifact_supersedes ON atlas_artifacts(supersedes_artifact_id);
CREATE INDEX idx_artifact_storage ON atlas_artifacts(storage_backend, storage_location);
```

### 1.2 Lineage Tracking: `atlas_artifact_lineage`

```sql
CREATE TABLE atlas_artifact_lineage (
  lineage_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  source_artifact_id UUID NOT NULL,      -- "summary" artifact
  target_artifact_id UUID NOT NULL,      -- "embedding" artifact (generated from summary)
  
  edge_type VARCHAR(50) NOT NULL CHECK (edge_type IN (
    'generated_from',                    -- embedding was generated from summary
    'cached_from',                       -- redis_cache materialized from embedding
    'regenerated_from',                  -- new summary replaces old (semantic diff triggered)
    'validated_by',                      -- GAN validated this artifact
    'superseded_by'                      -- this artifact was replaced
  )),
  
  generator VARCHAR(100),                -- Which system created this edge (e.g., "EmbeddingGemma")
  created_at TIMESTAMP DEFAULT NOW(),
  git_commit VARCHAR(40),
  
  FOREIGN KEY (source_artifact_id) REFERENCES atlas_artifacts(artifact_id) ON DELETE CASCADE,
  FOREIGN KEY (target_artifact_id) REFERENCES atlas_artifacts(artifact_id) ON DELETE CASCADE,
  
  INDEX idx_lineage_source ON atlas_artifact_lineage(source_artifact_id),
  INDEX idx_lineage_target ON atlas_artifact_lineage(target_artifact_id),
  INDEX idx_lineage_edge_type ON atlas_artifact_lineage(edge_type)
);
```

### 1.3 Semantic Diff Record: `atlas_semantic_diffs`

```sql
CREATE TABLE atlas_semantic_diffs (
  diff_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  packet_key VARCHAR(255) NOT NULL,
  old_artifact_id UUID,                  -- Previous summary/artifact
  new_artifact_id UUID,                  -- Current summary/artifact
  
  similarity REAL,                       -- 0.0 to 1.0 (cosine similarity)
  recommendation VARCHAR(50) CHECK (recommendation IN (
    'skip',                              -- 0.98+: don't regenerate
    'partial',                           -- 0.85-0.98: update cache/metadata only
    'full'                               -- < 0.85: full regeneration
  )),
  
  -- What actually happened
  action_taken VARCHAR(50) CHECK (action_taken IN (
    'skipped',
    'partial_update',
    'full_regeneration',
    'manual_override'
  )),
  action_reason TEXT,
  
  -- Impact measurement
  regeneration_cost_saved REAL,          -- Estimated compute cost avoided
  latency_ms INT,                        -- Time to compute the diff
  
  created_at TIMESTAMP DEFAULT NOW(),
  git_commit VARCHAR(40),
  
  INDEX idx_semantic_diff_packet ON atlas_semantic_diffs(packet_key),
  INDEX idx_semantic_diff_recommendation ON atlas_semantic_diffs(recommendation),
  INDEX idx_semantic_diff_created ON atlas_semantic_diffs(created_at DESC)
);
```

### 1.4 Views for Easy Querying

```sql
-- View: Full lineage tree for a packet
CREATE VIEW artifact_lineage_tree AS
WITH RECURSIVE lineage AS (
  SELECT 
    artifact_id, packet_key, feature_id, artifact_type, generator, 
    storage_backend, gan_validated, 0 as depth
  FROM atlas_artifacts
  WHERE artifact_type = 'summary'  -- Start from summaries
  
  UNION ALL
  
  SELECT 
    a.artifact_id, a.packet_key, a.feature_id, a.artifact_type, a.generator,
    a.storage_backend, a.gan_validated, l.depth + 1
  FROM atlas_artifacts a
  JOIN atlas_artifact_lineage al ON a.artifact_id = al.source_artifact_id
  JOIN lineage l ON al.target_artifact_id = l.artifact_id
  WHERE l.depth < 10  -- Prevent cycles
)
SELECT * FROM lineage;

-- View: Artifacts waiting for GAN validation
CREATE VIEW artifacts_pending_validation AS
SELECT 
  artifact_id, packet_key, feature_id, artifact_type, generator,
  generator_version, created_at, created_by
FROM atlas_artifacts
WHERE gan_validated = false
  AND artifact_type IN ('summary', 'embedding', 'gemma4_output')
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at ASC;

-- View: Generator performance (success rate)
CREATE VIEW generator_success_rate AS
SELECT 
  generator, generator_version,
  COUNT(*) as total_artifacts,
  SUM(CASE WHEN gan_validated AND gan_validation_score > 0.7 THEN 1 ELSE 0 END) as high_quality,
  SUM(CASE WHEN gan_validated AND gan_validation_score > 0.7 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as success_rate,
  AVG(gan_validation_score) as avg_score
FROM atlas_artifacts
WHERE gan_validated = true
GROUP BY generator, generator_version
ORDER BY success_rate DESC;
```

### Implementation
```bash
# 1. Create schema
npm run atlas:artifacts:schema:create

# 2. Backfill existing packets with 'summary' artifact records
npm run atlas:artifacts:backfill:existing

# 3. Verify counts
npm run atlas:artifacts:verify:counts
```

---

## Task 2: Wire Generators to Log Artifacts (8 hours)

### 2.1 Gemma4 Summary Generation

**File**: `src/lib/server/ai/gemma4-client.ts` (or equivalent)

```typescript
// After calling Gemma4, log the artifact

async function generateSummaryArtifact(packet: Packet): Promise<string> {
  const summary = await bifrostChat([
    { role: 'system', content: 'Summarize this code...' },
    { role: 'user', content: packet.content },
  ]);
  
  // 1. Store the artifact
  const artifact = await db.insert(atlasArtifacts).values({
    artifact_id: randomUUID(),
    packet_key: packet.packet_key,
    feature_id: packet.feature_id,
    artifact_type: 'summary',
    content_hash: sha256(summary),
    generator: 'Gemma4',
    generator_version: 'gemma4-legal-iq4xs',
    generator_config: {
      temperature: 0.3,
      max_tokens: 200,
      model: 'gemma4-legal-iq4xs',
    },
    git_commit: getCurrentCommit(),
    source_packet_hash: sha256(packet.content),
    storage_backend: 'postgres_jsonb',
    storage_location: 'atlas_packets.summary',
    artifact_metadata: {
      input_tokens: summary.usage?.prompt_tokens,
      output_tokens: summary.usage?.completion_tokens,
    },
    created_by: 'Gemma4',
  });
  
  // 2. Create lineage edge (if summary depends on something)
  // (Most summaries are generated directly from packets, not other artifacts)
  
  return summary;
}
```

### 2.2 EmbeddingGemma Embedding Generation

**File**: `src/lib/server/embeddings/embedding-client.ts`

```typescript
async function embedAndLog(summary: string, packet_key: string): Promise<Float32Array> {
  const embedding = await ollamaEmbed(summary, 'embeddinggemma:latest');
  
  // Store the embedding artifact
  const artifact = await db.insert(atlasArtifacts).values({
    artifact_id: randomUUID(),
    packet_key,
    artifact_type: 'embedding',
    content_hash: sha256(Buffer.from(embedding).toString('base64')),
    generator: 'EmbeddingGemma',
    generator_version: 'embeddinggemma:latest',
    generator_config: {
      pooling: 'mean',
      normalization: 'l2',
      dimension: 768,
    },
    storage_backend: 'qdrant',
    storage_location: `point:${qdrant_point_id}`,  // Qdrant point ID
    artifact_metadata: {
      qdrant_point_id,
      qdrant_collection: 'codebase_chunks_768',
      dimension: 768,
    },
    created_by: 'EmbeddingGemma',
  });
  
  // Create lineage: embedding generated from summary
  const summaryArtifact = await db.query(
    `SELECT artifact_id FROM atlas_artifacts 
     WHERE packet_key = $1 AND artifact_type = 'summary' 
     ORDER BY created_at DESC LIMIT 1`,
    [packet_key]
  );
  
  if (summaryArtifact) {
    await db.insert(atlasArtifactLineage).values({
      source_artifact_id: summaryArtifact.artifact_id,
      target_artifact_id: artifact.artifact_id,
      edge_type: 'generated_from',
      generator: 'EmbeddingGemma',
    });
  }
  
  return embedding;
}
```

### 2.3 AutoEncoder Compression

```typescript
async function compressToLatent64(embedding: Float32Array, packet_key: string) {
  const latent64 = await gpuAutoEncoder.encode(embedding);
  
  await db.insert(atlasArtifacts).values({
    artifact_id: randomUUID(),
    packet_key,
    artifact_type: 'latent64',
    content_hash: sha256(Buffer.from(latent64).toString('base64')),
    generator: 'AutoEncoder',
    generator_version: 'ae-768-to-64-v2',
    generator_config: {
      input_dim: 768,
      output_dim: 64,
      architecture: 'VAE',
    },
    storage_backend: 'redis',
    storage_location: `latent:${packet_key}:64`,
    artifact_metadata: { norm: computeL2Norm(latent64) },
    created_by: 'AutoEncoder',
  });
}
```

### 2.4 Redis Cache Materialization

```typescript
async function materializeRedisCache(
  packet_key: string,
  feature_id: string,
  centroid: Float32Array
) {
  const redisKey = `centroid:feature:${feature_id}`;
  await redis.set(redisKey, JSON.stringify(centroid), 'EX', 86400);
  
  // Log the artifact
  await db.insert(atlasArtifacts).values({
    artifact_id: randomUUID(),
    packet_key,
    feature_id,
    artifact_type: 'redis_cache',
    generator: 'RedisWriter',
    generator_version: 'v1',
    storage_backend: 'redis',
    storage_location: redisKey,
    artifact_metadata: {
      redis_key: redisKey,
      ttl_seconds: 86400,
      size_bytes: JSON.stringify(centroid).length,
    },
    created_by: 'RedisWriter',
  });
}
```

---

## Task 3: Backfill Existing Artifacts (8 hours)

### 3.1 Backfill Script: `scripts/atlas/backfill-artifact-registry.mjs`

```javascript
/**
 * Backfill artifact registry for all existing packets
 * 
 * For each packet:
 * 1. Check if it has a summary (in metadata or column)
 * 2. Create 'summary' artifact record
 * 3. Check if it's in Qdrant (has qdrant_point_id)
 * 4. Create 'embedding' artifact record
 * 5. Create lineage edges
 */

import { db } from '$lib/server/db/client.js';
import { Pool } from 'pg';

async function backfillArtifactRegistry() {
  const batchSize = 500;
  let processedCount = 0;
  
  // 1. Get all packets
  const allPackets = await db.query(`SELECT * FROM atlas_packets`);
  console.log(`Processing ${allPackets.length} packets...`);
  
  for (let i = 0; i < allPackets.length; i += batchSize) {
    const batch = allPackets.slice(i, i + batchSize);
    
    for (const packet of batch) {
      try {
        // Create 'summary' artifact if summary exists
        if (packet.summary) {
          const summaryHash = sha256(packet.summary);
          
          await db.insert(atlasArtifacts).values({
            packet_key: packet.packet_key,
            feature_id: packet.feature_id,
            artifact_type: 'summary',
            content_hash: summaryHash,
            generator: 'Gemma4',  // Assume all existing summaries came from Gemma4
            generator_version: 'gemma4-rotorquant:latest',
            generator_config: {},
            storage_backend: 'postgres_jsonb',
            storage_location: 'atlas_packets.summary',
            artifact_metadata: {},
            created_by: 'backfill',
            created_at: packet.created_at || new Date(),
          });
          
          processedCount++;
        }
        
        // Create 'embedding' artifact if Qdrant point ID exists
        if (packet.metadata?.qdrant_point_id) {
          const embedHash = sha256(`qdrant:${packet.metadata.qdrant_point_id}`);
          
          await db.insert(atlasArtifacts).values({
            packet_key: packet.packet_key,
            feature_id: packet.feature_id,
            artifact_type: 'embedding',
            content_hash: embedHash,
            generator: 'EmbeddingGemma',
            generator_version: 'embeddinggemma:latest',
            storage_backend: 'qdrant',
            storage_location: `point:${packet.metadata.qdrant_point_id}`,
            artifact_metadata: {
              qdrant_point_id: packet.metadata.qdrant_point_id,
              qdrant_collection: 'codebase_chunks_768',
            },
            created_by: 'backfill',
            created_at: packet.updated_at || packet.created_at || new Date(),
          });
          
          processedCount++;
        }
      } catch (err) {
        console.error(`Error processing packet ${packet.packet_key}: ${err.message}`);
      }
    }
    
    console.log(`Progress: ${i + batchSize} / ${allPackets.length}`);
  }
  
  console.log(`✅ Backfill complete. Created ${processedCount} artifact records.`);
}

backfillArtifactRegistry();
```

### 3.2 npm Script
```json
{
  "atlas:artifacts:backfill": "node scripts/atlas/backfill-artifact-registry.mjs",
  "atlas:artifacts:backfill:verify": "node scripts/atlas/verify-artifact-registry.mjs"
}
```

---

## Task 4: Add Artifact Logging to Pipeline (12 hours)

### 4.1 Create Artifact Logger Utility

**File**: `src/lib/server/artifacts/artifact-logger.ts`

```typescript
import { db } from '$lib/server/db/client.js';
import { sha256 } from '$lib/utils/hashing.js';

export interface LogArtifactInput {
  packet_key: string;
  feature_id: string;
  artifact_type: string;
  content_hash?: string;
  content?: string;  // Will compute hash if provided
  generator: string;
  generator_version: string;
  generator_config?: Record<string, any>;
  storage_backend: 'filesystem' | 'qdrant' | 'redis' | 'postgres_jsonb' | 'seaweedfs' | 'memory';
  storage_location: string;
  artifact_metadata?: Record<string, any>;
  depends_on_artifacts?: string[];  // Other artifact IDs
  tags?: string[];
  created_by?: string;
}

export async function logArtifact(input: LogArtifactInput) {
  const contentHash = input.content_hash || (input.content ? sha256(input.content) : null);
  
  const artifact = await db.insert(atlasArtifacts).values({
    artifact_id: randomUUID(),
    packet_key: input.packet_key,
    feature_id: input.feature_id,
    artifact_type: input.artifact_type,
    content_hash: contentHash,
    generator: input.generator,
    generator_version: input.generator_version,
    generator_config: input.generator_config || {},
    git_commit: getCurrentCommit(),
    storage_backend: input.storage_backend,
    storage_location: input.storage_location,
    artifact_metadata: input.artifact_metadata || {},
    tags: input.tags || [],
    created_by: input.created_by || 'unknown',
  });
  
  // Create lineage edges if this depends on other artifacts
  if (input.depends_on_artifacts?.length > 0) {
    for (const sourceId of input.depends_on_artifacts) {
      await db.insert(atlasArtifactLineage).values({
        source_artifact_id: sourceId,
        target_artifact_id: artifact.artifact_id,
        edge_type: 'generated_from',
        generator: input.generator,
      });
    }
  }
  
  return artifact;
}
```

### 4.2 Integrate into Existing Generation Pipelines

Wire `logArtifact()` into:
- Gemma4 summary generation
- EmbeddingGemma embeddings
- AutoEncoder compression
- KarpathyBlender scoring
- Redis materialization
- Markdown document generation

---

## Task 5: Create Dashboard (6 hours)

### 5.1 Routes: `/api/artifacts/*`

```typescript
// GET /api/artifacts/by-packet/{packet_key}
// Returns: All artifacts generated from this packet + lineage

// GET /api/artifacts/lineage/{artifact_id}
// Returns: Full lineage tree (backwards and forwards)

// GET /api/artifacts/generator-stats
// Returns: Success rate by generator/version

// GET /api/artifacts/pending-validation
// Returns: Artifacts waiting for GAN score

// POST /api/artifacts/validate/{artifact_id}
// Body: { gan_score: 0.85, gan_validation_error: null }
// Updates: Sets gan_validated=true, stores score
```

### 5.2 UI: `/artifacts/*` Pages

```svelte
<!-- /artifacts/[packet_key] - Show all artifacts for a packet -->
- Timeline view of artifacts
- Lineage tree visualization
- GAN validation status per artifact
- Storage locations (Qdrant point, Redis key, file path)

<!-- /artifacts/generators - Generator performance dashboard -->
- Table: generator, version, success_rate, avg_gan_score
- Sorting: by success rate
- Filter: by artifact type

<!-- /artifacts/pending - Validation queue -->
- List of artifacts waiting for GAN score
- Bulk validation actions
```

---

## Success Criteria

### Acceptance Tests

```bash
# 1. Schema exists
npm run atlas:artifacts:schema:verify
# Expected: All 3 tables + 4 views + indexes present

# 2. Backfill complete
npm run atlas:artifacts:backfill:verify
# Expected: 
#   - 17,995 'summary' artifacts (one per packet)
#   - ~13,500 'embedding' artifacts (for Qdrant-linked packets)
#   - Total: ~31,500 artifact records

# 3. New artifacts logged on generation
npm run test:artifacts:logging
# Expected:
#   - Generate summary → artifact_id returned
#   - Artifact queryable via /api/artifacts/by-packet/{packet_key}
#   - Lineage edges created

# 4. Queries fast
npm run test:artifacts:performance
# Expected:
#   - Get all artifacts for 1 packet: < 50ms
#   - List generators: < 100ms
#   - Lineage tree (depth 5): < 200ms

# 5. Dashboard functional
npm run test:artifacts:dashboard
# Expected:
#   - /artifacts page loads
#   - Generator stats calculated
#   - Lineage visualization renders
```

---

## Files to Create/Modify

| File | Type | Lines | Description |
|------|------|-------|-------------|
| `drizzle/manual/0050_artifacts_registry.sql` | Schema | 150 | Create 3 tables + 4 views + indexes |
| `src/lib/server/artifacts/artifact-logger.ts` | Utility | 80 | Log artifact helper function |
| `scripts/atlas/backfill-artifact-registry.mjs` | Script | 120 | Backfill 17,995 existing packets |
| `src/lib/server/ai/gemma4-client.ts` | Modified | +15 | Wire logging to summary generation |
| `src/lib/server/embeddings/embedding-client.ts` | Modified | +15 | Wire logging to embedding generation |
| `src/routes/api/artifacts/+server.ts` | API | 100 | GET /api/artifacts/* endpoints |
| `src/routes/(app)/artifacts/+page.svelte` | UI | 200 | Dashboard & visualization |
| `tests/artifacts.spec.ts` | Tests | 150 | Schema + logging + query tests |

---

## Timeline (1 week)

**Day 1**: Schema creation + backfill (8h)  
**Day 2**: Wire Gemma4 + EmbeddingGemma (6h)  
**Day 3**: Wire AutoEncoder + Redis (4h)  
**Day 4**: Dashboard routes + UI (8h)  
**Day 5**: Testing + refinement (4h)  

**Total**: 40 hours

---

## Why This Unblocks Everything

**Without artifact registry**:
- Generate summary → can't trace if generation succeeded
- Regenerate redundantly (no history)
- Can't measure which generators work
- Can't collect training data (no artifact-to-reward link)

**With artifact registry**:
- Every artifact is logged + validated
- Know exactly what was generated when + why
- Measure generator success rate
- Feed successful artifacts into fine-tuning
- Build semantic diff (compare old vs new artifact hashes)
- Build replay database (what artifacts led to user acceptance?)

This is the **foundation** for everything that comes next.

