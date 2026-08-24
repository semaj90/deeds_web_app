# OpenSpec: Parent Atlas OKF Knowledge Layers — PARENT_ATLAS_KNOWLEDGE_GAP_AUDIT_V1

Scope is the first bounded slice only (see proposal.md "What Changes"). Do not
start concept/hyperedge modeling, the synthesis-mapping ledger, the full
recommendation engine, or Deep Agents integration under this task list.

## Implementation evidence — 2026-08-14

- [x] Added the read-only ownership scanner
  `scripts/atlas/audit-okf-library-ownership.mjs` and command
  `npm run atlas:okf:library:audit`.
- [x] Added the separate read-only runtime ownership scanner
  `scripts/atlas/audit-okf-runtime-ownership.mjs` and command
  `npm run atlas:okf:runtime:ownership`. It classifies canonical owners,
  derived views, runtime executors, projections, cache, recommendations, and
  optional orchestration/documentation surfaces without promoting any owner.
- [x] Produced `docs/reports/okf-library-ownership.json` and `.md` after
  scanning 26,408 executable/source files and 2 package manifests.
- [x] The scan identified `Deep Agents` as `MISSING`; `tree-sitter`,
  `ast-grep`, `OpenWiki`, and `cuGraph` as `IMPORTED_UNPROVEN`. Other rows are
  heuristic `WIRED_CANDIDATE` evidence only, not promotion to canonical
  ownership. A source-line scanner cannot prove runtime invocation, output
  consumption, persistence, or production reachability.
- [x] Scanner bug fixed before final run: documentation/configuration files and
  audit scripts were excluded, and imports now require same-line import/use
  evidence. No packages were installed and no runtime endpoints were called.
- [x] Added the cross-domain OKF contract owner
  `sveltekit-frontend/src/lib/server/atlas/contracts/okf-cross-domain-v1.ts`.
  It defines revisioned domain classification, a derived 4×6 feature envelope,
  and evidence-linked recommendations without replacing the existing
  classification envelope, FeatureMatrix5/FeatureMatrixRowV1, or Kanban owner.
- [x] Extended the existing ontology-linked tuple contract with relation
  revision, optional source span, and explicit `OBSERVED | DERIVED |
  SUPERSEDED` lifecycle. This remains evidence/provenance, not canonical
  identity or retrieval truth.
- [x] Added focused contract coverage in
  `sveltekit-frontend/src/lib/server/atlas/contracts/okf-cross-domain-v1.spec.ts`.
  The focused lane-contracts run passed 4 tests. This proves schema behavior
  only; it does not prove production callers, persistence, or runtime library
  ownership.

## Slice 1 — OKF validation + gap export

- [ ] Validate existing `.okf/` files against OKF v0.2 (provenance, trust, lifecycle fields present and well-formed).

  **Partial finding (2026-08-24, read-only, no validator built yet)**: checked
  what actually exists before writing a validator. `.okf/manifest.yaml`
  declares itself `version: 2` and registers 5 domain schemas under
  `registries.domains.schemas` (`retrieval.yaml`, `cache.yaml`,
  `database.yaml`, `feature-intelligence.yaml`, `parent-atlas-execution.yaml`)
  but `.okf/domains/` only actually contains 3 files
  (`feature-intelligence.yaml`, `parent-atlas-execution.yaml`,
  `structured-value.yaml`) — `retrieval.yaml`, `cache.yaml`, `database.yaml`
  are declared but absent, and `structured-value.yaml` exists but isn't
  declared in the manifest. Manifest/filesystem drift, both directions.

  Of the 3 files that exist, all three declare `version: 1` (not `v0.2`,
  and inconsistent with the manifest's own `version: 2`), all three have
  `status:`, but only `structured-value.yaml` has any `provenance:` field
  (line 55) — `feature-intelligence.yaml` and `parent-atlas-execution.yaml`
  have none. **No file anywhere in `.okf/` has a `trust:` or `lifecycle:`
  field** (checked all 3 domain files plus `manifest.yaml` and `index.md`).

  **This blocks writing an actual validator, not just running one that
  doesn't exist yet**: "OKF v0.2" (an internal framework name — "OpenSpec
  Knowledge Framework" per `manifest.yaml`'s own header comment, not an
  external standard) is referenced by this proposal/design/tasks file as
  requiring "provenance, trust, lifecycle fields," but no file in this repo
  enumerates what those fields must actually contain to pass validation —
  there is no v0.2 spec document to validate against, only the phrase. A
  validator built now would have to invent the required schema itself,
  which is a spec decision (same class of decision this repo's own rules
  say shouldn't be made unilaterally — e.g. the LVG-2/LVG-10/11 pattern in
  `parent-atlas-live-graph-proof/tasks.md`), not a mechanical check.

  Not yet done: writing the actual OKF v0.2 field spec (what must
  `provenance`/`trust`/`lifecycle` contain, using `structured-value.yaml`'s
  existing `provenance:` block, if suitable, as a starting template rather
  than inventing from nothing) — needs an explicit decision before a real
  validator can be built; reconciling the manifest/filesystem drift found
  above (5 declared vs. 3 present domain schemas).
