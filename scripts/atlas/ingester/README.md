Ingester scaffolds

Usage:

1. Build canonical nodes/edges from `.opencode/cards/` and NDJSON inputs:

```bash
node scripts/atlas/ingester/unify-extractors.mjs
```

2. Generate tasks from nodes:

```bash
node scripts/atlas/ingester/tasker-scaffold.mjs
```

3. Produce placeholder fixes:

```bash
node scripts/atlas/ingester/error-fixer-scaffold.mjs
```

The scripts write into `.tmp/ingest/` (nodes.ndjson, edges.ndjson, tasks.ndjson, fixes.ndjson).
