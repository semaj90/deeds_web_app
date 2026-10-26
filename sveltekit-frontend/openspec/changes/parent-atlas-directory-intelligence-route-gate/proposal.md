# Directory intelligence and parser-route gate

## Why
The repo's directory inventory, relevance scores, parser routes and Valkey centroids were produced by
scripts and reports with no owning spec. This change records the contract those artifacts must honor.

## What changes
- Source-parser routing fails closed: unknown extensions abstain, and unavailable sidecar capabilities block code routes.
- A sidecar AST response counts as complete only when `syntax_status` is `CLEAN` and `scan_completeness` is `COMPLETE`.
- Each submitted source in an extractor run receives exactly one disposition, so the accounting reconciles.
- Valkey centroids are written only under the `atlas:dirintel:v1:` namespace with a 24-hour TTL, and never overwrite existing keys.
- Relevance scores are heuristic and labeled as such.

## Out of scope
Graphify persistence, Postgres writes, LangExtract evidence, and any admission of extracted evidence.
