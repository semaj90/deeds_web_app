ALTER TABLE "concept_records" ADD COLUMN "retrieval_strategy" text DEFAULT 'fusion';--> statement-breakpoint
ALTER TABLE "concept_records" ADD COLUMN "last_retrieved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "concept_records" ADD COLUMN "concept_temperature" double precision DEFAULT 0.5;--> statement-breakpoint
CREATE INDEX "idx_retrieval_telemetry_strategy_created" ON "retrieval_telemetry" USING btree ("retrieval_strategy","created_at");