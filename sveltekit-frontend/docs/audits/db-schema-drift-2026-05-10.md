# DB Schema Drift Audit — 2026-05-10

**Method**: `docker exec legal-ai-postgres psql` introspection of live `legal_ai_db` (port 5434 via proxy) vs Drizzle declarations across `src/lib/server/db/schema-postgres.ts`, `schema/*.ts`, `schema-evidence-crud.ts`, `schema-chat.ts`, `schema-phase89-preserved.ts`.

**Counts** (top-line):

| Bucket | Count |
|---|---|
| Tables declared in Drizzle | 258 |
| Tables present in live DB | 247 |
| Declared in Drizzle, MISSING in DB | **61** |
| Present in DB, NOT in Drizzle | **50** |
| In both | 197 |
| DB-only tables protected by `tablesFilter` | 0 |
| DB-only tables WOULD-BE-DROPPED by `drizzle-kit generate` | **50** ⚠️ |

---

## 1. Tables — DB-only, NOT covered by `tablesFilter` (DELETION RISK ⚠️)

These 50 tables exist in production but neither Drizzle declares them nor `drizzle.config.ts` `tablesFilter` excludes them. Running `drizzle-kit generate` today would emit `DROP TABLE` for each.

```
ace_chunks                       ace_context_sources       ace_docs
ace_hit_logs                     ace_sources               admin_model_weights
admin_telemetry                  agent_actions             agent_context_files
agent_context_files_history      agent_context_relations   auto_tags
case_statute_links               chat_document_attachments citation_collections
code_relations_v1                code_retrieval_chunks     collection_citations
directory_context_bindings       document_topics           embedded_summaries
feature_dependency_edges         file_hotness_scores       file_summaries
fix_attempts                     fixer_patterns            fixer_run_log
hypergraph_edge_members          indexing_jobs             model_weights
poi_photos                       poi_relationships         report_audit_log
report_versions                  screenshot_artifacts      statute_chunks
symbol_runtime_stats             taxonomy_edges            taxonomy_nodes
timeline_events                  trace_events              trace_runs
user_interaction_history         vault_md_index            vault_md_join
warden_audit_log                 warden_chunks             warden_citation_graph
warden_citations                 warden_evidence
```

**P0 action required**: extend `drizzle.config.ts` `tablesFilter` to either (a) include declarations for these (preferred for ones the app uses) or (b) exclude them from drizzle-kit's view via `'!table_name'` (preferred for legacy/historical).

Investigation priority by likely importance:
| Table | Likely owner | Recommendation |
|---|---|---|
| `ace_chunks`, `ace_context_sources`, `ace_docs`, `ace_hit_logs`, `ace_sources` | ACE pipeline | **Declare in Drizzle** — these are active; the codebase reads them |
| `case_statute_links` | Legal case lookup | **Declare in Drizzle** — exists in schema/legal-cases.ts but maybe under a different name |
| `agent_context_files`, `agent_context_files_history`, `agent_context_relations`, `directory_context_bindings` | AGENTS.md spine (per MEMORY.md) | **Declare in Drizzle** — these are the spine documented in CLAUDE.md |
| `vault_md_index`, `vault_md_join` | Obsidian vault join layer (per MEMORY.md hypergraph doc) | **Declare in Drizzle** |
| `embedded_summaries` | RAPTOR / summary layer | **Declare in Drizzle** |
| `warden_*` (5 tables) | Warden subsystem | Investigate — possibly legacy, may need `!warden_*` filter |
| `fixer_*`, `fix_attempts` | Error-fix loop | **Declare in Drizzle** if active, else filter |
| `trace_events`, `trace_runs` | MCP trace observability | **Declare in Drizzle** |
| `taxonomy_*`, `auto_tags`, `feature_dependency_edges` | Tagging / feature graph | **Declare in Drizzle** |

---

## 2. Tables — Drizzle declares but MISSING in DB (silent runtime failure risk)

These 61 tables would 500-error any route that queries them. Sample top-40:

```
ace_retrieval_hits            ace_retrieval_runs           ai_chat_sessions
ai_memory                     ai_models                    ast_edges
ast_file_features             ast_nodes                    auto_approval_rules
case_assignments              case_chunks                  case_timeline
cases_jsonb                   charges                      code_llm_index
codebase_audit_events         community_reports            context_buffers
conversations                 document_relationships_jsonb embedding_cache_enhanced
error_brain_analysis          error_brain_diffs            error_cluster
error_sessions                evidence_chain_of_custody    evidence_jsonb
generated_fixes               gpu_cluster_centroids        ingested_documents
kb_provenance_graph           legal_documents_jsonb        memory_gain_audits
messages                      metadata_envelopes           ocr_processing_queue
predictive_todos              prosecutor_case_persons      prosecutor_cases
prosecutor_evidence
```

