# Parent Atlas — Data Spine (implementation-ready)
Date: 2026-05-29

Purpose
-------
Concrete, implementation-ready plan that turns TypeScript/Drizzle schema + AST exports + outcome ledger into a deterministic Parent Atlas export, ready for DuckDB MapReduce audits and training-row generation for LoRA/tool-routing adapters.

Current contract order:
BM25 + concept activation -> spectra-g / Engram optional adapter ->
XGBoost formal reranker -> Neo4j contextual trees + HyperRAG packet RPC ->
Autoencoder / SOM latent topology -> native GEMM deferred.

Decision splits live in:
- `docs/atlas/xgboost-reranker-contract.md`
- `docs/atlas/native-gemm-deferral.md`

Design Principles (Caveman)
- Stable IDs first (SHA256 normalized keys)
- Schema bridge second (Drizzle → schema map JSONL)
- Offline joins third (JSONL → DuckDB hash joins)
- Training rows last (JSONL supervised rows for LoRA adapters)

Two-lane storage split
- Cold originals are immutable files and archives.
- Warm packets/cards are compact indexes that point back to the cold originals.
- Hot cache is only active task memory and recent retrieval state.
- Queue is work waiting to be processed, not source truth.
- Postgres is the truth table and packet registry.
- Qdrant is the semantic lookup layer with payload filters and ANN search.
- See also: [Dual-Lane Hot Brain, Cold Queue](</C:/Users/james/Videos/deeds-web-app/docs/architecture/dual-lane-hot-brain-cold-queue.md>)

Caveman architecture (compiler pipeline)
-------------------------------------------------
TypeScript/Drizzle schema
→ normalized sourceRefs
→ UUID/hash identity layer (sha256 + uuidv7)
→ JSONL exports (nodes/edges/cards/schema/drizzle-map/vectors)
→ DuckDB hash joins / audits
→ Postgres truth tables (write-only with --write)
→ Qdrant 768d semantics (seeded from vectors64.jsonl as a separate op)
→ Neo4j graph paths (produce edges.jsonl for import)
→ 64d autoencoder/SOM cold routing (offline transform)
→ LoRA/tool-routing training rows

ID rules (deterministic)
- `sourceRefId = sha256(normalize(sourceRef))`
- `symbolId    = sha256(sourceRefId + '|' + symbolName + '|' + lineRange)`
- `tableId     = sha256(schemaName + '|' + tableName)`
- `columnId    = sha256(tableId + '|' + columnName)`
- `cardId      = sha256(sourceRefId + '|' + graphVersion + '|' + cardKind)`
- `traceId`, `rewardId`, `trainingId` = `uuidv7()`

Normalization rules (sourceRef)
- Strip `file:` / `file://` schemes
- Convert backslashes → `/` and collapse `//`
- Lowercase for stable comparators
- Strip repo-root prefixes (e.g. remove leading `.*?src/` to `src/`)
- Keep anchors (line:col) out of ID; optional symbolIds include lineRange

Schema bridge (Drizzle → atlas map)
- Script: `scripts/atlas/export-drizzle-schema-map.mjs`
- Output record per table:
  {
    "table": "glyph_records",
    "tableId": "sha256:...",
    "columns": [ { "name":"source_ref", "columnId":"sha256:...", "type":"text", "usedByFiles": [] } ]
  }
- Use Drizzle TypeScript schema as canonical source; emit deterministic `tableId`/`columnId` using sha256 of canonical names.

AST → Edge emissions (dry-run)
- File/Symbol → `CALLS` → Symbol
- File/Symbol → `USES_DB` → Table/Column (emit `tableId`/`columnId`)
- File/Symbol → `USES_TOOL` → MCP Tool id/name
- SourceRef → `HAS_EMBEDDING` → Qdrant point ref
- SourceRef → `HAS_REWARD` → outcome ledger row id(s)

Scripts (implement these; dry-run default)
1. `scripts/atlas/export-drizzle-schema-map.mjs` — read Drizzle schema, write `memory/exports/atlas/drizzle-schema-map.jsonl`.
2. `scripts/atlas/normalize-source-ref-id.mjs` — normalize sourceRefs and write `sourceRefs.jsonl` with `sourceRefId` (sha256).
3. `scripts/atlas/build-parent-atlas-export-bundle.mjs` — aggregate nodes/edges/cards/schema/vectors into `memory/exports/atlas/*`.
4. `scripts/atlas/duckdb-parent-atlas-audit.mjs` — run DuckDB SQL audits (unmatched sourceRefs, reward gaps, uses-db coverage), write `.tmp/parent-atlas.duckdb`.
5. `scripts/atlas/build-training-rows-dry-run.mjs` — join ledger+cards+uses-db → produce `training-rows.jsonl` (positive/negative examples), no writes by default.

DuckDB JSONL flow (practical)
Files (inputs)
- `nodes.jsonl` (cards, files, symbols) — must include `sourceRefId`/`cardId` fields
- `edges.jsonl` (CALLS, USES_DB, USES_TOOL) — include `fromId`, `toId`, `edgeType`
- `drizzle-schema-map.jsonl` — table/column ids
- `outcome-ledger.ndjson` — ledger rows enriched with `sourceRefId`
- `qdrant-export.jsonl` (optional) — pointId → sourceRefId mapping
- `vectors64.jsonl` (optional) — 64-d vectors for SOM

