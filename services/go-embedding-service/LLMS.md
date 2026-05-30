# AGENTS.md — `services/go-embedding-service`

## Scope

Go embedding service. HTTP :8097 / gRPC :50051. Wraps the Ollama `embeddinggemma:latest` model and serves 768-dim vectors to TypeScript callers. `grpc/embedding-client.ts` uses this as the primary embedding path before falling back to inline Ollama HTTP.

## Ports

| Transport | Port | Notes |
|-----------|------|-------|
| gRPC | :50051 | `EmbeddingService` — primary path |
| HTTP | :8097 | Compiled, direct fetch fallback |

## Key files

| File | Purpose |
|------|---------|
| `main.go` | Server entrypoint |

## TypeScript consumer

`src/lib/server/grpc/embedding-client.ts` — cascade: gRPC :50051 → HTTP :8097 → Ollama inline. Status: **FULLY WIRED**.

## Safety rules

- 768-dim output only — do not change vector dimensionality without updating all Qdrant collections.
- Never cache embeddings by user ID — content hash only, otherwise cross-user cache pollution.
- gRPC :50051 is the only port in use for this service (no collision risk).

## First tools

```
trace.kag_search({ query: "go embedding service grpc 50051" })
```


<!-- ingest: 2026-05-30T02:17:10.013Z -->
- ingested_nodes: 18742 from C:\Users\james\Videos\deeds-web-app\.opencode\cards
