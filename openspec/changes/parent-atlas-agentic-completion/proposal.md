# Parent Atlas Agentic Completion & Error-Fixing Runtime

## Status

Proposed

## Why

Parent Atlas currently contains the pieces needed for a high-value local coding and research system:

* canonical feature/task identity
* sourceRef-backed evidence
* Postgres canonical state
* dense and sparse retrieval
* KAG / DAG / Neo4j graph projections
* Redis / Bitfrost hot-cache concepts
* local `llama-server.exe`
* NLP / AST / tree-sitter / ast-grep analysis
* OpenCode / MCP execution
* Kanban task projection
* GPU compute lanes
* offline model-training and evaluation lanes

The missing piece is a canonical coordination contract connecting these systems without making experimental frameworks, cache implementations, or graph materializations authoritative.

This change defines Parent Atlas as the control and evidence plane for agentic code repair, feature completion, retrieval, context assembly, execution, evaluation, and learning.

## Goals

1. Make `feature_id + source_ref` the common identity/provenance spine across Atlas, Kanban, retrieval, agent execution, tests, and learning records.

2. Build a deterministic agentic error-fixing loop:

   Query / error
   → classify
   → retrieve
   → graph-expand
   → construct context
   → plan
   → patch
   → test
   → evaluate
   → retry / accept
   → record evidence

3. Separate protocol responsibilities:

   * MCP: agent → tools/resources
   * ACP Agent Client Protocol: editor/client → coding agent
   * A2A: independent agent → independent agent
   * tRPC: typed internal application RPC
   * event/outbox transport: asynchronous state changes
   * Parent Atlas contracts: canonical task/evidence state

4. Keep orchestration frameworks replaceable.

5. Make llama-server context use demand-driven rather than preloading the complete repository.

6. Add Bitfrost / Redis warming based on active task, sourceRefs, graph neighborhood, and recent query patterns.

7. Preserve QLoRA, dataset generation, reinforcement/evaluation and graph rebuilds as offline lanes rather than startup dependencies.

8. Provide a Kanban representation of all work with machine-checkable completion evidence.

## Non-Goals

This change SHALL NOT:

* replace Postgres with Redis, Neo4j, Qdrant, Mastra, Paperclip, or an agent framework;
* treat KV cache as durable memory;
* attempt to place the entire repository into one model context;
* use QLoRA as live per-query memory;
* require Neo4j, GPU graph analysis, model training, or pruning to start normal development;
* make Paperclip or Mastra the canonical task database;
* introduce IBM ACP as a second agent-to-agent protocol now that that protocol has converged into A2A.

## Architecture

### 1. Canonical control plane

Postgres stores:

* feature identity
* task identity
* sourceRefs
* execution runs
* attempts
* mutations
* test/eval results
* retrieval manifests
* context manifests
* artifact lineage
* model/config identity

Canonical relationships:

`feature_id`
→ `kanban_task_id`
→ `agent_run_id`
→ `attempt_id`
→ `mutation_id`
→ `validation_id`

Every derived system MUST retain the canonical IDs.

### 2. Query intake plane

Inputs may originate from:

* VS Code
* OpenCode
* ACP-compatible IDE/client
* web UI
* TRACE MCP
* CLI
* Kanban task
* test/compile failure
* scheduled/offline analysis

All inputs normalize into an `AtlasWorkRequest`.

Required fields:

* request_id
* workspace_id
* intent
* query/error text
* optional feature_id
* optional sourceRefs
* repository revision
* requested capabilities
* execution policy

### 3. Retrieval cascade

Retrieval SHALL be staged rather than indiscriminate.

Stage A — exact/local

* sourceRef
* file path
* symbol
* diagnostic location
* AST owner
* imports/exports
* tests
* git/revision metadata

Stage B — lexical

* identifiers
* BM25/BM42
* error strings
* filenames
* APIs
* package names

Stage C — dense

* semantic embedding retrieval
* relevant code chunks
* prior solutions
* documentation
* packet summaries

Stage D — graph

* DAG dependency expansion
* KAG evidence expansion
* call/import graph
* feature implementation graph
* Neo4j projected neighborhood
* optional hypergraph relationships

Stage E — rerank

Candidate evidence is reranked and assigned:

* relevance
* authority
* freshness
* source quality
* graph distance
* implementation confidence
* token cost

Retrieval MUST fail open when a reranker fails unless policy explicitly rejects a candidate.

### 4. Context compiler

The context compiler converts retrieval evidence into bounded context packets.

Context SHALL be divided into lanes:

#### Working context

Directly visible model tokens:

* current task
* active diagnostics
* relevant code
* patch constraints
* test command
* recent attempt feedback

#### ACE packets

Compact reusable task knowledge:

* symbol cards
* feature cards
* dependency cards
* failure cards
* solution cards

