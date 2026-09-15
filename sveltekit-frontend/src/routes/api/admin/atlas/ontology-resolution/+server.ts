import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth-utils.js';
import { pool } from '$lib/server/db/client.js';
import { resolveOntologyLabelV1 } from '$lib/server/atlas/ontology-resolution-boundary-postgres.js';

/**
 * Admin review surface for Phase 1/2 of
 * openspec/changes/parent-atlas-ontology-oaklib-fanout-bitmap.
 *
 * GET -> current atlas_domain_ontology vocabulary (the OAKLIB-equivalent
 * concept root) plus feature_ontology_tuples resolution-state counts, when
 * the Phase 2 migration's columns exist. Degrades gracefully (same top-level
 * keys, `migrationApplied: false`) if the migration hasn't been applied yet
 * -- matches this repo's Degraded Response Contract, never a schema-shape
 * mismatch between success and degraded responses.
 */

interface DomainOntologyRow {
  group_id: string;
  group_label: string;
  parent_group_id: string | null;
  description: string | null;
  taxonomy_level: number;
  confidence: number;
  examples: string[] | null;
  updated_at: Date;
}

async function resolutionColumnsExist(): Promise<boolean> {
  const { rows } = await pool.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'feature_ontology_tuples'
        AND column_name IN ('resolved_concept_id', 'resolution_state')`
  );
  return rows.length === 2;
}

export const GET: RequestHandler = async (event) => {
  requireAdmin(event);
  try {
    const vocabResult = await pool.query<DomainOntologyRow>(
      `SELECT group_id, group_label, parent_group_id, description, taxonomy_level, confidence, examples, updated_at
         FROM atlas_domain_ontology
        ORDER BY taxonomy_level, group_id`
    );
    const vocabulary = vocabResult.rows.map((row) => ({
      groupId: row.group_id,
      groupLabel: row.group_label,
      parentGroupId: row.parent_group_id,
      description: row.description,
      taxonomyLevel: row.taxonomy_level,
      confidence: row.confidence,
      examples: row.examples ?? [],
      updatedAt: row.updated_at,
    }));

    const migrationApplied = await resolutionColumnsExist();

    if (!migrationApplied) {
      return json({
        ok: true,
        migrationApplied: false,
        vocabulary,
        resolutionStats: null,
        totalTuples: 0,
      });
    }

    const statsResult = await pool.query<{ resolution_state: string; count: string }>(
      `SELECT resolution_state, count(*) AS count
         FROM feature_ontology_tuples
        GROUP BY resolution_state
        ORDER BY resolution_state`
    );
    const totalResult = await pool.query<{ total: string }>(
      `SELECT count(*) AS total FROM feature_ontology_tuples`
    );

    const resolutionStats = Object.fromEntries(
      statsResult.rows.map((row) => [row.resolution_state, Number(row.count)])
    );

    return json({
      ok: true,
      migrationApplied: true,
      vocabulary,
      resolutionStats,
      totalTuples: Number(totalResult.rows[0]?.total ?? 0),
    });
  } catch (error) {
    console.error('[admin/atlas/ontology-resolution] GET failed', error);
    return json({
      ok: true,
      migrationApplied: false,
      vocabulary: [],
      resolutionStats: null,
      totalTuples: 0,
    });
  }
};

interface ResolveLabelRequestBody {
  label?: string;
}

/**
 * Live test tool for the Phase 1 resolver -- lets an admin type a raw label
 * and see exactly what resolveOntologyLabelV1() would return, without
 * touching any table.
 */
export const POST: RequestHandler = async (event) => {
  requireAdmin(event);
  try {
    const body = (await event.request.json()) as ResolveLabelRequestBody;
    if (!body.label?.trim()) {
      return json({ ok: false, error: 'label is required' }, { status: 400 });
    }
    const result = await resolveOntologyLabelV1({
      schemaVersion: 'atlas.ontology-resolution-request.v1',
      label: body.label.trim(),
    });
    return json({ ok: true, result });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
};
