# Parent Atlas Pydantic + LDR + Learning Circuit Alignment — 2026-09-01

Status: **ALIGNMENT_FROZEN_IMPLEMENTATION_OPEN**

Audited repository head at start: `fe87fc05df033c7459ae0a0e4983fd0c730c8dbb`.

This note aligns the existing Parent Atlas deep-research specification, the upstream `LearningCircuit/local-deep-research` package, the older July Learning Circuit implementation, Phase 79 agentic error fixing, and the RTX/WSL2 residency work. It is an ownership/convergence record only. It does not install packages, start services, mutate stores, execute GPU work, or promote a learned component.

## Findings

### 1. LDR already means Local Deep Research in this repository

The workstation bootstrap already provisions `local-deep-research[mcp]` in a dedicated Python tools virtual environment and probes imports for `local_deep_research`, Pydantic, LangGraph, Qdrant, psycopg/pgvector, Firecrawl, BM25, NetworkX and gRPC.

Existing Parent Atlas surfaces already include:

- `sveltekit-frontend/src/lib/server/ldr/ldr-orchestrator.ts`
- `sveltekit-frontend/src/mcp/tools/ldr-research.ts`
- `sveltekit-frontend/src/routes/api/ldr/research/+server.ts`
- `scripts/atlas/research-error-fixes.mjs`
- `sveltekit-frontend/scripts/atlas/bootstrap-agentic-research.ps1`

The existing TypeScript orchestrator is a real implementation: SearXNG discovery -> document extraction -> llama-server synthesis. It uses `LLAMA_SERVER_URL` with the shared `LLM_MODEL_ID`, so it is already aligned with the single `:8090` synthesis capability better than the old Learning Circuit runtime.

### 2. Upstream LearningCircuit/local-deep-research is a compatible provider, not Parent Atlas authority

Current upstream observed during this audit:

- repository: `LearningCircuit/local-deep-research`
- version: `1.10.7`
- Python: `>=3.12,<3.15`
- Pydantic: `~=2.12`
- pydantic-settings: `~=2.12`
- optional MCP entry point available through the package's `mcp` extra
- LangGraph agent strategy exists upstream

Parent Atlas may use upstream LDR as an external-research executor/challenger. It MUST NOT own Parent Atlas canonical packet identity, CandidateOrdinal, artifact hashes, exact promotion, mutation authorization, workflow receipts, or durable ontology truth.

The public Parent Atlas tool name remains `ldr_research`. Do not expose a second peer `ldr-mcp` tool surface to agents without an explicit owner migration; that would create another live research owner.

### 3. The July three-service Learning Circuit is historical/compatibility architecture

The old files:

- `docs/LEARNING-CIRCUIT-ARCHITECTURE.md`
- `docs/LEARNING-CIRCUIT-OPERATIONAL-STATUS.md`
- `src/lib/server/agent-control/learning-circuit.ts`
- `src/lib/server/agent-control/error-fixing-graph.ts`

encode a useful deterministic state-machine idea, but the runtime assumptions are stale. The implementation hardcodes the former `8091` / `8092` / `8093` model workers, contains placeholder retrieval, placeholder edit execution, placeholder tests and a placeholder reranker. Current Docker configuration explicitly records that the three CPU-only Learning Circuit containers were removed and superseded by the single Gemma/TurboQuant/Ornith-compatible synthesis surface on `:8090`.

Therefore preserve the workflow concepts but do not revive those three model services.

### 4. Pydantic belongs at the Python execution/transport boundary

Pydantic is already common in Parent Atlas Python/FastAPI sidecars. For LDR it should validate Python-side request/receipt envelopes that mirror Parent Atlas canonical contracts.

Pydantic MUST NOT become a second schema authority beside the Parent Atlas TypeScript/Zod/package contracts. Cross-language parity should be fixture-based: the same JSON envelope must pass both the canonical TypeScript contract and its Python Pydantic adapter, and tampered revision/checksum fixtures must fail both.

