# Parent Atlas Container, Language, API, Feature Label, and HMM Alignment

**Recorded:** 2026-11-10
**Scope:** source/configuration review plus the latest available workstation snapshots.
**Authority:** review and design report only. No containers, services, databases, caches, GPU jobs, labels, or task state were changed.

## Executive assessment

The repository has many of the pieces, but they are not yet joined into a qualified recommendation procedure. The current state is best described as **substantial inventory and prototype logic; incomplete evidence contract; no proven end-to-end recommendation path**.

The largest gap is not another model or index. It is a revision-bound contract joining:

```text
language profile + API contract + exact source evidence
  → typed relation proposal + feature-label reference
  → validated HMM observation sequence
  → bounded recommendation with evidence and abstention
  → human review / separate authorized execution
```

The source already has a revision-qualified API observation contract and a proposal-only API relation bridge, and this review added a shadow-only `.okf` procedure/schema pair. These are contracts and proposal code, not a proven end-to-end catalog or admitted relation path. No calibrated, corpus-trained HMM recommendation model was found. Separately, the 96 local policy rows are not usable training evidence: all 96 carry placeholder `sourceRevision: "unknown"` and only one state, action, model, budget, and outcome. The domain-classification runbook also records zero reviewed gold labels and a historical mismatch with the 17-group taxonomy.

## What was inspected

The source/configuration inventory included the root Compose file, GPU Compose file, dedicated NLP sidecar Compose file, `dev:gpu` startup and NATS worker guards, `.okf` feature-index policy, language profiles and schemas, classification runbook, feature-label registry, API observation and proposal contracts, policy/HMM helpers, training-row recorder, alternative deterministic routers, and agentic recommendation workflow. It also added `.okf/schemas/hmm-api-recommendation-procedure-v1.schema.json` and `.okf/pipelines/hmm-api-recommendation-v1.yaml` as a non-authoritative, disabled shadow contract.

Key current working-tree SHA-256 values:

| Source | SHA-256 |
|---|---|
| `docker-compose.yml` | `1117bddcca985e15f4e8c64c244a59dbc36f2c9a829e8165da38e1479b65e320` |
| `docker/docker-compose.gpu.yml` | `d119361df1f3fd643a832affef20feb5990686a1f8ec7c65c6a5b56b6685af94` |
| `docker/miniforge-nlp-sidecar/docker-compose.yml` | `bc73e5eb7d3ee0e80c509e6931066b4b1d8d3016511513f8d609bb1453128d4a` |
| `.vscode/tasks.json` | `ebc64c6cd4787b1f7a61ad6bcf78e60a544fa1197fd73b0842a2b6e83fb959bd` |
| `sveltekit-frontend/scripts/startup/dev-gpu-runtime.mjs` | `2411781433cc71de88dfdae9a2fc380df3d14d15ce8cf58efa67fa7531fa85245` |
| `sveltekit-frontend/scripts/startup/ensure-nats-langgraph.mjs` | `8f1876fb3e29ed337f53cba3672c1da66e9ea469740011256aa3e1e644d5b993` |
| `.okf/indexes/feature-intelligence.yaml` | `f5e74a352ffcf0015a004864af3bd6552488169a82a0ccc962c626ec2a74d684` |
| `.okf/schemas/language-profile-v1.schema.json` | `ff2cd4f2f9432cb1452c026643756a82e6d943afbfb82d8bdf61e67af7d72210` |
| `.okf/schemas/feature-relationships-v1.schema.json` | `2b50f8ced271efd34a49920cdc73f07f605f63962112e101322a2dc348d012cf` |
| `.okf/runbooks/okf-oak-domain-classification-cheatsheet.md` | `679cfd7cde7bc7a966eace765648d38030fd7a367ca48a8a49b3aebe4c867ccd` |
| `sveltekit-frontend/src/lib/server/retrieval/hmm-tool-selector.ts` | `0b617631584a3213f3f5eb08576b33ad8327ddec60bce0c337dc9bbf1bb336e6` |
| `sveltekit-frontend/src/lib/server/router/viterbi-router.ts` | `060e2a2d908955676861a158d614fd49bcaa5219efee118e45dad0c536726178` |
| `sveltekit-frontend/src/lib/server/labels/feature-label-registry.shared.json` | `42bf73883950c0f2962b493ca96cf1e831c40274e734add39c7da381e03ac322` |

These hashes identify the reviewed working-tree bytes, not a clean commit or deployment.

