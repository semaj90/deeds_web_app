# Parent Atlas agentic workflow control-plane proof ladder

## Authority split

`WorkflowActionEventV1` remains the internal ordered runtime event and identity owner for workflow/action/receipt/resource IDs.

A2A, ACP migration records, operational task-board cards, Parent Atlas Studio views, Graphify daily plans and GPU index plans are noncanonical projections over revisioned workflow/evidence state.

The canonical feature Kanban remains the `FeatureV1` / `FeatureEvidenceV1` / `FeatureStateV1` materializer defined by `atlas-kanban-materializer`; operational workflow cards MUST NOT overwrite feature completion/state.

OpenSpec `tasks.md` files remain implementation-task authority. `docs/OPENSPEC-WORKBOARD.md`, operational Kanban cards, and Parent Atlas Studio spec/task views are projections only and MUST NOT become a second task ledger.

```text
OpenSpec proposal/spec/design
        ↓
owning tasks.md
        ↓ selected/claimed execution
WorkflowActionEventV1
        ↓
WorkflowTaskBoardCardV1
        ↓
ParentAtlasStudioWorkflowProjectionV1
        ↓ verification/evidence receipt
owning tasks.md acceptance checkbox
        ↓
regenerated OPENSPEC-WORKBOARD
```

A workflow card reaching `DONE` is therefore execution evidence, not permission to mark an OpenSpec task or canonical feature complete unless that owner's acceptance condition is independently satisfied.

## Spec-system adapters

OpenSpec remains the canonical change/spec/task system. Other spec-driven-development systems may be used only as quality adapters:

- GitHub Spec Kit-style clarify/checklist/analyze/converge passes may inspect an existing OpenSpec change and propose or append missing work to its owning `tasks.md`; they do not create a parallel `.specify` backlog for Parent Atlas.
- Kiro-style requirements-first/design-first planning, EARS requirements, per-task verification, and pre/post task or tool hooks may strengthen an existing OpenSpec change; `.kiro/specs` is not task authority.
- Small `AGENTS.md`/steering files contain instructions only. Generated repository indexes and large evidence corpora stay retrievable on demand through Parent Atlas rather than returning to ambient context.

If `Sass` means the stylesheet language, it is a Parent Atlas Studio implementation detail (variables, nesting, mixins, functions compiled to CSS), never workflow or state authority. If `SaaS` means product administration, users/auth/integrations/settings/datastore health are Studio views over existing application owners rather than new Parent Atlas identities.

## Protocol direction

- New outbound agent interoperability targets A2A `1.0.0`.
- ACP is retained only as a legacy ingress compatibility boundary while it migrates into A2A.
- ACP ingress payloads MUST receive a checksum and migration receipt before becoming an Atlas A2A task projection.
- A2A `INPUT_REQUIRED` and `AUTH_REQUIRED` are interrupted states. Neither may authorize a file/database/index mutation.
- A2A Artifacts represent task outputs; workflow progress/status remains status/message metadata.

## Daily execution shape

```text
repository provenance dry-run
        ↓
graphify:daily chain
        ↓
native structural owner
Tree-sitter / ast-grep / exact source+byte identity
        ↓
feature recommendation refresh
        ↓
QAS recommendation receipt
        ↓
GPU codebase index plan
        ↓
EmbeddingGemma semantic_768
        ↓
Qdrant projection / parity
        ↓
exact cuVS oracle
        ↓
CAGRA challenger + cluster/graph features
        ↓
latent/topology derived features
        ↓
ontology/KAG current-tuple projection
        ↓
retrieval parity / validation
        ↓
ACE / ContextManifest
        ↓
Ornith / governed agent action
        ↓
operational Kanban refresh
        ↓
Parent Atlas Studio projection refresh
        ↓
A2A task/artifact updates
```

The ordering above does not make latent/topology or ontology mandatory for baseline semantic retrieval. Their failures degrade those optional feature lanes while leaving a proven `semantic_768` retrieval path usable.

## GPU codebase indexing invariants

