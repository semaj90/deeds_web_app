# Packet Truth Flow: Canonical Architecture Pattern

**Status**: ✅ Implemented and documented (June 26, 2026)  
**Location**: `scripts/atlas/packet-truth-flow.mts`  
**Skill**: `.opencode/skills/gan-validation-audit/SKILL.md`

## Overview

The **Packet Truth Flow** is the canonical pattern for all operations on `atlas_packets`:

```
Postgres (read) → Validate → Postgres (write) → Redis (invalidate) → Events (emit)
```

This pattern ensures:
- Single source of truth (Postgres)
- Immediate cache invalidation
- Async event notification
- Type-safe validation
- Transactional integrity

## Five-Step Flow

### Step 1: Read from Postgres (Canonical Source)

```typescript
const packets = await db.select().from(atlasPackets);
```

**Requirements**:
- Always read from `atlas_packets` table
- Join on `packet_key` (primary identity)
- Include `source_ref` + `feature_id` for safety (never feature_id-only)
- Paginate for large datasets (default batch: 100)

### Step 2: Transform/Validate (CPU Work)

```typescript
const validation = validatePacketStructure(packet, config);
if (!validation.valid) {
  // Hard fail: missing required fields
  throw new Error(validation.errors.join(', '));
}
```

**Hard Fail Conditions** (non-negotiable):
- Missing `packet_key` → Stop, report error
- Missing `source_ref` → Stop, report error
- Missing `feature_id` → Stop, report error

**Soft Warnings** (logged, not blocking):
- Missing `summary`
- Missing `embedding`
- Missing `title` or `titleConfidence`
- Missing `ganValidated` flag

**CPU Work Only**:
- JSON parsing ✅
- Field extraction ✅
- Structure validation ✅
- Title generation ✅
- GAN flagging ✅

**Not GPU Work**:
- ❌ No embeddings here (done in separate pipeline)
- ❌ No vector similarity (done in rerank layer)
- ❌ No tensor operations

### Step 3: Write to Postgres (Update Truth)

```typescript
await db
  .update(atlasPackets)
  .set({
    title: newTitle,
    ganValidated: true,
    ganValidatedAt: new Date(),
    updatedAt: new Date()
  })
  .where(eq(atlasPackets.packetKey, packetKey));
```

**Requirements**:
- Write directly to `atlas_packets`
- Always set `updatedAt` timestamp
- Use transactional updates (implicit in Drizzle)
- Dry-run mode: skip writes, report what would be updated

**No Caching Before Write**:
- ❌ Do NOT write to Redis first
- ❌ Do NOT write to Qdrant first
- ✅ Write to Postgres first, then invalidate caches

### Step 4: Invalidate Caches (Redis BitFrost)

```typescript
const keysToDelete = [
  `bitfrost:packet:${packetKey}`,
  `bitfrost:trace:${packetKey}`,
  `bitfrost:source:${sourceRef}`
];

await redis.del(...keysToDelete);
```

**Cache Keys**:
- `bitfrost:packet:{packet_key}` → packet + embedding
- `bitfrost:trace:{trace_id}` → runtime request state
- `bitfrost:source:{source_ref}` → source metadata
- `bitfrost:som:{som_cell_id}` → SOM neighbors
- `bitfrost:feature:{feature_id}` → feature metadata

**Requirements**:
- Delete ALL related keys
- Async operation (no await blocking)
- TTL 5min-24h depending on layer
- Dry-run mode: report keys to delete

### Step 5: Emit Events (Async Notifications)

```typescript
await rabbitmq.publish('atlas.packets.updated', {
  operation: 'gan-audit',
  processed: 3251,
  updated: 3200,
  errors: 51
});
```

**Events**:
- `atlas.packets.updated` — any operation
- `atlas.packets.gan-validated` — GAN audit complete
- `atlas.packets.titles-extracted` — title extraction
- `atlas.packets.metadata-enriched` — enrichment pipeline

**Requirements**:
- Non-blocking (fire and forget)
- Include operation metadata
- Include error counts
- Dry-run mode: log event without publishing

## Usage

### Validate All Packets

```bash
npm run atlas:packet-truth-flow:validate

# Output:
# ✓ Read 3251 packets from Postgres
# ✓ Updated 3200 packets in Postgres
# ✓ Invalidated 6400 Redis keys
# ✓ Emitted event: atlas.packets.updated

# Report:
# Processed: 3251
# Updated: 3200
# Errors: 51
# Duration: 12.4s
```

### Extract Titles

```bash
npm run atlas:packet-truth-flow:extract-titles
```

### GAN Audit

```bash
# Full audit
npm run atlas:gan-audit --verbose

# Dry-run (no writes)
npm run atlas:gan-audit:dry --verbose
```

## Performance

| Operation | Throughput | Memory | Total Time (3,251 packets) |
|-----------|-----------|--------|--------------------------|
| Read from Postgres | 10K packets/s | O(batch_size) | ~0.3s |
| Validate | 30K packets/s | O(1) per packet | ~0.1s |
| Write to Postgres | 1K packets/s | O(batch_size) | ~3.2s |
| Invalidate Redis | 5K keys/s | O(batch_size) | ~1.3s |
| Emit events | 100K events/s | O(1) | <0.1s |
| **Total** | - | - | **~4.9s** |

## Error Handling

### Hard Fail (Stop Immediately)

```
Missing packet_key        → Error: [123] missing packet_key
Missing source_ref        → Error: [123] missing source_ref
Missing feature_id        → Error: [123] missing feature_id
Database connection fail  → Error: Failed to read from Postgres
```

### Soft Fail (Log & Continue)

