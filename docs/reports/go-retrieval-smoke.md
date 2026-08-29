# Go Retrieval Smoke

Status: PASS
Generated: 2026-08-29T01:50:14.257Z

- HTTP: READY http://127.0.0.1:8100/health (52ms)
- gRPC/TCP: READY 127.0.0.1:50053 (2ms)

## HTTP Health

```json
{
  "dependencies": {
    "embedding_service": {
      "connected": true,
      "required": true
    },
    "postgres": {
      "connected": true,
      "required": true
    },
    "qdrant": {
      "connected": true,
      "required": true
    },
    "redis": {
      "connected": true,
      "required": false
    }
  },
  "embeddingServiceUp": true,
  "pgvectorConnected": true,
  "qdrantConnected": true,
  "readiness_state": "READY_FULL",
  "redisConnected": true,
  "status": "healthy",
  "timestamp": 1787968214294
}
```
