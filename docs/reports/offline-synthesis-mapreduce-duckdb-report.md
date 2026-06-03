# Offline Synthesis MapReduce DuckDB

Generated: 2026-06-03T04:05:42.227Z
Mode: WRITE

## Summary
- rows: 50
- files: 50
- features: 5
- static imports: 10
- dynamic imports: 0

## Top Features
- unclassified: 34
- cache: 12
- ui: 2
- admin: 1
- rag: 1

## Top Extensions
- .json: 30
- .md: 19
- .ts: 1

## Notes
- The mapreduce NDJSON is mirrored into DuckDB so offline synthesis can query the consolidated file graph without re-scanning the repo.
- This lane keeps the same durable sourceRef and feature joins used by the Parent Atlas lane.
