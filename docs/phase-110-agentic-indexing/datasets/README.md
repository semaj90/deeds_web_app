# JSONL datasets

Recommended versioned files:

- `artifacts.v1.jsonl`
- `embedding-jobs.v1.jsonl`
- `label-observations.v1.jsonl`
- `cluster-features.v1.jsonl`
- `ranking-judgments.v1.jsonl`
- `validation-results.v1.jsonl`
- `failed-records.v1.jsonl`

Each line must include:

- schema_version
- run_id
- workspace_revision
- artifact_id when applicable
- producer or extractor version
- source/input hash
- validation state

JSONL is an interchange and audit format, not the canonical mutable database.
