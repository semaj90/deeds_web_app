---
name: feature-labeling
description: Auto-label ACE cards with domain and feature tags using Gemma4 offload
license: MIT
compatibility: opencode
---

# Skill: feature-labeling

## When to use
- During codebase ingestion, clustering, or manual review to assign stable feature labels to clusters, files, or pathways.

## Purpose
Provide a deterministic process and field-set for labeling features so different agents and export pipelines don't create duplicate or conflicting feature entries.

## Process
1. Collect candidate signals: directory path, top n member file paths, centroid keywords (from LLM), manual tags.
2. Normalize candidate labels: kebab-case, max 48 chars, prefer existing registry entries.
3. Resolve conflicts: if a near-duplicate label exists (levenshtein < 3 or Jaccard overlap > 0.7 on token sets), assign `alias_of` and link to canonical feature id.
4. Produce final feature object:

```json
{
  "feature_id":"feature-12345",
  "label":"codebase-indexing",
  "aliases":["indexing","code-index"],
  "components":["indexer","karpathy-gpu"],
  "tags":["ingest","cluster-card"],
  "sourceRefs":["sveltekit-frontend/src/lib/server/indexer/dual-embedder.ts"],
  "confidence":0.87
}
```

5. Register into `feature-registry.json` with provenance.

## Validation rules
- `label` must be unique (case-insensitive) among canonical features.
- `feature_id` is stable: `sha1(label + origin)` or UUIDv5 anchored to repo root.

## Output
- Structured feature object written to `.tmp/feature-registry.json` (staging) and published to `memory/exports/feature-registry.jsonl` when approved.
