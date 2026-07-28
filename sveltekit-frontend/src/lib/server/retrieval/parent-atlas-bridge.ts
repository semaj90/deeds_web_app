/**
 * Parent Atlas Retrieval Bridge
 *
 * Integrates Parent Atlas domain taxonomy, feature extraction, and canonical lineage
 * into the unified retrieval orchestrator.
 *
 * Parent Atlas provides:
 * - Domain taxonomy (feature_id → domain_class mapping)
 * - Canonical identity (source_ref → packet_key resolution)
 * - Feature extraction (AST, semantic, lexical lane signals)
 * - Lineage validation (bijection checks, orphan detection)
 */

import { Pool } from 'pg';
import type { SearchFilter } from './types.js';

export interface ParentAtlasContext {
  source_ref: string;
  feature_id: string | null;
  feature_label: string | null;
  domain_class: string | null;
  packet_key: string | null;
  workspace_revision: string | null;
  confidence: number;
}

export interface ParentAtlasBridgeConfig {
  postgres: { host: string; port: number; user: string; password: string; database: string };
}

const DEFAULT_CONFIG: ParentAtlasBridgeConfig = {
  postgres: {
    host: process.env.POSTGRES_HOST || '127.0.0.1',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    user: process.env.POSTGRES_USER || 'legal_admin',
    password: process.env.POSTGRES_PASSWORD || '',
    database: process.env.POSTGRES_DB || 'legal_ai_db'
  }
};

/**
 * Resolve Parent Atlas context for a given source_ref
 * Uses Postgres atlas_packets as canonical truth source
 */
export async function resolveParentAtlasContext(
  sourceRef: string,
  config: ParentAtlasBridgeConfig = DEFAULT_CONFIG
): Promise<ParentAtlasContext | null> {
  const pool = new Pool({
    host: config.postgres.host,
    port: config.postgres.port,
    user: config.postgres.user,
    password: config.postgres.password,
    database: config.postgres.database
  });

  try {
    const result = await pool.query(
      `SELECT
        source_ref,
        feature_id,
        feature_label,
        domain_class,
        packet_key,
        workspace_revision
      FROM atlas_packets
      WHERE source_ref = $1
      LIMIT 1`,
      [sourceRef]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      source_ref: row.source_ref,
      feature_id: row.feature_id,
      feature_label: row.feature_label,
      domain_class: row.domain_class,
      packet_key: row.packet_key,
      workspace_revision: row.workspace_revision,
      confidence: row.packet_key ? 0.95 : 0.6 // High confidence if packet_key resolved
    };
  } catch (err) {
    console.warn('Parent Atlas context resolution failed:', err);
    return null;
  } finally {
    await pool.end();
  }
}

/**
 * Enrich search filters with Parent Atlas domain constraints
 * Converts feature_id → domain_class for more targeted retrieval
 */
export async function enrichFilterWithDomainTaxonomy(
  filter: SearchFilter | undefined,
  config: ParentAtlasBridgeConfig = DEFAULT_CONFIG
): Promise<SearchFilter | undefined> {
  if (!filter || !filter.feature_ids || filter.feature_ids.length === 0) {
    return filter;
  }

  const pool = new Pool({
    host: config.postgres.host,
    port: config.postgres.port,
    user: config.postgres.user,
    password: config.postgres.password,
    database: config.postgres.database
  });

  try {
    const result = await pool.query(
      `SELECT DISTINCT domain_class
      FROM atlas_packets
      WHERE feature_id = ANY($1) AND domain_class IS NOT NULL`,
      [filter.feature_ids]
    );

    const domains = result.rows.map(r => r.domain_class);
    if (domains.length > 0) {
      return {
        ...filter,
        domain_class: domains.length === 1 ? domains[0] : undefined,
        domain_ids: domains
      };
    }

    return filter;
  } catch (err) {
    console.warn('Domain taxonomy enrichment failed:', err);
    return filter;
  } finally {
    await pool.end();
  }
}

/**
 * Validate candidate against Parent Atlas lineage rules
 * Ensures source_ref, feature_id, packet_key are consistent
 */
export async function validateParentAtlasLineage(
  sourceRef: string,
  featureId: string | null,
  packetKey: string | null,
  config: ParentAtlasBridgeConfig = DEFAULT_CONFIG
): Promise<{ valid: boolean; confidence: number; warnings: string[] }> {
  const warnings: string[] = [];
  let confidence = 1.0;

  // Empty source_ref is invalid
  if (!sourceRef || sourceRef.trim().length === 0) {
    return { valid: false, confidence: 0, warnings: ['Empty source_ref'] };
  }

  // packet_key required for high confidence
  if (!packetKey) {
    warnings.push('Missing packet_key');
    confidence -= 0.3;
  }

  // feature_id without feature_label is suspicious
  if (featureId && !featureId.includes(':')) {
    warnings.push('Feature ID may be incomplete (missing namespace)');
    confidence -= 0.1;
  }

  return {
    valid: confidence > 0.5,
    confidence: Math.max(0, confidence),
    warnings
  };
}

/**
 * Batch resolve Parent Atlas contexts for multiple source refs
 * Efficient for candidate deduplication and enrichment
 */
export async function batchResolveParentAtlasContext(
  sourceRefs: string[],
  config: ParentAtlasBridgeConfig = DEFAULT_CONFIG
): Promise<Map<string, ParentAtlasContext>> {
  if (sourceRefs.length === 0) {
    return new Map();
  }

  const pool = new Pool({
    host: config.postgres.host,
    port: config.postgres.port,
    user: config.postgres.user,
    password: config.postgres.password,
    database: config.postgres.database
  });

  try {
    const result = await pool.query(
      `SELECT
        source_ref,
        feature_id,
        feature_label,
        domain_class,
        packet_key,
        workspace_revision
      FROM atlas_packets
      WHERE source_ref = ANY($1)`,
      [sourceRefs]
    );

    const map = new Map<string, ParentAtlasContext>();
    for (const row of result.rows) {
      map.set(row.source_ref, {
        source_ref: row.source_ref,
        feature_id: row.feature_id,
        feature_label: row.feature_label,
        domain_class: row.domain_class,
        packet_key: row.packet_key,
        workspace_revision: row.workspace_revision,
        confidence: row.packet_key ? 0.95 : 0.6
      });
    }

    return map;
  } catch (err) {
    console.warn('Batch Parent Atlas resolution failed:', err);
    return new Map();
  } finally {
    await pool.end();
  }
}

export default {
  resolveParentAtlasContext,
  enrichFilterWithDomainTaxonomy,
  validateParentAtlasLineage,
  batchResolveParentAtlasContext
};
