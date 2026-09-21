# Go Retrieval Smoke

Status: PASS
Generated: 2026-09-20T23:18:59.030Z

- HTTP: READY http://127.0.0.1:8100/health (37ms)
- gRPC/TCP: READY 127.0.0.1:50053 (1ms)

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
  "timestamp": 1789946339056
}
```