**Note**: many of these `_jsonb` suffixes (cases_jsonb, evidence_jsonb, legal_documents_jsonb) suggest a planned JSONB-envelope variant of existing tables that was declared but never migrated. The `prosecutor_*` triplet may be planned schema-renames.

**P1 action**: for each, classify as:
- **stub** — code path never reaches the table; remove the Drizzle declaration
- **planned** — pending migration to actually create the table
- **renamed** — table got renamed in DB; update Drizzle to match
- **route-blocker** — actively breaking a route; needs immediate migration

A focused route-grep for each table would surface the route-blockers. Recommend: `npm run audit:dirs` with a per-table search filter.

---

## 3. Schema drift items ALREADY closed this session

Captured in commits `230d084fef..783f3a6b25`:

| # | Item | Resolution | Commit |
|---|---|---|---|
| 1 | `cases.user_id` column missing | `ALTER TABLE cases ADD COLUMN user_id uuid` | `230d084fef` |
| 2 | `evidence.uploaded_by` uuid→integer coercion | Route-side `Number()` coercion in `/api/evidence/upload/+server.ts` | `230d084fef` |
| 3 | `admin_ai_chat_sessions.context_tag` + `active` columns | Migration `20260510_admin_ai_chat_sessions_columns.sql` + partial unique index | `32194c3c91` |
| 4 | `statutes.section` + `category` + `source_url` columns | Migration `20260510_statutes_missing_columns.sql` | `4fc5fbd4cb` |
| 5 | `crimes` table created | Migration `20260510_crimes_table.sql` | `e54bc0850e` |
| 6 | `raw_error_embeddings.file_path` (route was wrong) | Route rewritten to use `metadata->>'file_path'` JSONB pattern | `e54bc0850e` |
| 7 | `admin_raptor_summaries` table created | Migration `20260510_admin_raptor_summaries.sql` | `e00a4dbf3a` |
| 8 | `legal_documents.jurisdiction` column | Migration `20260510_legal_documents_jurisdiction.sql` | `e061beb5c1` |

---

## 4. CRITICAL — unresolved type-mismatch FK pairs

**`cases.user_id` is `uuid` but `users.id` is `integer`** — fundamental identity-system mismatch. Per `master_agents.md` §"Session 2026-05-10", 24 tables follow the `uuid` pattern and ~16 follow `integer`. Mixed. No formal FK constraint enforces this anywhere because the types can't match.

This is the **dominant blocker** for clean Drizzle-kit operations going forward. Resolution paths (recommend ONE — operator decides):

| Path | Effort | Risk |
|---|---|---|
| **A. Migrate all to integer** | Touches 24 tables, requires data migration if any rows exist | Medium — rows likely empty in dev DB, prod unknown |
| **B. Migrate all to uuid** | Touches 16 tables incl. `users.id` (touches all FKs) | High — Lucia v3 sessions + auth code expects current shape |
| **C. Two-tier identity** | Add `users.uuid uuid` alongside `users.id integer`; new tables FK on uuid, legacy stays on id | Medium — keeps both, adds complexity |
| **D. Defer forever** | Continue case-by-case coercion (`Number()` in routes) | Low effort but tech-debt accrues |

Currently operating at **Path D** by accident. No formal decision documented.

---

## 5. Indexes — sample spot-check

