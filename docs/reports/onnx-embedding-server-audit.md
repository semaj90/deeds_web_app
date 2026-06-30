# ONNX Embedding Server Audit

- generated_at: 2026-06-30T17:53:05.958Z
- url: http://127.0.0.1:8081
- status: PASS
- backend: onnx
- dim: 768
- providers_available: AzureExecutionProvider, CPUExecutionProvider
- providers_active: CPUExecutionProvider
- batch_size: 64
- elapsed_ms: 398
- vectors: 64
- dimension_ok: true

## Routing

Set this to route the existing embedding client through the ONNX server before Ollama:

```powershell
$env:OLLAMA_EMBED_BASE_URL="http://127.0.0.1:8081"
```

The existing embedding client will still cache Redis keys and write Postgres/Qdrant through the current workers.

