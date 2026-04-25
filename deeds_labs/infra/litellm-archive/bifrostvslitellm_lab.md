# Bifrost vs LiteLLM — Migration Lab Notes

## Date: April 1, 2026
## Decision: Replace LiteLLM with Bifrost + pgai

---

## Why LiteLLM Was Removed

### Supply Chain Attack (March 24, 2026)
- **Versions 1.82.7–1.82.8** on PyPI compromised by threat actor **TeamPCP**
- Malicious payload: credential stealer (SSH keys, cloud creds, wallets, `.env` files)
- Kubernetes lateral movement via privileged pods
- Persistent systemd backdoor connecting to remote C2 server
- Live on PyPI for ~40 minutes, LiteLLM gets ~3.4M downloads/day
- Our Docker image (`ghcr.io/berriai/litellm:main-stable`) was NOT directly affected (pins deps)
- But the project's CI/CD was compromised through a poisoned Trivy scanner
- Safe version v1.83.0+ released with new CI/CD pipeline

### Performance Limitations
- Python-based proxy — GIL bottleneck under concurrency
- ~500 µs overhead per request
- Database logging layer degrades after 1M+ logs
- 5.6 GB Docker image, ~500 MB RAM under load

### Sources
- https://docs.litellm.ai/blog/security-update-march-2026
- https://snyk.io/blog/poisoned-security-scanner-backdooring-litellm/
- https://thehackernews.com/2026/03/teampcp-backdoors-litellm-versions.html
- https://www.kaspersky.com/blog/critical-supply-chain-attack-trivy-litellm-checkmarx-teampcp/55510/
- https://securitylabs.datadoghq.com/articles/litellm-compromised-pypi-teampcp-supply-chain-campaign/

---

## Bifrost — Replacement Gateway

### Specs
| Metric | LiteLLM | Bifrost |
|--------|---------|---------|
| Language | Python | **Go** |
| Docker image | 5.6 GB | **~20 MB** (280x smaller) |
| RAM under load | ~500 MB | **~50 MB** (10x less) |
| Overhead/request | ~500 µs | **11 µs** (50x faster) |
| P99 latency | baseline | **54x faster** |
| Throughput | baseline | **9.4x higher** |
| External deps | Redis, PostgreSQL | **None** |
| Supply chain risk | HIGH (PyPI) | **Low** (Go binary) |
| gRPC | No | **Yes** (HTTP/Protobuf, gRPC/Protobuf) |
| Semantic caching | Redis-backed | **Built-in plugin** |
| OpenAI-compatible | Yes | **Yes** (`/v1/chat/completions`) |
| Ollama support | Yes | **Yes** (any OpenAI-compatible endpoint) |

### Key Features
- Drop-in replacement — same `/v1/chat/completions` API
- Semantic caching built-in (no Redis dependency for this)
- Adaptive load balancing across providers
- Guardrails and governance
- Native observability (OTLP)
- Config via `config.json` with JSON schema validation
- Deploy: `npx -y @maximhq/bifrost` or Docker `maximhq/bifrost`

### Sources
- https://github.com/maximhq/bifrost
- https://hub.docker.com/r/maximhq/bifrost
- https://docs.getbifrost.ai/quickstart/gateway/setting-up

---

## pgai — Database-Level AI (Already Running)

Our `deeds-postgres-pgai:pg17` container already has pgai. It can:
- Call Ollama LLMs directly from SQL (`ai.ollama_generate()`)
- Generate embeddings in-DB (`ai.ollama_embed()`)
- Auto-vectorize tables with background workers
- Eliminate network hops for DB-adjacent AI operations

### Source
- https://github.com/timescale/pgai

---

## What Was Archived Here

- `litellm_config.yaml` — The YAML config that was mounted to `/app/config.yaml`
  - Routed gemma3-legal, embeddinggemma, gemma3 through Ollama
  - Redis semantic cache with 1h TTL
  - Master key: sk-deeds-litellm-2026

## Docker Cleanup
- Container `deeds-litellm-proxy` — removed (was exited with code 127)
- Image `ghcr.io/berriai/litellm:main-stable` — removed (5.6 GB freed)
- `.env` updated: `LITELLM_ENABLED=false`, Bifrost vars added

---

## Wiring Changes

### Before (LiteLLM)
```
SvelteKit → litellmChat() → POST http://localhost:4000/v1/chat/completions → Ollama
```

### After (Bifrost + pgai)
```
SvelteKit → bifrostChat() → POST http://localhost:3040/v1/chat/completions → Ollama
                                (50x faster, built-in semantic cache)

PostgreSQL → ai.ollama_embed() → Ollama  (zero network hop for DB operations)
```

### Files Modified
- `sveltekit-frontend/.env` — LITELLM disabled, BIFROST enabled
- `sveltekit-frontend/src/lib/server/ollama.ts` — litellmChat → bifrostChat
- `docker-compose.yml` — Bifrost service added (full profile)

---

*Archived April 1, 2026 — LiteLLM replaced due to supply chain compromise + performance*