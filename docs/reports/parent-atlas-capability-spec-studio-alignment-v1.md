# Parent Atlas capability → spec → task → runtime → Studio alignment v1

Status: **READ-ONLY OWNERSHIP / PRODUCT ALIGNMENT**  
Date: 2026-09-05  
Canonical-authority changes: **none**  
New OpenSpec changes created: **0**

This report aligns the already-built Parent Atlas capability planes with the repo's existing
OpenSpec ledgers, task/workboard projections, agentic workflow contracts, and Parent Atlas Studio.
It is deliberately **not** another implementation owner.

The core rule is:

```text
SPEC INTENT                IMPLEMENTATION AUTHORITY          RUNTIME TRUTH
OpenSpec change            owning tasks.md                   WorkflowActionEventV1
proposal/spec/design  ->   dependency-ordered checkbox  ->  receipts/evidence/current run
                                |                                  |
                                v                                  v
                        OPENSPEC-WORKBOARD                    workflow Kanban
                        planning projection                  runtime projection
                                \                                  /
                                 \                                /
                                  ------ Parent Atlas Studio -----
                                         projection only
```

## 1. Spec-system decision

Parent Atlas should keep **OpenSpec as the canonical change/spec/task authority**.

OpenSpec's current default spec-driven workflow is already the best fit for this repository:

```text
proposal.md
   ↓
specs/**/spec.md + design.md
   ↓
tasks.md
   ↓
apply
   ↓
archive / durable history
```

`tasks.md` is the implementation ledger. The generated `docs/OPENSPEC-WORKBOARD.md` remains a
navigation/progress projection and MUST NOT become a second task authority.

### What to borrow from GitHub Spec Kit without adopting `.specify/` as authority

Spec Kit's useful quality gates map cleanly onto the existing OpenSpec workflow:

| Spec Kit mechanism | Parent Atlas adaptation |
|---|---|
| constitution | existing CLAUDE/AGENTS/OpenSpec governance invariants |
| clarify | pre-design ambiguity/owner check |
| checklist | acceptance/proof checklist adjacent to owning OpenSpec |
| analyze | cross-artifact owner/revision/contract consistency audit |
| converge | read-only implementation-vs-spec audit that appends/suggests remaining tasks in the **existing owner** |
| taskstoissues | optional external projection only; GitHub issue is not task authority |
| bug assess/fix/validate | align with Phase 78 proposal → Phase 79 bounded repair → verification receipt |

Do **not** create `.specify/specs/*` as a parallel canonical product backlog. If Spec Kit tooling is
used, it should consume/export OpenSpec artifacts as a quality adapter.

### What to borrow from Kiro without adopting `.kiro/specs/` as authority

Kiro's useful ideas are:

- requirements-first or design-first as a **planning mode**, not a second ledger;
- EARS-style acceptance requirements (`WHEN ... THE SYSTEM SHALL ...`) for testable behaviors;
- per-task verification;
- PreTaskExec / PostTaskExec / PreToolUse hooks as inspiration for fail-closed execution gates;
- optional property-based tests for strong invariants.

Kiro `AGENTS.md` files are always-included steering and nested files are automatically discovered.
That is exactly why Parent Atlas must keep AGENTS files small and retrieve repo knowledge on demand;
never put generated full-repository indexes back into nested AGENTS files.

### Sass versus SaaS

If "sass" meant literal **Sass/SCSS**, it is a UI implementation detail only: variables, nesting,
mixins and functions can support Parent Atlas Studio styling, but Sass owns no task, auth, workflow,
or Atlas state.

If "SaaS" was intended, the product/control-plane features belong in Studio as projections over
existing app owners: users, roles/permissions, integrations, approvals, runtime/datastore health,
audit, resource budgets, settings, and optionally workspace/tenancy/billing if the product actually
needs them. Do not create `ParentAtlasUser` or `ParentAtlasAuth` as parallel identities.

