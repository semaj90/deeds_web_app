# 🏷️ Phase 89: Migration Metadata Quick Reference

## Fast Commands

```bash
# Check what needs migrating
node scripts/phase89-migration-query.mjs --all

# Specific migrations
node scripts/phase89-migration-query.mjs --svelte5      # Svelte 4 → 5
node scripts/phase89-migration-query.mjs --bits-ui      # Melt-UI → Bits-UI
node scripts/phase89-migration-query.mjs --routes       # Route consolidation
node scripts/phase89-migration-query.mjs --modals       # Modal patterns
```

## Qdrant Filters (Copy-Paste Ready)

### All Svelte 5 Migrations
```bash
curl -X POST http://localhost:6333/collections/phase89_code_units/points/scroll \
  -H "Content-Type: application/json" \
  -d '{
  "filter": {
    "must": [
      { "key": "needs_svelte5_migration", "match": { "value": true } }
    ]
  },
  "limit": 100,
  "with_payload": true
}'
```

### Specific Pattern (export let)
```bash
curl -X POST http://localhost:6333/collections/phase89_code_units/points/scroll \
  -H "Content-Type: application/json" \
  -d '{
  "filter": {
    "must": [
      { "key": "migration_flags", "match": { "any": ["svelte4_props"] } }
    ]
  },
  "limit": 100
}'
```

### Melt-UI Files
```bash
curl -X POST http://localhost:6333/collections/phase89_code_units/points/scroll \
  -H "Content-Type: application/json" \
  -d '{
  "filter": {
    "must": [
      { "key": "needs_bits_ui_migration", "match": { "value": true } }
    ]
  },
  "limit": 100
}'
```

### Modal Components
```bash
curl -X POST http://localhost:6333/collections/phase89_code_units/points/scroll \
  -H "Content-Type: application/json" \
  -d '{
  "filter": {
    "must": [
      { "key": "is_modal_card", "match": { "value": true } }
    ]
  },
  "limit": 100
}'
```

### Combined: Svelte 4 Modals
```bash
curl -X POST http://localhost:6333/collections/phase89_code_units/points/scroll \
  -H "Content-Type: application/json" \
  -d '{
  "filter": {
    "must": [
      { "key": "needs_svelte5_migration", "match": { "value": true } },
      { "key": "is_modal_card", "match": { "value": true } }
    ]
  },
  "limit": 100
}'
```

## Migration Flags Reference

| Flag | Meaning | Fix Action |
|------|---------|------------|
| `svelte4_props` | `export let` props | Replace with `$props()` |
| `svelte4_events` | `createEventDispatcher` | Replace with callbacks |
| `svelte4_reactivity` | `$:` statements | Replace with `$derived` |
| `svelte4_module_context` | `<script context="module">` | Refactor to `+page.ts` |
| `melt_ui_legacy` | Melt-UI imports | Migrate to Bits-UI v2 |
| `route_consolidation_*` | Old route structure | Move to new consolidated routes |
| `modal_card_component` | Dialog/Modal usage | Update to new modal architecture |

## JavaScript SDK Example

```javascript
import { QdrantClient } from '@qdrant/js-client-rest';

const client = new QdrantClient({ url: 'http://localhost:6333' });

// Find Svelte 5 migrations
const results = await client.scroll('phase89_code_units', {
  filter: {
    must: [
      { key: 'needs_svelte5_migration', match: { value: true } }
    ]
  },
  limit: 100,
  with_payload: true
});

console.log(`Found ${results.points.length} files needing Svelte 5 migration`);

// Group by specific pattern
const byPattern = {};
for (const point of results.points) {
  const flags = point.payload.migration_flags || [];
  for (const flag of flags) {
    if (!byPattern[flag]) byPattern[flag] = [];
    byPattern[flag].push(point.payload.file_path);
  }
}

console.log('By pattern:', byPattern);
```

## Payload Structure

```javascript
{
  "file_path": "src/lib/components/UserProfile.svelte",
  "unit_kind": "component",
  "feature_tags": ["ui", "user"],
  "migration_flags": [
    "svelte4_props",
    "svelte4_reactivity"
  ],

  // Fast boolean filters
  "needs_svelte5_migration": true,
  "needs_bits_ui_migration": false,
  "is_modal_card": false,
  "is_route_consolidated": false,

  "indexed_at": "2026-01-03T19:09:25.921Z"
}
```

## Test Embedding

```bash
# Run validation test
node scripts/test-phase89-embedding.mjs

# Expected output:
# ✅ All tests passed! (9/9)
```

## Indexer Commands

```bash
# Full re-index with rescue mode (5 retries)
node scripts/phase89-code-unit-indexer.mjs --index --rescue

# Index specific types
node scripts/phase89-code-unit-indexer.mjs --routes
node scripts/phase89-code-unit-indexer.mjs --components
node scripts/phase89-code-unit-indexer.mjs --modules
```

## Status Check

```bash
# Check indexing progress
Get-Process | Where-Object { $_.ProcessName -like "*node*" }

# Check Qdrant collection
curl http://localhost:6333/collections/phase89_code_units
```

---

**Last Updated**: January 3, 2026
**Status**: Production Ready ✅
