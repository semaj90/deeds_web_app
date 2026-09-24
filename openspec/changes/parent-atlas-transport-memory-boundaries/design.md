## Context

`GET /api/acp/service-ports` is admin-protected but is explicitly used by other agents for service discovery. Its current descriptor is built from every ACP tool registration and exposes tool IDs and gRPC methods, including generic tool execution and mirror-sync labels. A peer-facing discovery document must not imply authority to mutate canonical Postgres/Graphify state or projections.

## Goals / Non-Goals

**Goals:**
- Apply a default-deny allowlist to peer-discovery metadata.
- Advertise only read-only retrieval methods and explicitly approved read-only tools.
- Keep the existing ACP registry and internal tool definitions unchanged.
- Separately gate the generic `/api/acp/execute` dispatch path through the existing `tool-authorization.ts` permission owner; discovery filtering is not execution authorization.

**Non-Goals:**
- No credential/Bearer-authentication changes and no canonical identity changes.
- No new authorization subsystem or role model; A2A-04 reuses the existing permission-grant owner and only supplies required-permission facts for the separate ACP tool set.
- No Postgres, Graphify, Qdrant, Neo4j, or Valkey writes.
- No claim that peer calls are authenticated merely because metadata is filtered.

## Decisions

- Filter the A2A descriptor at construction time using explicit tool IDs and per-service method allowlists. Unknown tools/services/methods are omitted.
- Initially allow only `identity:recover` and the retrieval service's `Search`, `RRFFuse`, and `Rerank` methods. Do not expose generic `ExecuteTool*` methods or mirror tools.
- Have the HTTP discovery route render tools from the filtered descriptor IDs, not the full ACP registry.
- Keep the allowlist separate from ACP execution registration so internal tools remain available to their existing owners.

## Risks / Trade-offs

- [A legitimate read-only peer capability may be omitted] → add it only with a focused test and reviewed allowlist change.
- [Metadata filtering is not an authorization boundary] → actual RPC handlers must continue to enforce their own authentication/authorization; this task does not claim otherwise.
- [A future method may become mutating without a name change] → method allowlists are explicit and do not admit unknown methods by prefix or pattern.

## Migration Plan

No data migration. Deploying this change only reduces the tools and methods advertised by the discovery endpoint. Rollback is a code revert; it must not restore broad advertisement without re-reviewing A2A-03.

## Open Questions

- Are there external peers depending on the existing broad discovery metadata? The local registry has no authoritative list of such consumers; the fail-closed default remains until measured.

## ACP coding-agent boundary (contract only)

- Editor/session/task/action IDs are protocol-local references. The adapter may project them only onto caller-resolved Atlas task attempts and `WorkflowActionEventV1` records; it never creates canonical task, packet, source, or graph identity.
- `tool-authorization.ts` remains the permission decision owner. Discovery, ingress validation, or an ACP `AUTH_REQUIRED`/progress state is not dispatch authorization.
- Patches are proposals. Durable application remains behind the existing repair admission/approval path and independent readback; this OpenSpec change does not wire an ACP patch executor.
- Terminal output is bounded evidence and must be redacted before exposure; it cannot carry hidden reasoning, credentials, or become identity/authority. Progress is a projection of existing workflow events and receipts, not a second event ledger.
- Runtime status remains legacy inbound ingress only, outbound ACP disabled, migration target A2A 1.0. No ACP client, server, editor integration, or live dispatch is claimed by this contract.
