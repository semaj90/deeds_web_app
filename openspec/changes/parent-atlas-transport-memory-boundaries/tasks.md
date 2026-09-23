# Parent Atlas — Transport, Memory, and Structural Boundaries

## Classification backlog

- [ ] **PROTO-01** Freeze the transport ownership matrix for tRPC, gRPC, MCP, ACP, and A2A; record current callers and reject duplicate bus ownership.
- [x] **PROTO-02A** Classify TurboVec HTTP/gRPC operations, N-API adapter, and spawned-Python wrapper against one service owner; prove HTTP/gRPC health and fail closed on the missing N-API module/method. Evidence: `parent-atlas-transport-owner-matrix-v1.json`; no writes.
- [ ] **PROTO-02B** Extend the owner/lifecycle matrix to all remaining active sidecars and verify each operation's runtime caller/protocol, without treating parallel interfaces as duplicate canonical owners.
- [x] **PROTO-03** Declare gRPC the typed cross-language contract for native/polyglot compute, while permitting operation-specific HTTP health/compatibility/fallback routes under the same service owner. No app identity or fusion ownership transfers; contract added to the OpenSpec spec.
- [x] **PROTO-04** Declare tRPC optional for demonstrated TypeScript application-local control surfaces. OpenSpec now states it is dormant capability without a client and cannot own identity, durable truth, cross-language compute, or workflow authority; the caller census found no in-repo tRPC client. Server mount remains unchanged.
- [ ] **ACP-01** Define the Parent Atlas coding-agent ACP boundary for editor sessions, permissions, tool actions, patches, terminal output, and progress.
- [x] **ACP-02A** Add a strict projection-only mapping contract for checksummed ACP ingress task/action/session/run references to the existing Kanban task attempt and `WorkflowActionEventV1` run/action/receipt references, carrying a supplied ContextManifest checksum; mismatched run, receipt, external refs, or ingress checksum fail closed. Fixture-proven only; no ACP runtime wiring, ContextManifest readback, or canonical authority is claimed.
- [ ] **ACP-02B** Wire the ACP ingress caller to resolve the canonical task attempt, ContextManifest checksum, and ExecutionReceipt from their existing owners, then prove a bounded end-to-end mapping/readback. ACP must not own graph identity.
      **Investigation done 2026-09-22, not wired — found the real "existing owners" for 2 of 3
      inputs, and a real identity-format blocker that must be resolved before wiring can proceed
      (recording this rather than forcing a wiring around it):**
      - **Task attempt — real owner found, compatible.** `listKanbanTaskAttempts({ taskId, runId })`
        (`sveltekit-frontend/src/lib/server/atlas/kanban-task-board.ts:380`) reads the real
        `kanban_task_attempts` table (`id, task_id, run_id, worker, started_at, finished_at,
        success, failure_kind, execution_receipt_id`) — column shape matches
        `buildAcpIdentityProjectionV1`'s `taskAttempt` input exactly (`taskId`, `runId`,
        `executionReceiptId`). Plain-text IDs both sides; no format conflict.
      - **WorkflowActionEventV1 — real read pattern found, but a genuine UUID-vs-string identity
        mismatch blocks using it as-is.** `action-writer.ts` (`writeActionAtomically`,
        lines ~222-245) already does the exact read this task needs — `SELECT payload FROM
        workflow_events WHERE run_id = ? AND action_id = ? AND sequence_no = ?` — for its own
        internal readback verification, then validates via
        `canonical-action-write-adapter-v1.ts::validateCanonicalActionReadbackV1()`. But
        `prepareCanonicalActionWriteV1()` in that same adapter file **hard-requires
        `event.runId`/`event.actionId` to match a UUID regex**
        (`CANONICAL_WORKFLOW_EVENT_RUN_ID_MUST_BE_UUID` / `..._ACTION_ID_MUST_BE_UUID`) — yet
        ACP-02A's own fixture (`packages/parent-atlas/test/acp-identity-projection-v1.test.mjs`)
        uses non-UUID string IDs (`runId: 'run:9'`, `actionId: 'action:canonical'`). A
        `WorkflowActionEventV1` shaped like ACP-02A's fixture would be **rejected outright** by
        the real canonical writer/reader path. This is a real blocker, not a cosmetic detail:
        ACP-02B cannot "resolve... from their existing owners" until it's decided whether (a)
        external ACP run/action IDs get translated into UUIDs before any `WorkflowActionEventV1`
        is constructed, or (b) the canonical writer's UUID requirement is relaxed for this path,
        or (c) some other reconciliation. Not decided here — flagging for the operator/next pass.
      - **ContextManifest checksum — no persisted lookup-by-run store found at all.**
        `buildContextManifestV2()` (`sveltekit-frontend/src/lib/server/atlas/graph/
        context-manifest-v2.ts`) is a pure function: given identity/revision inputs, it
        deterministically computes a checksum — it is not a DB-backed store you resolve a
        checksum FROM by run or task ID. Grepped `schema-postgres.ts` for any
        `ContextManifestV2`/`context_manifest` table: zero matches. A separate, larger,
        differently-scoped contract (`AtlasWorkflowSpecV1` in `agentic-file-compiler/contracts.ts`)
        carries a `contextManifestId` field, but that's an ID reference inside a different DAG-spec
        system, not confirmed to be the checksum store this task means — not chased further here.
        **This is the real gap**: there is currently nothing to "resolve the ContextManifest
        checksum from its existing owner" by run/task ID; the checksum is only ever freshly
        computed from inputs the caller must already have, which may mean ACP-02B's phrasing needs
        revisiting rather than treating this as a missing implementation.
      No code written, no tests run, no DB touched — read-only investigation only.
- [ ] **A2A-01** Add a Parent Atlas AgentCard only after single-agent execution and receipts are proven.
- [x] **A2A-02A** Add a projection-only adapter contract that binds an A2A task to a caller-resolved Atlas task attempt, matching run and receipt IDs and carrying workflow/action/evidence/resource/artifact provenance; mismatches fail closed. Focused fixtures prove mapping only; no canonical authority or live resolver is claimed.
- [ ] **A2A-02B** Wire the A2A adapter to the existing canonical task-attempt resolver and prove bounded end-to-end task/run/receipt/provenance readback. Keep A2A identifiers protocol-local and noncanonical.
- [x] **A2A-03** `DISCOVERY_DESCRIPTOR_BOUNDARY_PROVEN` (status label corrected 2026-09-23 —
  previously read as if it closed peer-write authorization; it does not). Prohibit *advertising*
  canonical Postgres/Graphify operations as peer-agent writable state. The peer discovery
  descriptor is now default-deny: only `identity:recover` and retrieval `Search`/`RRFFuse`/`Rerank`
  are advertised; generic `ExecuteTool*`, mirror tools, unknown tools, and unknown methods are
  omitted. The discovery route renders tools from the filtered descriptor IDs rather than the
  complete ACP registry. Focused contract test passes 2/2. **This proves only that a peer cannot
  discover a mutating capability through this descriptor — it does NOT prove a peer cannot invoke
  an unadvertised mirror/write RPC method directly by name.** That is a distinct, still-open
  question (see A2A-04 below), not covered by this task's evidence. Evidence:
  `sveltekit-frontend/src/lib/server/acp/acp-grpc-quic-bridge.ts`,
  `sveltekit-frontend/src/routes/api/acp/service-ports/+server.ts`, and
  `sveltekit-frontend/src/lib/server/acp/acp-grpc-quic-bridge.spec.ts`.
