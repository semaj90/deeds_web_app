# ONNX Embedding Server Audit

- generated_at: 2026-08-26T02:15:35.130Z
- url: http://127.0.0.1:8081
- status: PASS
- backend: unknown
- dim: unknown
- providers_available: unknown
- providers_active: unknown
- batch_size: 8
- elapsed_ms: 125
- vectors: 8
- dimension_ok: true

## Routing

Set this to route the existing embedding client through the ONNX server before Ollama:

```powershell
$env:OLLAMA_EMBED_BASE_URL="http://127.0.0.1:8081"
```

The existing embedding client will still cache Redis keys and write Postgres/Qdrant through the current workers.

