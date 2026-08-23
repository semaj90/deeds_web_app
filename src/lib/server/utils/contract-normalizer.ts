import { db } from '$lib/server/db/drizzle.js';
import { atlasContractFields } from '$lib/server/db/schema.js';

// Static fallback mappings for hot path / fallback / test environments
const STATIC_MAPPINGS: Record<string, string> = {
  // source_ref mappings
  'canonicalSourceRef': 'source_ref',
  'sourceRef': 'source_ref',
  'source_path': 'source_ref',
  'filePath': 'source_ref',
  'file_path': 'source_ref',
  'rel_path': 'source_ref',
  'relPath': 'source_ref',

  // feature_id mappings
  'featureId': 'feature_id',
  'feature': 'feature_id',

  // feature_label mappings
  'featureLabel': 'feature_label',
  'feature_name': 'feature_label',

  // domain_class mappings
  'domain': 'domain_class',
  'domainClass': 'domain_class',

  // ontology_label mappings
  'ontology': 'ontology_label',

  // topology_label mappings
  'topology': 'ontology_label',

  // community_id mappings
  'community': 'community_id',
  'communityId': 'community_id',

  // som_cluster mappings
  'som_cell': 'som_cluster',

  // packet_key mappings
  'packetKey': 'packet_key',
  'id': 'packet_key',
};

let dbMappings: Record<string, string> | null = null;
let initialized = false;

/**
 * Initializes dynamic contract field mappings from Postgres.
 */
export async function initNormalizer() {
  if (initialized) return;
  initialized = true;
  try {
    const rows = await db.select({
      raw: atlasContractFields.rawField,
      canonical: atlasContractFields.canonicalField,
    }).from(atlasContractFields);
    dbMappings = {};
    for (const r of rows) {
      dbMappings[r.raw] = r.canonical;
    }
  } catch (err) {
    console.warn('⚠️ Failed to load dynamic contract mappings from DB, using static fallback:', err.message);
  }
}

/**
 * Maps raw payload or metadata fields to canonical normalized contract fields.
 * Uses DB mappings if successfully loaded, else falls back to static mappings.
 */
export function normalizeContractFields(payload: Record<string, any>): Record<string, any> {
  const mappings = dbMappings || STATIC_MAPPINGS;
  const normalized: Record<string, any> = {};
  for (const [key, val] of Object.entries(payload)) {
    const canonicalKey = mappings[key] || key;
    normalized[canonicalKey] = val;
  }
  return normalized;
}