- [ ] **A2A-04** `A2A_INVOCATION_AUTHORIZATION_BOUNDARY` — direct-invocation authorization audit
  (not started). Test whether a peer can call an unadvertised mutating/mirror RPC method by name
  despite A2A-03's discovery-level suppression. Read-only-safe approach: exercise authorization at
  the dispatch/handler-admission layer with invalid or dry-run fixtures (no real mutation needs to
  occur) and prove rejection happens before handler invocation, not merely that the method is
  unlisted in discovery output. Acceptance criteria (none proven yet, all still open):
  (1) direct invocation of an unadvertised/write-like method is rejected;
  (2) rejection occurs before handler invocation, not merely omitted from discovery;
  (3) missing/invalid authorization fails closed;
  (4) peer-supplied canonical IDs cannot become authority merely by being supplied;
  (5) mirror/canonical mutation cannot occur through the peer surface without the required
  authorization; (6) tests proving this remain non-mutating. Do not implement or claim this gate
  proven until fixtures exercising all six criteria exist and pass without changing runtime
  behavior.
- [x] **MEM-01** Freeze the three-memory taxonomy: ephemeral llama KV prompt cache, disposable BitFrost/Valkey residency, and PostgreSQL durable canonical memory. Qdrant/Neo4j are rebuildable projections, not memory authorities; CLAUDE.md's historical linear hierarchy has been explicitly superseded. Documentation contract only; no runtime-state claim.
- [x] **MEM-02** Keep `ContextManifest` as the reproducible model-context boundary; KV cache reuse is an optimization and never durable truth. `ContextManifestV2` preserves the existing V1 payload and deterministically checksums context/revision inputs (`context-manifest-v2.ts` and its focused spec); llama prompt reuse is marked `ephemeral` in `context-prompt-streamer.ts`. Contract-level proof only; live llama-server KV persistence behavior is not claimed.
- [x] **MEM-03** Prove revision-qualified BitFrost keys and fail-open behavior across workspace, policy, graph, and representation revisions. `buildAceBitfrostCacheKeyV1` identity test now asserts a distinct key for each of those four revision changes; the existing cache-aside suite proves reconstruction after Valkey read failure and returning reconstructed canonical data when the cache write fails. Focused suites pass 27/27. Contract/fixture proof only; no live Valkey readback or cache write is claimed. Evidence: `sveltekit-frontend/src/lib/server/atlas/cache/ace-bitfrost-cache-identity-v1.test.ts`, `sveltekit-frontend/src/lib/server/atlas/cache/bitfrost-residency-warming-v1.test.ts`.
- [x] **STRUCT-01** Use Tree-sitter CST named-node projection for compact structural memory; do not create a canonical CAST subsystem. The existing `CanonicalStructuralObservationV2` traverses named CST children, preserves AST paths and UTF-8 spans, and hard-codes `canonicalWritesAllowed=false`; its focused spec passes 5/5. This is a derived observation representation, not a new canonical CAST owner. `STRUCT-02` remains open for the richer `StructuralMemoryCard` contract (typed relationships and representation-revision coverage).
- [x] **STRUCT-02** Define `StructuralMemoryCard` as derived evidence containing canonical IDs, source span, typed relationships, syntax status, and representation revision; upstream Tree-sitter node IDs remain provenance. Implemented/exported `StructuralMemoryCardV1` as a projection-only schema/builder: canonical references are supplied (never minted), source/workspace revisions and byte/line spans are bound into a deterministic evidence checksum, relation refs are typed and validated, and `canonicalAuthority=false`/`writesPerformed=false` are enforced. Package TypeScript build and focused contract tests pass 4/4; runtime/database promotion is not claimed. Evidence: `packages/parent-atlas/src/core/structural-memory-card-v1.ts`, `packages/parent-atlas/test/structural-memory-card-v1.test.mjs`.
- [x] **STRUCT-03** Define one language-extension registry for TypeScript (`.ts/.tsx/.mts/.cts`), JavaScript (`.js/.jsx/.mjs/.cjs`), Python (`.py/.pyi`), Rust (`.rs`), Go (`.go`), and Java (`.java`); unsupported extensions stop at explicit classification. Live 8095 probe passed.
- [x] **STRUCT-04** Normalize failures into typed diagnostics: `ChunkingError` for parse/extraction failure and `UnsupportedLanguageError` for unsupported extensions; preserve source revision and file path without fabricating evidence. Live unsupported-language probe passed; parse-failure parity remains tracked by STRUCT-05/GPH-15.
- [x] **STRUCT-05** Preserve Tree-sitter `ERROR`/`MISSING` syntax evidence in `syntaxStatus` (`CLEAN` or `RECOVERED_WITH_ERRORS`) separately from canonical identity validity. The bounded live failure-isolation proof passes both malformed `ERROR` and missing-delimiter `MISSING` diagnostics with `RECOVERED_WITH_ERRORS`; the v2 owner now maps the same fatal diagnostics to `ChunkingError`, matching the legacy classifier (focused local test passed). The deployed sidecar image has not been rebuilt/re-probed, so STRUCT-04's live typed-envelope parity remains unproven.
- [x] **STRUCT-06** Evaluate `supermemoryai/code-chunk` only as a contextual chunking/reference implementation; its chunk IDs and memory graph cannot become Parent Atlas canonical identity or truth. Upstream README review confirms AST-aware contextual chunk text, scope/import/sibling metadata, byte/line ranges, streaming, and per-file errors; it also demonstrates path-plus-ordinal IDs and vector-store upsert, which are explicitly NOT adopted as Parent Atlas identity or write authority. Classified `REFERENCE_ONLY / EXPERIMENTAL_CONTEXT_ENRICHER_CANDIDATE`; not installed or runtime-tested. `CC-01` remains open until local `StructuralChunkV1` is defined/reconciled; see `docs/reports/openspec-workboard-run-2026-09-23T005049Z.json` and https://github.com/supermemoryai/code-chunk.
- [ ] **STRUCT-07** Prove the bounded path `CST named nodes → structural evidence → GIS identity → Postgres packet → semantic_768 projection`; no direct chunker writes to Qdrant or Neo4j.
- [x] **CC-01** Audit `supermemoryai/code-chunk` output against `StructuralChunkV1`: scope chain, entities, signatures, imports, siblings, byte/line ranges, contextualized text, and per-file errors. Static field-level reconciliation completed against the existing `TreesitterChunkerChunkV1`, symbol/framework nominations, structural-reference facts, extraction receipt, and `StructuralMemoryCardV1`; no duplicate `StructuralChunkV1` owner was created. Scope, entities, imports, and byte/line ranges map to existing owners; signatures are partial (nomination only); sibling/contextualized-text fields are absent and must remain derived/nonidentity; per-file failure evidence exists across adapter/receipt boundaries but is not one batch-joined `StructuralChunkV1` field. No code-chunk package install or runtime output claim. Full mapping and gaps: `docs/reports/structural-chunk-reference-mapping-v1.json`.
- [ ] **CC-02** Benchmark contextual structural metadata against the current treesitter-chunker evidence on a fixed corpus; record symbol localization and repair-localization Recall@10/MRR without changing identity.
- [x] **CC-03** Classify code-chunk as `EXPERIMENTAL_CONTEXT_ENRICHER` or `REPLACEMENT_CANDIDATE`; it must not become a second canonical Graphify/GIS/SearchRuntime owner. Decision: `EXPERIMENTAL_CONTEXT_ENRICHER` only; no local dependency or runtime integration was found, and its output remains downstream of existing GIS identity. Replacement/promotion is not proposed; usefulness awaits the fixed-corpus CC-02 benchmark, while `CC-01` schema reconciliation remains open. Evidence: STRUCT-06 upstream reference review and scoped source search (no package/import/caller).
- [ ] **CC-04** Feed code-chunk-style context into the existing SemanticCard compiler only after GIS identity assignment; contextualized text is representation input, never identity.
- [ ] **CC-05** Prove batch failure isolation and bounded concurrency: one file may return `ChunkingError` while other files complete and the Graphify receipt counts each result.
- [ ] **HG-01** Map process/repair/execution n-ary events to the existing hypergraph owner using event provenance, not duplicate binary graph truth.
- [ ] **HG-02** Keep hypergraph expansion after canonical retrieval as additional evidence; SearchRuntime remains the only candidate fusion owner.
- [ ] **HG-03** Preserve hyperedge participants, task/run IDs, revisions, selected packets, tests, and receipts without promoting event IDs to packet identity.
- [ ] **MEM-04** Define a CAST-like `TaskScene` episodic record around request/task/workspace revision, actors, evidence, actions, outcome, `ContextManifest`, `RLMTrace`, and `ExecutionReceipt`; reserve CAST-like for episodic memory.
- [ ] **MEM-05** Model temporal semantic relationships as provenance-owned `UPDATES`, `EXTENDS`, and `DERIVES` observations while preserving superseded history.
- [ ] **MEM-06** Keep semantic, episodic, and procedural memory separate: Atlas packets/graph, TaskScene/RLMTrace/receipts, and ACE playbooks/policy revisions; BitFrost/Valkey remains cache only.
- [ ] **SIMD-05** Benchmark simdjson only on metadata JSON/JSONL paths such as receipts, snapshots, and traces; retain Zod/Pydantic/TypeScript schemas as semantic authorities.
- [ ] **TV-01** Restrict TurboVec to the canonical `semantic_768` representation and its own exact oracle.
- [ ] **TV-02** Map TurboVec stable external IDs/ordinals back to canonical Atlas identity; never promote TurboVec local IDs to packet identity.
- [ ] **TV-03** Prove TurboVec filtering parity with the canonical `SearchFilter` contract.
- [ ] **TV-04** Treat TurboVec, Qdrant, and future CAGRA as one logical dense lane with one SearchRuntime fusion contribution.
- [ ] **TV-05** Define one `DenseExecutor` seam for `semantic_768`, query vectors, allowed ordinals, `k`, and index revision; Qdrant, cuVS exact, TurboVec, and CAGRA are interchangeable executors, not separate fusion lanes.
- [ ] **TV-06A** Prove `TURBOVEC_EXECUTION_OWNER_PROVEN`: select one live transport and classify HTTP, gRPC, Rust N-API, and spawned CLI paths as primary, compatibility, deprecated, or rollback before building a TurboVec index.
- [ ] **GRAPH-01** Prove bounded graph expansion: seed cap, explicit max depth, per-seed neighbor limit, visited canonical packet dedupe, final candidate cap, and fail-open behavior. Graph expansion supplies evidence only; it must not become a standalone ranking or fusion owner.
- [ ] **GRAPH-02** Prove vector-seed expansion: semantic top-K canonical symbols → depth-limited typed edges → canonical-ID dedupe; PageRank remains a feature and hypergraph events remain additional evidence.
- [ ] **GDS-01** Classify the Python `graphdatascience` client as a graph-algorithm executor only; Neo4j remains the structural graph projection and Postgres remains canonical truth.
- [ ] **GDS-02** Run revision-qualified PageRank/community algorithms from the canonical Neo4j projection and emit derived feature records keyed by `symbol_version_id`/`workspace_revision`.
- [ ] **GDS-03** Prove derived graph features enter `FeatureMatrixRow`/`RetrievalFeatureRow` without becoming a second ranker, embedding component, or RRF lane.
- [ ] **GDS-04** Keep CPU Neo4j GDS and optional cuGraph comparisons on the same graph snapshot; record parity and runtime without promoting either implementation to identity ownership.
- [ ] **ROUTE-07** Prove hot/warm/cold tier transitions with revision-qualified cache keys, fail-open behavior, and no truth mutation when Valkey entries are stale or missing.
- [ ] **LEX-01** Freeze one logical lexical lane: BM25 baseline first; BM42 is an alternative executor only after a sparse collection and sparse identity round trip exist.
- [ ] **TV-06B** Prove the ordinal map from TurboVec external IDs to `symbol_version_id`, `packet_key`, and `workspace_revision`; local numeric IDs never become canonical identity.
- [ ] **TV-07** Prove filtered dense-search parity using the canonical `SearchFilter` and ordinal allowlist/bitset; retain one logical dense contribution per canonical entity.
- [ ] **RPC-01** Use gRPC control messages plus Arrow/mmap immutable bulk tensor transport for GPU/vector compute; do not send large tensor payloads through tRPC or MCP.
- [ ] **RPC-02** Freeze a small typed `BuildIndexRequest` control contract containing snapshot, representation, ordinal-map revisions, mmap path, dimensions, and vector count.
- [ ] **RPC-03** Prove Arrow/mmap is the bulk semantic-vector transport before sending large tensors through JSON, tRPC, MCP, or protobuf messages.
- [ ] **RLM-01** Keep `RLMEnvironment`, `RLMTrace`, budgets, and recursive evidence navigation internal to Parent Atlas; expose agent behavior through ACP/A2A only after their gates pass.
- [ ] **ACE-INJ-01** Compile RLM retrieval and optional hypergraph evidence into the existing `ContextManifest` and bounded ACE packet; never inject raw unranked results.
- [ ] **ACE-INJ-02** Link `ContextManifest`, model execution, `ExecutionReceipt`, and a CAST-like `TaskScene` by immutable revision/hash fields.
- [ ] **ACE-INJ-03** Feed validated execution outcomes into ACE Reflector/Curator only after receipt and provenance gates pass; policy updates cannot rewrite canonical graph truth.

