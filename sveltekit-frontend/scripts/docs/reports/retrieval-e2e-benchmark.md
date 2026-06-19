benchmark-retrieval-e2e — 2026-06-19T04:11:19.286Z
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
queries    : 10
passed     : 10  failed: 0
avg wall ms: 23ms
p50 wall ms : 16ms
p95 wall ms : 77ms

atlas_retrieval_eval_times breakdown:
  cache hits (redis): 6 rows
  live hits:          6 rows

Per-lane DB averages (live path only):
  hash=02a2c8611965a9f9  qdrant=0.0ms  bm25=0.0ms  neo4j=0.0ms  total=13.5ms
  hash=193f9935dbbbd60b  qdrant=0.0ms  bm25=0.0ms  neo4j=0.0ms  total=12.5ms
  hash=738fd1d70d9003c5  qdrant=0.0ms  bm25=0.0ms  neo4j=0.0ms  total=24.0ms
  hash=9eb56dbac7808a2e  qdrant=0.0ms  bm25=0.0ms  neo4j=0.0ms  total=11.5ms
  hash=c02f7512c3a2035e  qdrant=0.0ms  bm25=0.0ms  neo4j=0.0ms  total=11.0ms
  hash=f41842967e97cd0a  qdrant=0.0ms  bm25=0.0ms  neo4j=0.0ms  total=15.0ms
