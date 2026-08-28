# Research Kernel V1 integration

## Result

Implemented and fixture-tested a bounded local research circuit above ACE Card
Selection V2. The circuit is read-only and revision-qualified; it does not
expose arbitrary Python, shell, database, Qdrant, Valkey, Neo4j, or GPU
operations.

## Implemented

- `ResearchKernelSessionV1` with workspace, candidate-snapshot, ordinal-map,
  kernel revision, and explicit operation/card/token/time budgets.
- `ResearchOperationV1` receipts with input/output checksums.
- `LocalResearchCircuitV1` with bounded subqueries, deterministic ordinal/card
  ordering, ACE selection, coverage stop, and replay checksum.
- `atlas_research` on the existing Atlas task-kernel MCP facade.

The existing LDR stdio server is now registered separately in OpenCode as
`ldr-research`. The Atlas facade remains separate: it delegates to the
internal Atlas context builder and does not turn LDR into an authority or
storage backend.

## Validation

- ACE Card Selection V2: 2/2 tests passed.
- Local Research Circuit V1: 2/2 tests passed.
- TypeScript check: no errors for the added research/context files.
- MCP `tools/list`: `atlas_research` exposed.
- Atlas MCP smoke: 10/10 checks passed.
- MCP endpoint probe: `ldr-mcp` UP with 4 tools.
- Bounded `ldr.quick_summary` invocation reached the handler but returned
  `fetch failed`; the LDR HTTP backend is not currently reachable.

## Not proven

- Persistent IPython kernel lifecycle in a container.
- Live LDR research execution against the configured LDR HTTP service.
- LDR backend health/reachability remains open; MCP transport health alone is
  insufficient.
- The repository contains authenticated SvelteKit LDR routes, but the MCP
  adapter intentionally targets the separate local-deep-research API contract
  on port 5000 (`/api/research/start`, `/api/history`, and
  `/api/research/quick-summary`). These are different runtime boundaries and
  were not conflated.
- `turbovec-sidecar` is unrelated and currently returned HTTP 404.
- LangExtract has no local MCP script; it remains behind its existing HTTP/Python lane.
- Live retrieval/ACE/Valkey writes or production promotion.

## Next gate

Health-check the registered `ldr-research` MCP server, then decide whether a
future bounded circuit should call its `quick_summary` or async pair. Keep
LDR results as external research evidence until source/revision grounding is
validated by Atlas.