## Container and directory ownership

### Current runtime caveat

The latest direct recheck found Docker unavailable: the engine pipe was absent, `com.docker.service` was stopped, `WslService` was `StopPending`, and 24 `wsl.exe -l -q` clients remained. Therefore there is **no current live container inventory, per-container memory measurement, or startup timing**. Compose configuration is not proof that a service is running.

The 2026-11-10 RAM report contains an earlier live memory sample, and the 2026-09-20 Docker image audit recorded 26 active containers. These are historical snapshots. The RAM report groups several smaller services, so it does not provide an individually measured row for all 26. Do not use the old count as today's status.

### Compose roles and source directories

Root Compose resolves to 5 default services, 18 services with `full`, and 10 with `gpu`. `dev:gpu` is a separate startup path; it does not launch the whole root `full` or `gpu` profile.

| Container/service | Workload and language | Configuration / source directory | Runtime status in this review |
|---|---|---|---|
| `legal-ai-postgres` | PostgreSQL 18 + pgvector; canonical identity/evidence | `docker-compose.yml`; `docker/postgres/` | Unknown now; historical RAM sample 661 MiB |
| `legal-ai-qdrant` | Qdrant vector projection | `docker-compose.yml` | Unknown now; historical sample about 1.0 GiB |
| `legal-ai-valkey` | Valkey cache/residency | `docker-compose.yml` | Unknown now; grouped in historical smaller services |
| `legal-ai-rabbitmq` | RabbitMQ work-dispatch broker | `docker-compose.yml` | Unknown now; historical sample 115 MiB |
| Caddy | Reverse proxy | `docker-compose.yml`, `infra/caddy/` | Unknown now; grouped in historical smaller services |
| `legal-ai-neo4j` | Neo4j graph projection | `docker-compose.yml` | Unknown now; historical sample 1.90 GiB. Compose heap was previously reduced; current runtime effect is not verified. |
| `legal-ai-bifrost` | Model/provider gateway | `docker-compose.yml`, `docker/bifrost/` | Unknown now; historical sample 220 MiB |
| `legal-ai-nats` | Event/work queue consumed by agent/index/embedding code | `docker-compose.yml` | Unknown now; grouped in historical smaller services. Do not classify as unused. |
| `legal-ai-couchdb` | CouchDB service | `docker-compose.yml` | Unknown now; grouped in historical smaller services |
| `legal-ai-searxng` and `searxng` | Search service; duplicate deployment identity was flagged | `docker-compose.yml` | Unknown now; combined historical sample 148 MiB; port ownership was not established in this review |
| `langfuse-server`, `langfuse-worker`, `langfuse-clickhouse` | LLM observability, worker, trace storage | `docker-compose.yml` | Reported stopped in the earlier RAM pass; tracing impact was not verified. Do not infer present state while Docker is unavailable. |
| `legal-ai-docling-vlm` | Python document/VLM processing | `docker-compose.yml`, `docker/docling-vlm/` | Unknown now |
| `legal-ai-image-synthesis` | Image synthesis service | `docker-compose.yml`, `docker/image-synthesis/` | Unknown now |
| `legal-ai-langgraph` | Python LangGraph orchestration | `docker-compose.yml`, `docker/langgraph-synthesis/` | Unknown now; historical sample 137 MiB |
| `legal-ai-go-search` | Go search API | `docker-compose.yml`, `services/go-search-service/` | Unknown now |
| `legal-ai-go-embedding` | Go embedding API/client integration | `docker-compose.yml`, `services/go-embedding-service/` | Unknown now |
| `legal-ai-go-retrieval` | Go retrieval executor | `docker-compose.yml`, `services/go-retrieval-service/` | Unknown now; grouped in historical smaller services |
| `miniforge-nlp-sidecar` | Python NLP, AST and OAK sidecar on `:8095` | `docker/miniforge-nlp-sidecar/docker-compose.yml`, `docker/miniforge-nlp-sidecar/` | Unknown now; historical sample 219 MiB |
| `atlas-gpu-8098` | Python RAPIDS/cuVS/cuGraph executor | `docker/docker-compose.gpu.yml`, `docker/atlas-gpu-8098/` | Unknown now; historical sample 160 MiB |
| `atlas-neural-decoder` | Python/PyTorch decoder on `:8121` | `docker/docker-compose.gpu.yml`, `docker/atlas-neural-decoder/` | Unknown now; historical sample 118 MiB |
| `ldr-local-deep-research-1` | Deep-research service | Compose/source owner requires confirmation | Unknown now; historical sample 210 MiB |

