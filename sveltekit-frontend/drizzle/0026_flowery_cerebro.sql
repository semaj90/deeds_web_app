CREATE TABLE "atlas_cards" (
	"file" text PRIMARY KEY NOT NULL,
	"type" text,
	"data" jsonb,
	"created_at" timestamp DEFAULT now()
);
