# LangExtract Gemma4 Service Proof

Generated: 2026-07-01T21:55:56.682Z
Status: LIVE_PASS

## Runtime

- langextract_url: http://127.0.0.1:8096
- llama_server_url: http://127.0.0.1:8090
- model: gemma4-legal-iq4xs-direct.gguf
- pid: n/a

## Health

- HTTP status: 200
- llama_server_available: PASS

## Notes

- Ollama is intentionally not used for LangExtract NER; Ollama remains embedding-only for EmbeddingGemma.
- Use explicit 127.0.0.1 instead of localhost to avoid IPv6 service collisions.