## Architecture review — 2026-08-14

The reviewed workstation split is now explicit: Postgres owns canonical
revisions, identities, receipts, ontology tuples, and ACE state; Qdrant owns
persistent dense/sparse/multivector projections; cuVS brute force is the exact
`semantic_768` oracle; CAGRA is an optional executor; Neo4j supplies bounded
structural expansion and PageRank evidence; Valkey stores revision-qualified
hot routing, centroid buckets, manifests, and ACE packets only.

### Three-plane boundary

```text
TRUTH
  Postgres + canonical graph + grounded observations

RETRIEVAL
  Qdrant + exact cuVS + optional CAGRA/TurboVec + lexical executor + graph expansion

MEMORY/ROUTING
  Valkey/BitFrost + KMeans/SOM routing metadata + ACE/context cache
```

KMeans answers “which region should be searched”; KNN/CAGRA answers “which
vectors are nearest”; graph expansion supplies relational evidence; hypergraph
expansion supplies bounded multi-entity process evidence; SOM is optional
topology-preserving routing/visualization. None of these may become a second
canonical identity or fusion owner.

The runtime temperature policy is explicit:

```text
HOT   Valkey packets, ACE cards, centroid hints, cached candidate lists
WARM  Qdrant dense retrieval, approved lexical executor, bounded graph expansion
COLD  Postgres/source reconstruction, immutable Arrow/mmap snapshots, broader evidence
```

