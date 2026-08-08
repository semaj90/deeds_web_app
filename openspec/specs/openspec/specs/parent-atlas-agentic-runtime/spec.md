# Parent Atlas Agentic Runtime — Delta Requirements

## Requirement: Canonical authority

The system SHALL treat Parent Atlas/Postgres records as canonical for feature, task, execution and evidence identity.

Redis, Qdrant, Neo4j, Paperclip, Mastra and model caches SHALL be rebuildable projections or execution services.

### Scenario: Projection disagreement

Given a Kanban, graph or cache record disagrees with the canonical Atlas record,
when the system reconciles state,
then canonical Atlas state SHALL win and the projection SHALL be repaired or marked stale.

---

## Requirement: Evidence-grounded repair

Every autonomous code mutation SHALL be associated with an evidence manifest.

The manifest SHALL contain enough information to explain why the mutation target was selected.

### Scenario: Agent proposes a patch

Given a diagnostic,
when an agent proposes a mutation,
then the run SHALL record relevant sourceRefs, symbols, retrieval scores, graph evidence and the selected target before the mutation is accepted.

---

## Requirement: Minimal mutation

The executor SHOULD mutate the smallest correct program unit.

### Scenario: Function-local defect

Given the evidence resolves the defect to one function,
when the repair agent edits the repository,
then it SHOULD patch that function rather than rewrite the complete file.

---

## Requirement: Validation-gated completion

Generation success SHALL NOT equal task success.

### Scenario: Generated patch

Given a patch has been applied,
when no relevant validation has passed,
then the task SHALL NOT enter DONE.

---

## Requirement: Layered retrieval

Retrieval SHALL combine exact, lexical, dense and graph evidence according to query requirements rather than treating one retrieval mechanism as universally authoritative.

### Scenario: Compiler diagnostic

Given a compiler error contains a precise source position,
when retrieval begins,
then direct file/symbol/AST evidence SHALL precede broad dense retrieval.

---

## Requirement: KAG/DAG separation

The system SHALL distinguish dependency topology from knowledge/evidence relationships.

DAG-style relationships SHOULD represent dependency or execution ordering.

KAG-style relationships SHOULD represent facts, claims, evidence, concepts and authority.

Hyperedges MAY represent genuinely n-ary relationships.

---

## Requirement: Context is compiled

The model context SHALL be a bounded projection of available evidence.

Redis/Bitfrost cache presence SHALL NOT imply inclusion in the prompt.

### Scenario: Warm feature bucket

Given one feature bucket contains 100 candidate packets,
when only 15 packets fit the relevance and token policy,
then only those selected packets SHALL enter active model context.

---

## Requirement: KV cache is ephemeral

Native/TurboQuant KV cache SHALL be treated as model execution optimization rather than durable knowledge storage.

Loss of KV cache SHALL NOT lose canonical task memory.

---

## Requirement: Query-aware warming

The system SHOULD warm likely-needed evidence when user or agent activity predicts future retrieval.

Candidate triggers include editor file activation, symbol selection, active diagnostics, current feature task and high-confidence graph neighbors.

---

## Requirement: Batch inference

Independent inference operations MAY be submitted as batches when doing so improves throughput.

Dependent reasoning operations SHALL preserve their dependency ordering.

---

## Requirement: ACP boundary

Agent Client Protocol MAY expose the Atlas coding agent to compatible IDE/client environments.

ACP transport SHALL NOT change canonical Atlas semantics.

---

## Requirement: A2A boundary

A2A SHALL be the preferred interoperability protocol for communication between independently deployable agents when such interoperability is required.

Local function calls SHALL NOT be converted into A2A calls without a deployment/isolation justification.

---

## Requirement: MCP boundary

MCP SHALL remain a tool/resource boundary for agents.

Tool calls that can mutate state SHALL be auditable and policy controlled.

---

## Requirement: Internal RPC

tRPC MAY provide strongly typed communication inside the TypeScript application.

tRPC SHALL NOT be considered a replacement for ACP, MCP or A2A.

---

## Requirement: Replaceable orchestration

An orchestration framework such as Mastra MAY manage workflows, retries, memory abstractions or coding harnesses.

The canonical workflow contracts SHALL remain framework-neutral.

### Scenario: Mastra removal

Given Mastra is removed,
when the existing Atlas executor invokes the same work contract,
then canonical task/evidence semantics SHALL remain unchanged.

---

## Requirement: Optional organizational UI

Paperclip MAY be evaluated as an agent/company/task/operator interface.

Paperclip SHALL NOT become mandatory infrastructure for Parent Atlas execution.

---

## Requirement: Recursive decomposition

Large tasks MAY be decomposed recursively.

Each subproblem SHALL have:

* parent run ID
* bounded context
* explicit objective
* typed result
* evidence references
* budget

Recursive reasoning SHALL terminate according to configured depth, token, time or attempt limits.

---

## Requirement: Offline learning

QLoRA and other parameter updates SHALL occur outside the interactive repair path.

Training artifacts SHALL be versioned and evaluated against held-out tasks before model promotion.

---

## Requirement: Replay

A completed repair run SHALL be replayable from persisted manifests sufficiently to reproduce:

* selected evidence;
* model/runtime configuration;
* tool calls;
* mutation;
* validation commands;
* outcome.

Replay SHALL NOT depend on an old KV cache being present.

---

## Requirement: Kanban evidence

The Kanban board SHALL expose projected execution status.

A task SHALL enter DONE only when its configured acceptance evidence has been satisfied.

---

## Requirement: Offline pruning

Directory-role analysis, redundant-feature detection, graph rebuilding, training and heavy GPU analysis SHALL remain offline operations.

They SHALL NOT become mandatory `dev:gpu` startup dependencies.