The dated Docker image-use report separately classifies 11 retained images, including the GPU executor, decoder, NLP sidecar, Postgres, Qdrant, Valkey, Go retrieval, Docling, Bifrost, and image synthesis. “Keep” in that audit is a retention recommendation, not proof of current deployment or actual need in every startup profile.

### Startup behavior already present

- The folder-open `Dev Server (GPU, detached)` task runs `npm run dev:gpu`: it reuses a healthy llama-server on `:8090`, defaults to Ollama-managed on-demand embeddings, starts/reuses the dedicated `:8095` NLP sidecar, then starts TRACE and Vite.
- A separate `LangGraph NATS Worker` folder-open task checks Docker and starts NATS if needed, waits for health, then starts a Node worker. Despite its task name, it does not start the LangGraph container.
- The two Docker callers can race at folder open. The repo also has 24 folder-open tasks, several of which do native, database, GPU, smoke, or bounded refresh work. They are not all equivalent to container startup, and some have writes or cooldown behavior.
- Existing profile gating and image/service reuse are useful foundations. The next optimization is a serialized readiness gate plus explicit per-task policy (`required`, `on-demand`, `manual`, `cooldown`) and side-effect ownership, followed by measured startup timing. Do not blanket-disable folder-open jobs based on count alone.

## Language-to-API relation map

There are currently **23 YAML language profiles** in `.okf/languages/` plus a Tree-sitter language catalog. The October runbook's 23/23 count agrees with the current file count, but validation was not rerun in this review. The profiles are useful parser/extraction inputs; they are not yet a validated map from every language to API scenarios and canonical feature labels.

Use the following relation proposals only when exact source/revision evidence supports them. An import, shared path, matching word, or feature label alone does not prove a relation.

| Language/profile | First source directories to inspect | Best source-backed relation/use case | API or contract evidence to bind | Candidate feature-label family |
|---|---|---|---|
| TypeScript / JavaScript / Svelte | `sveltekit-frontend/src/`, `packages/parent-atlas/src/`, `scripts/` | route `DECLARES_SCHEMA`; handler `CALLS_SERVICE`; route `GUARDED_BY_AUTH`; UI `CALLS_ROUTE` | SvelteKit `+server.ts` exports, Zod schemas, Drizzle calls, endpoint tests | `api-route`, `ui-component`, `agent`, `database`, `retrieval` |
| Python | `python/`, `services/`, `docker/` | FastAPI route `IMPLEMENTS_OPERATION`; endpoint `VALIDATES_WITH` Pydantic model; handler `CALLS_PROVIDER` | OpenAPI operation, Pydantic request/response, route tests, sidecar route source | `api-route`, `retrieval`, `agent`, `graph` |
| Go | `services/go-*/` | HTTP/gRPC handler `IMPLEMENTS_OPERATION`; client `CALLS_SERVICE`; handler `READS/WRITES_STORE` | OpenAPI/proto method and Go handler/client symbols | `api-route`, `retrieval`, `database` |
| Proto | `services/*/proto/`, registered `.proto` files | RPC `DECLARES_METHOD`; request/response fields `SHAPE_OPERATION` | `.proto` service and method descriptors | `api-route`, `retrieval` |
| SQL | `drizzle/`, `sveltekit-frontend/src/lib/server/db/` | query `READS/WRITES_TABLE`; FK `REFERENCES`; index `SUPPORTS_QUERY` | SQL source, Drizzle table declaration, query-plan evidence when performance is claimed | `database`, `retrieval` |
| C / C++ | native bridge directories such as `simd-bridge/cpp/`, plus discovered tracked source paths | native function `EXPORTS_ABI`; bridge `CALLS_SYMBOL`; buffer `ENCODES_FORMAT` | header declarations, build target, FFI/Node binding, parity fixture | `symbol`, `retrieval`, `agent` |
| Rust | `services/rust-index-advisor/`, other discovered `src/` roots | CLI/API handler `IMPLEMENTS_OPERATION`; index advisor `CONSUMES_SCHEMA` | Rust route/command symbols, serde types, test invocation | `api-route`, `database`, `retrieval` |
| JSON / YAML / TOML | `.okf/`, root Compose files, service config directories | config/schema `CONFIGURES_SERVICE`; manifest `DECLARES_CONTRACT` | JSON Schema, OpenAPI, Compose/service configuration with revision | `api-route`, `agent`, `database`, `cache` |
| NDJSON | schema, fixture, and event producer/consumer directories; exclude generated logs from authority | producer `EMITS_EVENT`; consumer `SUBSCRIBES_EVENT`; envelope `VALIDATES_WITH` | event schema, topic, producer/consumer source and fixture | `agent`, `svelte-realtime`, `retrieval` |
| Markdown / text | `.okf/`, `docs/`, `packages/*/docs/` | documentation `DESCRIBES_OPERATION`; claim `DOCUMENTS_SYMBOL` | explicit link to exact API operation or source symbol plus doc revision | `general`, `api-route`; documentation is weaker evidence than executable source |
| HTML | SvelteKit `src/` and service-specific template directories | form/view `SUBMITS_TO_ROUTE`; rendered view `DISPLAYS_RESOURCE` | template/form action, UI route, browser test | `ui-component`, `evidence` |
| CSS | SvelteKit component/style directories and public assets | component `STYLES_STATE` only; no API relation by default | component selector/state class plus component source | `ui-component` |
| GLSL | no tracked `.glsl` source found | shader `CONSUMES_BUFFER`; kernel `WRITES_OUTPUT` only if source is added | shader binding declarations and dispatch contract | no label until a real shader/API path exists |
| CMake | root and native component build directories | build target `BUILDS_LIBRARY`; target `LINKS_DEPENDENCY` | CMake target graph and generated ABI artifacts | `symbol`, `agent` |
| Bash / PowerShell | `scripts/`, `.vscode/` task launchers, service directories | launcher `STARTS_SERVICE`; task `DEPENDS_ON_HEALTH`; script `USES_ENV_CONFIG` | task/launcher source, service health contract, bounded command receipt | `agent`, `api-route` |
| Java / Lua / binary | discovered tracked source; current inventory has one Java file and no Lua or GLSL files | profile-specific extraction only when source exists and parser output is qualified; otherwise abstain | language-specific AST/API schema or a declared binary format parser contract | no label by filename; use `general` only as non-authoritative fallback |