Temperature controls retrieval breadth, not truth. Cache misses, stale
revisions, and unavailable executors must fail open to the next eligible tier.
The current live Qdrant collection has no sparse vector, so the WARM lexical
branch is baseline-only until a separate BM42 sparse schema and identity proof
exist.

KMeans and a 20x20 SOM are routing/visualization metadata derived from
`semantic_768`, not canonical identity or independent retrieval votes. BM42
remains deferred until a sparse collection and sparse identity round trip are
proven. Arrow IPC/mmap is the preferred bulk vector snapshot boundary for a
future Go/cuVS reader; hashes identify snapshots, while vectors remain binary
float data rather than hexadecimal text.

Current reviewed gates: exact cuVS live fixture `PROVEN`; CAGRA tiny-fixture
runtime and Recall@3 `PROVEN`, production `QUARANTINED`; graph bounded
expansion `OPEN`; TurboVec transport owner `OPEN`; LangExtract grounding and
live Graphify owner integration remain upstream correctness gates.

## Sequencing

1. GPH-13 parse-failure parity and CHUNK0 ownership closure.
2. AR-04 through AR-07 bounded RLM safety and deterministic receipt.
3. PROTO-01/02 transport audit.
4. ACP-01/02 coding-agent boundary.
5. A2A-01/02 only after independent-agent delegation is real and needed.
6. MEM, STRUCT, SIMD, TurboVec, and gRPC bulk-transport proofs as bounded lanes.

## Current lane state