## 2. Task / Kanban / runtime semantics

Three different things must stay distinct:

```text
A. OpenSpec task
   planned implementation work
   canonical owner = owning tasks.md

B. Feature Kanban card
   canonical feature/evidence/state projection
   owner = FeatureV1 / FeatureEvidenceV1 / FeatureStateV1 materializer

C. Workflow Kanban card
   current execution projection
   owner = WorkflowActionEventV1 → WorkflowTaskBoardCardV1
```

A runtime card reaching DONE does **not** automatically prove an OpenSpec task or canonical feature
complete. The owning task can be checked only after its stated evidence/proof gate is satisfied.

Recommended transition:

```text
OpenSpec unchecked task
      ↓ selected/claimed
WorkflowActionEventV1(kind=scheduled)
      ↓
operational workflow card
      ↓
RUNNING / BLOCKED / VERIFY / DONE / FAILED
      ↓
verification/evidence receipt
      ↓
owner updates tasks.md checkbox
      ↓
OpenSpec workboard regenerated
```

### Board vocabulary reconciliation

The Studio design note proposes human-friendly columns:

```text
TRIAGE | TODO | READY | RUNNING | BLOCKED | DONE
```

The actual `WorkflowTaskBoardCardV1` contract already uses:

```text
QUEUED | ACTIVE | BLOCKED | VERIFY | DONE | FAILED | CANCELED
```

Do **not** add a competing state machine. UI aliases should be derived:

| UI concept | Existing runtime state |
|---|---|
| TRIAGE / TODO | planning metadata outside an active runtime claim |
| READY | `QUEUED` + dependency-ready predicate |
| RUNNING | `ACTIVE` |
| BLOCKED | `BLOCKED` |
| VERIFY | `VERIFY` |
| DONE | `DONE` |
| FAILED | `FAILED` |
| CANCELED | `CANCELED` |

Dependency readiness is computed; drag-and-drop must never bypass unmet dependencies without an
explicit governed override event.

## 3. Parent Atlas Studio information architecture

The existing design note is directionally correct. The implementation should converge to **one**
permanent route after reconciling the existing top-level Atlas Studio and admin/unified-indexing
surfaces.

Recommended product navigation:

```text
OVERVIEW
SPECS & TASKS
KANBAN
DAG / RUNS
AGENTIC REPAIR
CODEBASE INDEX
RETRIEVAL
GRAPH & ONTOLOGY
MEMORY / RESIDENCY
MODELS
DATASTORES / RUNTIMES
AGENTS
INTEGRATIONS
APPROVALS
AUTH / USERS
EVIDENCE / ARTIFACTS
EVENTS / AUDIT
SETTINGS
```

The UI is a projection. It must never silently become a new storage owner.

## 4. Capability owner matrix

