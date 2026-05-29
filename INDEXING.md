% Indexing Policy and Runbook

This file defines the canonical include / exclude rules and runbook for the codebase indexing pipeline.

Purpose
-------
- Protect semantic indexes from developer environment noise (virtualenvs, build artifacts)
- Provide a single source-of-truth for all consumers (Atlas, Graphify, TurboVec, training pipelines)

Include
-------
Index these top-level folders (relative to repo root):

- `src/`
- `scripts/`
- `services/`
- `simd-bridge/`
- `drizzle/`
- `llm/`
- `docs/`
- `tests/`

Exclude
-------
Exclude the following paths and patterns from indexing:

- `.venv/`
- `**/.venv/`
- `venv/`
- `**/venv/`
- `site-packages/`
- `dist-packages/`
- `__pycache__/`
- `node_modules/`
- `.svelte-kit/`
- `.vite/`
- `dist/`
- `build/`
- `.git/`
- `deeds_labs/`  # archived or experimental work
- `*.pyc`
- `*.pyd`
- `*.dll`
- `*.so`
- `*.bin`

Patterns
--------
- Exclude rules are treated as path-normalized, case-insensitive substrings or simple globs
- When in doubt, prefer exclusion for binary and environment folders

Index-card schema
-----------------
Index cards (used for cluster-cards.jsonl and downstream tooling) should include the following fields:

```json
{
  "intent_class": "",
  "domain": "",
  "subdomain": "",
  "component": "",
  "feature": "",
  "sourceRefs": []
}
```

Runbook (high level)
---------------------
1. Update `indexing.config.json` with any project-specific overrides.
2. Run minimal validation on a small set of files (4-file smoke) to ensure excludes are honored.
3. Export a Qdrant backup (ndjson + metadata) before any deletions.
4. Delete stale `.venv` points in safe batches.
5. Run full reindex, then `ae:centroids`, then cluster summaries and `graph:exports`.

Notes
-----
- Keep `indexing.config.json` synchronized with `INDEXING.md` (human + machine readable).
- All CI jobs that touch indexing should read `indexing.config.json`.

Maintainer: Legal AI Platform Team
