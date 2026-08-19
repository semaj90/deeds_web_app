import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import {
  algorithmExecutionManifestSchema,
  checksumAlgorithmExecutionManifest,
  type AlgorithmExecutionManifestV1,
} from './algorithm-execution-manifest.js';

const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const algorithmExecutionReceiptSchema = z.object({
  schema: z.literal('atlas.algorithm-execution-receipt.v1').default('atlas.algorithm-execution-receipt.v1'),
  execution_id: z.string().min(1),
  manifest_checksum: checksum,
  manifest: algorithmExecutionManifestSchema,
  recorded_at: z.string().datetime(),
  canonical_authority: z.literal(false).default(false),
}).strict();

export const algorithmExecutionCdcEventSchema = z.object({
  schema: z.literal('atlas.algorithm-execution-event.v1').default('atlas.algorithm-execution-event.v1'),
  event_id: z.string().min(1),
  event_type: z.enum(['recorded', 'invalidated']),
  execution_id: z.string().min(1),
  manifest_checksum: checksum,
  source_snapshot_revision: z.string().min(1),
  representation_revision: z.string().min(1).nullable(),
  algorithm: z.string().min(1),
  compute_backend: z.string().min(1),
  cache_key: z.string().min(1),
  occurred_at: z.string().datetime(),
  canonical_authority: z.literal(false).default(false),
}).strict();

export type AlgorithmExecutionReceiptV1 = z.infer<typeof algorithmExecutionReceiptSchema>;
export type AlgorithmExecutionCdcEventV1 = z.infer<typeof algorithmExecutionCdcEventSchema>;

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Cache identity for execution results. Cache lookup can only reuse a result
 * when the frozen source snapshot, representation, algorithm identity and input
 * checksum all agree. Cache presence never upgrades an approximate result into
 * canonical evidence.
 */
export function buildAlgorithmExecutionCacheKey(manifest: AlgorithmExecutionManifestV1): string {
  const value = algorithmExecutionManifestSchema.parse(manifest);
  const manifestChecksum = checksumAlgorithmExecutionManifest(value);
  const representation = value.representation_revision ?? 'none';
  return [
    'atlas:algorithm-exec:v1',
    value.source_snapshot_revision,
    representation,
    value.algorithm,
    value.compute_backend,
    manifestChecksum,
    value.input_checksum,
  ].map((part) => encodeURIComponent(part)).join(':');
}

export function buildAlgorithmExecutionCdcEvent(input: {
  receipt: AlgorithmExecutionReceiptV1;
  event_type?: 'recorded' | 'invalidated';
  occurred_at?: string;
}): AlgorithmExecutionCdcEventV1 {
  const receipt = algorithmExecutionReceiptSchema.parse(input.receipt);
  const occurredAt = input.occurred_at ?? new Date().toISOString();
  return algorithmExecutionCdcEventSchema.parse({
    event_id: `algorithm-event:${sha256(`${receipt.execution_id}\0${receipt.manifest_checksum}\0${input.event_type ?? 'recorded'}\0${occurredAt}`).slice(0, 40)}`,
    event_type: input.event_type ?? 'recorded',
    execution_id: receipt.execution_id,
    manifest_checksum: receipt.manifest_checksum,
    source_snapshot_revision: receipt.manifest.source_snapshot_revision,
    representation_revision: receipt.manifest.representation_revision ?? null,
    algorithm: receipt.manifest.algorithm,
    compute_backend: receipt.manifest.compute_backend,
    cache_key: buildAlgorithmExecutionCacheKey(receipt.manifest),
    occurred_at: occurredAt,
    canonical_authority: false,
  });
}

export function createAlgorithmExecutionRepository(pool: Pool, client?: PoolClient) {
  const queryable = client ?? pool;

  async function record(manifestInput: AlgorithmExecutionManifestV1): Promise<AlgorithmExecutionReceiptV1> {
    const manifest = algorithmExecutionManifestSchema.parse(manifestInput);
    const manifestChecksum = checksumAlgorithmExecutionManifest(manifest);
    const recordedAt = new Date().toISOString();

    const result = await queryable.query<{
      execution_id: string;
      manifest_checksum: string;
      manifest: unknown;
      recorded_at: Date | string;
    }>(`
      INSERT INTO atlas_algorithm_execution_receipts (
        execution_id,
        workflow_id,
        action_id,
        dag_node_id,
        stage,
        logical_lane,
        algorithm_class,
        algorithm,
        geometry,
        metric,
        compute_backend,
        compilation_mode,
        transport,
        serialization,
        source_snapshot_revision,
        representation_revision,
        graph_snapshot_revision,
        relationship_snapshot_revision,
        input_checksum,
        output_checksum,
        manifest_checksum,
        manifest,
        recorded_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb,$23::timestamptz
      )
      ON CONFLICT (execution_id) DO UPDATE SET
        manifest_checksum = EXCLUDED.manifest_checksum,
        output_checksum = EXCLUDED.output_checksum,
        manifest = EXCLUDED.manifest,
        recorded_at = EXCLUDED.recorded_at
      WHERE atlas_algorithm_execution_receipts.manifest_checksum = EXCLUDED.manifest_checksum
      RETURNING execution_id, manifest_checksum, manifest, recorded_at
    `, [
      manifest.execution_id,
      manifest.workflow_id ?? null,
      manifest.action_id ?? null,
      manifest.dag_node_id,
      manifest.stage,
      manifest.logical_lane,
      manifest.algorithm_class,
      manifest.algorithm,
      manifest.geometry,
      manifest.metric,
      manifest.compute_backend,
      manifest.compilation_mode,
      manifest.transport,
      manifest.serialization,
      manifest.source_snapshot_revision,
      manifest.representation_revision ?? null,
      manifest.graph_snapshot_revision ?? null,
      manifest.relationship_snapshot_revision ?? null,
      manifest.input_checksum,
      manifest.output_checksum ?? null,
      manifestChecksum,
      JSON.stringify(manifest),
      recordedAt,
    ]);

    if (result.rowCount !== 1) {
      throw new Error(`ALGORITHM_EXECUTION_IDENTITY_CONFLICT:${manifest.execution_id}`);
    }
    const row = result.rows[0]!;
    const storedAt = row.recorded_at instanceof Date ? row.recorded_at.toISOString() : new Date(row.recorded_at).toISOString();
    return algorithmExecutionReceiptSchema.parse({
      execution_id: row.execution_id,
      manifest_checksum: row.manifest_checksum,
      manifest: row.manifest,
      recorded_at: storedAt,
      canonical_authority: false,
    });
  }

  async function readback(executionId: string): Promise<AlgorithmExecutionReceiptV1 | null> {
    const result = await queryable.query<{
      execution_id: string;
      manifest_checksum: string;
      manifest: unknown;
      recorded_at: Date | string;
    }>(`
      SELECT execution_id, manifest_checksum, manifest, recorded_at
      FROM atlas_algorithm_execution_receipts
      WHERE execution_id = $1
    `, [executionId]);
    if (result.rowCount === 0) return null;
    const row = result.rows[0]!;
    return algorithmExecutionReceiptSchema.parse({
      execution_id: row.execution_id,
      manifest_checksum: row.manifest_checksum,
      manifest: row.manifest,
      recorded_at: row.recorded_at instanceof Date ? row.recorded_at.toISOString() : new Date(row.recorded_at).toISOString(),
      canonical_authority: false,
    });
  }

  return { record, readback };
}