| Capability | Canonical/current owner | Runtime / projection role | Studio surface | Next convergence work |
|---|---|---|---|---|
| Change/spec intent | OpenSpec proposal/spec/design | planning | Specs & Tasks | keep one owner per capability |
| implementation checklist | owning OpenSpec `tasks.md` | planning | Specs & Tasks | project, never copy into UI DB |
| portfolio priority | `docs/OPENSPEC-WORKBOARD.md` generator | noncanonical projection | Overview / Specs | receipt-backed freshness |
| workflow/action identity | `WorkflowActionEventV1` | canonical runtime identity | DAG / Runs | live persistence/outbox adoption |
| operational task cards | `WorkflowTaskBoardCardV1` | projection | Kanban | AW-8 live wiring |
| feature Kanban | FeatureV1 / FeatureEvidenceV1 / FeatureStateV1 | canonical feature state | Kanban / Features | keep separate from runtime cards |
| Parent Atlas Studio projection | `ParentAtlasStudioWorkflowProjectionV1` | projection | all Studio | AW-8/AW-9 |
| auth/users/permissions | existing application auth + tool authorization | access control | Auth / Users | route-by-route intended access audit; no blanket auth patch |
| bounded mutation approval | existing proposal/authorization/receipt contracts | governance | Approvals | expose exact checksums/revisions |
| Postgres | canonical evidence/workflow/lineage truth | durable store | Datastores | health + migration ownership |
| Qdrant | semantic projection/executor | derived | Retrieval / Datastores | RF7 + current parity |
| Valkey / BitFrost | exact cache + hot-vector/residency projection | derived | Memory / Datastores | live HOT/WARM/COLD policy |
| Neo4j | graph projection | derived | Graph / Datastores | current tuple/snapshot parity |
| RabbitMQ/outbox | durable task/event transport | transport | Integrations | outbox-only authority proof |
| MCP | agent↔tool/resource boundary | transport | Integrations | capability admission |
| ACP | editor/coding-agent/legacy ingress compatibility | transport | Integrations | keep noncanonical |
| A2A | independent-agent interoperability | projection/transport | Agents / Integrations | live wiring only after validation |
| Graphify | structural/graph/index workflow | producer/workflow | Codebase Index | incremental current snapshot fanout |
| Tree-sitter / ast-grep | deterministic structural evidence | evidence producer | Codebase Index | exact revision/byte-span cards |
| CST / LSP / RPC observations | enrichment/evidence | derived observation | Codebase Index | bind to exact source/symbol revisions |
| Go Retrieval | retrieval executor/service | executor | Retrieval | preserve canonical identity + revisions |
| SearchRuntime | query-lane normalization/fusion production spine | runtime owner candidate | Retrieval | RF7 owner migration |
| semantic_768 | EmbeddingGemma representation | canonical semantic retrieval representation | Retrieval / Models | current full-workspace parity |
| TurboVec / cuVS / CAGRA | semantic executors/challengers | execution | GPU / Retrieval | one semantic vote only |
| exact cuVS | exact semantic oracle | proof executor | GPU / Retrieval | prerequisite for ANN promotion |
| CAGRA | ANN challenger | derived executor | GPU | never correctness oracle |
| latent_256 | learned AE routing representation | derived physical representation | Memory / GPU | topology admission/currentness |
| latent_128 / latent_64 | prefix slice + L2-normalized derived views per latest live proof | derived routing views | Memory / GPU | reconcile stale docs/comments; parity proof |
| KMeans / SOM / Topology4 | routing/topology features | derived challenger | Memory / Graph | never identity or new RRF lane |
| ACE | context/residency policy | control | Memory / Context | feature-source live owner |
| ContextManifestV2 | exact selected evidence/context identity | control artifact | Context / Agent | runtime injection + cache identity |
| Ornith-1.5 | synthesis/tool-use model | model runtime | Models / Agentic Repair | prefix-cache telemetry only |
| Phase 78 | Ornith repair proposal producer | noncanonical proposal | Agentic Repair | record cutover under existing repair owner |
| Phase 79 | bounded repair/apply/verify workflow | governed executor | Agentic Repair | live dry-run + authorized canary proof |
| analysis_pass_results | append-only analysis/repair outcome history | durable receipt history | Audit / Repair | revision-qualified writer only |
| KAG / hyperedges | canonical N-ary evidence | Postgres truth | Graph & Ontology | current snapshot materialization |
| OntologyLinkedTuple / `atlas_ontology_tuples` | ontology-kernel / canonical tuple owner | Postgres truth | Graph & Ontology | live census + bounded admission |
| OAK | ontology/task-function adapter/kernel | evidence/reasoning adapter | Graph & Ontology | executor binding; no second graph truth |
| Neo4j GDS | graph analytics | ephemeral derived projection | Graph | PageRank/Leiden/PPR receipts |
| DSPy / GEPA | agent-program evaluation/optimization | benchmark/optimizer | Models / Eval | bounded shadow eval only |
| Ewin Tang-inspired low-rank shortlist | existing STEP-08 challenger lane | heuristic challenger | Eval / Recommendations | benchmark against exact top-K |
| SearXNG | discovery search | external observation | Research | SearchSnapshot + acquisition boundary |
| simdjson | JSONL parser optimization | executor optimization | Runtime telemetry | only after profiler proves bottleneck |

