# Runtime Degradation Proof

Generated: 2026-06-19T23:20:06.121Z
Status: PASS

| Service stopped | Expected behavior | Packets | Strategy | Restored | Status |
|---|---|---:|---|---|---|
| valkey | cache miss fallback | 5 | fts-only | healthy | PASS |
| neo4j | graph skipped with lexical/dense retrieval preserved | 5 | fts-only | healthy | PASS |
| qdrant | FTS fallback preserved | 5 | fts-only | healthy | PASS |

- Postgres was never stopped or mutated.
- Each mirror service was restarted in a finally block.
