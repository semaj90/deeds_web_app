# Offline Synthesis MapReduce DuckDB

Generated: 2026-06-02T04:27:25.313Z
Mode: WRITE

## Summary
- rows: 25
- files: 25
- features: 5
- static imports: 10
- dynamic imports: 0

## Top Features
- cache: 12
- unclassified: 10
- admin: 1
- ui: 1
- rag: 1

## Top Extensions
- .md: 13
- .json: 11
- .ts: 1

## Notes
- The mapreduce NDJSON is mirrored into DuckDB so offline synthesis can query the consolidated file graph without re-scanning the repo.
- This lane keeps the same durable sourceRef and feature joins used by the Parent Atlas lane.
