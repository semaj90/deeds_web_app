/**
 * scripts/atlas/lib/ae-train-contract.mjs
 *
 * Frozen AE train contract — JSON Schema definitions for:
 *   - manifest entry (one record per feature-registry packet)
 *   - queue entry (deque item for the compression training queue)
 *   - training report (written to docs/reports/ae-train-*.json)
 *
 * This file is intentionally immutable after publication.
 * Bump CONTRACT_VERSION to introduce breaking changes.
 */

export const CONTRACT_VERSION = 'atlas-ae-train-v1';

// ── Manifest Entry Schema ─────────────────────────────────────────────────────
// One entry per atlas_packets row selected for AE training.

export const MANIFEST_ENTRY_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'AeTrainManifestEntry',
  type: 'object',
  required: [
    'packet_key',
    'source_ref',
    'feature_type',
    'version',
    'qdrant_collection',
    'qdrant_point_id',
    'embed_dim',
    'priority',
    'status',
  ],
  properties: {
    /** Stable Postgres identity. */
    packet_key:        { type: 'string', minLength: 1 },
    source_ref:        { type: 'string', minLength: 1 },
    /** Always 'sae_latent' for AE training outputs. */
    feature_type:      { type: 'string', enum: ['sae_latent'] },
    /** Semver-style version string for the trained AE weights. */
    version:           { type: 'string', pattern: '^[0-9]+\\.[0-9]+\\.[0-9]+$' },
    /** Qdrant collection supplying the raw embedding. */
    qdrant_collection: { type: 'string', minLength: 1 },
    /** Qdrant point UUID for this packet's embedding. */
    qdrant_point_id:   { type: 'string', minLength: 1 },
    /** Source embedding dimension (768 for codebase_chunks_768). */
    embed_dim:         { type: 'integer', enum: [768] },
    /** 0–100; higher = train first. Derived from feature_registry topology. */
    priority:          { type: 'integer', minimum: 0, maximum: 100 },
    /** pending | training | done | error */
    status:            { type: 'string', enum: ['pending', 'training', 'done', 'error'] },
    /** ISO-8601 timestamp; set when status transitions to 'done'. */
    completed_at:      { type: 'string', format: 'date-time' },
    /** feature_records.feature_id after successful upsert. */
    feature_id:        { type: 'string' },
    /** Error message if status === 'error'. */
    error:             { type: 'string' },
  },
  additionalProperties: false,
};

// ── Queue Entry Schema ────────────────────────────────────────────────────────
// The compression deque queue is a LIFO/priority stack consumed by the AE runner.

export const QUEUE_ENTRY_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'AeTrainQueueEntry',
  type: 'object',
  required: [
    'queue_id',
    'packet_key',
    'source_ref',
    'qdrant_collection',
    'qdrant_point_id',
    'embed_dim',
    'target_dim',
    'version',
    'priority',
    'enqueued_at',
  ],
  properties: {
    /** Monotonically increasing integer within a manifest run. */
    queue_id:          { type: 'integer', minimum: 0 },
    packet_key:        { type: 'string', minLength: 1 },
    source_ref:        { type: 'string', minLength: 1 },
    qdrant_collection: { type: 'string', minLength: 1 },
    qdrant_point_id:   { type: 'string', minLength: 1 },
    /** Input dimension to the AE encoder. */
    embed_dim:         { type: 'integer', enum: [768] },
    /** Output latent dimension from the AE encoder. */
    target_dim:        { type: 'integer', enum: [64] },
    version:           { type: 'string', pattern: '^[0-9]+\\.[0-9]+\\.[0-9]+$' },
    priority:          { type: 'integer', minimum: 0, maximum: 100 },
    enqueued_at:       { type: 'string', format: 'date-time' },
  },
  additionalProperties: false,
};

// ── Manifest Document Schema ──────────────────────────────────────────────────
// The top-level manifest JSON written to docs/reports/ae-train-manifest.json.

export const MANIFEST_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'AeTrainManifest',
  type: 'object',
  required: [
    'contract_version',
    'generated_at',
    'ae_version',
    'qdrant_collection',
    'embed_dim',
    'target_dim',
    'total_records',
    'records',
    'queue',
  ],
  properties: {
    contract_version:  { type: 'string', const: CONTRACT_VERSION },
    generated_at:      { type: 'string', format: 'date-time' },
    /** Weights version that will be produced. */
    ae_version:        { type: 'string', pattern: '^[0-9]+\\.[0-9]+\\.[0-9]+$' },
    qdrant_collection: { type: 'string' },
    embed_dim:         { type: 'integer', enum: [768] },
    target_dim:        { type: 'integer', enum: [64] },
    total_records:     { type: 'integer', minimum: 0 },
    records: {
      type: 'array',
      items: MANIFEST_ENTRY_SCHEMA,
    },
    queue: {
      type: 'array',
      items: QUEUE_ENTRY_SCHEMA,
    },
  },
  additionalProperties: false,
};

