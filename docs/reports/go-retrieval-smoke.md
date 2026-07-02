# Go Retrieval Smoke

Status: PASS
Generated: 2026-07-02T03:54:50.633Z

- HTTP: READY http://127.0.0.1:8100/health (49ms)
- gRPC/TCP: READY 127.0.0.1:50053 (2ms)

## HTTP Health

```json
{
  "embeddingServiceUp": true,
  "pgvectorConnected": true,
  "qdrantConnected": true,
  "redisConnected": true,
  "status": "healthy",
  "timestamp": 1782964490667
}
```