- `PROTO-01`: `CALLER_AND_LIFECYCLE_RECONCILED_TWO_CONFLICTS_OPEN` (2026-09-23, `lifecycleReconciliationV1` section added to
  `docs/reports/parent-atlas-transport-owner-matrix-v1.json`) — every transport surface (tRPC, the three Go
  services' HTTP/gRPC pairs, MCP's 4 server groupings, ACP's two surfaces, A2A's two surfaces) now carries an
  explicit classification into the 7-bucket taxonomy (`CANONICAL`/`OPTIONAL`/`COMPATIBILITY`/`EXPERIMENTAL`/
  `LEGACY`/`DORMANT`/`UNKNOWN`), with `endpointExists`/`reachable`/`hasInRepoCaller`/`canonicalOwner` recorded
  as separate, deliberately unmerged facts per surface. Real findings, not asserted from the comment text:
  `retrieval-client.ts`'s actual probe-order conditionals (traced, not just read from its header comment) show
  `RETRIEVAL_GRPC_ENABLED`/`RETRIEVAL_HTTP_ENABLED` both default `false` and are unset in `.env`/`.env.local`
  (grepped, zero matches), so the app's configured retrieval path falls through to `go-search-service` (:8096)
  — classified `CANONICAL` by configuration, but PROTO-02B's own live snapshot (below) reports it `DEGRADED`
  (`qdrantConnected=false`), while `go-retrieval-service` (:8100, `READY_FULL` per that same snapshot) sits
  disabled one env flag away, classified `OPTIONAL`. This tension — combining this pass's static config trace
  with PROTO-02B's independent live probe — was not visible in either source alone and is flagged as an open
  operator-decision conflict, not fixed. MCP: cross-checked BOTH live agent-surface configs directly
  (repo-root `.mcp.json` for Claude Code, `.opencode/opencode.jsonc` for OpenCode) — `trace-mcp-server.ts` is
  the only MCP server registered in both, classified `CANONICAL`; `src/mcp/server.ts` (stdio) and the three
  domain-specific server factories are registered in neither and have no npm-script launcher, classified
  `DORMANT`/`EXPERIMENTAL` respectively. The pre-existing MCP duplicate-tool finding
  (`context.prefetch_feature_context`) is carried forward as the second open conflict, `UNKNOWN`, pending an
  operator decision on which registration is authoritative. PROTO-01 is not marked fully `CLOSED` because its
  own text requires "reject duplicate bus ownership," and that action (not just the classification) remains
  outstanding for both conflicts — no tool registration or env default was touched. No runtime behavior
  changed; no code retired, removed, switched, or rewired.
  **`MCP_PREFETCH_OWNER_CONVERGENCE_01` (2026-09-23, `docs/reports/mcp-prefetch-feature-context-owner-v1.json`,
  result `MCP_PREFETCH_SINGLE_OWNER_PROVEN`)** — confirmed `CONTRACT_DIVERGENT`, not a thin duplicate:
  `new_tools.ts`'s registration takes optional `path`/`query` plus community/notecard/AGENTS.md options;
  `trace-mcp-server.ts`'s inline registration requires `query` and takes an entirely different
  `file_path`/`top_k`/`include_kb`/`include_karpathy` shape — zero field overlap beyond the name `query`
  itself. Read the actual MCP SDK source (`node_modules/@modelcontextprotocol/sdk/dist/cjs/server/mcp.js`) and
  confirmed `registerTool()` throws `Tool ${name} is already registered` on a duplicate name — not silent
  last-write-wins — which by itself would predict a startup crash given `registerNewTools()` (line 565) runs
  before the unguarded inline registration (line 7789). **Resolved with one read-only, non-mutating `tools/list`
  call against the already-running `:8788` server** (no restart, within this gate's authorized scope): the
  live server exposes exactly one `context.prefetch_feature_context` registration, matching `new_tools.ts`'s
  schema and description verbatim. `new_tools.ts` is the live single owner; the inline duplicate is confirmed
  unreachable via MCP discovery. The exact throw/catch mechanism explaining why the process doesn't crash
  remains unidentified — a real, named, lower-priority open question, not chased further. No registration
  touched, no restart performed, zero writes.
- `PROTO-02A`: `VERIFIED` — TurboVec's operation-level service/transport owners are in `docs/reports/parent-atlas-transport-owner-matrix-v1.json`; both HTTP and gRPC health pass and report the same 327,820 indexed/64-dimension/4-bit sidecar. HTTP prefilter and rerank are operation-specific; candidate search prefers gRPC with HTTP fallback; the gRPC upsert is a read-only/no-op stub. The N-API adapter's path and API do not match the verified Rust crate and fail closed; the spawned Python wrapper has no scoped caller. No owner or path was removed.
- `TURBOVEC_SEARCH_BACKEND_SINGLE_OWNER_AND_NATIVE_API_CONTRACT`: `TURBOVEC_SEARCH_SINGLE_OWNER_PROVEN`
  (2026-09-23, `docs/reports/turbovec-search-backend-owner-v1.json`) — full caller trace, not just endpoint
  health. Key finding: HTTP and gRPC are NOT two competing owners of one capability — they cover two
  **different** TurboVec operations. gRPC's real caller (`turbovec-prefilter.ts::turbovecSearch()`) uses ANN
  `/search`, gRPC-primary with HTTP fallback baked into the same function, wired as exactly one of 3 RRF
  fusion lanes in `rrf-integration.ts` — traced the other lane (`qdrantPromise`) and confirmed it calls a
  separate function (`queryQdrantVectorSignal`) with zero TurboVec involvement, so no duplicate-vote risk
  exists for RRF today. HTTP's real caller (`turbovec-search.ts::searchTurboVecSidecar()`) uses `/rerank` on
  Qdrant-sourced candidates, not `/search` — a genuinely different operation, reachable only via
  `qdrant-search.ts`'s `TurboVecSearchBackend`, itself config-gated off by default (`CODEBASE_ANN_BACKEND`
  defaults `'qdrant'`, unset in both env files). Two independent N-API adapter implementations found (not one)
  — `rust-napi-search-backend.ts` expects `searchAnn`, `turbovec-search.ts`'s own `loadNativeTurboVec()`
  expects `searchCodebaseAnn`/`search`/`query` — neither export exists in the verified crate (same 5 exports
  as before); both fail closed, and this duplication is itself flagged, not consolidated. A dead-duplicate
  `searchCodebaseAnn` function (defined independently in both `qdrant-search.ts` and `turbovec-search.ts`)
  was found and flagged — the live one is confirmed by 10 real callers, the other has zero external callers.
  CLI wrapper reconfirmed zero callers. Parity probe deliberately **not** run: gRPC's and HTTP's live
  operations aren't the same capability, so comparing them would be misleading; the genuinely comparable pair
  (gRPC `/search` vs HTTP `/search` fallback, both inside one function) is named as the correct future target
  instead. No code changed, no config changed, no transport removed/switched. Committed locally only.
- `PROTO-02B`: `OPEN` — remaining-sidecar fleet inventory and per-operation caller/lifecycle proof are still required. Supplemental live snapshot `docs/reports/openspec-workboard-run-2026-09-23T012648Z.json` (2026-09-23): 8095 NLP, 8091 LangGraph, and 8100 Go retrieval returned healthy/ok; 8097 embedding returned healthy with model loaded on CPU; 8096 Go search returned `degraded`/`qdrantConnected=false`; 8085 Docling returned `degraded` with `vlm_ocr=false`; 8121 neural decoder returned `degraded`; 8098 RAPIDS returned `ok`, CUDA available, PyTorch unavailable, execution-only and no-store-writes. Static source tracing found callers for the application-facing owners (NLP/structural, LangGraph, Go retrieval/search/embedding, Docling, decoder adapter, RAPIDS clients). New read-only probe `scripts/atlas/probe-go-grpc-health-v1.mjs` invoked each Go service's actual protobuf `Health` RPC: retrieval :50053 healthy, search :50055 degraded (`qdrantConnected=false`), embedding :50051 healthy on CPU. Therefore gRPC reachability and service health are now proven for these three methods; this does not prove that normal application traffic selects gRPC (retrieval/embedding are config-gated) or prove non-health RPC parity. Supplemental 2026-09-23 service/caller audit `docs/reports/openspec-workboard-run-2026-09-23T013727Z.json`: Bifrost :3040 is live/healthy and has a SvelteKit streaming caller; image-synthesis :8092 is live/healthy but reports CPU and all three model capabilities unloaded, while the evidence-upload caller's optional `/depth` result is handled as a settled failure. RabbitMQ AMQP/management and NATS client/monitoring ports are TCP-reachable, with SvelteKit publisher/caller code located; no messages were sent. The separate CrossEncoder `reranker-client.ts` has no in-repo caller and defaults to the image-synthesis port :8092 (wrong service); its documented sidecar port :8099 is also assigned by Compose to optional TensorRT, so do not repoint it without resolving ownership. Main retrieval instead calls the distinct `gpu-rerank.ts` owner. These are supplemental classifications only; no task checkbox earned. Other sidecar operations and full lifecycle classifications remain open.
- `PROTO-03`: `VERIFIED` as an architecture contract only — OpenSpec now declares gRPC the typed native/polyglot compute boundary while allowing operation-specific HTTP health/compatibility/fallback paths under one service owner. It does not claim every running service is gRPC-primary or that runtime migration is complete.
- TurboVec HTTP, gRPC, N-API, and spawned-CLI evidence: historical capability evidence; no live transport promotion.
- ACP packet artifacts: capability evidence only; no proven editor-agent session.
- A2A: `A2A-02A` projection contract now requires a resolved Atlas task attempt, rejects run/receipt mismatches, and records Atlas task/run refs alongside workflow/action/evidence/resource/artifact provenance. Package build and focused tests pass 15/15. `A2A-02B` remains open: there is no demonstrated runtime adapter caller/resolver readback; no runtime caller or independent-agent delegation need is proven.
- `STRUCT-03/04`: implementation is live in the rebuilt `miniforge-nlp-sidecar`; supported TypeScript returned `CLEAN` with chunks and unsupported `.txt` returned `UnsupportedLanguageError` with a diagnostic. Python syntax and client tests pass.
- `STRUCT-05`: syntax recovery is represented in the response contract; the live failure-isolation receipt proves both malformed `ERROR` and missing-delimiter `MISSING` diagnostics with `RECOVERED_WITH_ERRORS`. The v2 source now uses the legacy fatal-diagnostic classifier for both `error_tag` and `syntax_status`; focused local tests cover recovered syntax errors and nonfatal CRLF span remapping. The live receipt still reflects the pre-fix service image (`error_tag=null` for recovered syntax), so runtime typed-envelope parity remains open until a normal image rebuild and bounded re-probe.
- Runtime mutations from this OpenSpec: none.

