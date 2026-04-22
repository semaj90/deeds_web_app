CREATE TABLE IF NOT EXISTS "agent_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" varchar(255) NOT NULL,
	"lane" varchar(64) NOT NULL,
	"task_type" varchar(64) NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"outcome" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"start_time" timestamp with time zone DEFAULT now() NOT NULL,
	"end_time" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_sessions_session_id_unique" UNIQUE("session_id")
);

CREATE INDEX IF NOT EXISTS "idx_agent_sessions_id" ON "agent_sessions" USING btree ("session_id");
CREATE INDEX IF NOT EXISTS "idx_agent_sessions_lane" ON "agent_sessions" USING btree ("lane");
CREATE INDEX IF NOT EXISTS "idx_agent_sessions_status" ON "agent_sessions" USING btree ("status");