## 5. Graphify + GPU codebase workflow alignment

The repo already defines the correct workflow shape. Preserve it rather than creating a second
"GPU indexer":

```text
CURRENT SOURCE / WORKSPACE SNAPSHOT
        ↓
STRUCTURAL SNAPSHOT
Tree-sitter + ast-grep + exact byte/revision identity
        ↓
SEMANTIC EMBED
EmbeddingGemma semantic_768
        ↓
POSTGRES ADMISSION
        ↓
QDRANT PROJECTION
        ↓
CUVS EXACT ORACLE
        ↓
CAGRA CHALLENGER
        ↓
KMEANS / SOM / GRAPH FEATURES
        ↓
FEATURE ALIGNMENT
same frozen CandidateOrdinal/row checksum
        ↓
RETRIEVAL PARITY
        ↓
ACE / ContextManifest
        ↓
ORNITH / governed agent action
        ↓
receipts
        ↓
KANBAN_REFRESH
        ↓
STUDIO_REFRESH
```

Invariant:

```text
logical lane = semantic
executors = {Qdrant, TurboVec, cuVS, CAGRA, ...}
semantic fusion votes = 1
```

RF7 must remain ahead of any use of clustering/latent features in production ranking.

## 6. Latent/topology lane — expand now, under existing owners

The topology lane is now safe to resume, but not by adding another representation owner.

Target representation family:

```text
semantic_768                         retrieval truth
     ↓
NestedSemanticAutoencoder
     ↓
latent_256                           learned / physical / derived
     ├─ prefix[:128] + L2 normalize → latent_128 derived view
     └─ prefix[:64]  + L2 normalize → latent_64 derived view
              ↓
       KMeans / SOM / Topology4
              ↓
       routing / residency features
```

Latest operator/live-session evidence resolved the earlier `latent_64` ambiguity by direct numeric
comparison: stored `latent_64` matches prefix+renormalize of `latent_256`. The default branch still
contains stale/conflicting comments and historical documents, so **documentation/currentness
reconciliation must precede any new writer/backfill assumption**.

Proposed tasks for the **existing** `parent-atlas-topology-representation-admission` owner:

```text
TOPO-LATENT-RECON-01
Reconcile stale representation docs/comments against the live-derived prefix contract.
No data rewrite.

TOPO-LATENT-PARITY-01
Read-only bounded/full census:
latent_256 present
→ derive 128/64
→ compare any stored/admitted projection
→ emit sourcePopulationChecksum + representationRevision + parity receipt.

TOPO-ROUTING-01
Admit latent_64 KMeans/SOM outputs as CandidateFeatureSnapshot routing fields only.
No canonical identity; no extra semantic RRF vote.

TOPO-RESIDENCY-01
Pass topology/cluster features to ACE residency policy.
The topology lane recommends HOT/WARM/COLD; it never owns cache truth.
```

`latent_128` does not need to be persisted merely to be an addressable derived feature. Persist it
only if a measured executor/cache use case justifies the storage cost and a representation revision
is explicit.

## 7. Ontology / KAG / HyperGraphRAG lane — expand now, under existing owners

The correct authority chain is:

```text
source/schema/runtime/test facts
        ↓
AST/CST/LSP/RPC structural observations
        ↓
concept candidates
        ↓
OAK / taxonomy / mapping evidence
        ↓
OntologyLinkedTupleV1
        ↓
atlas_ontology_tuples       POSTGRES CANONICAL TUPLES
        ↓
Neo4j durable projection
        ↓
GDS in-memory analytical graph
        ↓
PageRank / Leiden / PPR / concept neighborhoods
        ↓
CandidateFeatureSnapshot / ACE
```