This covers the 23 current profiles: bash, binary, c, cmake, cpp, css, glsl, go, html, java, json, lua, markdown, ndjson, powershell, proto, python, rust, sql, text, toml, typescript, and yaml. Tracked source inventory contains no GLSL or Lua files, so those profiles currently have no observed code/API scenario. The table intentionally groups serialization/config formats where the relationship semantics are the same; the machine contract should still retain the exact language key.

## Feature labels and HMM readiness

The current shared feature-label registry has descriptive keys such as `api-route`, `ui-component`, `evidence`, `graph`, `database`, `retrieval`, `agent`, and `symbol`. These labels help route or describe evidence. They must not become task identity, authorization, numeric tensor inputs, or HMM probabilities by hashing label strings.

There are several distinct state machines; they must not be blended into one claimed HMM. `policy-types.ts` defines six policy states (`LOCATE`, `UNDERSTAND`, `TRACE`, `REPAIR`, `VALIDATE`, `RECOVER`), and `policy-pattern-extractor.ts` turns validated evidence into deterministic features/emission hints. `ace/state/hmm-state-estimator.ts` uses a separate nine-state vocabulary with hand-coded priors. `hmm-tool-selector.ts` is a deterministic rule-based MVP. `python/spatial_search_engine_v1.py` contains a Viterbi decoder, but the only discovered caller is its test. The `/hmm/viterbi` and `/hmm/baum-welch` client methods are not evidence that a sidecar endpoint is deployed; source comments defer production enablement. No compatible transition model, fit, calibration, production caller, or replay evaluation was established.

The API observation builder requires source/revision coordinates and has focused unit tests. The n-ary API bridge resolves participants against existing owners and emits a `PROPOSED` fact; it does not admit or persist it. A registry mismatch remains: these proposals use `API_CONTRACT_OBSERVED`, while `.okf/predicates/feature-relationships.yaml` currently registers eleven lower-case predicates and does not contain that key. The 12 uppercase relation kinds in the new procedure are proposal vocabulary; none map directly to the canonical registry as currently named. Treat these API relations as unadmitted until the predicate owner reconciles them. The adapter inventory is also not a complete operation catalog: route/proto copies and archived definitions require active/deprecated classification.