## Existing evidence boundary

- `docs/reports/transport-pressure-audit.{json,md}` is historical evidence only: it records TurboVec HTTP/MCP reachability on `:8791`, but its RabbitMQ port data predates the current published-port contract and must not be reused as current configuration truth.
- `docs/reports/turbovec-sidecar-contract.json` proves an earlier bounded dual HTTP/gRPC contract (`grpcHealth`, transform, encode, SOM, batch cosine, and search all passed); it does not select a canonical production transport or authorize a migration.
- `sveltekit-frontend/scripts/atlas/audit-acp-packet-transport.mjs` is an existing packet audit owner, not evidence that ACP is a live editor-agent protocol boundary.
- A fresh PROTO-01/PROTO-02 audit must record endpoint, caller, owner, live status, and lifecycle (`CANONICAL`, `COMPATIBILITY`, `EXPERIMENTAL`, or `LEGACY`) before any transport is promoted.

## Promotion gates

- `TRANSPORT_OWNER_MATRIX_PASS`
- `NO_DUPLICATE_SIDECAR_BUS_PASS`
- `MEMORY_TAXONOMY_PASS`
- `TREE_SITTER_CST_BOUNDARY_PASS`
- `CANONICAL_IDENTITY_NOT_UPSTREAM_PASS`
- `TURBOVEC_SEMANTIC_768_PASS`
- `TURBOVEC_FILTER_PARITY_PASS`
- `ACP_RECEIPT_LINK_PASS`
- `A2A_RECEIPT_LINK_PASS`

No task in this change may promote CAGRA, change RRF semantics, or alter canonical identity ownership.

## Structural CST/AST retrieval lane — 2026-08-28

The retrieval fabric is now explicitly modeled as lexical, sparse, dense,
structural CST/AST/symbol, graph, and optional late-interaction lanes. Tree-sitter
owns syntax/CST evidence; ast-grep owns structural matching; PostgreSQL remains
canonical identity/revision authority; SearchRuntime remains the single RRF owner.
Structural results must resolve to `CandidateOrdinal` before fusion.

- [x] **STRUCT-08** Define and export `StructuralQueryPlanV1` with deterministic
  query digest, literal terms, target symbols, node-kind hints, structural
  predicates, and CST/AST/signature mode. The plan is non-authoritative and
  non-executable until an executor is proven.
- [x] **STRUCT-09** Add fixture validation proving `canonicalAuthority=false` and
  `executable=false` for structural query plans.
- [x] **STRUCT-10A** Implement a read-only observation query adapter consuming
  `StructuralQueryPlanV1`; preserve source references, source revisions, byte
  spans, captures, and extractor revisions. The adapter is deliberately not a
  parser process, identity resolver, projection writer, or CandidateOrdinal
  assigner.
- [ ] **STRUCT-10B** Add the live Tree-sitter/ast-grep parser-process executor
  behind the observation adapter; preserve grammar revision and source bytes in
  its receipt.
- [ ] **STRUCT-11** Resolve structural observations through the existing Atlas
  identity bridge to `packetKey`, `canonicalId`, and `CandidateOrdinal`; reject
  unresolved, ambiguous, stale, or mixed-workspace results.
- [ ] **STRUCT-12** Emit a lane-local structural result envelope with rank/score
  diagnostics only; do not compare structural scores directly with dense or
  lexical scores.
- [ ] **STRUCT-13** Feed the structural lane into the existing SearchRuntime
  identity-resolution and RRF path as one logical contribution; do not add a
  second fusion owner or a second canonical writer.
- [ ] **STRUCT-14** Define `AtlasStructuralSparseV1` as a derived deterministic
  feature representation for symbols, node kinds, CST/AST paths, calls, imports,
  type references, grounded concepts, and evidence classes. Do not label it SPLADE
  unless a learned SPLADE-style producer is actually implemented and evaluated.
- [ ] **STRUCT-15** Prove bounded structural queries for declaration, call, import,
  implementation, and revision/checksum lookup on a fixed source corpus.
- [ ] **STRUCT-16** Add structural-vs-lexical-vs-dense ablation receipts with exact
  CandidateOrdinal deduplication before RRF; no topology, ColBERT, TurboVec, or
  PyTorch classifier is a prerequisite for this gate.

### Current structural-lane status

- Query-plan contract: `PROVEN_FIXTURE`.
- Tree-sitter/ast-grep observation adapters: present and separately tested.
- Observation query adapter: `PROVEN_FIXTURE` (`STRUCT-10A`).
- Live Tree-sitter/ast-grep parser-process executor: `OPEN` (`STRUCT-10B`).
- Exact-only structural identity bridge: bounded live proof passed against the
  15-row lineage-qualified map; one JavaScript source resolved exactly with
  `candidateOrdinal=0` under checksum
  `86fee5d38619d3065d8710942068f26fb5b0d3c09992b1b523083ae0a593d297`.
  Full-corpus identity resolution remains open (`STRUCT-11`).
- Structural lane-local result envelope: implemented and fixture-covered;
  scores remain diagnostic-only and `fusionReady=false` (`STRUCT-12`).
