# OpenSpec: Parent Atlas OKF Knowledge Layers — PARENT_ATLAS_KNOWLEDGE_GAP_AUDIT_V1

Scope is the first bounded slice only (see proposal.md "What Changes"). Do not
start concept/hyperedge modeling, the synthesis-mapping ledger, the full
recommendation engine, or Deep Agents integration under this task list.

## Slice 1 — OKF validation + gap export

- [ ] Validate existing `.okf/` files against OKF v0.2 (provenance, trust, lifecycle fields present and well-formed).
- [ ] Write 6 OKF gap concept files, one per known repo gap (domain lineage, concept edge ledger, representation fragmentation, topology schema drift, cluster run lineage, SOM run lineage), each evidence-linked to a real file/table/line, `status: NOT_PROVEN`, no fabricated claims.
- [ ] Validation: OKF validator run against the 6 new files reports 0 schema errors.

## Slice 2 — Library integration scanner (read-only)

- [ ] Build a script that walks package manifests + lockfiles + source imports for a fixed candidate list (tree-sitter, ast-grep, ts-morph, LangExtract, Deep Agents, LangChain, LangGraph, OpenWiki, KafkaJS, Debezium, Neo4j GDS, cuGraph, cuVS, TurboVec, Langfuse, OpenTelemetry, Mastra).
- [ ] For each: record declared/resolved version, imported (bool), invoked (bool), output consumed (bool), output persisted (bool), runtime endpoint if any.
- [ ] Classify: `WIRED | INSTALLED_UNUSED | IMPORTED_UNPROVEN | MISSING | MOCKED | STUBBED | BROKEN`.
- [ ] Output: one JSON + Markdown report, no code changes.

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

## Explicitly deferred (do not start)

- Concept/hyperedge modeling (`KnowledgeHyperedge`, `OkfSynthesisMapping`).
- Full gap-detector capability matrix (Declared/Implemented/Runtime/Persisted) beyond the 6 known gaps above.
- Recommendation engine automation beyond the fixture in Slice 4.
- Applying `atlas_work_items` migration to live Postgres.
- Deep Agents / LangGraph agent-runtime wiring.