| Gate | Existing evidence | Missing for a trustworthy recommendation |
|---|---|---|
| Vocabulary | 23 `.okf/languages/*.yaml` profiles match the 23 declared profile references; 17-group taxonomy; descriptive label registry | Per-language extraction coverage is not measured; feature labels remain descriptive and require registry/revision binding |
| API description | Revision-qualified API observation contract and proposal-only n-ary bridge exist with focused specs | Build operation-level inventory and active/deprecated status; bind routes, RPCs, schemas, auth, errors, effects, timeouts, versions, source revisions |
| Relations | `.okf` registry contains eleven canonical predicates; API bridge emits `API_CONTRACT_OBSERVED` | Reconcile the unregistered predicate with its owner; do not admit mismatched proposals or infer edges from co-occurrence |
| HMM observations | Deterministic policy extractor emits evidence-derived feature/emission hints | Bind ordered observations to one state vocabulary and model revision; missing signals remain missing |
| HMM model | Multiple unrelated HMM/Viterbi-shaped helpers and a six-state policy vocabulary exist | Compatible transition/emission model, fit procedure, diverse revision-qualified corpus, frozen split, baseline, calibration, abstention threshold, production caller |
| Supervision | Policy training-row recorder/loader exists; domain classification proposal routes exist | Current local 96-row dataset has zero non-placeholder source revisions and only one state/action/model/budget/outcome. The runbook separately records 0 reviewed domain gold labels (`NO_GOLD_LABELS`) against a suggested trust floor of 200 rows and 30 per class |
| Taxonomy alignment | `.okf` taxonomy has 17 groups | Historical DB values had 41 distinct `domain_class` values, only 8 taxonomy values across 23,616 rows; historical predicted domain covered 4,412 rows, 4,384 labelled `utility`. These figures need a fresh read-only run before operational decisions. |
| Procedure | New schema/procedure pair is registered in `.okf/manifest.yaml`; AJV 2020 validation and YAML parsing pass | It is a shadow-only inventory contract, not a runtime runner. Cross-file validation now verifies profile paths, exact canonical predicate inventory, and that candidate relation kinds remain explicitly proposal-only |
| Execution authority | Separate agentic workflow has a decision stage and task-promotion gate | Keep recommendations `PROPOSED`; model rank must never claim/complete tasks or execute write-capable MCP tools by itself |

## Parameters the `.okf` procedure should require

The versioned shadow procedure now exists. Before wiring a runner, extend/keep its cross-file validation for the following minimum fields:

| Parameter group | Required fields / constraints |
|---|---|
| Procedure identity | `schema`, `procedure_id`, `procedure_revision`, `status`, `owner`, `created_from_source_revision`, checksum |
| Language applicability | exact language-profile key and revision; parser/version; include/exclude globs; unsupported-language behavior is `ABSTAIN` |
| API contract binding | `api_contract_id`, API revision, operation ID, transport, method/path or RPC name, request/response schema refs and revisions, auth scope, error contract, side-effect class, timeout/retry and rate limits |
| Relation policy | allowlisted typed predicates; source/target entity types; relation cardinality; evidence requirements; exact source span/hash; no title/path-only joins |
| Feature-label binding | registry key and registry revision; label is descriptive metadata; any numeric HMM input must be separately named, typed, bounded, and derived from validated evidence |
| Observation model | observation schema revision; observation timestamps/order; missing-value semantics; categorical/numeric emission definition; normalizer revision; provenance per observation |
| HMM model | model revision/checksum; state vocabulary; transition matrix revision; emission parameters; fit corpus revision; training/validation/test split IDs; baseline and calibration metrics |
| Decision policy | top-K cap; confidence threshold; margin threshold; abstain/quarantine rules; timeout/retry budget; unresolved evidence behavior |
| Recommendation output | stable run ID; candidate task/packet identity if present; source ref/revision; API operation ref/revision; relation evidence refs; state path; score/confidence; policy/model revisions; `status=PROPOSED`; `executionAuthorized=false` |
| Safety and audit | `canonicalAuthority=false`; explicit read/write effect; no task completion mutation; independent evidence validation; reproducible input checksum |

## Recommended procedural flow

