/**
 * packet-registry.mjs
 *
 * Canonical registry constants for atlas packet identity.
 * All scripts and services that write title_id or title_generator_version
 * MUST import TITLE_GENERATOR_VERSION from here — never duplicate as a literal.
 *
 * Canonical title_id format:
 *   title:<slug>:<hash8>
 *   slug  = [a-z0-9]+(-[a-z0-9]+)*  (NO trailing dash)
 *   hash8 = [a-f0-9]{8}
 */

/** Version string written to atlas_packets.title_generator_version on every title_id write. */
export const TITLE_GENERATOR_VERSION = 'semantic-title-v1';

/** Regex for validating canonical title_id format. */
export const CANONICAL_TITLE_RE = /^title:[a-z0-9]+(-[a-z0-9]+)*:[a-f0-9]{8}$/;

/**
 * Identity columns that backfill scripts must NEVER modify.
 * Checked at runtime: if any of these appear in an UPDATE SET clause, abort.
 */
export const IDENTITY_COLUMNS_READONLY = Object.freeze([
  'packet_key',
  'source_ref',
  'feature_id',
  'tree_node_id',
  'qdrant_point_id',
]);

/**
 * Columns a title backfill is permitted to write.
 */
export const TITLE_BACKFILL_WRITABLE_COLUMNS = Object.freeze([
  'title_id',
  'title_generator_version',
  'updated_at',
]);
