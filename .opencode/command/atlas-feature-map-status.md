# Atlas Feature Map Status

Use the `atlas-feature-map-executor` agent.

Run a read-only status check of the Parent Atlas feature-map pipeline.

Inspect:

- `.tmp/codebase-feature-map.json`
- `.tmp/codebase-feature-map.md`
- `docs/graph/codebase-feature-map.json`
- `.tmp/feature_labels.jsonl`
- `.tmp/kanban_tasks.jsonl`
- `memory/exports/all-lanes-parent-atlas-report.json`

Report:

- whether each artifact exists
- file size
- modified time
- count of records where possible
- missing canonical IDs
- duplicate source_refs
- missing feature labels
- orphan Kanban tasks
- generated-folder pollution
- next safe action

Do not mutate the DB.
Do not edit files.
Do not run migrations.
Do not repair TRACE MCP.
Do not summarize with Gemma unless labels already exist.