- [ ] Write 6 OKF gap concept files, one per known repo gap (domain lineage, concept edge ledger, representation fragmentation, topology schema drift, cluster run lineage, SOM run lineage), each evidence-linked to a real file/table/line, `status: NOT_PROVEN`, no fabricated claims.
- [ ] Validation: OKF validator run against the 6 new files reports 0 schema errors.

### OKF / telemetry / ontology-linked tuple boundary

This is a contract note for Slice 1. It does not create a new owner.

- `timestamp`: provenance only.
- `HyperLogLog`: telemetry only. Use it for approximate breadth counts such as distinct workflows,
  symbols, users, packets, and retrieval neighborhoods. Do not use it to decide eviction or
  canonical cache truth.
- `OntologyLinkedTuple`: evidence layer only. Keep it as `subject / predicate / object / evidenceRef`
  with explicit `sourceRevision`, `representationRevision`, and producer revision fields. It is a
  linked evidence record, not semantic truth.
- `DomainClassification`: OKF / taxonomy lane. Use it for domain labels and ontology navigation.
- `Low-rank sampling`: retrieval / approximation experiment only. Keep Tang-style sketching with the
  retrieval LOD / algorithm taxonomy lane, not the ontology lane.

Suggested field list:

```ts
type OntologyLinkedTuple = {
  subject: string;
  predicate: string;
  object: string;
  evidenceRef: string;
  timestamp: string;
  sourceRevision: string;
  representationRevision: string;
  producerId: string;
  producerRevision: string;
  domainClass?: string;
};

type TelemetryBreadth = {
  packetKey: string;
  workflowHllKey?: string;
  symbolHllKey?: string;
  userHllKey?: string;
  neighborhoodHllKey?: string;
  countedAt: string;
};
```

## Slice 2 — Library integration scanner (read-only)

- [x] Build a read-only script that walks package manifests + executable/source imports for a fixed candidate list (tree-sitter, ast-grep, ts-morph, LangExtract, Deep Agents, LangChain, LangGraph, OpenWiki, Neo4j GDS, cuGraph, cuVS, TurboVec, Langfuse, OpenTelemetry, Mastra, PostgreSQL AIO, pgvector, bitmap indexes, Valkey, and Kanban recommendations).
- [x] For each: record declared/imported/invoked/output-consumed/output-persisted evidence and endpoint hints. Resolved package versions and live reachability remain separate follow-up gates.
- [x] Classify conservatively with `WIRED_CANDIDATE | INSTALLED_UNUSED | IMPORTED_UNPROVEN | MISSING | CAPABILITY_EVIDENCE_ONLY | NOT_PROVEN`.
- [x] Output one JSON + Markdown report without package installation or runtime mutation. Heuristic `WIRED_CANDIDATE` rows are not canonical-owner promotion.

## Slice 3 — Mock/stub candidate detection

- [ ] Static pass: `rg` for `TODO|NOT_IMPLEMENTED|throw new Error.*not implemented|Math\.random.*(mock|stub|simulate|placeholder|demo)`.
- [ ] AST-context classification per hit: test fixture (acceptable) / demo-flag-gated mock (acceptable, labeled) / unlabeled synthetic production response (flag) / throwing stub (flag) / unreferenced stub (flag).
- [ ] LLM used only to summarize post-static+runtime findings — never as sole verdict source.
- [ ] Output: one JSON + Markdown report.

## Slice 4 — atlas_work_items design + fixture

