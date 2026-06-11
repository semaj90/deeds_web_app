ALTER TABLE "qlora_examples" ADD COLUMN "retrieval_strategy" text DEFAULT 'fusion';--> statement-breakpoint
ALTER TABLE "concept_records" ADD COLUMN "strategy_distribution" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_traces" ADD COLUMN "retrieval_strategy" text DEFAULT 'fusion';--> statement-breakpoint
ALTER TABLE "agent_traces" ADD COLUMN "selected_concepts" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_traces" ADD COLUMN "score" double precision DEFAULT 1;--> statement-breakpoint
ALTER TABLE "agent_traces" ADD COLUMN "trace_source" text DEFAULT 'gemma4' NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_agent_traces_strategy" ON "agent_traces" USING btree ("retrieval_strategy");--> statement-breakpoint
CREATE INDEX "idx_agent_traces_score" ON "agent_traces" USING btree ("score");--> statement-breakpoint
CREATE INDEX "idx_agent_traces_trace_source" ON "agent_traces" USING btree ("trace_source");