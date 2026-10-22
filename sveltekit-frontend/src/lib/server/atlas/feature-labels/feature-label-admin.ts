/**
 * Read-only data for the Parent Atlas feature-label admin view.
 *
 * Only SELECT statements. Nothing here writes, migrates, or backfills.
 * Every result set is labelled with its authority so unreviewed material is never shown as approved:
 *   - approvedLabels comes only from atlas_feature_labels_current (REVIEWED rows).
 *   - candidateLabels comes from atlas_fi_features and is CANDIDATE_UNREVIEWED.
 *   - ontologyCrosswalks counts feature_ontology_tuples by resolution_state; unresolved tuples are never gold.
 *
 * Degraded contract: the returned object always has the same top-level keys, even on failure.
 */
import { pool } from '$lib/server/db/client.js';

export const FEATURE_LABEL_ADMIN_SCHEMA = 'atlas.feature-label-admin-view.v1';
const DEFAULT_LIMIT = 100;

export interface FeatureLabelAdminView {
  schema: typeof FEATURE_LABEL_ADMIN_SCHEMA;
  status: 'OK' | 'DEGRADED';
  error: string | null;
  limit: number;
  featureIds: Array<{ featureId: string; featureNamespace: string; featureType: string }>;
  approvedLabelsTable: 'PRESENT' | 'ABSENT' | 'UNKNOWN';
  approvedLabels: Array<{ featureId: string; labelRevision: number; featureLabel: string; domainClass: string | null; capability: string | null; conceptId: string | null; reviewedBy: string | null }>;
  candidateLabels: Array<{ featureId: string; featureLabel: string | null; domain: string | null; status: string | null; authority: 'CANDIDATE_UNREVIEWED' }>;
  sourceMappings: Array<{ normalizedPath: string; sourceRef: string | null; featureId: string | null }>;
  ontologyCrosswalks: Array<{ resolutionState: string | null; tuples: number }>;
  unresolvedEvidence: Array<{ sourceRef: string | null; packetKey: string | null; language: string | null }>;
}

function emptyView(limit: number, status: FeatureLabelAdminView['status'], error: string | null): FeatureLabelAdminView {
  return {
    schema: FEATURE_LABEL_ADMIN_SCHEMA,
    status,
    error,
    limit,
    featureIds: [],
    approvedLabelsTable: 'UNKNOWN',
    approvedLabels: [],
    candidateLabels: [],
    sourceMappings: [],
    ontologyCrosswalks: [],
    unresolvedEvidence: [],
  };
}

function clampLimit(limit: number | undefined): number {
  if (!Number.isInteger(limit) || limit === undefined) return DEFAULT_LIMIT;
  return Math.min(Math.max(limit, 1), 500);
}

export async function loadFeatureLabelAdminView(limitInput?: number): Promise<FeatureLabelAdminView> {
  const limit = clampLimit(limitInput);
  try {
    const features = await pool.query(
      `SELECT feature_id, feature_namespace, feature_type FROM atlas_features ORDER BY feature_id LIMIT $1`,
      [limit],
    );

    const tableCheck = await pool.query(`SELECT to_regclass('public.atlas_feature_labels') IS NOT NULL AS present`);
    const approvedPresent = Boolean(tableCheck.rows[0]?.present);
    const approved = approvedPresent
      ? await pool.query(
          `SELECT canonical_feature_id AS feature_id, label_revision, feature_label, domain_class, capability, concept_id, reviewed_by
           FROM atlas_feature_labels_current ORDER BY canonical_feature_id LIMIT $1`,
          [limit],
        )
      : { rows: [] as Array<Record<string, unknown>> };

    const candidates = await pool.query(
      `SELECT feature_id, feature_label, domain, status FROM atlas_fi_features ORDER BY feature_id LIMIT $1`,
      [limit],
    );
    const mappings = await pool.query(
      `SELECT normalized_path, source_ref, feature_id FROM atlas_feature_map ORDER BY normalized_path LIMIT $1`,
      [limit],
    );
    const crosswalk = await pool.query(
      `SELECT resolution_state, count(*)::int AS tuples FROM feature_ontology_tuples GROUP BY resolution_state ORDER BY resolution_state`,
    );
    const unresolved = await pool.query(
      `SELECT source_ref, packet_key, language FROM atlas_feature_evidence WHERE source_ref IS NOT NULL ORDER BY source_ref LIMIT $1`,
      [limit],
    );

    return {
      schema: FEATURE_LABEL_ADMIN_SCHEMA,
      status: 'OK',
      error: null,
      limit,
      featureIds: features.rows.map((r) => ({ featureId: String(r.feature_id), featureNamespace: String(r.feature_namespace), featureType: String(r.feature_type) })),
      approvedLabelsTable: approvedPresent ? 'PRESENT' : 'ABSENT',
      approvedLabels: approved.rows.map((r) => ({
        featureId: String(r.feature_id),
        labelRevision: Number(r.label_revision),
        featureLabel: String(r.feature_label),
        domainClass: (r.domain_class as string | null) ?? null,
        capability: (r.capability as string | null) ?? null,
        conceptId: (r.concept_id as string | null) ?? null,
        reviewedBy: (r.reviewed_by as string | null) ?? null,
      })),
      candidateLabels: candidates.rows.map((r) => ({
        featureId: String(r.feature_id),
        featureLabel: (r.feature_label as string | null) ?? null,
        domain: (r.domain as string | null) ?? null,
        status: (r.status as string | null) ?? null,
        authority: 'CANDIDATE_UNREVIEWED' as const,
      })),
      sourceMappings: mappings.rows.map((r) => ({
        normalizedPath: String(r.normalized_path),
        sourceRef: (r.source_ref as string | null) ?? null,
        featureId: (r.feature_id as string | null) ?? null,
      })),
      ontologyCrosswalks: crosswalk.rows.map((r) => ({ resolutionState: (r.resolution_state as string | null) ?? null, tuples: Number(r.tuples) })),
      unresolvedEvidence: unresolved.rows.map((r: Record<string, unknown>) => ({
        sourceRef: (r.source_ref as string | null) ?? null,
        packetKey: (r.packet_key as string | null) ?? null,
        language: (r.language as string | null) ?? null,
      })),
    };
  } catch (err) {
    return emptyView(limit, 'DEGRADED', err instanceof Error ? err.message : String(err));
  }
}
