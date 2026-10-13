---
title: OKF MCP Tool Calling and Resource Navigation
status: draft
canonicalAuthority: false
---

# OKF navigation and MCP tool calling

## Ownership

- `docs/.okf/registry.yaml` is the OKF schema-contract navigation registry.
- `.okf/index.md` is the curated root knowledge graph index, not a runtime source of truth.
- `.okf/architecture/parent-atlas-ingestion-agent-integrations-glossary-v1.md` is the operator-selected glossary owner. Verify it exists locally before using it; the path is not present in the checked-in GitHub main branch at the time of this proposal.
- `sveltekit-frontend/src/lib/server/mcp/okf-resource-catalog.mjs` owns the declared read-only `atlas://okf/*` resource catalog. Resource discovery and tool invocation are separate operations.

## Tool-selection boundary

1. Classify the query into `resource-read`, `source-evidence-search`, `structural/graph-analysis`, `derived-feature-analysis`, or `write-proposal`.
2. Discover a real registered MCP capability and its server authority, input schema, output schema and permission policy. Never invent a tool name because an OKF document mentions a subsystem.
3. For `resource-read`, obtain registered `atlas://okf/*` content through the existing MCP resource adapter. Do not infer that a catalog entry automatically registers a callable tool.
4. For `source-evidence-search`, use the production SearchRuntime and its existing logical lanes. Candidate search results are provisional until canonical packet/chunk membership, source revision, source digest and exact span are verified.
5. For `structural/graph-analysis`, require a qualified typed tuple and graph revision. NetworkX, Neo4j and cuGraph outputs are derived evidence, not source authority.
6. For `derived-feature-analysis`, join NLP tokens, bag-of-words/CSR, semantic vectors, K-means/SOM features or domain classification by verified canonical identity and revision. Do not promote clusters or coordinates to provenance.
7. For any proposed mutation, demand a separate authorization and verification workflow. Documentation lookup does not authorize index writes, migration, fixes, cache invalidation or snapshot deletion.

## Example logical invocation contract (illustrative, not an implemented MCP tool)

```json
{
  "requestId": "example-read-only",
  "intent": "source-evidence-search",
  "queryText": "where is the canonical chunk-to-packet source binding",
  "requiredEvidence": [
    "packetKey",
    "sourceRef",
    "sourceRevision",
    "workspaceRevision",
    "sourceDigest",
    "startByte",
    "endByte"
  ],
  "allowWrites": false
}
```

## Required returned receipt

A read-only tool execution should report `toolAuthority`, `toolName`, `requestId`, `inputChecksum`, `outputChecksum`, `evidenceRefs`, `revisionBindings`, `admissionStatus` and rejection reasons. Include `candidateOrdinal` when the result originated in a retrieval snapshot. These are desired receipt fields, not proof that every current MCP tool emits them.

## Admission and RRF policy

- A Qdrant or pgvector candidate whose source is unresolved is rejected from prompt admission, not silently repaired.
- One semantic lane earns at most one logical RRF vote regardless of executor: Qdrant HNSW, cuVS exact and CAGRA are alternative executors.
- ACE/BitFrost cache hits must read back the same admitted evidence as a qualified cold reconstruction.
- Failed or superseded source and graph revisions must not reach the ContextManifest or final prompt.
- Verification tests and real tool registrations are separate exit gates. This document creates neither.

## Read-only checks

```powershell
rg -n "OKF_RESOURCE_CATALOG_V1|atlas://okf|registerResource" sveltekit-frontend/src
rg -n "tool_registry|MCPToolRefV1|serverAuthorityId|toolName|hmm-tool-selector" sveltekit-frontend/src
rg -n "combineViaRRF|SearchRuntime|ContextManifest|sourceRevision" sveltekit-frontend/src
```

## Open gates

- Prove local glossary path and update the checked-in root glossary reference when synchronized.
- Confirm registry YAML parsing and link resolution on the workstation.
- Enumerate actual MCP tools and their read/write authority; document missing contracts without creating stubs.
- Execute one end-to-end MCP resource lookup and one canonical source-evidence query with readback receipts.
- Preserve existing datastore, snapshot, Graphify and model-training stop conditions.