### 5. Keep the LDR environment isolated from the RAPIDS environment

The existing bootstrap's dedicated `tools/agentic-research/.venv` is the correct dependency boundary. Do not install Local Deep Research, LangChain/LangGraph web dependencies, or its Pydantic stack into the `atlas-rapids-cu13` WSL2 environment merely because both participate in Phase 79.

Likewise, do not put LDR into the neural decoder image. The decoder remains a small PyTorch/CUDA 13.2 service; RAPIDS/cuVS/cuGraph and LDR are separate executor families.

## Correct Parent Atlas architecture

```text
ERROR / TASK
    |
    v
ErrorObservationV1 / task identity
    |
    v
DETERMINISTIC CLASSIFICATION + LOCAL RETRIEVAL
    |-- SearchRuntime / exact / FTS / Qdrant
    |-- CandidateOrdinalMapV1
    |-- Tree-sitter / ast-grep
    |-- graph / hypergraph evidence
    |
    | enough promoted evidence?
    |        |
    |        +-- yes ------------------------------------+
    |                                                   |
    +-- no                                              |
         v                                              |
ExternalResearchPlanV1                                 |
         |                                              |
         v                                              |
Parent Atlas ldr_research tool                          |
         |                                              |
         +-- TS-native LDR reference                    |
         +-- LearningCircuit/local-deep-research challenger
                 |
                 v
         read-only web/private-source research
                 |
                 v
         raw source/result envelope
                 |
                 v
8095 normalization / extraction / OKF classification
                 |
                 v
NormalizedExternalEvidenceV1
                 |
                 v
checksum + revision + citation verification
                 |
                 v
EXACT EVIDENCE PROMOTION <------------------------------+
                 |
                 v
GroundedClaimValidationReceiptV1
                 |
                 v
KernelDagCandidateV1
                 |
                 v
KernelDagValidatorV1
                 |
                 v
TypedRepairDagV1
                 |
                 v
EXPLICIT MUTATION AUTHORIZATION
                 |
                 v
bounded patch executor
                 |
                 v
compile / tests / validators
                 |
                 v
ExecutionReceiptV1 + packet-grained outcome events
                 |
                 v
ResearchImprovementStateV1 / learning datasets
```

## Ownership freeze

| Capability | Canonical owner / rule | LDR / Pydantic role |
|---|---|---|
| Packet/symbol/source identity | Parent Atlas canonical contracts + Postgres | consume only |
| CandidateOrdinal | frozen candidate snapshot | never invent from LDR results |
| Local retrieval/fusion | SearchRuntime family after RF6 convergence | consume results |
| External discovery/research | Parent Atlas `ldr_research` capability | provider/executor |
| Synthesis | shared `:8090` OpenAI-compatible capability | call through configured endpoint |
| External evidence | revisioned Parent Atlas evidence artifacts | produce candidate evidence for validation |
| Exact promotion | Parent Atlas | LDR cannot self-promote |
| Repair workflow | TypedRepairDag / bounded executor | research subroutine only |
| Mutation authorization | Parent Atlas authorization gate | never owned by LDR/LangGraph |
| GPU residency | canonical candidate-feature GPU residency owner | optional compute input; unrelated to LDR ownership |
| Learning outcomes | execution/validator receipts and packet-grained events | may contribute labeled observations |
| Python validation | Pydantic adapter | mirror canonical envelopes, not redefine them |

## Pydantic/LDR implementation gates

### LDR-ALIGN-01 — dependency receipt

Freeze a workstation `LdrEnvironmentReceiptV1` before changing runtime wiring:

```text
pythonVersion
localDeepResearchVersion
localDeepResearchCommit?
pydanticVersion
pydanticSettingsVersion
langgraphVersion
mcpVersion?
installEnvironment
environmentChecksum
```

The current bootstrap uses an unbounded `pydantic>=2` plus broad `--upgrade`. Align it with the tested upstream LDR dependency family rather than letting a future major/minor combination drift silently. Initial candidate pin from current upstream evidence:

