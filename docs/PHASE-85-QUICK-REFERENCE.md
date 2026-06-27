# Phase 85: Quick Reference Card

## The Mission
Close the feedback loop: **Packet → Gemma4 → Artifact Registry → Semantic Diff → Replay DB → Reward Dataset → Fine-tuning**

## Priority Stack (Do in This Order)

### 🚨 LAYER 1: Artifact Registry (CRITICAL PATH)
**Blocker**: Without it, can't measure success or skip regeneration  
**Effort**: 40 hours  
**Timeline**: Days 1-5

**What to Build**:
```sql
-- Main table (atlas_artifacts)
artifact_id (UUID)
packet_key (FK)
artifact_type (summary|embedding|latent64|som_cell|redis_cache|markdown|qdrant_payload|gemma4_prompt|gemma4_output)
content_hash (SHA256)
generator (Gemma4|EmbeddingGemma|AutoEncoder|SOM|KarpathyBlender|etc)
generator_version (e.g., "gemma4-legal-iq4xs")
generator_config (JSONB: temperature, max_tokens, etc)
storage_backend (filesystem|qdrant|redis|postgres_jsonb|seaweedfs)
storage_location (file path, Qdrant point_id, Redis key)
gan_validated (boolean)
gan_validation_score (real)
supersedes_artifact_id (UUID, if replacing prior artifact)
created_at, updated_at
```

**Backfill**: Insert one record for each packet's summary + embedding
- 17,995 packets × 2 artifacts (summary + embedding) = ~35,990 records

**Wire**: Every time Gemma4/EmbeddingGemma/etc generates something, call:
```typescript
await logArtifact({
  packet_key, feature_id, artifact_type, content_hash,
  generator, generator_version, generator_config,
  storage_backend, storage_location,
  created_by: 'Gemma4'  // or whatever generator
});
```

**Dashboard**: Show for each packet:
- All artifacts generated from it
- Generator success rate
- GAN validation status

---

### ⏳ LAYER 2: Semantic Diff (GATES REGENERATION)
**Blocker**: Layer 1  
**Effort**: 20 hours  
**Timeline**: Days 4-5  
**Impact**: Skip 80-90% of unnecessary regenerations

**What to Build**:
```typescript
// Compute cosine similarity between old & new embeddings
similarity = cosineSimilarity(oldEmbedding, newEmbedding);

// Gate regeneration
if (similarity >= 0.98) return 'skip';           // 98%+ similar → don't regenerate
if (similarity >= 0.85) return 'partial';        // 85-98% → update cache only
return 'full';                                    // <85% → full regeneration
```

**Store Results**:
```sql
-- atlas_semantic_diffs table
diff_id (UUID)
packet_key
old_artifact_id
new_artifact_id
similarity (0.0-1.0)
recommendation (skip|partial|full)
action_taken (what actually happened)
regeneration_cost_saved (estimated compute cost avoided)
created_at
```

**Dashboard**: Show:
- Regenerations prevented by similarity
- Accuracy of thresholds ("When similarity was 0.87, regeneration was worth it X% of the time")

---

### ⏳ LAYER 3: Artifact Lineage Graph
**Blocker**: Layer 1  
**Effort**: 15 hours  
**Timeline**: Week 2

**What to Build**:
```sql
-- atlas_artifact_lineage table
edge_id (UUID)
source_artifact_id (e.g., summary artifact)
target_artifact_id (e.g., embedding artifact generated from summary)
edge_type (generated_from|cached_from|regenerated_from|validated_by|superseded_by)
generator (EmbeddingGemma, etc)
created_at, git_commit
```

**Query Example**:
```sql
-- Show me why GAN validation failed
WITH RECURSIVE lineage AS (
  SELECT artifact_id, generator, 0 as depth
  FROM atlas_artifacts
  WHERE artifact_id = 'failed-artifact-id'
  
  UNION ALL
  
  SELECT a.artifact_id, a.generator, l.depth + 1
  FROM atlas_artifacts a
  JOIN atlas_artifact_lineage al ON a.artifact_id = al.source_artifact_id
  JOIN lineage l ON al.target_artifact_id = l.artifact_id
)
SELECT * FROM lineage ORDER BY depth;
```

---

### ⏳ LAYER 4: Replay Database
**Blocker**: Layer 1  
**Effort**: 20 hours  
**Timeline**: Week 3

**What to Build**:
```sql
-- agent_runs table
trace_id (UUID, primary key)
timestamp
user_prompt (TEXT)
retrieved_packet_ids (UUID[])
retrieval_strategy (cache_hit|qdrant|neo4j|fallback)
mcp_tools_called (VARCHAR[])
llm_model (Gemma4 version)
llm_output (TEXT)
artifacts_generated (UUID[])
gan_score (REAL)
cache_hits (INT)
cache_misses (INT)
total_latency_ms (INT)
success (BOOLEAN)
```

