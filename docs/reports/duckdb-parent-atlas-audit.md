# DuckDB Parent Atlas Audit

Generated: 2026-06-12T19:35:07.263Z

## Summary

- Bundle files: 12905
- Schema tables: 91
- SourceRef rows: 42
- Matched rows: 41
- Unmatched rows: 1
- Ambiguous rows: 0
- Relevant rows: 21
- Relevant matched rows: 21
- Relevant unmatched rows: 0
- Relevant match rate: 100%

## Top Unmatched Suffixes

- Audit Report: [unsafe_drizzle_update_delete] warning detected: 1

## Notes

- This audit is read-only. It does not mutate Postgres, Qdrant, Redis, Neo4j, DuckDB, or packet files.
- It treats the bundle manifest and normalized sourceRef catalog as the dry-run join surface.