```text
local-deep-research[mcp]==1.10.7
pydantic~=2.12
pydantic-settings~=2.12
Python 3.13 workstation tools venv
```

Re-check upstream before committing a durable pin.

### LDR-ALIGN-02 — typed request boundary

Implement the already-designed `ExternalResearchPlanV1` rather than inventing another research-plan type. Required concerns include:

```text
researchRunId
question / normalized query hash
revisionSetHash
allowedDomains
blockedDomains
freshnessPolicy
maxSources
maxBytes
maxWallMs / timeout
maxIterations
producerRevision
readOnly = true
```

The current `LDRConfig` only carries result/document/token/temperature/timeout limits, so domain and lineage policy remain a real gap.

### LDR-ALIGN-03 — Pydantic parity adapter

Add Python Pydantic mirrors only for the Parent Atlas LDR boundary. Required proof:

```text
canonical TS/Zod fixture -> Pydantic PASS
Pydantic serialization -> canonical TS/Zod PASS
changed revisionSetHash -> FAIL where bound
missing producer revision -> FAIL
readOnly=false -> FAIL for research executor
unknown/unbounded domain policy -> FAIL or explicit policy decision
```

Do not define CandidateOrdinal, packet identity, or exact-promotion semantics independently in Python.

### LDR-ALIGN-04 — one provider surface

Keep `ldr_research` as the single Parent Atlas capability. If upstream LDR is enabled, select it behind a provider/executor setting or adapter. Do not expose both the existing TypeScript orchestrator and upstream LDR MCP as independent votes/tools with the same authority.

Initial provider classification:

```text
TS_NATIVE_LDR        = current reference / compatibility implementation
LEARNINGCIRCUIT_LDR  = read-only challenger until parity/evaluation receipt
```

### LDR-ALIGN-05 — synthesis owner convergence

Both providers must call the configured synthesis capability; neither may hardcode the old 8091/8092/8093 services or a model filesystem path.

Record:

```text
LLM endpoint
model capability/model revision
prompt/template revision
temperature
max tokens
provider revision
```

### LDR-ALIGN-06 — evidence, not answer, is the durable output

A natural-language LDR answer is provisional. Durable promotion flows through source acquisition -> content hash/source revision -> normalization -> citation/evidence identity -> validators -> exact promotion.

The synthesis string may be stored as a derived artifact, but must not replace source evidence.

### LDR-ALIGN-07 — Phase 79 integration

Use LDR only when the local evidence circuit cannot resolve a required constraint. The agentic repair spine remains:

```text
feature/source identity
 -> CandidateOrdinal fanout
 -> graph/symbol revision closure
 -> ContextManifest / evidence plan
 -> grounded claim validation
 -> patch-plan candidates
 -> TypedRepairDag
 -> explicit authorization
 -> bounded apply
 -> compile/test/validator receipts
```

This maps directly to `DAG-ERROR-01` rather than reviving the old placeholder `error-fixing-graph.ts` executor.

### LDR-ALIGN-08 — outcome learning closes the FeatureVector execution gap

Validated repair executions should emit packet-grained outcome events into the existing execution-utility lineage path. This is the useful successor to the old unrevisioned `agent_outcomes`/success-prior idea.

Required signals remain concrete validator outcomes such as:

```text
selected
evidence_used
compile_pass
test_pass
repair_success
validation_pass
source_revision
representation_revision
```

Do not update learned priors merely because the model liked a recommendation.

## RTX / GPU alignment

LDR acquisition itself is not a GPU-residency owner. The RTX stack participates at bounded compute points:

```text
semantic_768 retrieval / embedding
candidate feature tensors
reranking / learned ranker challengers
Ornith synthesis
future cuTile/SIMT experiments
```

Keep GPU-EXP-12 independent. Current proof establishes pinned async staging, one H2D transfer, resident reuse, parity, pointer non-leakage and post-release rejection. It does NOT yet establish VRAM-pressure-triggered eviction. LDR integration must not be used to close that hardware gate indirectly.