- SearchRuntime bridge: implemented as a DI adapter over the existing `ast`
  logical lane; exact identities only, deterministic deduplication, and no
  second fusion owner. Focused integration tests remain to be run (`STRUCT-13`).
- Structural hit coordinates now carry nullable `astGraphRevision` and
  `compilerSemanticGraphRevision`, plus `patternId`, `patternRevision`, and
  `scoreClass`; missing graph coordinates remain non-promotable rather than
  being substituted with a tree-node or relationship revision.
- Feature-gated live provider now exists with an explicit `sourceRefs` allowlist,
  current source loader, existing 8095 client, exact identity bridge, and
  existing SearchRuntime `ast` lane projection. Default production composition
  remains unchanged until a caller supplies a current candidate map (`STRUCT-13`).
- `StructuralProviderV1` contract and `legacy | shadow | structural` mode
  resolver are now defined with bounded budgets and a non-authoritative receipt;
  default mode remains `legacy` until shadow parity is proven.
- Shadow parity receipt is implemented: legacy remains the sole RRF contributor;
  structural-only, legacy-only, overlap, stale, ambiguous, and unresolved counts
  are recorded deterministically (`STRUCT-13D`).
- `STRUCT-13E` coverage audit is implemented and read-only: the current 15-source
  CandidateOrdinal cohort has 15 packet rows but 0 legacy `function_symbol` rows;
  legacy structural coverage reconciliation is required before `STRUCT-14`.
- Structural projection planning is now available as a read-only 15-source plan;
  code-capable sources produced 16 observations, while 8 non-code/document sources
  were explicitly reported as unsupported. No legacy packet rows were populated.
- Added an additive idempotency contract for future structural projection rows:
  nullable `projection_key` plus a partial unique index. The migration is not applied;
  existing structural facts remain untouched until the normal migration process runs.
- Added and tested `GraphNodeKeyV1`: canonical symbol/packet/chunk identities are
  preferred, exact source occurrences are projection-only fallbacks, and `treeNodeId`
  is not an identity source.
- Added a thin graph algorithm registry that delegates PageRank, Katz, K-truss,
  cuVS, cuML, and related execution to library backends; Atlas retains policy,
  identity, revisions, and receipts rather than reimplementing algorithms.
- Added revision-qualified `GraphAlgorithmExecutionReceiptV1` binding the selected
  policy decision to graph/workspace/ordinal checksums and library revision; focused
  receipt tests pass and the receipt remains non-executing/non-authoritative.
- Graph expansion now attaches that receipt when callers provide complete graph,
  workspace, ordinal-map, and library revision coordinates; incomplete requests
  remain backward-compatible but produce no falsely qualified receipt.
- Added `GraphOrdinalMapV1` with deterministic graph-node sorting, dense executor
  ordinals, revision binding, checksum, duplicate rejection, and reverse lookup;
  it remains distinct from CandidateOrdinal and upstream/tree node IDs.
- Added `GraphOrdinalEdgeCompilerV1` so NetworkX/cuGraph can consume the same
  identity-keyed topology; unknown nodes, disallowed self-loops, and invalid
  weights fail closed. Focused ordinal/edge tests pass.
- Added `GraphOrdinalParityInputV1` to package one revision-bound ordinal map and
  compiled edge list for independent CPU/GPU execution; focused parity-input tests
  pass and the artifact remains non-authoritative/non-persistent.
- Live `:8095 /ast/chunk` -> observation-query proof runner: available;
  execute `scripts/atlas/prove-structural-query-live-v1.mjs` to establish the
  live receipt. This remains non-authoritative until `STRUCT-11` identity
  resolution succeeds.
- Go `LaneAST`: declared, but currently unsupported by the live lane service.
- Structural sparse representation: `OPEN`.
- CandidateOrdinal bridge and RRF integration: `OPEN`.
- ColBERT/late interaction, TurboVec, AVX2, simdjson, PyTorch/logistic
  classification, Arrow/mmap, ACP/A2A, and Mastra remain downstream or optional
  lanes and must not block structural query-plan acceptance.

## Re-verification pass (2026-09-05, read-only) — orphaned "temporal" sub-thread found