Never reverse this chain. A Neo4j/GDS node id, cluster id, ontology label, or model classification
cannot manufacture Atlas identity or rewrite source evidence.

The older persistence receipt reports substantial hyperedge/member population but zero ontology
tuples. That status must be re-censused live before any claim that ontology materialization is now
current.

Proposed tasks for the **existing** `parent-atlas-ontology-kernel` / Feature Intelligence owners:

```text
ONTO-CURRENT-CENSUS-01
Read-only live census:
atlas_hyperedges
atlas_hyperedge_members
atlas_ontology_tuples
source/workspace/graph/ontology revision coverage
ambiguity + unmapped counts

ONTO-TUPLE-ADMISSION-01
Freeze a bounded current source/graph cohort.
Materialize exact OntologyLinkedTupleV1 proposals from deterministic evidence.
No fuzzy identity admission.

ONTO-TUPLE-APPLY-01
Separate explicit proposal → authorization → bounded Postgres apply → fresh readback.
Idempotent replay required.

ONTO-NEO4J-PROJECTION-01
Project only admitted tuple checksum into Neo4j.
Prove node/edge/relation reconstruction parity and current graph revision.

ONTO-GDS-ANALYTICS-01
Run PageRank/Leiden/PPR against the admitted projection and emit derived receipts.
No GDS result is canonical truth.

ONTO-ACE-FEATURE-01
Join concept/taxonomy/community/neighborhood fields by CandidateOrdinal into
CandidateFeatureSnapshotV1.
No additional retrieval vote.
```

OAK remains an adapter/kernel behind this owner. It may validate, map, traverse, or compile task
functions; it must not become a second ontology datastore or graph authority.

## 8. Agentic repair alignment

The repair path should now be recorded as:

```text
error observations
      ↓
Phase 78 Ornith proposal producer
      ↓
error_suggestions (noncanonical queue)
      ↓
Phase 79
exact sourceRevision + SearchRuntime + feature/NES context
      ↓
Ornith bounded exact edits
      ↓
proposal checksum / preimage guard
      ↓
explicit apply authorization
      ↓
git diff --check + svelte-check
      ↓
analysis_pass_results / WorkflowActionEvent evidence
      ↓
OpenSpec task/feature completion only after owning acceptance gate
```

The legacy Enhanced Phase 79 launcher should remain only a compatibility shim to canonical Phase 79.
Do not reintroduce Gemini/Ollama/MiniLM/private-Qdrant/private-Redis ownership in a second repair
runtime.

The existing `parent-atlas-agentic-repair-bundle-integration` change should record this cutover as
owner evidence; do not create `parent-atlas-phase78-v2` or `parent-atlas-phase79-v2` changes merely
for the script names.

## 9. SaaS/admin control-plane alignment

Parent Atlas Studio can expose familiar SaaS operations without inventing new domain identities.

### Auth / users

Use the existing app user/session/role/tool-authorization system.

Studio should show:

```text
users / service actors
roles
resolved tool/capability grants
current sessions/agent identities where already supported
recent authorization denials
mutation approvals
```

The existing tool-authorization audit already documents role-derived grants, exact permission
matching and no-escalation behavior. A Studio page should consume that owner.

### Datastores / runtimes

One runtime registry view should expose:

```text
POSTGRES
QDRANT
VALKEY / BITFROST
NEO4J / GDS
RABBITMQ / OUTBOX
GO RETRIEVAL
MCP
ORNiTH llama-server
EmbeddingGemma
GPU / cuVS / cuGraph / RAPIDS
SearXNG / acquisition services
```

Per-runtime status vocabulary:

```text
CONFIGURED
CONNECTED
HEALTHY
DEGRADED
UNPROVEN
DISABLED
```

`CONFIGURED` or `CONNECTED` must never be rendered as `PROVEN` without a receipt.

### Other normal SaaS/admin surfaces

Add only when backed by existing product truth:

- workspaces/projects/tenancy;
- API/integration configuration;
- budget/resource envelopes;
- audit/events;
- approvals/governance;
- settings/preferences;
- billing/subscription only if Parent Atlas is actually commercialized as a multi-user SaaS.

None of these should become a new retrieval, workflow, identity, or evidence owner.

## 10. Agent-program / recommendation lane

Use existing `parent-atlas-compute-rank-cache-eval-dspy-gepa` for DSPy/GEPA.

```text
RouteTrace + retrieval metrics + tool outcomes + evidence quality + latency + token cost
          ↓
DSPy program
          ↓
GEPA shadow optimizer
          ↓
held-out replay / Pareto candidate selection
          ↓
explicit promotion receipt
```

GEPA may optimize prompts/programs, not:

- canonical identity;
- sourceRevision semantics;
- RRF ownership;
- datastore authorization;
- ontology truth.

Ewin Tang-inspired low-rank recommendation remains **STEP-08 challenger work**. The original result
assumes a data structure supporting length-square / ℓ2-norm sampling and samples from a low-rank
approximation; this is not a drop-in replacement for exact top-K retrieval. Parent Atlas should use
it only if a real low-rank utility/recommendation matrix exists and benchmark it against exact
selection.

Suggested benchmark shape:

```text
CandidateFeatureMatrix / user×concept utility matrix
     ↓
TANG_INSPIRED_LOW_RANK_SHORTLIST
     ↓
exact preserved-lane floors
     ↓
exact cuVS / canonical rank comparison
     ↓
Recall@K / MRR / NDCG / latency / bytes / GPU cost
```

No promotion without held-out lift and identity parity.

## 11. Parser/serialization lane

Keep simdjson as a profiler-driven executor optimization:

```text
JSONL / NDJSON
   ↓
simdjson parse_many-style streaming
   ↓
typed Atlas record
```

It owns parsing performance only. It does not own packet identity, graph identity, revisions, or
storage. Profile Graphify/indexing first; if hashing, database joins, embeddings, or graph work
dominate, simdjson is not the next gate.

Large numeric artifacts remain Arrow IPC/mmap/tensors. JSON/MessagePack describe logical records;
they do not carry bulk 768-dimensional matrices through the task/event control plane.

## 12. Recommended dependency order from here

```text
P0  RF7 semantic fusion owner migration
    one semantic vote across Qdrant/TurboVec/cuVS/CAGRA

P1  AW-8/AW-9 workflow live wiring
    OpenSpec task projection → WorkflowActionEvent → Kanban → Studio

P2  ACE feature-source + ContextManifest runtime
    domain/query/structural/graph/ontology features → one snapshot

P3  Residency control
    ACE → BitFrost/Valkey/tensor HOT/WARM/COLD

P4  Latent/topology admission
    current semantic_768 → latent_256 → derived 128/64 → KMeans/SOM routing

P5  Ontology materialization
    current deterministic evidence → ontology tuples → Neo4j parity → GDS features

P6  Agentic repair live proof
    Phase 78 dry proposal → Phase 79 dry-run → one authorized bounded canary

P7  Parent Atlas Studio product convergence
    one route; Specs/Tasks, Kanban, DAG/Runs, Repair, Retrieval, Graph/Ontology,
    Memory, Models, Datastores, Auth/Users, Approvals, Audit

P8  DSPy/GEPA shadow optimization

P9  challengers
    Tang low-rank, additional topology/geometry, parser/codec optimizations
```

## 13. Concrete existing-owner task queue

Do not create a new cross-cutting OpenSpec change. Append/refine these tasks only in their current
owners after checking the newest local working tree for concurrent edits:

