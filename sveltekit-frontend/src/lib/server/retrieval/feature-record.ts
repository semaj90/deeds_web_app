/**
 * Feature Registry — typed CRUD for feature_records table.
 *
 * Every computed artifact (embedding, cluster assignment, pagerank score,
 * SAE latent, AST extraction, etc.) is versioned here with a stable UUID,
 * version string, SHA-256 input hash, and JSONB payload.
 *
 * Supersession: writing a newer version of a feature does not delete the old
 * row — it sets superseded_at / superseded_by on the old row and inserts a
 * fresh row. The unique index on (packet_key, feature_type, version) WHERE
 * superseded_at IS NULL guarantees at most one current record per (packet,
 * type, version) triple.
 */

import { db } from '$lib/server/db/client.js';
import { sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FeatureType =
  | 'embedding384'
  | 'embedding768'
  | 'pca64'
  | 'som20'
  | 'kmeans64'
  | 'pagerank'
  | 'community'
  | 'graphsage128'
  | 'sae_latent'
  | 'ast'
  | 'summary'
  | 'collaborative';

export interface FeatureRecord {
  feature_id: string;
  packet_key: string;
  feature_type: FeatureType;
  version: string;
  snapshot_hash: string;
  payload: Record<string, unknown>;
  scalar_f32: number | null;
  vector_f32: string | null;
  created_at: Date;
  superseded_at: Date | null;
  superseded_by: string | null;
}

export interface UpsertFeatureInput {
  packet_key: string;
  feature_type: FeatureType;
  version: string;
  /** Canonical input to hash — must be the exact bytes that produced the payload. */
  canonical_input: string | Buffer;
  payload: Record<string, unknown>;
  scalar_f32?: number;
  /** Base64-encoded float32 array (for dims < 256). */
  vector_f32?: string;
}

// ---------------------------------------------------------------------------
// Hash helper
// ---------------------------------------------------------------------------

function sha256(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

// ---------------------------------------------------------------------------
// Write operations
// ---------------------------------------------------------------------------

/**
 * Insert a new feature record.
 *
 * If a current (superseded_at IS NULL) record already exists for the same
 * (packet_key, feature_type, version) AND has the same snapshot_hash, it is
 * returned as-is (idempotent).
 *
 * If the hash differs (input changed), the old record is superseded and a new
 * one is inserted atomically.
 */
export async function upsertFeatureRecord(input: UpsertFeatureInput): Promise<FeatureRecord> {
  const snapshot_hash = sha256(input.canonical_input);

  const result = await db.execute(sql`
    WITH existing AS (
      SELECT feature_id, snapshot_hash
      FROM feature_records
      WHERE packet_key   = ${input.packet_key}
        AND feature_type = ${input.feature_type}
        AND version      = ${input.version}
        AND superseded_at IS NULL
      LIMIT 1
    ),
    supersede AS (
      UPDATE feature_records fr
      SET
        superseded_at = NOW(),
        superseded_by = gen_random_uuid()
      FROM existing e
      WHERE fr.feature_id = e.feature_id
        AND e.snapshot_hash != ${snapshot_hash}
      RETURNING fr.feature_id AS old_id,
                fr.superseded_by AS new_id
    ),
    insert_new AS (
      INSERT INTO feature_records (
        feature_id,
        packet_key,
        feature_type,
        version,
        snapshot_hash,
        payload,
        scalar_f32,
        vector_f32
      )
      SELECT
        COALESCE(s.new_id, gen_random_uuid()),
        ${input.packet_key},
        ${input.feature_type},
        ${input.version},
        ${snapshot_hash},
        ${JSON.stringify(input.payload)}::jsonb,
        ${input.scalar_f32 ?? null}::real,
        ${input.vector_f32 ?? null}
      FROM (SELECT 1) dummy
      LEFT JOIN supersede s ON true
      WHERE
        -- Only insert if there was no existing row, or we just superseded one
        NOT EXISTS (
          SELECT 1 FROM existing e
          WHERE e.snapshot_hash = ${snapshot_hash}
        )
      RETURNING *
    )
    -- Return inserted row if new, or existing unchanged row
    SELECT * FROM insert_new
    UNION ALL
    SELECT fr.* FROM feature_records fr
    JOIN existing e ON fr.feature_id = e.feature_id
    WHERE e.snapshot_hash = ${snapshot_hash}
    LIMIT 1
  `);

  const rows = result.rows as Array<Record<string, unknown>>;
  if (!rows[0]) {
    throw new Error(
      `upsertFeatureRecord: no row returned for ${input.packet_key}/${input.feature_type}/${input.version}`
    );
  }

  return rowToRecord(rows[0]);
}

/**
 * Mark a feature record as superseded (without inserting a replacement).
 * Use when a feature type is being retired entirely.
 */
export async function supersedeFeatureRecord(feature_id: string): Promise<void> {
  await db.execute(sql`
    UPDATE feature_records
    SET superseded_at = NOW()
    WHERE feature_id  = ${feature_id}::uuid
      AND superseded_at IS NULL
  `);
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

/**
 * Get the current (non-superseded) feature record for a specific
 * (packet_key, feature_type, version) triple.
 * Returns null if none exists.
 */
export async function getFeatureRecord(
  packet_key: string,
  feature_type: FeatureType,
  version: string,
): Promise<FeatureRecord | null> {
  const result = await db.execute(sql`
    SELECT *
    FROM feature_records
    WHERE packet_key   = ${packet_key}
      AND feature_type = ${feature_type}
      AND version      = ${version}
      AND superseded_at IS NULL
    LIMIT 1
  `);

  const row = (result.rows as Array<Record<string, unknown>>)[0];
  return row ? rowToRecord(row) : null;
}

/**
 * Get the latest current feature of each requested type for a single packet.
 * Returns a map keyed by feature_type.
 */
export async function getPacketFeatures(
  packet_key: string,
  feature_types?: FeatureType[],
): Promise<Map<FeatureType, FeatureRecord>> {
  const result = feature_types?.length
    ? await db.execute(sql`
        SELECT DISTINCT ON (feature_type) *
        FROM feature_records
        WHERE packet_key   = ${packet_key}
          AND feature_type = ANY(${feature_types}::text[])
          AND superseded_at IS NULL
        ORDER BY feature_type, created_at DESC
      `)
    : await db.execute(sql`
        SELECT DISTINCT ON (feature_type) *
        FROM feature_records
        WHERE packet_key  = ${packet_key}
          AND superseded_at IS NULL
        ORDER BY feature_type, created_at DESC
      `);

  const map = new Map<FeatureType, FeatureRecord>();
  for (const row of result.rows as Array<Record<string, unknown>>) {
    const rec = rowToRecord(row);
    map.set(rec.feature_type, rec);
  }
  return map;
}

/**
 * Bulk fetch current features for multiple packets.
 * Returns a map keyed by packet_key → Map<feature_type, FeatureRecord>.
 *
 * Designed for batch hydration during retrieval (one SQL round-trip).
 */
export async function listCurrentFeatures(
  packet_keys: string[],
  feature_types?: FeatureType[],
): Promise<Map<string, Map<FeatureType, FeatureRecord>>> {
  if (packet_keys.length === 0) return new Map();

  const result = feature_types?.length
    ? await db.execute(sql`
        SELECT DISTINCT ON (packet_key, feature_type) *
        FROM feature_records
        WHERE packet_key   = ANY(${packet_keys}::text[])
          AND feature_type = ANY(${feature_types}::text[])
          AND superseded_at IS NULL
        ORDER BY packet_key, feature_type, created_at DESC
      `)
    : await db.execute(sql`
        SELECT DISTINCT ON (packet_key, feature_type) *
        FROM feature_records
        WHERE packet_key   = ANY(${packet_keys}::text[])
          AND superseded_at IS NULL
        ORDER BY packet_key, feature_type, created_at DESC
      `);

  const outer = new Map<string, Map<FeatureType, FeatureRecord>>();
  for (const row of result.rows as Array<Record<string, unknown>>) {
    const rec = rowToRecord(row);
    if (!outer.has(rec.packet_key)) outer.set(rec.packet_key, new Map());
    outer.get(rec.packet_key)!.set(rec.feature_type, rec);
  }
  return outer;
}

/**
 * List version history for a (packet_key, feature_type) pair,
 * newest first. Includes superseded rows.
 */
export async function getFeatureHistory(
  packet_key: string,
  feature_type: FeatureType,
): Promise<FeatureRecord[]> {
  const result = await db.execute(sql`
    SELECT *
    FROM feature_records
    WHERE packet_key   = ${packet_key}
      AND feature_type = ${feature_type}
    ORDER BY created_at DESC
  `);

  return (result.rows as Array<Record<string, unknown>>).map(rowToRecord);
}

// ---------------------------------------------------------------------------
// Arrow export helper (for offline training pipeline)
// ---------------------------------------------------------------------------

/**
 * Stream all current feature records of a given type + version as raw rows.
 * Called by the Arrow export script (`scripts/atlas/export-features-arrow.mjs`)
 * which converts these rows into an Arrow IPC file for PyTorch training.
 *
 * Uses a server-side cursor to avoid loading all rows into memory at once.
 * Caller provides an async callback invoked per batch.
 */
export async function streamFeatureRecords(
  feature_type: FeatureType,
  version: string,
  onBatch: (batch: FeatureRecord[]) => Promise<void>,
  batchSize = 500,
): Promise<{ total: number }> {
  let offset = 0;
  let total = 0;

  while (true) {
    const result = await db.execute(sql`
      SELECT *
      FROM feature_records
      WHERE feature_type = ${feature_type}
        AND version      = ${version}
        AND superseded_at IS NULL
      ORDER BY created_at ASC
      LIMIT ${batchSize} OFFSET ${offset}
    `);

    const rows = result.rows as Array<Record<string, unknown>>;
    if (rows.length === 0) break;

    await onBatch(rows.map(rowToRecord));
    total += rows.length;
    offset += rows.length;

    if (rows.length < batchSize) break;
  }

  return { total };
}

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------

function rowToRecord(row: Record<string, unknown>): FeatureRecord {
  return {
    feature_id: String(row['feature_id']),
    packet_key: String(row['packet_key']),
    feature_type: String(row['feature_type']) as FeatureType,
    version: String(row['version']),
    snapshot_hash: String(row['snapshot_hash']),
    payload: (row['payload'] as Record<string, unknown>) ?? {},
    scalar_f32: row['scalar_f32'] != null ? Number(row['scalar_f32']) : null,
    vector_f32: row['vector_f32'] != null ? String(row['vector_f32']) : null,
    created_at: new Date(String(row['created_at'])),
    superseded_at: row['superseded_at'] ? new Date(String(row['superseded_at'])) : null,
    superseded_by: row['superseded_by'] != null ? String(row['superseded_by']) : null,
  };
}
