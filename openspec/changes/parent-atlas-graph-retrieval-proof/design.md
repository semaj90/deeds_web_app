# OpenSpec: Parent Atlas Graph Retrieval Proof Design

## Identity layers

| Layer | Contract | Notes |
|---|---|---|
| source identity | `source_id` | Stable logical source across revisions |
| source version | `source_version_id` | Revision-bound source occurrence |
| parse occurrence | `parse_node_id` | Parser-bound node occurrence in a specific parse revision |
| stable symbol | `symbol_id` | Cross-revision logical symbol identity |
| symbol version | `symbol_version_id` | Version-bound occurrence of a symbol |
| structural chunk | `chunk_id` | Retrieval unit derived from source or symbol structure |
| packet | `packet_key` | Canonical Parent Atlas semantic packet identity |
| concept | `concept_id` | Normalized extracted concept/entity identity |
| graph node | `graph_node_key` | Node identity inside a graph snapshot or projection |

## Current contract correction

`tree_node_id` is currently best treated as a provisional structural field. It may be used to preserve current joins and history, but it must not be promoted as the canonical symbol identity until the separate contracts above exist and are proven live.

`graphify_files.file_id` should be treated as a source identity candidate until its derivation is inspected. If the derivation includes `source_revision`, it is a source-version identity rather than a cross-revision file identity.

`graphify_symbols.symbol_id` is a stable-symbol candidate, but its cross-revision continuity and `stable_symbol_key` formula still need proof. A symbol can remain stable across content-only edits yet still change across renames or file moves unless a separate reconciliation ledger proves continuity.

`graphify_edges` can have valid row identity while its endpoints remain provisional. Edge row identity is not the same as stable endpoint identity.

## Parser reality

The declared parser lane and the runtime implementation must be tracked separately:
- parser manifest: what the pipeline claims it uses
- parser runtime: what the executable extraction logic actually does

If the runtime is still regex/heuristic-based, the proof state must say so explicitly. A declared Tree-sitter intent is not proof of parser-backed identity.

## Downstream impact

Until this split is complete:
- graph snapshot apply remains provisional
- uniqueness changes around `tree_node_id` remain blocked
- KNN, KMeans, SOM, and PageRank should be treated as downstream consumers of the provisional inventory, not as proof of canonical identity
- lineage should be expressed with edges such as `DERIVED_FROM`, `REPRESENTS`, `SUMMARIZES`, and `REFERENCES`, not overloaded into one field

## Read-only audit targets

Before any schema mutation, prove the following read-only questions:

1. What exactly generates `graphify_files.file_id`?
2. Does `graphify_symbols.symbol_id` survive a content-only edit?
3. Does `graphify_symbols.symbol_id` survive a rename or file move?
4. Is `atlas_tree_nodes.node_id` a revision-bound parse occurrence, not a stable symbol?
5. Does `atlas_packets.tree_node_id` mean "derived from this parse occurrence" rather than "this is the symbol"?

The answer to each question must come from live data or writer code, not file names or comments.

## Evidence hierarchy

Static search is candidate discovery only.

Preferred evidence types, in order:

1. AST analysis
2. Runtime test
3. SQL / database verification
4. HTTP integration test
5. End-to-end proof

Audit findings must cite at least one concrete proof source. A grep match may identify a candidate, but it does not by itself establish runtime behavior, authorization, or lineage.

Examples:

- Route protection is proven by AST call graph plus live HTTP 401/403/200 responses.
- Env fallback behavior is proven by startup/runtime validation, not by literal string presence alone.
- Svelte syntax migration is proven by AST or compiled output, not comments or examples.
- Lineage ownership is proven by join-back queries and store verification, not by schema names alone.

## Canonical contract audit

Identity and lineage must remain separate.

Identity candidates:
- `tree_node_id`
- `packet_key`
- `representation_id`
- `embedding_id`
- `snapshot_id`

Lineage edges:
- `DERIVED_FROM`
- `REPRESENTS`
- `PROJECTS_TO`
- `SUMMARIZES`
- `SUPERSEDES`
- `GENERATED_BY`
- `VALIDATED_BY`

Analytical metadata such as PageRank, SOM, KMeans, or Neo4j metrics must not be mixed into identity fields or lineage labels.

Postgres remains the canonical source of truth. Redis, Qdrant, Neo4j, and other stores are projections or mirrors unless a separate proof explicitly elevates them.

## Evidence pipeline

