ALTER TABLE "kanban_tasks"
  ADD COLUMN IF NOT EXISTS "assignee" text;
--> statement-breakpoint
ALTER TABLE "kanban_tasks"
  ADD COLUMN IF NOT EXISTS "priority" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "kanban_tasks"
  ADD COLUMN IF NOT EXISTS "claim_token" text;
--> statement-breakpoint
ALTER TABLE "kanban_tasks"
  ADD COLUMN IF NOT EXISTS "claim_expires_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "kanban_tasks"
  ADD COLUMN IF NOT EXISTS "last_heartbeat_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "kanban_tasks"
  ADD COLUMN IF NOT EXISTS "current_run_id" text;
--> statement-breakpoint
ALTER TABLE "kanban_tasks"
  ADD COLUMN IF NOT EXISTS "attempt_count" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "kanban_tasks"
  ADD COLUMN IF NOT EXISTS "failure_count" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "kanban_tasks"
  ADD COLUMN IF NOT EXISTS "max_retries" integer NOT NULL DEFAULT 3;
--> statement-breakpoint
ALTER TABLE "kanban_tasks"
  ADD COLUMN IF NOT EXISTS "started_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "kanban_tasks"
  ADD COLUMN IF NOT EXISTS "completed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "kanban_tasks"
  ADD COLUMN IF NOT EXISTS "idempotency_key" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kanban_task_dependencies" (
  "parent_task_id" text NOT NULL,
  "child_task_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "kanban_task_dependencies_parent_child_pk" PRIMARY KEY ("parent_task_id", "child_task_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kanban_task_comments" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "task_id" text NOT NULL,
  "author" text NOT NULL,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kanban_task_events" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "task_id" text NOT NULL,
  "run_id" text,
  "event_type" text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kanban_task_attempts" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "task_id" text NOT NULL,
  "run_id" text NOT NULL,
  "worker" text NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone,
  "success" boolean NOT NULL DEFAULT false,
  "failure_kind" text,
  "execution_receipt_id" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kanban_ready_idx" ON "kanban_tasks" USING btree ("priority" DESC, "created_at") WHERE "status" = 'ready';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kanban_running_heartbeat_idx" ON "kanban_tasks" USING btree ("last_heartbeat_at") WHERE "status" = 'running';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kanban_dependency_child_idx" ON "kanban_task_dependencies" USING btree ("child_task_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kanban_events_task_idx" ON "kanban_task_events" USING btree ("task_id", "created_at" DESC);