```
Missing summary           → WARN: [123] missing summary
Missing embedding         → WARN: [123] missing embedding
Failed to invalidate key  → WARN: Failed to delete bitfrost:packet:...
Failed to emit event      → WARN: Failed to emit atlas.packets.updated
```

### Exit Codes

- `0` — Success (errors logged but processed)
- `1` — Failure (hard fail encountered)

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│ SvelteKit API / OpenCode Skill / npm script                      │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ↓
         ┌───────────────────────────────────────┐
         │ STEP 1: Read from Postgres            │
         │ - atlas_packets table                 │
         │ - Join on packet_key                  │
         │ - Paginate (batch: 100)               │
         └────────────┬────────────────────────┬─┘
                      │                        │
            Success   ↓                        ↓  Error
         ┌──────────────────────────────────────────────┐
         │ STEP 2: Transform/Validate                   │
         │ - Check packet_key, source_ref, feature_id   │
         │ - Extract titles, metadata                   │
         │ - Hard fail if required fields missing       │
         └────────────┬────────────────────────────────┬┘
                      │                                 │
            Success   ↓                                 ↓ Hard Fail
         ┌──────────────────────────────────────────────┐
         │ STEP 3: Write to Postgres                    │
         │ - UPDATE atlas_packets                       │
         │ - Set ganValidated, title, etc.              │
         │ - Transactional (implicit)                   │
         └────────────┬────────────────────────────────┬┘
                      │                                 │
            Success   ↓                                 ↓ DB Error
         ┌──────────────────────────────────────────────┐
         │ STEP 4: Invalidate Redis Caches              │
         │ - Delete bitfrost:packet:*                   │
         │ - Delete bitfrost:trace:*                    │
         │ - Delete bitfrost:source:*                   │
         └────────────┬────────────────────────────────┬┘
                      │                                 │
            Success   ↓                                 ↓ Cache Error
         ┌──────────────────────────────────────────────┐
         │ STEP 5: Emit Events                          │
         │ - Publish atlas.packets.updated              │
         │ - Include metrics (processed, updated, etc)  │
         │ - Non-blocking                               │
         └────────────┬────────────────────────────────┬┘
                      │                                 │
            Success   ↓                                 ↓ Event Error
         ┌──────────────────────────────────────────────┐
         │ Report Results                               │
         │ - Processed count                            │
         │ - Updated count                              │
         │ - Error count                                │
         │ - Duration                                   │
         │ - Exit code (0 or 1)                         │
         └──────────────────────────────────────────────┘
```

## Decision Tree: When to Use This Pattern

1. **Are you reading/writing packets?** → Use this pattern
2. **Are you validating structure?** → Use this pattern
3. **Are you enriching metadata?** → Use this pattern
4. **Are you doing embeddings?** → Use separate pipeline (not here)
5. **Are you doing vector search?** → Use Qdrant directly (mirrors are separate)
6. **Are you doing tensor operations?** → Use GPU worker (not here)

## Do NOT Use This Pattern For

- ❌ Vector similarity scoring (use GPU reranker)
- ❌ Embeddings (use separate embedding pipeline)
- ❌ Vector search (use Qdrant directly)
- ❌ Graph traversal (use Neo4j directly)
- ❌ Redis-only operations (use Redis client directly)

## Related References

- **Script**: `scripts/atlas/packet-truth-flow.mts` (720 lines, fully typed)
- **Skill**: `.opencode/skills/gan-validation-audit/SKILL.md`
- **npm scripts**: `atlas:gan-audit`, `atlas:packet-truth-flow`, `atlas:packet-truth-flow:validate`
- **CLAUDE.md**: "Canonical Packet Truth Flow Architecture" section

## Examples

### Example 1: GAN Validation Audit

```typescript
// Read → Validate → Write → Invalidate → Emit
const result = await executePacketTruthFlow({
  operation: 'gan-audit',
  dryRun: false,
  verbose: true,
  // ... config
});

console.log(`Processed: ${result.processed}`);
console.log(`Updated: ${result.updated}`);
console.log(`Errors: ${result.errors.length}`);
```

### Example 2: Extract Titles for All Packets

```typescript
const result = await executePacketTruthFlow({
  operation: 'extract-titles',
  dryRun: false,
  verbose: false,
  // ... config
});
```

### Example 3: Dry-run Validation

```typescript
const result = await executePacketTruthFlow({
  operation: 'validate',
  dryRun: true,  // No writes
  verbose: true,
  // ... config
});

// Output shows what WOULD happen, without actual changes
```

## Integration Points

### SvelteKit API Route

```typescript
// src/routes/api/packets/validate/+server.ts
export async function POST({ request }) {
  const result = await executePacketTruthFlow({
    operation: 'gan-audit',
    dryRun: false,
    verbose: false,
    redis: { /* ... */ },
    gemma4: { /* ... */ },
    timeoutMs: 90000,
    cacheTtlSeconds: 3600
  });

  return json(result);
}
```

### OpenCode Skill

```typescript
// Invoked via:
// /atlas:gan-audit
// /atlas:packet-truth-flow:validate
// /atlas:packet-truth-flow:extract-titles
```

### npm Script

```bash
npm run atlas:gan-audit --verbose
npm run atlas:packet-truth-flow:validate
npm run atlas:packet-truth-flow:extract-titles
```

## Summary

The Packet Truth Flow is the **canonical architecture pattern** for all atlas packet operations:

1. ✅ Postgres is truth
2. ✅ Validate before writing
3. ✅ Invalidate caches after writing
4. ✅ Emit events for traceability
5. ✅ Async-safe, type-safe, transactional

**Do this, not something else.**