`trace_dynamic_context` is the central evidence assembly tool, not a giant audit tool.

It accepts a bounded question or target and returns an evidence bundle assembled from multiple proof lanes:
- static structure via rg, ast-grep, ts-morph, and Tree-sitter
- retrieval via Qdrant / TurboVec / cuVS
- graph analysis via NetworkX / Neo4j / cuGraph
- runtime proof via HTTP, MCP, process, and service checks
- telemetry via OTel / trace records / validation ledgers

The tool must return evidence, not code edits. Patch generation and patch validation belong to later tools.

### Request shape

```ts
interface TraceDynamicContextRequest {
  workspaceId: string;
  question: string;
  target?: {
    filePath?: string;
    symbolId?: string;
    symbolVersionId?: string;
    packetKey?: string;
    route?: string;
    traceId?: string;
  };
  workspaceRevision: string;
  sourceRevision?: string;
  lanes: Array<"lexical" | "typescript_ast" | "parser_ast" | "semantic" | "dependency_graph" | "runtime" | "browser" | "telemetry">;
  limits: {
    topK: number;
    maxFiles: number;
    maxSymbols: number;
    maxTokens: number;
    graphDepth: number;
    timeoutMs: number;
    runtimeMode: "read_only" | "probe" | "test";
  };
}
```

### Response shape

```ts
interface TraceDynamicContextResult {
  traceId: string;
  workspaceRevision: string;
  sourceId?: string;
  sourceVersionId?: string;
  symbolId?: string;
  symbolVersionId?: string;
  parseNodeId?: string;
  packetKey?: string;
  confidence: number;
  methods: string[];
  evidence: Array<{ kind: string; path?: string; symbol?: string; line?: number; status: string }>;
  retrieval: {
    lexicalHits: Array<unknown>;
    semanticHits: Array<unknown>;
    graphHits: Array<unknown>;
    runtimeHits: Array<unknown>;
  };
  runtime?: {
    httpRequests: Array<unknown>;
    playwrightTracePath?: string;
    consoleErrors?: string[];
    networkFailures?: string[];
  };
  validation: {
    status: "PROVEN" | "PARTIAL_PROVEN" | "NOT_PROVEN" | "CONTRADICTED";
    passedGates: string[];
    failedGates: string[];
    unresolvedClaims: string[];
  };
  provenance: {
    generatedAt: string;
    toolVersions: Record<string, string>;
    queryDigest: string;
    evidenceDigest: string;
  };
}
```

### First bounded slice

The first implementation slice should be small:
- input: `question`, `workspaceRevision`, optional `filePath` or `symbolId`
- lanes: `rg`, `ts-morph`, `Tree-sitter`, `Qdrant`, `Postgres` join-back
- output: bounded evidence list, canonical IDs, revision markers, and proof status
- exclusions: Mastra orchestration, A2A, cuVS, cuGraph, KMeans, SOM, PageRank, and automatic patching

### Pipeline rule

`trace_dynamic_context` should be a single evidence pipeline that aggregates proof from adapters. It should not become a monolithic AI audit that invents conclusions without evidence. Static discovery is candidate generation only; proof comes from runtime, SQL, HTTP, graph, or end-to-end validation.

The first adapter pair for that pipeline should stay narrow: static discovery plus Postgres join-back. Any evidence bundle should have a small formatter that can render route, symbol, packet, or runtime questions without collapsing them into one generic report.

## Patch tournament seam

This change also owns the next patch-selection step after evidence gathering: a bounded generate-test-select tournament for one existing compile error.

Current owner code paths to extend:
- `scripts/atlas/agentic-recommendation-workflow.mjs` for candidate generation and decisioning
- `sveltekit-frontend/src/lib/server/ai/error-agent/workflow-loop.ts` for repair classification and logging
- `sveltekit-frontend/src/lib/server/ace/atlas-tool-registry.ts` for patch proposal / patch apply tool contracts
- `sveltekit-frontend/src/lib/server/agent/execution-review.ts` for proposal-vs-execution review and manual approval state

Design constraints:
- candidate generation stays separate from evidence assembly
- each candidate runs in an isolated worktree or equivalent isolated checkout
- static checks and focused tests run before ranking
- ranking is deterministic and uses evidence-backed features only
- output is a comparison packet plus a Kanban card
- no candidate is auto-applied
- no training or reward optimization begins in this slice

The tournament should remain a recommendation artifact until manual approval promotes one candidate into the normal patch pipeline.