The "Classification backlog"/"Current lane state"/"Structural CST/AST retrieval lane" sections
above are self-consistent and show no drift from re-checking a sample of their claims. **A separate
finding, not previously flagged anywhere in this file**: this change's own directory contains 11
`temporal-*.md` companion documents (`temporal-action-ledger.md`,
`temporal-action-alternative-execution-addendum.md`, `temporal-action-recommendation-addendum.md`,
`temporal-dag-persistence-negative-control.md`, `temporal-dag-proof-harness.md`,
`temporal-live-postgres-alternative-loop-proof.md`, `temporal-post-dispatch-proof-addendum.md`,
`temporal-post-dispatch-recorder-addendum.md`, `temporal-recommendation-history-addendum.md`,
`temporal-recommendation-outcome-addendum.md`) covering a "Temporal Action Ledger / DRY Agent
Runtime" workstream — durable procedural execution history, LangGraph DAG proof harness,
alternative-action-selection and recommendation-outcome receipts. **None of these 11 files are
referenced anywhere in this `tasks.md` or in `proposal.md`** (`rg "temporal"` against both returns
only one unrelated hit — `MEM-05`'s passing mention of "temporal semantic relationships", a
different concept). This is thematically adjacent to but distinct from this change's actual scope
(transport/memory/structural boundaries) and appears to be orphaned rather than intentionally
scoped here — flagged per this repo's "record what you found, even when you don't fix it" rule
(CLAUDE.md's Duplication Prevention §6), not resolved.

**Self-reported status ladder across the 11 files** (by file mtime, oldest first — all dated
2026-08-21 except the last, 2026-08-31):
`temporal-action-ledger.md` / `-action-alternative-execution-addendum.md` /
`-action-recommendation-addendum.md` / `-post-dispatch-recorder-addendum.md` /
`-recommendation-history-addendum.md` → `IMPLEMENTED_UNPROVEN`;
`-dag-persistence-negative-control.md` / `-dag-proof-harness.md` /
`-live-postgres-alternative-loop-proof.md` → `WRITTEN_UNPROVEN`;
`-post-dispatch-proof-addendum.md` → `PARTIAL_PROVEN` (11/11 gates, 2 real bugs found+fixed along
the way); **most current**, `-recommendation-outcome-addendum.md` (mtime 2026-08-31, 10 days after
the others) → `PARTIAL_PROVEN` (12/12 gates verified live, with 2 disclosed remaining caveats:
`DAG-02`'s "selected edge reaches terminal failure" clause, and a shared "K1-seeded not forced live"
caveat). Not independently re-verified against live code/DB in this pass — only the files' own
self-reported status headers were read; a future session picking this up should decide whether to
(a) cross-link these into this file's own task list, (b) split them into their own OpenSpec change
given they're a distinct workstream, or (c) confirm they're already superseded/subsumed elsewhere
before doing either.

## TEMPORAL-CANONICAL-SUPERSESSION-01 (2026-09-09)

- [x] Contract seam added in `packages/parent-atlas/src/core/temporal-supersession-fabric-v1.ts`.
  It separates logical artifact identity from version identity, validates lifecycle states and
  supersession relations, and computes a deterministic current-owner decision.
- [x] Fail-closed fixture proves one active version yields `PROVEN_CURRENT_OWNER` and two active
  versions yield `AMBIGUOUS_CURRENT_OWNER`.
- [ ] Git CRUD ingestion, append-only cross-domain event projection, agent-action linkage,
  temporal query intent, prefill masks, cache invalidation, tournament winner lifecycle, and live
  Postgres readback remain open. `workspaceRevision` is intentionally not synthesized here.

Evidence: `packages/parent-atlas/test/temporal-supersession-fabric-v1.test.ts`.
This is contract/fixture proof only; no canonical lifecycle rows were written.

### TEMPORAL-SCHEMA-SURFACES-AUDIT-01 (2026-09-09)

- [x] Added `scripts/atlas/audit-temporal-schema-surfaces-v1.mjs` and
  `npm run atlas:temporal:schema:audit`.
- [x] Read-only live inventory found all six required tables present and all
  requested indexes present.
- [x] Null workspace revisions are explicitly accepted by this audit while
  snapshot/tournament admission remains unresolved.
- [x] Corrected the audit against the live schema: `semantic_lifecycle_events`
  uses `previous_state` and `new_state`, not a generic `lifecycle` column.
  Recommendation status must not be silently substituted for those states.

Evidence: `docs/reports/temporal-schema-surfaces-v1.json`.

### TEMPORAL-CURRENT-OWNER-PROJECTION-01 (2026-09-09)

- [x] Added the read-only event-to-current-owner projection audit over the
  existing `semantic_lifecycle_events` table.
- [x] The projection reports latest lifecycle, event count, active-event count,
  latest event identity, revision binding, and ambiguity without writing a
  materialized table.
- [x] Live read-only result: `CURRENT_OWNER_NOT_PROVEN_NO_EVENTS`; the table is
  reachable but contains 0 lifecycle events, so no current owner can be claimed.
- [ ] This does not yet establish canonical supersession authority: event
  provenance, explicit replacement targets, agent-action linkage, and current
  workspace revision remain incomplete.

Evidence: `docs/reports/temporal-current-owner-projection-v1.json`.

Recheck (2026-09-09): `npm run atlas:promotion:gates`,
`npm run atlas:temporal:schema:audit`, and
`npm run atlas:temporal:current-owner:audit` remain read-only. The six temporal
tables and required columns are present (`6/6`, zero missing), while the live
ledger still has `0` events and `0` entities. Consolidated promotion remains
`BLOCKED` at `CURRENT-SOURCE-TERMINAL-EXECUTION-01` with
`WORKSPACE_REVISION_UNBOUND_UNTIL_TOURNAMENT`; no authority or writes claimed.

### TEMPORAL-EVENT-CANDIDATE-COMPILER-01 (2026-09-09)

- [x] Added a read-only bounded compiler from current `atlas_packets` revision
  rows to deterministic `OBSERVED` event candidates.
- [x] Candidate output preserves nullable workspace revisions and emits no
  supersession claims; current rows alone cannot prove predecessor/replacement
  history.
- [ ] Do not append candidates yet. Historical snapshot pairing, source CRUD
  deltas, agent-action linkage, and reviewed authority evidence remain required.

Evidence: `docs/reports/temporal-event-candidates-v1.json`.

### TEMP-IDENTITY-CARDINALITY-01 (2026-09-09)

- [x] Added `scripts/atlas/audit-temporal-logical-identity-v1.mjs` and
  `npm run atlas:temporal:identity:audit`.
- [x] Live read-only result: 61,718 observations, 61,718 proposed logical
  packet IDs, 61,718 version IDs, 0 logical IDs with multiple versions, and
  exactly 1 visible history frame.
- [x] Bootstrap event semantics now use `BASELINE_OBSERVED`; an initial
  observation is not treated as a historically proven `CREATED` event.
- [ ] Supersession remains uncomputable until two ordered workspace/source
  snapshots are available. No lifecycle event was appended.

Evidence: `docs/reports/temporal-logical-identity-v1.json`.

### TEMP-PREDECESSOR-COMPILER-01 (2026-09-09)

- [x] Added explicit base/target `WorkspaceSnapshotV1` comparison with
  `CREATED`, `UPDATED`, `UNCHANGED`, and `TOMBSTONED` candidates.
- [x] Both manifests are independently readback-validated before comparison;
  blocked input produces no candidates and no authority claim.
- [ ] Two valid ordered snapshots are not yet available. The compiler emits no
  lifecycle events, supersession authority, or database writes.

Evidence: `docs/reports/temporal-predecessor-candidates-v1.json`.
Verification against the two existing checksum-addressed artifacts returned
`BLOCKED_SNAPSHOT_READBACK` for both inputs, with zero candidates and zero
supersession claims. The compiler therefore demonstrated fail-closed behavior;
the artifacts are historical observations, not valid ordered frames.

### TEMP-EVENT-BOOTSTRAP-PLAN-01 (2026-09-09)

- [x] Added a read-only bootstrap plan that classifies the current one-frame
  population as `BASELINE_OBSERVED` only.
- [x] Live plan contains 61,718 observations, 0 historical creation claims,
  0 supersession claims, and 0 appendable events.
- [ ] Event append remains unauthorized until a second valid ordered snapshot
  and predecessor evidence exist.

Evidence: `docs/reports/temporal-bootstrap-plan-v1.json`.
- [ ] CANONICAL-IDENTITY-V1 POINTER (2026-09-21): canonical object identity (symbol/file/chunk discriminants, mandatory workspaceRevision + sourceRevision, no 'unknown'/latest-row inference, representation/execution/transport ids and CandidateOrdinal are NOT canonical identity) is owned by `CANONICAL-IDENTITY-V1-SPEC-01` in `openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/tasks.md`. This change SHALL reference that contract and not define its own identity rules; it may add representation-, execution-, feature-, cache-, transport- or projection-specific identities only. Pointer only; no scope change here. Spec status: SPEC_DRAFT (not signed off).
