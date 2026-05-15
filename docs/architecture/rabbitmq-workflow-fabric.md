# RabbitMQ Workflow Fabric

## Goal

Add a minimal, fail-open workflow lane for PDF OCR so evidence uploads can enqueue `ingest.pdf.ocr`, complete locally when RabbitMQ is down, and surface status in the admin UI.

## Runtime Lane

1. Evidence upload creates the existing in-memory progress job.
2. The PDF upload also registers a workflow run.
3. The workflow helper publishes `ingest.pdf.ocr` to RabbitMQ.
4. The dummy worker consumes the job and marks the run complete.
5. The workflow status API and admin panel read the shared job store.

## Schema Proposal

This is proposal-only. No migration or `drizzle push`.

### `workflow_runs`

- `id` uuid primary key
- `evidence_id` uuid not null
- `queue_name` text not null
- `status` text not null
- `transport` text not null
- `created_at` timestamptz not null
- `updated_at` timestamptz not null
- `completed_at` timestamptz null

### `workflow_steps`

- `id` uuid primary key
- `workflow_run_id` uuid not null
- `step_key` text not null
- `status` text not null
- `progress` integer not null
- `message` text not null
- `created_at` timestamptz not null

## Fail-Open Rule

- If RabbitMQ publish fails, the workflow completes locally.
- The upload path still returns success.
- The UI shows the run as completed instead of blocking the user.

## Non-Goals

- No new canonical datastore.
- No change to identity strategy.
- No browser access to RabbitMQ or other core services.
