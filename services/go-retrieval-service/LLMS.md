# AGENTS.md — `services/go-retrieval-service`

## Scope

Go gRPC + HTTP retrieval service. Serves `SearchEvidence`, `StreamEvidence`, `SearchCodebase`, `Health` RPCs. TypeScript callers in `src/lib/server/grpc/retrieval-client.ts` fall back to HTTP :8100 when gRPC :50053 is unavailable.

## Ports

| Transport | Port | Env flag |
|-----------|------|----------|
| gRPC | :50053 | `RETRIEVAL_GRPC_ENABLED=true` |
| HTTP | :8100 | `RETRIEVAL_HTTP_ENABLED=true` |

## Key files

| File | Purpose |
|------|---------|
| `main.go` | Server entrypoint — registers gRPC + HTTP mux |
| `proto/` | Protobuf definitions for Retrieval service |

## TypeScript consumer

`src/lib/server/grpc/retrieval-client.ts` — cascade: gRPC :50053 → HTTP :8100 → inline TypeScript fallback. Activate with `RETRIEVAL_GRPC_ENABLED=true` or `RETRIEVAL_HTTP_ENABLED=true` in `.env`.

## Safety rules

- Service is read-only — no writes to Qdrant, Postgres, or Neo4j.
- Never expose raw DB credentials in gRPC responses.
- Port :50053 **may collide** with CHR97 agent if both services start. Verify before deploying.
- All gRPC services default to disabled — `*_GRPC_ENABLED=false` — don't enable globally without testing.

## First tools

```
trace.kag_search({ query: "go retrieval service grpc" })
graph.shortest_path({ sourceFile: "services/go-retrieval-service/main.go", targetFile: "src/lib/server/grpc/retrieval-client.ts" })
```