- canonical semantic dimension remains `semantic_768`.
- semantic lane vote count remains exactly `1`; executors do not produce extra fusion votes.
- Qdrant, TurboVec, cuVS and CAGRA are executors/projections inside one logical semantic family, not independent RRF votes.
- CAGRA requires a cuVS exact-oracle stage in the same frozen plan.
- mutating index stages require validation receipts.
- GPU `APPLY` additionally requires an admitted `GpuResourceEnvelope` receipt/reference.
- KMeans/SOM/PageRank/PPR/Node2Vec and other derived feature stages remain noncanonical.
- all derived rows MUST align to the same frozen row-identity checksum before retrieval/index promotion.
- a topology/cluster feature may affect routing, residency, shortlist cost, or context depth only after exact candidate identity has already been established.

## Latent / topology derived lane

Detailed acceptance remains owned by `parent-atlas-topology-representation-admission` and tensor movement by `parent-atlas-tensor-residency-integration`. This control-plane file only defines how admitted outputs participate in workflows.

The current intended nested family is:

```text
semantic_768
    ↓ NestedSemanticAutoencoder
latent_256                    learned physical derived representation
    ├─ prefix[:128] + L2 → latent_128 derived view
    └─ prefix[:64]  + L2 → latent_64  derived view
                              ↓
                         KMeans / SOM / Topology4
                              ↓
                   CandidateFeatureSnapshot routing fields
                              ↓
                       ACE residency/context policy
```

A same-session live numeric check reported that stored `latent_64` matches the prefix+L2-normalized `latent_256[:64]` hypothesis to float16 storage tolerance. That evidence resolves the prior slice-vs-independent-output question for the observed rows, but it does not by itself promote legacy latent writers or stale representation IDs. The topology owner still must reconcile stale producer/documentation claims, bind representation revisions, and prove current-corpus parity.

Required control-plane behavior after topology admission:

- `latent_256`/`latent_128`/`latent_64` never create canonical candidate identity.
- `latent_128` need not be persisted merely to be usable as a deterministic derived view.
- KMeans/SOM/Topology4 outputs are routing/cache/residency features only.
- no latent/topology representation becomes an additional semantic RRF lane.
- an ACE HOT/WARM/COLD recommendation references an existing canonical candidate/artifact identity; eviction or demotion removes only derived residency.

## Ontology / KAG / HyperGraphRAG lane

Detailed ontology admission remains owned by `parent-atlas-ontology-kernel`; canonical N-ary/graph persistence and projection parity remain with the existing Feature Intelligence graph owners. OAK is an adapter/kernel behind that authority, not a replacement datastore.

Required authority chain:

```text
source/schema/runtime/test evidence
        ↓
AST/CST/LSP/RPC observations
        ↓
concept / relation candidates
        ↓
OAK + taxonomy/domain mapping evidence
        ↓
OntologyLinkedTupleV1
        ↓
atlas_ontology_tuples              PostgreSQL canonical tuple truth
        ↓
Neo4j projection
        ↓
GDS / NetworkX / cuGraph analytics
PageRank / Leiden / PPR / neighborhoods
        ↓
CandidateFeatureSnapshot
        ↓
ACE / ContextManifest
```

Do not reverse this chain. Neo4j node IDs, GDS graph IDs, cluster/community labels, model domain labels, or ontology aliases cannot manufacture source identity or canonical tuple truth.

The latest recorded persistence census in the ontology owner reported `62,802` `atlas_hyperedges`, `125,604` `atlas_hyperedge_members`, and `0` `atlas_ontology_tuples`. That is a historical/current-recorded gate value, not a promise that the live database still has the same counts. Before materialization, re-census the live database and bind the target cohort to exact source/workspace/graph/ontology revisions.

Workflow admission sequence:

```text
ONTO-CURRENT-CENSUS
        ↓
current bounded tuple proposal
        ↓
explicit authorization
        ↓
bounded Postgres tuple apply
        ↓
fresh-connection readback + replay
        ↓
Neo4j projection parity
        ↓
GDS analytical receipts
        ↓
CandidateFeatureSnapshot / ACE
```