Likewise GPU-EXP-13 CandidateOrdinal reconciliation remains independent of external-research integration.

## Phase 79 learning hierarchy

The "learning circuit" should now mean a receipted improvement loop, not three permanent LLM containers:

```text
L0 deterministic contracts / replay / validators
L1 unsupervised routing features
L2 supervised learning-to-rank
L3 neural reranking / representation challengers
L4 program/prompt optimization
L5 policy-learning experiments
L6 model adapters only from verified corpus
```

No later layer may bypass the earlier evidence, authorization or evaluation gates.

## Relation to semantic / kinetic / dynamic ontology layers

```text
SEMANTIC
contracts, identity, revisions, evidence meaning
Zod canonical schema + Pydantic runtime mirror

KINETIC
typed tools and transformations
SearchRuntime, LDR acquisition, AST/graph expansion, ranking, patch DAG

DYNAMIC
state transitions and feedback
ResearchImprovementStateV1, retries, validator outcomes, execution utility,
residency transitions, learned policy experiments

LINEAGE
source -> artifact -> evidence -> claim -> patch -> validator -> receipt
```

Lineage is the cross-layer invariant; storage engines, model backends and GPU providers are projections/executors.

## Do not do

- Do not restart the old 8091/8092/8093 Learning Circuit containers.
- Do not let upstream `ldr-mcp` become a peer canonical tool beside Parent Atlas `ldr_research`.
- Do not install LDR dependencies in the RAPIDS WSL2 environment or neural decoder container.
- Do not let Pydantic redefine CandidateOrdinal/canonical identity semantics.
- Do not treat an LDR synthesis answer as promoted evidence.
- Do not let LangGraph or LDR authorize patches.
- Do not close GPU-EXP-12 from reuse/release evidence alone.
- Do not feed unvalidated LDR outcomes directly into learned ranking or RL labels.

## Recommended next implementation order

```text
LDR-ALIGN-01 environment/version receipt
 -> LDR-ALIGN-02 ExternalResearchPlanV1 boundary
 -> LDR-ALIGN-03 Pydantic/Zod parity fixtures
 -> LDR-ALIGN-04 one-provider adapter under ldr_research
 -> bounded read-only LDR replay
 -> NormalizedExternalEvidenceV1 + source/checksum receipt
 -> GroundedClaimValidationReceiptV1
 -> DAG-ERROR-01 repair-plan integration
 -> authorized patch + validator receipts
 -> packet-grained outcome learning
```

Run GPU-EXP-12 pressure eviction and GPU-EXP-13 CandidateOrdinal reconciliation as parallel hardware/retrieval gates, not prerequisites for read-only LDR integration.

## Status labels

- `LDR_UPSTREAM_DISCOVERED`: PROVEN
- `PYDANTIC_UPSTREAM_COMPATIBILITY_RANGE`: PROVEN_FROM_UPSTREAM_METADATA
- `EXISTING_TS_LDR_RUNTIME`: IMPLEMENTED
- `PARENT_ATLAS_LDR_MCP_TOOL`: IMPLEMENTED / existing runtime audit previously classified partial
- `OLD_THREE_SERVICE_LEARNING_CIRCUIT`: SUPERSEDED_RUNTIME_DESIGN; concepts reusable
- `EXTERNAL_RESEARCH_PLAN_RUNTIME_CONTRACT`: NOT_IMPLEMENTED / spec-only in this audit
- `NORMALIZED_EXTERNAL_EVIDENCE_RUNTIME_CONTRACT`: NOT_IMPLEMENTED / spec-only in this audit
- `PYDANTIC_ZOD_LDR_PARITY`: NOT_PROVEN
- `UPSTREAM_LDR_PROVIDER_WIRING`: NOT_PROVEN
- `PHASE79_LDR_TO_TYPED_REPAIR_DAG`: NOT_PROVEN
- `GPU_EXP_12_PRESSURE_EVICTION`: NOT_PROVEN

No production or canonical ownership changed by this alignment note.