- [ ] Draft `atlas_work_items` + `atlas_work_item_evidence` Drizzle schema (design only — do not apply/migrate yet).
- [ ] Repository-only fixture (in-memory or local test DB) proving the shape round-trips: insert one gap-backed work item + one evidence row, read back.
- [ ] Do NOT apply this migration against the live database in this slice.

## Slice 5 — Kanban issues + recommendations + OpenWiki review page

- [ ] From slices 1–3's findings, generate one Kanban issue per evidence-backed gap (using the slice-4 fixture, not live Postgres, until the migration is separately approved).
- [ ] One recommendation per issue, each citing required evidence + prohibited changes + acceptance gates.
- [ ] Install OpenWiki; configure its generated-wiki output directory separate from `docs/okf/parent-atlas/` (hand-authored/canonical).
- [ ] OpenWiki synthesizes exactly one review page summarizing this audit — verify it does not scan `.env`, secrets, model binaries, raw Qdrant vectors, or unbounded logs.

## Slice 6 — Cross-domain OKF schema boundary (planning/audit only)

This slice defines the OKF envelope and ownership matrix; it does not promote
any library, database feature, model, or accelerator into a canonical owner.

- [x] **OKF-06.1 Domain classification envelope** Define a revisioned
  `DomainClassificationV1` for `document`, `file`, `feature`, `symbol`, and
  `task` subjects. It must carry `subjectRef`, `domainId`, `taxonomyRevision`,
  `confidence`, `evidenceRefs`, `sourceRevision`, `producerId`, and
  `producerRevision`. Domain labels navigate and group evidence; they do not
  become `symbol_id`, `packet_key`, or retrieval truth.
- [x] **OKF-06.2 Ontology-linked tuple envelope** Extend the existing tuple
  boundary with typed subject/object kinds, relation revision, evidence span or
  source reference, and lifecycle (`OBSERVED | DERIVED | SUPERSEDED`). Keep
  n-ary process/document/feature relationships as explicit hyperedge evidence;
  do not flatten them into fake binary symbols.
- [x] **OKF-06.3 Feature mapping envelope** Define one derived
  `FeatureMatrixRowV1` mapping for the current 4×6 experimental feature grid:
  four feature families by six derived values, each with `featureId`,
  `featureRevision`, `subjectRef`, `ontologyRefs`, `value`, `coverage`, and
  provenance. Reuse the existing feature-matrix owner; do not create a second
  semantic envelope or identity schema.
- [ ] **OKF-06.4 Document/file derivation graph** Specify how a document,
  packet, source file, symbol, related file, feature row, and ontology tuple
  connect through evidence references. Derived relationships must be
  replayable from canonical Postgres/Graphify records and must not be inferred
  solely from a cluster label or embedding similarity.

  **Spot-check (2026-08-24, read-only)**: verified OKF-06.1/06.2/06.3's `[x]`
  marks are backed by real code, not just checked off in this file —
  `DomainClassificationV1Schema`
  (`sveltekit-frontend/src/lib/server/atlas/contracts/okf-cross-domain-v1.ts:22`)
  has exactly the fields OKF-06.1 specifies (`subjectRef`, `domainId`,
  `taxonomyRevision`, `producerId`, confirmed by grep against the live file).
  Confirmed OKF-06.4 by contrast has **no** corresponding envelope anywhere:
  searched `sveltekit-frontend/src/lib/server/atlas/contracts/` for
  `DocumentDerivationGraph`/`DerivationGraphV1`/similar — zero matches. The
  `[ ]` here is accurate, not stale.
- [x] **OKF-06.5 Runtime ownership matrix** Classify LangChain, Deep Agents,
  LangGraph, OpenWiki, PyTorch, PostgreSQL AIO, bitmap/table indexes, pgvector,
  Qdrant, Neo4j, Valkey, and the agentic Kanban board as
  `ORCHESTRATOR | DOCUMENTATION | COMPUTE_EXECUTOR | CANONICAL_TRUTH |
  PROJECTION | CACHE | RECOMMENDATION_SURFACE`. The static scanner is complete;
  live invocation, output consumption, persistence, and endpoint reachability
  remain separate proof gates.
