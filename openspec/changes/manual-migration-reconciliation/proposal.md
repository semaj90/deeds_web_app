# OpenSpec: Manual Migration Reconciliation

## Why

`drizzle/manual/*.sql` is the project's documented escape hatch for schema changes `drizzle-kit generate` can't express (GIN/HNSW indexes, schema merges, idempotent sidecar tables) — see CLAUDE.md "Database Migration Safety" and "Drizzle Safety Rule (May 11, 2026)". The rule assumes every file in that directory has been applied. It hadn't been verified.

A 2026-08-05 session debugging `npm run dev:gpu` and `npm run graphify:daily` found two sidecar files sitting unapplied on disk:
- `drizzle/manual/workflow_orchestration_tables.sql` → missing `workflow_runs`, `workflow_tasks`, `workflow_outbox`, `workflow_approvals`. Symptom: outbox publisher loop spammed `relation "workflow_outbox" does not exist` on every poll cycle.
- `drizzle/manual/0051_atlas_topology_eval_times.sql` → missing `atlas_topology_eval_times`. Symptom: `atlas:phase16:som:apply` telemetry write step failed silently (non-fatal, but wrong).

Both were pure `CREATE TABLE IF NOT EXISTS`, additive, zero risk, and were applied directly during that session. A full sweep (`for f in drizzle/manual/*.sql; check table exists`) found **10 more** files whose target tables are still missing live. Applying those blind would violate the project's own Drizzle Safety Rule — several touch tables that already exist under similar names (`evidence` vs. new `evidence_items`, `admin_ai_chat_sessions` vs. new `ai_chat_sessions`), and one (`20260402_indexing_ace_schema_merge.sql`, 520 lines) contains `DROP TRIGGER` statements against `legal_nodes`/`legal_chunks`, which are live tables.

## What this proves

- Every `drizzle/manual/*.sql` file has a known, recorded state: `APPLIED`, `SAFE_TO_APPLY`, `NEEDS_DEDUP_REVIEW`, or `NEEDS_STATEMENT_REVIEW`.
- No file gets applied without confirming its target tables don't collide with an existing canonical table under a different name (per CLAUDE.md's Consolidation Sweep Rule — canonical vs. duplicate audit before patching).
- `20260402_indexing_ace_schema_merge.sql` gets a statement-by-statement diff against the live `legal_nodes`/`legal_chunks` schema before anything in it runs, since it's the one file in the set that mutates existing tables rather than only adding new ones.
- The two files applied this session (`workflow_orchestration_tables.sql`, `0051_atlas_topology_eval_times.sql`) are recorded as done so this doesn't get re-litigated.

## Non-goals

- Not touching `drizzle-kit generate`/`push` — this is entirely about the manual SQL sidecar lane.
- Not deciding product intent for `proposed_20260530_task_semantic_packets.sql` (filename says "proposed" — this change surfaces it for a decision, doesn't make the decision).
- Not writing new Drizzle schema entries for these tables — that's a follow-up once a file is confirmed safe and applied; out of scope here.
