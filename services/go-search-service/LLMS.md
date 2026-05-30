# AGENTS.md — `services/go-search-service`

## Scope

Go HTTP search service on :8096. Provides fast lexical + vector search over the codebase index. TypeScript callers hit it as the Go service fast-path in the 8-adapter search orchestrator.

## Ports

| Transport | Port | Notes |
|-----------|------|-------|
| HTTP | :8096 | Operational — direct fetch from TypeScript |
| (planned gRPC) | :50055 | **Collision risk** — port claimed by CHR97 agent client too |

## Key files

| File | Purpose |
|------|---------|
| `main.go` | Server entrypoint — HTTP router |
| `proto/` | Protobuf definitions |

## TypeScript consumer

Search orchestrator (`src/lib/server/search/hybrid-search.ts` or equivalent) uses direct `fetch` to `:8096` as the first adapter in the 8-domain search cascade.

## Safety rules

- Port :50055 **collision**: `chr97-agent-client.ts` also targets :50055. One service must move before enabling gRPC here. Use only HTTP :8096 until resolved.
- Read-only service — no mutations allowed in handlers.
- Never log user query content at INFO level — queries may contain PII.

## First tools

```
trace.kag_search({ query: "go search service http" })
graph.expand_neighborhood({ stableKeys: ["services/go-search-service/main.go"] })
```


<!-- ingest: 2026-05-30T02:17:10.013Z -->
- ingested_nodes: 18742 from C:\Users\james\Videos\deeds-web-app\.opencode\cards
