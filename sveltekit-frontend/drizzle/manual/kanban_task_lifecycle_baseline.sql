-- Parent Atlas Kanban persistence sidecar (applied with explicit authorization).
-- Scope is limited to the five Kanban tables represented by
-- src/lib/server/db/schema/kanban-tasks.ts.

CREATE TABLE IF NOT EXISTS "kanban_tasks" (
  "task_id" text PRIMARY KEY NOT NULL,
  "feature_id" text NOT NULL,
  "feature_label" text NOT NULL,
  "source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "lane" text DEFAULT 'todo' NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "validation_command" text,
  "assignee" text,
  "priority" integer DEFAULT 0 NOT NULL,
  "claim_token" text,
  "claim_expires_at" timestamp with time zone,
  "last_heartbeat_at" timestamp with time zone,
  "current_run_id" text,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "failure_count" integer DEFAULT 0 NOT NULL,
  "max_retries" integer DEFAULT 3 NOT NULL,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "idempotency_key" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "kanban_task_dependencies" (
  "parent_task_id" text NOT NULL,
  "child_task_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "kanban_task_dependencies_parent_child_pk" PRIMARY KEY ("parent_task_id", "child_task_id")
);

CREATE TABLE IF NOT EXISTS "kanban_task_comments" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "task_id" text NOT NULL,
  "author" text NOT NULL,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "kanban_task_events" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "task_id" text NOT NULL,
  "run_id" text,
  "event_type" text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "kanban_task_attempts" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "task_id" text NOT NULL,
  "run_id" text NOT NULL,
  "worker" text NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone,
  "success" boolean DEFAULT false NOT NULL,
  "failure_kind" text,
  "execution_receipt_id" text
);

CREATE INDEX IF NOT EXISTS "kanban_ready_idx"
  ON "kanban_tasks" USING btree ("priority" DESC, "created_at")
  WHERE "status" = 'ready';

CREATE INDEX IF NOT EXISTS "kanban_running_heartbeat_idx"
  ON "kanban_tasks" USING btree ("last_heartbeat_at")
  WHERE "status" = 'running';

CREATE INDEX IF NOT EXISTS "kanban_dependency_child_idx"
  ON "kanban_task_dependencies" USING btree ("child_task_id");

CREATE INDEX IF NOT EXISTS "kanban_events_task_idx"
  ON "kanban_task_events" USING btree ("task_id", "created_at" DESC);