- [x] **OKF-06.5a Frontend dependency and admin smoke review** Svelte 5,
  SvelteKit 2, `drizzle-orm`, and `drizzle-kit` are declared and installed;
  `drizzle-kit check` passes; `/admin` rendered with HTTP 200, the expected
  `System Overview` heading, and zero browser console errors. This proves the
  local dependency/render lane only; it does not promote OKF runtime ownership
  or prove durable work-item persistence. Evidence:
  `docs/reports/okf-sveltekit-admin-smoke.json` and `.md`.
- [x] **OKF-06.6 Recommendation linkage** Define a recommendation record that
  references one or more OKF evidence IDs, Graphify receipts, feature rows,
  and acceptance gates. Recommended work may create or update a Kanban task,
  but it may not mutate canonical graph, packet, ontology, vector, or cache
  truth without an independently approved apply path.
- [ ] **OKF-06.7 Storage/index boundary** Record PostgreSQL/pgvector as
  canonical or durable derived storage only where an existing owner proves it;
  record bitmap/table indexes as query accelerators with explainable filter
  parity; record PyTorch/AIO as compute/I/O capabilities, not schema owners.
- [ ] **OKF-06.8 Agent/document boundary** Treat LangChain/Deep Agents as
  optional orchestration, OpenWiki as a generated review surface, and the
  Kanban agent as a recommendation/execution coordinator. None may write
  canonical truth directly; all durable changes require promotion receipts.
- [ ] **OKF-06.9 Schema proof** Validate representative document, file, feature,
  tuple, cluster, and recommendation fixtures with stable IDs, revision
  changes, missing-evidence statuses, and supersession behavior. Produce one
  JSON/Markdown receipt with `CREATED`, `WIRED`, `PROVEN`, and `DONE` states.

### Current classification for this slice

| Capability | Current boundary | Status |
| --- | --- | --- |
| PostgreSQL / canonical identities and revisions | truth owner | PROVEN by existing architecture; version/AIO runtime probe pending |
| pgvector / table and bitmap indexes | derived/query acceleration | capability exists; parity proof pending |
| PyTorch | compute executor | separate GPU/runtime proof required |
| LangChain / Deep Agents / LangGraph | optional orchestration | not a canonical owner; integration audit pending |
| OpenWiki | generated documentation/review surface | not a truth owner; safe output boundary pending |
| Feature matrix 4×6 | derived feature projection | schema/coverage proof pending |
| Domain classification / ontology tuples | OKF evidence/navigation | tuple lifecycle and revision proof pending |
| Kanban recommendations | advisory coordination | evidence-linked fixture/promotion proof pending |

### Current gaps after contract implementation

- The new contracts are `CREATED` and focused-test `PROVEN`; they are not yet
  `WIRED` to a durable Postgres work-item/evidence schema or a live agent loop.
- The existing production feature owner remains the five-column
  `FeatureMatrix5`/`FeatureMatrixRowV1` path. The 4×6 envelope is a derived OKF
  mapping and must not be used to create a second feature-matrix identity or
  vector schema.
- LangChain and LangGraph are only heuristic `WIRED_CANDIDATE` evidence from
  the read-only scanner. Deep Agents is `MISSING`; no promotion or package
  install is authorized by this OpenSpec.
- OpenWiki is `IMPORTED_UNPROVEN` and remains a generated review surface. It
  has no approved canonical-data ingestion path.
- PostgreSQL AIO, pgvector, bitmap/table indexes, PyTorch, Qdrant, Neo4j, and
  Valkey still require owner-specific runtime/persistence/parity receipts.
- Domain classification, tuple lifecycle, feature mapping, and
  recommendation schemas do not prove semantic embedding, sparse BM42,
  TurboVec/CAGRA, PageRank, or agent execution behavior.

## Explicitly deferred (do not start)

- Concept/hyperedge modeling (`KnowledgeHyperedge`, `OkfSynthesisMapping`).
- Full gap-detector capability matrix (Declared/Implemented/Runtime/Persisted) beyond the 6 known gaps above.
- Recommendation engine automation beyond the fixture in Slice 4.
- Applying `atlas_work_items` migration to live Postgres.
- Deep Agents / LangGraph agent-runtime wiring.
- Direct OpenWiki ingestion of secrets, raw vectors, or unbounded repository logs.
- Treating PostgreSQL AIO, bitmap indexes, pgvector, or PyTorch as new canonical
  schema owners.