1. **Discover contract:** identify the API operation from OpenAPI/proto/source, validate its request/response schema, and record exact source/document revisions.
2. **Extract language evidence:** parse only supported source under its `.okf/languages/<language>.yaml` profile. Emit exact symbols, spans, and structural relations; keep lexical matches as lower-confidence evidence.
3. **Bind label:** resolve the descriptive `feature_label` key to the shared registry revision. A label match narrows candidate procedures but cannot establish identity or authorization.
4. **Validate relation:** check predicate, endpoint types, source span/hash, API operation binding, and revision compatibility. Reject path-only or title-only joins.
5. **Build observations:** map qualified evidence to explicitly declared observation fields. Unknown/missing signals remain missing; do not synthesize defaults as observed values.
6. **Run shadow recommendation:** HMM/tool ranker emits bounded candidates plus the state path, evidence, model revision, and abstention reason. Deterministic rules remain the baseline oracle.
7. **Evaluate:** compare recommendations with reviewed outcomes using precision/recall@K, calibration, abstention, stale-source rejection, and decision latency. Keep one dataset split frozen by revision.
8. **Review and dispatch separately:** only a human or existing authorized task lifecycle can admit work. A recommendation score never writes a task status or creates a dependency.

## How far off are we?

| Dimension | Distance to next credible milestone |
|---|---|
| Container role/source map | Mostly inventoried. Need to reconcile the 26-container historical count to the grouped recent memory report; current Docker recovery is prerequisite to fresh state, memory, and startup measurements. |
| Language extraction | 23 declared profile paths match 23 current YAML files; per-language API relation quality and source coverage are not measured. |
| `.okf` recommendation procedure | Contract added and registered; schema, profile paths, registered predicate list, label keys, and source paths validate. Candidate relation kinds remain intentionally unmapped and unadmitted. |
| HMM recommendation | Early/prototype. Dataset is unusable for fitting as-is (96/96 placeholder source revisions, single state/action/outcome); compatible transitions, gold labels, frozen evaluation and production caller remain absent. |
| API-to-feature-label links | Observation/proposal owners exist; no complete operation catalog or admitted relation set. The emitted API predicate is absent from the canonical `.okf` predicate registry. |
| End-to-end readiness | Not proven. Next milestone: reconcile predicate ownership, then make a read-only inventory and assemble a reviewed, revision-qualified shadow cohort. Do not train from the current 96-row dataset or write canonical state. |

**Follow-up:** the procedure now declares all candidate relation kinds `PROPOSAL_ONLY`; its validator confirms the 23 profile paths, exact 11-predicate registry list, and 12 candidate kinds do not overlap by name. This closes the ambiguity about their current disposition, but it does not resolve the canonical semantic owner for `API_CONTRACT_OBSERVED` or make any proposal admissible. Validation output: `PASS: schema, manifest, 23 language profiles, 11 canonical predicates, 12 proposal-only relation kinds, 11 labels, 10 source refs, 96 policy rows; HMM disabled`.

**Overall:** the source-side inventory, observation/proposal owners, and disabled procedure contract now exist. A useful shadow pilot is still blocked by the API-predicate registry mismatch, missing operation-level catalog/review set, and unusable policy-training revisions. Trusted recommendations and autonomous execution remain substantially farther away.

## Next gates

1. Reconcile `API_CONTRACT_OBSERVED` with the canonical `.okf` predicate owner; do not admit those proposals until then.
2. Build a read-only API operation inventory from active OpenAPI, proto, route schemas and executable handlers; attach current source and contract revisions.
3. **Done for current shadow contract:** semantic validation confirms all 23 language refs exist and the 12 candidate relation kinds are explicitly proposal-only. Canonical relation mapping remains a separate owner decision.
4. Replace or quarantine policy rows whose source revisions are placeholders; collect varied, reviewed states/actions/outcomes before any fitting.
5. Keep all HMM execution disabled until one state vocabulary, model revision, baseline, calibration, abstention policy and production caller are proven.
6. Separately recover Docker/WSL through the human-operated procedure, then recollect actual containers, memory, startup time and readiness. Do not use old RAM data as current.

## Sources and limits