A tuple/Neo4j/GDS failure leaves semantic retrieval available and marks ontology features unavailable; it cannot be hidden by a model-generated concept label.

## Agentic repair lane

Current repair ownership is the existing Phase 78/79 + `parent-atlas-agentic-repair-bundle-integration` path, not a separate repair knowledge store.

```text
error observations
      ↓
Phase 78 Ornith proposal producer
read-only SearchRuntime context + exact sourceRevision
      ↓
error_suggestions noncanonical queue
      ↓
Phase 79 canonical repair workflow
      ↓
exact preimage + Parent Atlas retrieval/features/NES context
      ↓
Ornith bounded edit plan
      ↓
proposal checksum + explicit authorization
      ↓
git diff --check + targeted/full validation
      ↓
analysis_pass_results / WorkflowActionEvent evidence
      ↓
OpenSpec task or canonical feature can close only if its own acceptance gate passes
```

The legacy Enhanced Phase 79 entrypoint is compatibility-only and must delegate to the canonical Phase 79 workflow; it must not regain Gemini/Ollama/MiniLM/private Redis/private Qdrant ownership.

## Graphify daily gates

`DRY_RUN` may build plans without mutation receipts.

`APPLY` is admitted only when:

```text
validated structural/source snapshot
    +
validation receipts
    +
exact semantic oracle receipt
    +
GPU resource admission (GPU index only)
    +
revision-matched graph / semantic / feature identities
```

Fallback execution MUST NOT turn an unvalidated native structural or GPU index step into a canonical write.

Incremental Graphify should reuse any descendant artifact whose source/revision dependency set is unchanged and invalidate only descendants of changed source revisions. A stale `codebase-graph.json` is an observability/currentness signal; it is not permission to rebuild every downstream representation indiscriminately.

## Studio / task-board projection

Parent Atlas Studio should display three related but distinct task/state surfaces:

1. **OpenSpec board** — planning/progress projection from owning `tasks.md` files.
2. **Feature board** — canonical feature/evidence/state projection.
3. **Workflow board** — current runtime task/action execution projection.

Workflow cards may show:

- queued / active / blocked / verify / done / failed / canceled
- workflow/action/DAG node IDs
- lane/transport/executor
- validation/evidence/artifact refs
- A2A task status
- GPU index/Graphify progress
- exact source/graph/semantic/feature revision set
- authorization/approval requirement
- current attempt/lease/heartbeat where available

A workflow card reaching `DONE` does not by itself move a canonical feature to `VERIFIED`; the feature materializer still requires its own acceptance evidence. It also does not by itself check an OpenSpec task checkbox.

Human-facing aliases such as `READY`/`RUNNING` may be derived in the UI, but the existing runtime state machine remains the owner:

```text
READY   = QUEUED + dependency-ready predicate
RUNNING = ACTIVE
BLOCKED = BLOCKED
VERIFY  = VERIFY
DONE    = DONE
FAILED  = FAILED
```

Dragging a card may request a governed transition; it must not bypass dependency, revision, validation, or authorization guards.

## Parent Atlas Studio product surfaces

The existing Studio reference note remains design input. Converge to one permanent route after reconciling the current Atlas Studio and admin/unified-indexing surfaces; do not keep two divergent control planes.

Recommended navigation projection:

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

### Auth / users

Reuse the application's existing user/session/role/tool-authorization owners. Studio may show users/service actors, roles, resolved capability grants, recent denials, and pending mutation approvals. Do not introduce a second `ParentAtlasUser` identity or blanket-add `locals.user` guards to intentionally service-to-service routes without an access-model audit.

### Datastores / runtimes

Expose a single registry/proof view for existing services, for example:

```text
PostgreSQL
Qdrant
Valkey / BitFrost
Neo4j / GDS
RabbitMQ / outbox
Go Retrieval
MCP
Ornith llama-server
EmbeddingGemma
GPU / cuVS / cuGraph / RAPIDS
SearXNG / acquisition services
```