**Query Examples**:
```sql
-- Which packets are slowest to generate?
SELECT packet_key, AVG(total_latency_ms) as avg_latency
FROM agent_runs, UNNEST(retrieved_packet_ids) as pid
GROUP BY packet_key ORDER BY avg_latency DESC;

-- Which retrieval strategy works best for legal queries?
SELECT retrieval_strategy,
       COUNT(CASE WHEN success THEN 1 END) * 100.0 / COUNT(*) as success_rate
FROM agent_runs
WHERE user_prompt ILIKE '%patent%'
GROUP BY retrieval_strategy;
```

---

### ⏳ LAYER 5: Reward Dataset
**Blocker**: Layer 1 + 4  
**Effort**: 15 hours  
**Timeline**: Week 4

**What to Build**:
```sql
-- artifact_rewards table
reward_id (UUID)
artifact_id (FK to artifacts)
reward_dimension (compilation|tests|lint|user_acceptance|performance|security)
reward_score (-1.0 to +1.0)
context_before (source code)
context_after (generated code)
user_accepted (BOOLEAN)
user_feedback_text (TEXT)
```

**Export for Training**:
```sql
SELECT 
  a.generator, a.generator_config, a.artifact_metadata,
  ar.reward_score, ar.reward_dimension,
  ar.context_before, ar.context_after, ar.user_accepted
FROM atlas_artifacts a
JOIN artifact_rewards ar ON a.artifact_id = ar.artifact_id
WHERE ar.reward_score > 0.7 AND a.generator = 'Gemma4'
ORDER BY ar.reward_score DESC
-- → export to SFT pairs for QLoRA fine-tuning
```

---

## Weekly Checklist

### Week 1: Artifact Registry + Semantic Diff
- [ ] Create `atlas_artifacts` schema
- [ ] Create `atlas_artifact_lineage` schema
- [ ] Create `atlas_semantic_diffs` schema
- [ ] Backfill 17,995 existing packets
- [ ] Wire Gemma4 to log summaries
- [ ] Wire EmbeddingGemma to log embeddings
- [ ] Implement cosineSimilarity()
- [ ] Define thresholds (0.98, 0.85)
- [ ] Integrate semantic diff into git-diff workflow
- [ ] Dashboard: artifact lineage + semantic diff results

### Week 2: Wire All Generators
- [ ] AutoEncoder → log latent64
- [ ] SOM → log som_cell
- [ ] KarpathyBlender → log karpathy_tags
- [ ] Redis → log cache keys
- [ ] Markdown generator → log files

### Week 3: Replay Database
- [ ] Create `agent_runs` schema
- [ ] Instrument ACP pipeline to log runs
- [ ] Create queries for "what works?"
- [ ] Dashboard: performance by strategy

### Week 4: Reward Dataset + Training Export
- [ ] Create `artifact_rewards` schema
- [ ] Wire compilation/test/lint checkers
- [ ] Collect user feedback
- [ ] Export training pairs for QLoRA
- [ ] Dashboard: reward distribution

---

## Success Metrics

By end of Phase 85:
- ✅ All artifacts logged with generator + version
- ✅ Semantic diff prevents 80% of unnecessary regenerations
- ✅ Lineage tree queryable (depth 5, < 200ms)
- ✅ Dashboard shows generator success rate
- ✅ Export training pairs from artifact_rewards
- ✅ Replay DB has 1000+ runs logged

---

## Critical File References

| What | File |
|------|------|
| Full Architecture Analysis | `docs/architecture/SESSION-84-MISSING-LAYERS-ANALYSIS.md` |
| Phase 85 Detailed Spec | `docs/architecture/PHASE-85-ARTIFACT-REGISTRY-SPEC.md` |
| Schema Design | `docs/architecture/PHASE-85-ARTIFACT-REGISTRY-SPEC.md` § Task 1 |
| Implementation Tasks | `docs/architecture/PHASE-85-ARTIFACT-REGISTRY-SPEC.md` § Tasks 2-5 |
| Project Memory | `memory/session-84-architecture-gaps-identified.md` |

---

## The 30-Second Pitch

**Problem**: We generate artifacts (summaries, embeddings, caches) but don't track them. Result: blind regeneration, can't measure success.

**Solution**: Artifact registry + semantic diff.

**Impact**: 
- Know what works (generator success rate)
- Skip 80-90% of unnecessary regenerations
- Collect training data for fine-tuning

**Timeline**: 1 week for layers 1-2, 2 more weeks for layers 3-5.