#### Bitfrost buckets

Prefetched groups keyed by:

* feature_id
* sourceRef neighborhood
* directory role
* symbol cluster
* test cluster
* error fingerprint
* graph community

#### Native model cache

`llama-server.exe` KV/prompt cache remains ephemeral model execution state.

It MUST NOT be treated as canonical memory.

### 5. Cache warming

Cache warming SHALL occur in response to likely future demand.

Warm triggers may include:

* user opens file in VS Code;
* user selects symbol;
* query mentions feature_id;
* active diagnostic appears;
* Kanban task is moved to active;
* agent chooses a file for modification;
* graph traversal identifies high-probability neighbors.

Warm:

* sourceRef cards
* AST summaries
* dependency neighborhood
* recent tests
* top dense neighbors
* high-authority graph nodes

Do NOT automatically inject all warmed material into the model context.

Warm cache is a candidate pool.

The context compiler chooses what becomes tokens.

### 6. Local inference

`llama-server.exe` is the synthesis/reasoning execution lane.

Runtime requirements:

* single owner per configured port;
* model-aware reuse;
* explicit context budget;
* explicit cache backend;
* telemetry for prompt tokens, reused cache, generated tokens, latency and failure;
* batch execution available for independent analysis tasks.

Batch mode SHOULD be used for:

* file summaries
* feature classification
* candidate scoring
* test-failure explanation
* evidence validation

Batch mode SHOULD NOT be used where one operation depends on the generated result of the previous operation.

### 7. Agentic repair loop

Each repair attempt SHALL execute:

1. Observe
2. Normalize diagnostic
3. Resolve feature/source identity
4. Retrieve evidence
5. Expand dependency/graph neighborhood
6. Compile context
7. Produce ranked hypotheses
8. Select mutation target
9. Generate minimal patch
10. Apply patch
11. Run targeted validation
12. Evaluate result
13. Retry with new evidence when necessary
14. Run broader regression validation
15. Persist result and evidence
16. Update Kanban projection

Mutation priority:

symbol-level patch
→ function-level patch
→ file-level patch
→ structural refactor

Whole-file rewriting SHOULD be avoided when a bounded mutation is possible.

### 8. RLM lane

RLM-style recursive reasoning is an orchestration strategy, not a replacement for retrieval.

Use it when:

* a task spans many files;
* evidence cannot fit simultaneously in context;
* multiple hypotheses need independent exploration;
* intermediate summaries can reduce context cost.

Each recursive call MUST emit a typed result that can be merged into the parent task.

### 9. Learning lane

Production execution records SHALL generate optional training/evaluation data.

Potential datasets:

* diagnostic → relevant files
* diagnostic → root cause
* evidence set → winning patch
* failed patch → corrected patch
* feature → implementation evidence
* retrieval candidates → relevance labels
* graph neighborhood → useful node labels

QLoRA SHALL remain offline.

It MUST NOT be used as a substitute for live task memory or context swapping.

Promotion requires evaluation against a held-out benchmark.

### 10. Protocol boundaries

#### ACP

Use Agent Client Protocol for:

IDE/client
↔
coding agent/harness

This enables VS Code or other compatible clients to use the same Atlas-backed coding agent.

#### MCP

Use MCP for:

agent
↔
TRACE/search/AST/database/test/file tools

#### A2A

Use A2A only when independently deployable agents need delegation or collaboration.

Examples:

Atlas supervisor
→ research agent

Atlas supervisor
→ code repair agent

Atlas supervisor
→ GPU analysis agent

Local subroutines do not require A2A.

#### tRPC

Use tRPC for strongly typed internal TypeScript service calls where both producer and consumer belong to the application.

Do not expose tRPC as the universal agent protocol.

### 11. Mastra evaluation

Mastra MAY provide:

* supervisor workflows
* durable execution
* retries
* agent/tool definitions
* coding harness delegation
* memory abstractions
* observability

Mastra MUST consume Atlas contracts.

Atlas MUST remain executable without Mastra.

A proof-of-concept SHALL compare Mastra orchestration with the current custom orchestrator before adoption.

### 12. Paperclip evaluation

Paperclip SHALL be evaluated only as an optional:

* agent organization view
* work delegation UI
* operator board
* agent lifecycle manager

Paperclip SHALL NOT own:

* canonical feature state
* evidence lineage
* retrieval state
* sourceRef identity
* execution truth

Any integration must map Paperclip agents/tasks back to Atlas IDs.

## Completion Criteria

The change is complete when one real repository error can be processed end-to-end from diagnostic to verified repair while recording:

* canonical feature/task identity
* exact source evidence
* retrieval candidates
* graph expansion
* context manifest
* model/runtime identity
* patch
* tests
* retry history
* final acceptance
* Kanban state transition

and the complete run can be replayed from persisted evidence without relying on hidden model memory.