// ── Training Report Schema ────────────────────────────────────────────────────
// Written to docs/reports/ae-train-report-<timestamp>.json after training.

export const REPORT_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'AeTrainReport',
  type: 'object',
  required: [
    'contract_version',
    'generated_at',
    'ae_version',
    'qdrant_collection',
    'embed_dim',
    'target_dim',
    'dry_run',
    'totals',
    'weights_saved',
    'feature_records_written',
  ],
  properties: {
    contract_version:       { type: 'string', const: CONTRACT_VERSION },
    generated_at:           { type: 'string', format: 'date-time' },
    ae_version:             { type: 'string' },
    qdrant_collection:      { type: 'string' },
    embed_dim:              { type: 'integer' },
    target_dim:             { type: 'integer' },
    dry_run:                { type: 'boolean' },
    totals: {
      type: 'object',
      required: ['queued', 'done', 'errors', 'skipped'],
      properties: {
        queued:  { type: 'integer' },
        done:    { type: 'integer' },
        errors:  { type: 'integer' },
        skipped: { type: 'integer' },
      },
    },
    /** True if AE weights were persisted to Redis. */
    weights_saved:           { type: 'boolean' },
    /** Number of feature_records rows written via upsertFeatureRecord. */
    feature_records_written: { type: 'integer', minimum: 0 },
    /** Training metrics from the AE trainer (epochs, loss, duration). */
    training_metrics: {
      type: 'object',
      properties: {
        epochs:      { type: 'integer' },
        best_loss:   { type: 'number' },
        duration_ms: { type: 'integer' },
        vector_count:{ type: 'integer' },
      },
    },
    errors: {
      type: 'array',
      items: {
        type: 'object',
        required: ['packet_key', 'error'],
        properties: {
          packet_key: { type: 'string' },
          error:      { type: 'string' },
        },
      },
    },
  },
  additionalProperties: false,
};

// ── Validation helpers ────────────────────────────────────────────────────────
// Lightweight validate — no dependency on ajv in the CLI scripts.

/**
 * Validates required fields of a manifest entry; throws on violation.
 * @param {object} entry
 */
export function validateManifestEntry(entry) {
  for (const field of MANIFEST_ENTRY_SCHEMA.required) {
    if (entry[field] === undefined || entry[field] === null) {
      throw new Error(`AeTrainManifestEntry missing required field: ${field}`);
    }
  }
  if (entry.embed_dim !== 768) {
    throw new Error(`AeTrainManifestEntry embed_dim must be 768, got ${entry.embed_dim}`);
  }
  if (entry.version && !/^\d+\.\d+\.\d+$/.test(entry.version)) {
    throw new Error(`AeTrainManifestEntry version must be semver, got ${entry.version}`);
  }
}

/**
 * Validates required fields of a queue entry; throws on violation.
 * @param {object} entry
 */
export function validateQueueEntry(entry) {
  for (const field of QUEUE_ENTRY_SCHEMA.required) {
    if (entry[field] === undefined || entry[field] === null) {
      throw new Error(`AeTrainQueueEntry missing required field: ${field}`);
    }
  }
  if (entry.embed_dim !== 768) {
    throw new Error(`AeTrainQueueEntry embed_dim must be 768, got ${entry.embed_dim}`);
  }
  if (entry.target_dim !== 64) {
    throw new Error(`AeTrainQueueEntry target_dim must be 64, got ${entry.target_dim}`);
  }
}

/**
 * Validates a complete manifest document; throws on violation.
 * @param {object} manifest
 */
export function validateManifest(manifest) {
  if (manifest.contract_version !== CONTRACT_VERSION) {
    throw new Error(
      `AeTrainManifest contract_version mismatch: expected ${CONTRACT_VERSION}, got ${manifest.contract_version}`,
    );
  }
  for (const field of MANIFEST_SCHEMA.required) {
    if (manifest[field] === undefined || manifest[field] === null) {
      throw new Error(`AeTrainManifest missing required field: ${field}`);
    }
  }
  if (!Array.isArray(manifest.records)) {
    throw new Error('AeTrainManifest.records must be an array');
  }
  if (!Array.isArray(manifest.queue)) {
    throw new Error('AeTrainManifest.queue must be an array');
  }
  for (const entry of manifest.records) validateManifestEntry(entry);
  for (const entry of manifest.queue)   validateQueueEntry(entry);
}
