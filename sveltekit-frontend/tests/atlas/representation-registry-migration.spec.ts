// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(process.cwd(), 'drizzle', '0152_atlas_representations_registry.sql');

const migrationSql = readFileSync(migrationPath, 'utf8');

describe('0152 atlas representations registry migration', () => {
  it('declares the bounded registry and immediate evidence tables', () => {
    expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS public.atlas_representations');
    expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS public.atlas_representation_providers');
    expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS public.atlas_representation_lane_selections');
    expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS public.atlas_representation_provider_fallbacks');
    expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS public.atlas_retrieval_lane_fallbacks');
    expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS public.atlas_representation_migrations');
    expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS public.atlas_qdrant_collection_mappings');
    expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS public.atlas_representation_compatibility_evaluations');
    expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS public.atlas_representation_validation_results');
    expect(migrationSql).not.toContain('CREATE TABLE IF NOT EXISTS public.atlas_prompt_templates');
  });

  it('keeps the representation status axes and dimensional guardrails', () => {
    expect(migrationSql).toContain(
      "lifecycle_status text NOT NULL DEFAULT 'CANDIDATE' CHECK (lifecycle_status IN ('CANDIDATE', 'ACTIVE', 'DEPRECATED', 'RETIRED'))",
    );
    expect(migrationSql).toContain("verification_status text NOT NULL DEFAULT 'UNVERIFIED' CHECK (verification_status IN (");
    expect(migrationSql).toContain("'STATIC_VERIFIED'");
    expect(migrationSql).toContain("'SAMPLE_VERIFIED'");
    expect(migrationSql).toContain("'PRODUCTION_VERIFIED'");
    expect(migrationSql).toContain(
      'output_dimensions integer NOT NULL CHECK (output_dimensions > 0 AND output_dimensions <= native_dimensions)',
    );
    expect(migrationSql).toContain('dimension_method text NOT NULL CHECK (dimension_method IN (');
    expect(migrationSql).toContain("'UNKNOWN'");
  });

  it('records the 384 lane as a candidate unverified reference lane', () => {
    expect(migrationSql).toContain("'semantic_384'");
    expect(migrationSql).toContain("'CANDIDATE'");
    expect(migrationSql).toContain("'UNVERIFIED'");
    expect(migrationSql).toContain("'UNKNOWN'");
  });

  it('avoids transactional migration hazards', () => {
    expect(migrationSql).not.toContain('CREATE INDEX CONCURRENTLY');
    expect(migrationSql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS atlas_lane_selection_primary_scope_idx');
    expect(migrationSql).toContain('WHERE is_primary = true');
    expect(migrationSql).toContain('DROP TRIGGER IF EXISTS atlas_representations_immutable_trigger');
  });
});