Confirmed present (created via raw SQL sidecar migrations, NOT auto-generated by drizzle-kit because operator-class clauses aren't expressible in Drizzle):

```
idx_codebase_chunk_summary_embedding_ivfflat  (halfvec_cosine_ops)  ✅
idx_cluster_summaries_embedding_ivfflat       (vector_cosine_ops)   ✅
idx_codebase_chunk_semantic_tags_gin          (gin)                 ✅
idx_codebase_chunk_tags_gin                   (gin_path_ops)        ✅
legal_documents_content_tsv_gin               (gin)                 ✅ Phase 1B
admin_ai_chat_sessions_user_context_active_unique  (partial unique) ✅
```

All shipped via `drizzle/manual/*.sql` sidecars. Pattern is intentional — Drizzle table defs list B-tree indexes only; operator-class + partial indexes go in the manual SQL files. **No fix needed**, just documenting the convention.

---

## 6. Migration recommendations — DO NOT APPLY YET

Priority-ordered, operator approval required for each:

### P0 — Block `drizzle-kit generate` from dropping live data

```
# .drizzle.config.ts — extend tablesFilter
# (recommend declaring most in Drizzle instead; this is the band-aid)
tablesFilter: [
  ...existing,
  '!ace_chunks', '!ace_context_sources', '!ace_docs', '!ace_hit_logs', '!ace_sources',
  '!agent_context_files', '!agent_context_files_history', '!agent_context_relations',
  '!auto_tags', '!case_statute_links', '!chat_document_attachments',
  '!citation_collections', '!code_relations_v1', '!code_retrieval_chunks',
  '!collection_citations', '!directory_context_bindings', '!document_topics',
  '!embedded_summaries', '!feature_dependency_edges', '!file_hotness_scores',
  '!file_summaries', '!fix_attempts', '!fixer_patterns', '!fixer_run_log',
  '!hypergraph_edge_members', '!indexing_jobs', '!model_weights',
  '!poi_photos', '!poi_relationships', '!report_audit_log', '!report_versions',
  '!screenshot_artifacts', '!statute_chunks', '!symbol_runtime_stats',
  '!taxonomy_edges', '!taxonomy_nodes', '!timeline_events',
  '!trace_events', '!trace_runs', '!user_interaction_history',
  '!vault_md_index', '!vault_md_join',
  '!warden_audit_log', '!warden_chunks', '!warden_citation_graph',
  '!warden_citations', '!warden_evidence',
  '!admin_model_weights', '!admin_telemetry',
]
```

This is **band-aid only**. The right long-term fix is declaring the tables in Drizzle.

### P1 — Identity strategy decision

Operator picks A/B/C/D from §4 above. Until then, **do NOT run `drizzle-kit push`** anywhere.

### P2 — Declare Drizzle stubs for the 50 DB-only tables

For each table the app actually reads/writes, add Drizzle definitions matching live shape. Use `drizzle-kit introspect` against the live DB to scaffold these automatically:

```bash
cd sveltekit-frontend
npx drizzle-kit introspect:pg
# Review the generated meta/0000_*.sql and schema.ts
# Cherry-pick the table definitions you need into schema/*.ts files
```

### P3 — Investigate the 61 Drizzle-declared / DB-missing tables

For each, decide:
- Delete the Drizzle declaration (stub, never used)
- Create the missing table via migration (planned, blocked)
- Update the Drizzle name (renamed in DB)

---

## 7. Where each missing object is consumed (sample)

A full route-grep for all 61 missing tables is out of scope for this audit; here are the routes most likely to 500-error:

| Drizzle table (missing in DB) | Consumed by |
|---|---|
| `messages` | `src/lib/server/db/schema-chat.ts` declares it; `chat_messages` (different name) IS in DB. Likely a rename — Drizzle declaration is stale. |
| `conversations` | Various chat routes; same situation as `messages` |
| `community_reports` | GraphRAG planned feature, never migrated |
| `case_chunks` | Phase 1 legal retrieval — declared in `schema/legal-cases.ts`, never created. **P1 because Phase 1 is in progress.** |
| `evidence_chain_of_custody` | Evidence audit feature — needs grep to confirm if any active route reads it |
| `ai_chat_sessions`, `ai_memory`, `ai_models` | AI assistant features — may overlap with `admin_ai_chat_sessions` |
| `gpu_cluster_centroids` | LangGraph synth uses different name? — needs grep |
| `prosecutor_*` triplet | Probably planned-but-deferred subsystem; needs ownership decision |

**Recommendation**: when committing the P0 `tablesFilter` extension above, ALSO open one focused issue per missing-Drizzle-table to assign owners. The 61 are too many to investigate in one sweep.

---

## 8. Verification artifacts

Generated this session:

| File | Purpose |
|---|---|
| `/tmp/db_tables_clean.txt` | 247 live table names from `information_schema.tables WHERE table_schema='public'` |
| `/tmp/drizzle_tables.txt` | 258 names extracted from `pgTable('...'` declarations across all schema files |

Both available for reproducible diff. Rebuild:

```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -t \
  -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1;" \
  | grep -v '^\s*$' | awk '{$1=$1; print}' | sort -u > /tmp/db_tables_clean.txt

grep -rhE "pgTable\(['\"][a-z_0-9]+['\"]" sveltekit-frontend/src/lib/server/db/ \
  | grep -oE "pgTable\(['\"][a-z_0-9]+['\"]" \
  | sed -E "s/pgTable\\(['\"]([^'\"]+)['\"]/\\1/" \
  | sort -u > /tmp/drizzle_tables.txt
```

---

## 9. What this audit does NOT cover

- **Column-level drift on the 197 shared tables** — would need per-table `\d table_name` introspection against Drizzle property-by-property. Spot-checked critical ones via prior session work (the 8 closed items). A full column audit is the next pass.
- **Index parity** — confirmed sample but not exhaustive.
- **Foreign-key constraint integrity** — beyond the `users.id` type-mismatch above, no audit of which FK constraints exist live vs declared.
- **Trigger / function / view drift** — Drizzle doesn't manage these; out of scope.
- **Data-level integrity** — orphan rows, duplicate uniques, etc. — different audit.
