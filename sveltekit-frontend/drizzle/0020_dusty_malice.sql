CREATE TABLE "entities" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"centrality_score" real DEFAULT 0,
	"metadata" jsonb DEFAULT '{}',
	"last_active_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "entity_edges" (
	"source_id" text NOT NULL,
	"target_id" text NOT NULL,
	"relation_type" text NOT NULL,
	"weight" real DEFAULT 1,
	"metadata" jsonb DEFAULT '{}',
	CONSTRAINT "entity_edges_source_id_target_id_relation_type_pk" PRIMARY KEY("source_id","target_id","relation_type")
);
--> statement-breakpoint
ALTER TABLE "entity_edges" ADD CONSTRAINT "entity_edges_source_id_entities_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_edges" ADD CONSTRAINT "entity_edges_target_id_entities_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;