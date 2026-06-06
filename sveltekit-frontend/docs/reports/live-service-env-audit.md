# Live Service Env Audit

Generated: 2026-06-05T21:34:21.017Z

## Env Presence

- DATABASE_URL: yes
- POSTGRES_HOST: no
- POSTGRES_PORT: no
- QDRANT_URL: yes
- NEO4J_URI: yes
- REDIS_URL: yes

## Services

- postgres
  - env present: yes
  - raw url: postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db
  - normalized host/port: 127.0.0.1:5434
  - expected host/port: 127.0.0.1:5434
  - tcp reachable: yes
  - recommendation: READY
  - note: TCP connect succeeded
- qdrant
  - env present: yes
  - raw url: http://127.0.0.1:6333
  - normalized host/port: 127.0.0.1:6333
  - expected host/port: 127.0.0.1:6333
  - tcp reachable: yes
  - http reachable: yes
  - http status: 200
  - recommendation: READY
  - note: HTTP 200
- neo4j
  - env present: yes
  - raw url: bolt://127.0.0.1:7687
  - normalized host/port: 127.0.0.1:7687
  - expected host/port: 127.0.0.1:7687
  - tcp reachable: yes
  - driver reachable: yes
  - recommendation: READY
  - note: driver verifyConnectivity succeeded
- redis
  - env present: yes
  - raw url: redis://127.0.0.1:6379
  - normalized host/port: 127.0.0.1:6379
  - expected host/port: 127.0.0.1:6379
  - tcp reachable: yes
  - recommendation: READY
  - note: TCP connect succeeded

## Readiness Interpretation

- Postgres ECONNREFUSED at 127.0.0.1:5434 is usually SERVICE_STOPPED when DATABASE_URL already targets the expected port.
- Qdrant fetch failure means the HTTP API did not respond from the resolved host/port.
- Neo4j driver failure means either the bolt service is down, the URI/port is wrong, or credentials are missing/invalid.
