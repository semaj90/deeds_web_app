# Migration Log

## 2026-09-07

- Established `karpathy-wiki/` as the portable OKF-facing bundle.
- Added a root index for progressive disclosure and agent navigation.
- Added OKF frontmatter to the existing web-development guide without changing
  its body or runtime ownership claims.
- Kept `llm/` as a compatibility hub and `.okf/` as the Atlas registry.
- Read-only bundle audit passed: 5 Markdown files, 3 concept files, and zero
  frontmatter or internal-link errors; receipt:
  `docs/reports/okf-wiki-migration-v1.json`.
- No source files, model artifacts, databases, vector indexes, caches, or graph
  projections were modified by this migration slice.