Example DuckDB jobs (commands)
Create DB and import JSONL (relative paths):
```bash
duckdb memory/exports/atlas/parent-atlas.duckdb \
  -c "CREATE TABLE ledger AS SELECT * FROM read_ndjson('.opencode/outcome-ledger.enriched.jsonl');\
        CREATE TABLE cards  AS SELECT * FROM read_ndjson('memory/exports/atlas/nodes.jsonl');"
```

Find ledger rows with no card (unmatched sourceRefs):
```sql
SELECT l.sourceRefs, l.sourceRefId, count(*) AS cnt
FROM read_ndjson(' .opencode/outcome-ledger.enriched.jsonl') l
LEFT JOIN read_ndjson('memory/exports/atlas/nodes.jsonl') c
  ON l.sourceRefId = c.cardIdHash
WHERE c.cardIdHash IS NULL
GROUP BY l.sourceRefs, l.sourceRefId
ORDER BY cnt DESC;
```

Find files that touch DB tables (USES_DB):
```sql
SELECT f.sourceRef, d.table, d.column
FROM read_ndjson('memory/exports/atlas/uses-db.jsonl') d
JOIN read_ndjson('memory/exports/atlas/sourceRefs.jsonl') f
  ON d.sourceRefId = f.sourceRefId;
```

Training row consolidation (LoRA-ready)
- Canonical training row shape (JSONL):
```json
{
  "trainingId":"uuidv7()",
  "sourceRefId":"sha256:...",
  "task":"tool_routing",
  "input":"<context packet>",
  "expected_tool":"semantic_search",
  "positive_sourceRefs":["sha256:..."],
  "negative_sourceRefs":[],
  "graph_path":[],
  "db_tables":[],
  "reward":0.82,
  "embedding768_ref":"qdrant:codebase_chunks_768:pointId",
  "vector64":[],
  "adapter_tag":"atlas-tool-router-lora"
}
```

Offline MapReduce / hash-join lane (rules)
- Always enrich JSONL with deterministic IDs before joins (`normalize-source-ref-id.mjs`).
- Prefer hash-join on `sourceRefId` or `cardIdHash` (sha256) instead of free-text paths.
- Use suffix heuristics only as a fallback; log ambiguous matches to `.tmp/ambiguous-suffix-examples.jsonl`.
- Dry-run mode must be default; write-mode requires `--write` explicit flag.

Postgres / Qdrant / Neo4j responsibilities
- Postgres: durable truth, partitioned tables (`outcome_ledger`, `chunk_hit_log`, `summary_cards`). Write via controlled migration or `--write` path.
- Qdrant: 768d retrieval store (collection: `codebase_chunks_768`). Seeded from `vectors64.jsonl`/`qdrant-export.jsonl` via separate command — do not write from these scripts.
- Neo4j: graph path proofs; export `edges.jsonl` for manual/controlled import.
- spectra-g / Engram remains optional and fail-open; it is an adapter surface, not canonical storage.
- XGBoost is the formal reranker contract for retrieval ordering; keep side-channel hotness scoring parallel only.
- Native GEMM stays deferred until the reranker and signal-quality gates justify activation.
- Adapter boundary note: TurboVec, LlamaIndex, LangChain, and LangGraph remain adapters only; durable writes must go through promotion queues and bounded apply gates.

Acceptance criteria
- `sourceRefId` stability: same normalized sourceRef → same sha256 across runs.
- Drizzle `tableId` / `columnId` deterministic and present in `drizzle-schema-map.jsonl`.
- `USES_DB` joins connect files/symbols → `tableId`/`columnId` in `uses-db.jsonl`.
- `outcome-ledger` rows join to cards via `sourceRefId` in dry-run outputs.
- `training-rows.jsonl` includes positive & negative examples and `uuidv7()` `trainingId`.
- No external DB/vector writes unless `--write` is passed.

Next actions (recommended)
1. Implement `scripts/atlas/export-drizzle-schema-map.mjs` (Drizzle schema → JSONL).
2. Implement `scripts/atlas/normalize-source-ref-id.mjs` and run across all inputs.
3. Build `memory/exports/atlas/*` bundle using `build-parent-atlas-export-bundle.mjs` (dry-run).
4. Run `duckdb-parent-atlas-audit.mjs` to identify unmatched refs, ambiguous suffixes, and generate `training-rows.jsonl` dry-run.
5. Iterate: resolve ambiguousExamples, then consider guarded `--write` step to Postgres/Qdrant/Neo4j if required.

Appendix: quick command set
```bash
# enrich JSONL with stable IDs
node scripts/atlas/normalize-source-ref-id.mjs .opencode/outcome-ledger.ndjson .opencode/outcome-ledger.enriched.jsonl

# build parent atlas bundle (dry-run)
node scripts/atlas/build-parent-atlas-export-bundle.mjs --dry-run

# run duckdb audits and produce training rows (dry-run)
node scripts/atlas/duckdb-parent-atlas-audit.mjs --input memory/exports/atlas --out .tmp/parent-atlas.duckdb

# produce training JSONL
node scripts/atlas/build-training-rows-dry-run.mjs --input memory/exports/atlas --out memory/exports/atlas/training-rows.jsonl
```

Contact
-------
If you want, I can scaffold the five scripts above now and run the normalize + DuckDB audit (dry-run). Which step should I scaffold and run first?
