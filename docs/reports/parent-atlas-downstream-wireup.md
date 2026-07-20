# Parent Atlas Downstream Wire-up

- status: READY_FOR_DOWNSTREAM_IMPORT
- generated_at: 2026-07-19T22:07:49.746Z
- host: WSL2
- staging_workspace: .tmp
- canonical_truth: postgres
- derived_mirror: qdrant
- container_stack: postgres -> qdrant
- package_smoke_report: C:\Users\james\Videos\deeds-web-app\docs\reports\parent-atlas-package-smoke.json

## Service Contract

- postgres: postgresql://127.0.0.1:5434/legal_ai_db (postgres, port 5434)
- qdrant: http://127.0.0.1:6333 (http, port 6333)
- neo4j: http://127.0.0.1:7474 (http, port 7474)
- redis-valkey: redis://127.0.0.1:6379 (redis, port 6379)
