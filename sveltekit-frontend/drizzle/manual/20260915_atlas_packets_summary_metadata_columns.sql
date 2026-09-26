-- DRAFT, NOT APPLIED (2026-09-15). Additive-only fix for the stage-11 (Phase 17-21) gap found by
-- scripts/atlas/audit-phase17-21-workstation.mjs: its summary_lane.schema check reports
-- MIGRATION_PENDING and its coverage query fails live with
-- `column "summary" does not exist` -- root-caused precisely (not assumed) to two separate,
-- independent gaps:
--
-- 1. `atlas_packets` already HAS `summary` and `summary_hash` (both `text`, confirmed live via
--    information_schema.columns) -- but is genuinely MISSING the other 5 columns the audit
--    script checks for: `summary_model`, `summary_backend`, `summary_version`,
--    `summary_generated_at`, `summary_metadata`.
-- 2. `parent_atlas_documents` is NOT a real table -- it is a VIEW over `atlas_packets`
--    (see drizzle/manual/parent_atlas_documents_view_widen.sql), and that view's SELECT list
--    does not expose ANY summary-related column, including the 2 that already exist. This is
--    why the audit script's query against `parent_atlas_documents` fails with
--    `column "summary" does not exist` even though `atlas_packets.summary` is real and populated.
--
-- This file only adds the 5 missing columns to atlas_packets and widens the view to expose all
-- 7. It does NOT backfill any new column's values (no writer for summary_model/backend/version/
-- generated_at/metadata exists yet -- that is separate, not-yet-scoped work, matching this
-- session's Drizzle Safety Rule discipline: draft first, human review, dry-run before apply).

-- Step 1: add the 5 missing columns to the real table (idempotent).
ALTER TABLE public.atlas_packets
  ADD COLUMN IF NOT EXISTS summary_model text,
  ADD COLUMN IF NOT EXISTS summary_backend text,
  ADD COLUMN IF NOT EXISTS summary_version integer,
  ADD COLUMN IF NOT EXISTS summary_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS summary_metadata jsonb;

-- Step 2: widen the view to expose all 7 summary-related columns. Re-declares the full SELECT
-- list from parent_atlas_documents_view_widen.sql plus the 7 new/existing summary columns --
-- CREATE OR REPLACE VIEW requires the full column list, not just an ADD.
CREATE OR REPLACE VIEW public.parent_atlas_documents AS
SELECT
  packet_key AS id,
  source_ref,
  directory_path AS rel_path,
  feature_id,
  COALESCE((payload ->> 'line_count')::integer, 0) AS line_count,
  COALESCE((payload ->> 'is_route')::boolean, false) AS is_route,
  COALESCE((payload ->> 'is_svelte_comp')::boolean, false) AS is_svelte_comp,
  COALESCE((payload ->> 'has_zod')::boolean, false) AS has_zod,
  COALESCE(ARRAY(SELECT jsonb_array_elements_text(ap.payload -> 'drizzle_refs')), ARRAY[]::text[]) AS drizzle_refs,
  COALESCE(ARRAY(SELECT jsonb_array_elements_text(ap.payload -> 'imports')), ARRAY[]::text[]) AS imports,
  COALESCE(ARRAY(SELECT jsonb_array_elements_text(ap.payload -> 'exports')), ARRAY[]::text[]) AS exports,
  qdrant_point_id,
  COALESCE(ARRAY(SELECT jsonb_array_elements_text(ap.payload -> 'related_feature_ids')), ARRAY[]::text[]) AS related_feature_ids,
  COALESCE((payload ->> 'has_auth')::boolean, false) AS has_auth,
  COALESCE(ARRAY(SELECT jsonb_array_elements_text(ap.payload -> 'route_handlers')), ARRAY[]::text[]) AS route_handlers,
  COALESCE(tags, ARRAY[]::text[]) AS tags,
  kmeans_cluster::text AS cluster_id,
  som_cluster AS centroid_id,
  packet_key,
  feature_label,
  created_at,
  workspace_id,
  updated_at,
  summary,
  summary_hash,
  summary_model,
  summary_backend,
  summary_version,
  summary_generated_at,
  summary_metadata
FROM atlas_packets ap
WHERE source_ref IS NOT NULL;