- `docs/reports/ram-savings-2026-11-10.md` — historical live RAM snapshot, startup path inventory, latest Docker/WSL failure diagnosis.
- `docs/reports/docker-image-usage-audit-v1.json` — dated 2026-09-20, read-only image retention audit; records 26 active containers then.
- `.okf/runbooks/okf-oak-domain-classification-cheatsheet.md` — dated domain and classification status; contains the 23/23 historical profile claim and zero-gold-label findings.
- `.okf/indexes/feature-intelligence.yaml` — canonical PostgreSQL and projection ownership; derived signals cannot self-promote.
- `.okf/schemas/language-profile-v1.schema.json` and `.okf/schemas/feature-relationships-v1.schema.json` — adjacent schema owners.
- `sveltekit-frontend/src/lib/server/retrieval/hmm-tool-selector.ts` and `sveltekit-frontend/src/lib/server/router/viterbi-router.ts` — current routing implementation boundaries.
- `sveltekit-frontend/src/lib/server/labels/feature-label-registry.shared.json` — descriptive feature-label registry.
- `sveltekit-frontend/src/lib/server/atlas/language/api-contract-observation-v1.ts` and `sveltekit-frontend/src/lib/server/atlas/graph/api-contract-nary-proposal-v1.ts` — revision-qualified observation and proposal-only relation owners with focused specs.
- `sveltekit-frontend/src/lib/server/atlas/policy/policy-pattern-extractor.ts` and `policy-training.ts` — deterministic observation/emission helper and training-row recorder; recorder presence is not a fitted model.
- `.okf/predicates/feature-relationships.yaml` — actual canonical predicate names; API proposal vocabulary currently differs.
- `.okf/schemas/hmm-api-recommendation-procedure-v1.schema.json` and `.okf/pipelines/hmm-api-recommendation-v1.yaml` — registered shadow-only procedure; HMM remains disabled.
- `scripts/atlas/validate-hmm-api-recommendation-procedure-v1.mjs` — repeatable schema, manifest, language, label, predicate, source-reference, authority, and dataset-snapshot validator.
- `scripts/atlas/agentic-recommendation-workflow.mjs` — multi-stage retrieval/rerank/synthesis and decision workflow; this review does not claim its live endpoints or full recommendation path are healthy.

Focused validation passed with `node scripts/atlas/validate-hmm-api-recommendation-procedure-v1.mjs`: YAML parses; AJV 2020 accepts the procedure against its JSON Schema; all 23 declared language-profile paths match the 23 files; all 11 referenced feature-label keys exist; the procedure's eleven canonical predicate names match the registry; all ten referenced source paths exist; and its local policy dataset counts match the 96 JSONL rows. The 12 proposed relation kinds have no direct canonical predicate mapping. `git diff --check` and a whitespace scan passed. Docker read-only inspection still fails because the Desktop engine pipe is absent. No live database, Qdrant, Valkey, NATS, model, container, or GPU operation was invoked.

### Additional source hashes for this reviewed procedure

These are SHA-256 hashes of the current working-tree bytes, not deployment or commit receipts:

| Source | SHA-256 |
|---|---|
| `.okf/manifest.yaml` | `06aa96755e34f38f8039e1e500093be42701637f3f8f6246e938028cb1b0e401` |
| `.okf/schemas/hmm-api-recommendation-procedure-v1.schema.json` | `506090b6d20f698ca4ad4a147195e0a7bef8b7b384844fe439f9ae74076e578a` |
| `.okf/pipelines/hmm-api-recommendation-v1.yaml` | `d6d18a4d0a97cdc3cc03b225fbeca449eb8b93adf1357f23dc65da96921064ad` |
| `.okf/predicates/feature-relationships.yaml` | `243dae1b3520655aa6a88ea60c9fa56ee83de3df5259347b367ff837d87028fd` |
| `scripts/atlas/validate-hmm-api-recommendation-procedure-v1.mjs` | `e5a1814c8c259e75e2d31e4ed2aeb78ee184fb3686704e2104ecbb06aa8548b6` |
| `sveltekit-frontend/src/lib/server/atlas/language/api-contract-observation-v1.ts` | `5fd4f57f85f7a4347d721cc96fc7b57f74af1936c7cd206fcaa237f3909c8e29` |
| `sveltekit-frontend/src/lib/server/atlas/graph/api-contract-nary-proposal-v1.ts` | `019e754fe7d081f7cfb9cc8d2cc38805add1de9dd29b983e2ce2e3997cfd2083` |
| `sveltekit-frontend/src/lib/server/atlas/policy/policy-pattern-extractor.ts` | `1ce875a35c316a2fb73bf9306dad33a05ac19f07c49595dc16576385fa2596cd` |
| `sveltekit-frontend/src/lib/server/atlas/policy/policy-training.ts` | `ee759aac1dc4754b66d2b0fd2e28f7de9a2a2ccb1729e12f3aadecaf3adeb535` |
