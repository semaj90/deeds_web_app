# Atlas Procedural Sequence Catalog v1

Status: implementation scaffold only; PostgreSQL DDL is a planned sidecar and has not been applied. No sequence records were created.

The proposed `atlas_procedural_sequences_v1` catalog uses `(sequence_id, sequence_revision)` as its stable key; the primary-key B-tree also supports `sequence_id` lookups, avoiding a redundant duplicate index. Separate indexes support `feature_id` and case-insensitive exact `feature_label` retrieval. Only `ADMITTED` rows with source/workspace revisions and evidence references are visible through `atlas.procedural_sequence_search`. The MCP tool is read-only and returns descriptive steps; it cannot execute them. Database checks keep records non-canonical and non-executable.

Validation: the Zod input schema accepted a valid feature-label query and rejected an unfiltered query and an over-limit request. The Drizzle schema module loaded under Node 22. `sidecar-migrations.json` parsed and targeted `git diff --check` passed. Focused Vitest and `svelte-check` produced no diagnostics before being interrupted; neither is reported as passing. No database connection or migration was run.

Next gate: review the draft DDL and feature/sequence ownership, then obtain explicit operator authorization before a rollback rehearsal or live apply. Seed only source-grounded, revision-qualified, reviewed procedures through a separately approved bounded writer.