Use proof-aware status vocabulary:

```text
CONFIGURED
CONNECTED
HEALTHY
DEGRADED
UNPROVEN
DISABLED
```

`CONFIGURED` or `CONNECTED` must never imply a capability proof.

If Parent Atlas later becomes a multi-user SaaS product, tenancy/workspaces, budgets, API integrations, subscription/billing, and preferences can be added only behind their existing product/account truth; none becomes retrieval or workflow identity.

## Recommendation / low-rank challenger lane

Ewin Tang-inspired low-rank sampling remains a STEP-08 benchmark/challenger, not a production rank owner. The useful idea is to shortlist computation over an already-valid candidate/utility matrix under strong low-rank and sampling-access assumptions.

```text
already-valid CandidateFeatureMatrix / utility matrix
        ↓
TANG_INSPIRED_LOW_RANK_SHORTLIST
        ↓
mandatory preserved-lane floors
        ↓
exact ranking/oracle comparison
        ↓
Recall@K / MRR / NDCG / latency / byte cost / GPU cost
        ↓
explicit promotion receipt if it actually wins
```

It cannot replace canonical exact eligibility or source/evidence identity, and it cannot create another semantic fusion vote.

## Parser / serialization boundary

A simdjson/NDJSON parser may be evaluated only when profiling shows JSONL parsing is a material Graphify/indexing cost. It is a parser executor, never a packet/revision/graph owner.

```text
JSONL / NDJSON -> SIMD parser -> typed Atlas records
Arrow IPC / mmap / tensors -> bulk numeric plane
```

Do not route large `semantic_768` or feature matrices through JSON/MessagePack task envelopes when artifact references/Arrow/mmap already own the numeric plane.

## Proof sequence

```text
AW-0  WorkflowActionEvent internal ownership      EXISTING
AW-1  A2A v1.0 projection contracts              WRITTEN_UNPROVEN
AW-2  ACP legacy-ingress migration receipt       WRITTEN_UNPROVEN
AW-3  operational task-board projection          WRITTEN_UNPROVEN
AW-4  Graphify daily workflow plan               WRITTEN_UNPROVEN
AW-5  GPU codebase index plan + exact oracle     WRITTEN_UNPROVEN
AW-6  Parent Atlas Studio workflow projection    WRITTEN_UNPROVEN
AW-7  bounded control-plane proof script         WRITTEN_UNPROVEN
AW-8  live Graphify/Kanban/Studio/A2A wiring     PENDING
AW-9  workstation execution + receipts           PENDING
AW-10 OpenSpec task → runtime card projection    PENDING
AW-11 latent/topology workflow feature join      PENDING; owned by topology/feature owners
AW-12 ontology tuple → Neo4j/GDS feature join    PENDING; owned by ontology/graph owners
AW-13 Phase 78/79 repair → workflow evidence     PENDING; owned by repair/run-receipt owners
AW-14 Studio auth/datastore proof registry       PENDING; projection over existing owners
```

`AW-10..14` are integration/projection gates only. They do not move canonical ownership out of the OpenSpec/topology/ontology/auth/retrieval changes named above.

## Written proof command

Build Parent Atlas first, then run:

```bash
node scripts/atlas/prove-agentic-workflow-control-plane.mjs
```

This is non-mutating by default.

An apply-mode proof is intentionally fail-closed without a GPU resource admission receipt:

```bash
ATLAS_GPU_RESOURCE_RECEIPT_ID=<receipt-id> \
node scripts/atlas/prove-agentic-workflow-control-plane.mjs --apply
```

No live Graphify, Qdrant, Kanban, Studio or remote A2A endpoint should be called by this bounded proof; it validates the control-plane composition before runtime wiring.

## Cross-reference

The broader capability/ownership/product alignment is recorded at:

`docs/reports/parent-atlas-capability-spec-studio-alignment-v1.md`

That report and this file are navigation/integration records. The owning OpenSpec `tasks.md` files remain implementation authority.