| Existing owner | Task tranche |
|---|---|
| `parent-atlas-retrieval-fusion-reachability` | RF7 executor→logical-lane migration + live replay |
| `atlas-feature-intelligence` / agentic workflow control plane | AW-8 live Kanban/Studio/Graphify wiring; AW-9 workstation execution receipts |
| `parent-atlas-candidate-feature-execution-fabric` | query/domain/structural/graph/ontology/topology feature joins by CandidateOrdinal |
| `parent-atlas-ace-rlm-bitfrost-integration` | ACE feature-source owner + ContextManifestV2 live path + residency decisions |
| `parent-atlas-ace-bitfrost-cache-correctness` | exact ContextManifest/prefix cache identity |
| `parent-atlas-topology-representation-admission` | TOPO-LATENT-RECON/PARITY/ROUTING |
| `parent-atlas-tensor-residency-integration` | CPU/pinned/GPU residency proof and demotion |
| `parent-atlas-ontology-kernel` | ONTO current census + bounded tuple admission + kernel executor binding |
| `atlas-feature-intelligence` graph tasks | Postgres tuple/hyperedge → Neo4j/NetworkX/cuGraph parity |
| `parent-atlas-agentic-repair-bundle-integration` | Phase 78/79 current-stack cutover evidence |
| `parent-atlas-compute-rank-cache-eval-dspy-gepa` | DSPy/GEPA + recommendation challenger evaluation |
| existing auth/security audit owners | intended-access audit + Studio projection, no duplicate auth |

## 14. Permanent invariants

1. OpenSpec `tasks.md` is implementation task authority; the workboard and Studio are projections.
2. `WorkflowActionEventV1` owns runtime workflow/action/receipt identity.
3. Feature Kanban state and operational workflow-card state are separate.
4. Postgres remains canonical durable evidence/workflow/ontology truth.
5. Qdrant, Valkey, Neo4j, GDS, GPU tensors and cluster IDs are rebuildable projections/executors.
6. `semantic_768` is the canonical semantic retrieval representation.
7. `latent_256/128/64`, SOM/KMeans/Topology4 are routing/residency features, never identity.
8. One logical semantic lane gets one fusion vote, regardless of executor count.
9. Ontology/model classifications cannot override deterministic source/structural evidence.
10. Agent repairs require exact source preimages, explicit authorization for mutation, and verification.
11. Studio controls must call the same governed write owners used by scripts/MCP; no UI-only mutation path.
12. AGENTS files remain small steering instructions; repo knowledge is retrieved on demand.
13. Spec Kit and Kiro may supply quality patterns, never a parallel canonical backlog.
14. Sass is UI styling only; SaaS administration is a product projection over existing owners.
15. Challengers (Tang, CAGRA, topology, alternate parsers/codecs) require baseline/replay receipts before promotion.

## 15. Upstream references reviewed for this alignment

- OpenSpec spec-driven schema: https://openspec.dev/docs/schemas/spec-driven
- GitHub Spec Kit: https://github.github.com/spec-kit/
- GitHub Spec Kit Agentic SDD: https://github.github.com/spec-kit/reference/agentic-sdd.html
- GitHub Spec Kit spec-of-specs: https://github.github.com/spec-kit/concepts/spec-of-specs.html
- Kiro Feature Specs: https://kiro.dev/docs/specs/feature-specs/
- Kiro steering / AGENTS.md: https://kiro.dev/docs/steering/
- Kiro hook triggers: https://kiro.dev/docs/hooks/types/
- Sass documentation: https://sass-lang.com/documentation/
- Ewin Tang, *A quantum-inspired classical algorithm for recommendation systems*: https://arxiv.org/abs/1807.04271

## 16. Result

```text
PARENT_ATLAS_CAPABILITY_SPEC_STUDIO_ALIGNMENT_RECORDED

new canonical owners:        0
new OpenSpec changes:        0
new datastores:              0
new workflow identity:       0
new auth identity:           0
latent lane:                 attached to existing topology owners
ontology lane:               attached to existing ontology/graph owners
Studio:                      projection over existing task/workflow/evidence owners
Spec Kit/Kiro:               quality adapters/pattern sources only
```
