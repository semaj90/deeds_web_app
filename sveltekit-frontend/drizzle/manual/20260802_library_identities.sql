-- Library registry: canonical npm/pip package identity table.
-- Manual sidecar migration (not drizzle-kit generated) because generating
-- against the current schema.ts also picked up unrelated pre-existing
-- schema drift (recommendation_log, semantic_lifecycle_events,
-- semantic_signals) that isn't part of this change. See
-- library-identities.ts for the Drizzle schema definition this mirrors.

CREATE TABLE IF NOT EXISTS "library_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"address" text NOT NULL,
	"package_manager" text NOT NULL,
	"package_name" text NOT NULL,
	"package_version" text NOT NULL,
	"lockfile_digest" text,
	"package_json_digest" text,
	"installation_path" text NOT NULL,
	"source_type" text NOT NULL,
	"workspace_root" text NOT NULL,
	"tier1" jsonb,
	"tier2_paths" jsonb,
	"scanned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_identities_address_unique" UNIQUE("address")
);

CREATE INDEX IF NOT EXISTS "idx_library_identities_package_name" ON "library_identities" USING btree ("package_name");
CREATE INDEX IF NOT EXISTS "idx_library_identities_package_manager" ON "library_identities" USING btree ("package_manager");
CREATE INDEX IF NOT EXISTS "idx_library_identities_source_type" ON "library_identities" USING btree ("source_type");
