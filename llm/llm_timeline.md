# llm timeline

Append-only event log for this repo-local wiki.

## Format

- `YYYY-MM-DDTHH:MM:SSZ` — short event title — what changed — source file(s)

## Entries

- 2026-05-14T00:00:00Z — created llm hub — added repo-local wiki layout and update rules — `AGENTS.md`, `llm/llm.md`
- 2026-05-14T00:00:00Z — tightened wiki safeguards — preserved append-only timeline rule and discouraged new directory AGENTS proliferation — `AGENTS.md`, `llm/llm_intent.md`, `llm/llm_inventory.md`
- 2026-05-14T00:00:00Z — added Karpathy master wiki — centralized ACE multi-hop traversal, relevant scripts, and debug flow — `llm/karpathy_llmwiki.md`, `llm/llm.md`
- 2026-05-14T00:00:00Z — added repo-root path map — surfaced workspace roots beyond `sveltekit-frontend/` for multi-hop traversal — `llm/repo_root_map.md`, `llm/karpathy_llmwiki.md`
- 2026-05-14T00:00:00Z — added docs codebase atlas landing page — created docs-facing home under `docs/codebase_atlas/` — `docs/codebase_atlas/README.md`
- 2026-05-14T00:00:00Z — added docs atlas pages — created docs-facing index, root map, and Karpathy traversal pages — `docs/codebase_atlas/index.md`, `docs/codebase_atlas/repo_root_map.md`, `docs/codebase_atlas/karpathy_llmwiki.md`
- 2026-05-14T00:00:00Z — expanded docs atlas — added feature, package, language, and top-script maps — `docs/codebase_atlas/feature_map.md`, `docs/codebase_atlas/package_map.md`, `docs/codebase_atlas/language_counts.md`, `docs/codebase_atlas/top_scripts.md`
- 2026-05-15T10:00:00Z — hardened ACE topological infrastructure — resolved LibTorch bridge pathing, integrated topology search (8101) into dev-everything, and established gRPC/simdjson boundaries — `libtorch-reranker.ts`, `dev-everything.mjs`, `ace-incremental-startup.mjs`
- 2026-05-16T18:30:00Z — stabilized database identity contracts — normalized all user_id/created_by columns to Integer serial PK standard; resolved 30+ tables in Drizzle schema and live PostgreSQL; cleaned up archived-schemas from contract audits — `sveltekit-frontend/src/lib/server/db/schema-postgres.ts`, `scripts/atlas/repair-db-all-identities.mjs`, `scripts/atlas/audit-drizzle-postgres-contracts.mjs`
