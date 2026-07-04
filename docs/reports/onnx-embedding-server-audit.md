# ONNX Embedding Server Audit

- generated_at: 2026-07-04T00:38:30.735Z
- url: http://127.0.0.1:8081
- status: FAIL
- backend: unknown
- dim: unknown
- providers_available: unknown
- providers_active: unknown
- batch_size: 8
- elapsed_ms: n/a
- vectors: 0
- dimension_ok: false

## Routing

Set this to route the existing embedding client through the ONNX server before Ollama:

```powershell
$env:OLLAMA_EMBED_BASE_URL="http://127.0.0.1:8081"
```

The existing embedding client will still cache Redis keys and write Postgres/Qdrant through the current workers.

