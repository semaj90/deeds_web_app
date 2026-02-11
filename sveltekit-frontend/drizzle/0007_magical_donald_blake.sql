CREATE TYPE "public"."case_link_type" AS ENUM('CHARGED_UNDER', 'CITED_IN', 'RELATED_TO', 'OVERRULED_BY', 'AFFIRMED_BY');--> statement-breakpoint
CREATE TABLE "case_statute_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"statute_id" uuid,
	"citation_id" uuid,
	"link_type" "case_link_type" DEFAULT 'CITED_IN' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "case_statute_links" ADD CONSTRAINT "case_statute_links_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_statute_links" ADD CONSTRAINT "case_statute_links_statute_id_statutes_id_fk" FOREIGN KEY ("statute_id") REFERENCES "public"."statutes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_statute_links" ADD CONSTRAINT "case_statute_links_citation_id_citations_id_fk" FOREIGN KEY ("citation_id") REFERENCES "public"."citations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_statute_links" ADD CONSTRAINT "case_statute_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "case_statute_links_case_id_idx" ON "case_statute_links" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "case_statute_links_statute_id_idx" ON "case_statute_links" USING btree ("statute_id");--> statement-breakpoint
CREATE INDEX "case_statute_links_citation_id_idx" ON "case_statute_links" USING btree ("citation_id");