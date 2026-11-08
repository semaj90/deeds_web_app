// sveltekit-frontend/src/lib/server/atlas/kanban/kanban-dag-prefill-v1.ts
import { Pool } from 'pg';
import { createHash } from 'node:crypto';

export interface UpsertReceiptV1 {
  success: boolean;
  rowsProcessed: number;
  dbHost: string;
  durationMs: number;
  sha256Digest: string;
  canonicalAuthority: boolean;
}

/**
 * Enforces Security Gate P0: Refuses execution if the PostgreSQL connection string
 * points to production, live, or the main legal_ai_db instance.
 */
export function assertScratchDatabaseUri(connectionString?: string): string {
  const url = connectionString || process.env.ATLAS_SCRATCH_PG18_URL || '';
  if (!url.trim()) {
    throw new Error('[SECURITY GATE P0] ATLAS_SCRATCH_PG18_URL environment variable is missing.');
  }

  const forbiddenTokens = ['legal_ai_db', 'production', 'live', 'main_db'];
  const lower = url.toLowerCase();
  for (const token of forbiddenTokens) {
    if (lower.includes(token)) {
      throw new Error(`[SECURITY GATE P0] FATAL: Connection URI contains forbidden production token '${token}'. Aborting.`);
    }
  }
  return url;
}

export interface DecodedTaskRecordV2 {
  mortonCode: number;
  taskOrdinal: number;
  clusterId: number;
  position: [number, number, number];
  finalScore: number;
  features: number[];
  latent64: Float32Array; // 64 floats
}

/**
 * Decodes the 417,728-byte v2 binary record block and 1,670,912-byte latent vectors
 * into structured TaskRecord objects.
 */
export function decodeTaskRecordsAndLatents(
  recordBuffer: ArrayBuffer | Buffer,
  latentBuffer: ArrayBuffer | Buffer,
  taskCount = 6527
): DecodedTaskRecordV2[] {
  const RECORD_SIZE = 64;
  const LATENT_DIM = 64;

  if (recordBuffer.byteLength !== taskCount * RECORD_SIZE) {
    throw new Error(`RECORD_LENGTH_MISMATCH: got ${recordBuffer.byteLength}, expected ${taskCount * RECORD_SIZE}`);
  }
  if (latentBuffer.byteLength !== taskCount * LATENT_DIM * 4) {
    throw new Error(`LATENT_LENGTH_MISMATCH: got ${latentBuffer.byteLength}, expected ${taskCount * LATENT_DIM * 4}`);
  }

  const isRecBuf = typeof Buffer !== 'undefined' && Buffer.isBuffer(recordBuffer);
  const recView = new DataView(
    isRecBuf ? recordBuffer.buffer : (recordBuffer as ArrayBuffer),
    isRecBuf ? recordBuffer.byteOffset : 0,
    recordBuffer.byteLength
  );

  const isLatBuf = typeof Buffer !== 'undefined' && Buffer.isBuffer(latentBuffer);
  const latView = new DataView(
    isLatBuf ? latentBuffer.buffer : (latentBuffer as ArrayBuffer),
    isLatBuf ? latentBuffer.byteOffset : 0,
    latentBuffer.byteLength
  );

  const results: DecodedTaskRecordV2[] = [];

  for (let i = 0; i < taskCount; i++) {
    const o = i * RECORD_SIZE;
    const mortonCode = recView.getUint32(o + 0, true);
    const taskOrdinal = recView.getUint32(o + 4, true);
    const clusterId = recView.getUint16(o + 8, true);
    // reserved 2 bytes at o + 10

    const pos: [number, number, number] = [
      recView.getFloat32(o + 12, true),
      recView.getFloat32(o + 16, true),
      recView.getFloat32(o + 20, true)
    ];
    const finalScore = recView.getFloat64(o + 24, true);

    const features: number[] = [];
    for (let f = 0; f < 8; f++) {
      features.push(recView.getFloat32(o + 32 + f * 4, true));
    }

    const latent64 = new Float32Array(LATENT_DIM);
    const latBase = i * LATENT_DIM * 4;
    for (let d = 0; d < LATENT_DIM; d++) {
      latent64[d] = latView.getFloat32(latBase + d * 4, true);
    }

    results.push({
      mortonCode,
      taskOrdinal,
      clusterId,
      position: pos,
      finalScore,
      features,
      latent64
    });
  }

  return results;
}

/**
 * Upserts the decoded OpenSpec DAG tasks into PostgreSQL 18 public.atlas_kanban_dag_prefill_v1
 * using batch transactions and ON CONFLICT (task_id) DO UPDATE.
 */
export async function upsertKanbanDagPrefill(
  poolOrUri: Pool | string,
  records: DecodedTaskRecordV2[],
  taskIds: string[]
): Promise<UpsertReceiptV1> {
  const t0 = performance.now();
  const connectionString = typeof poolOrUri === 'string' ? assertScratchDatabaseUri(poolOrUri) : undefined;
  const pool = typeof poolOrUri === 'string' ? new Pool({ connectionString }) : poolOrUri;

  const hasher = createHash('sha256');
  let processed = 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN;');

    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      const taskId = taskIds[i] || `task:ordinal:${rec.taskOrdinal}`;
      const sequenceId = i + 1;
      const procedureId = `proc:comm:${rec.clusterId}:task:${rec.taskOrdinal}`;
      const executionStatus = rec.finalScore > 0.5 ? 'ROUTED_ACTIVE' : 'UNROUTED';

      // Convert Float32Array latent64 to Buffer for PostgreSQL BYTEA storage
      const latentBuffer = Buffer.from(rec.latent64.buffer, rec.latent64.byteOffset, rec.latent64.byteLength);

      const queryText = `
        INSERT INTO public.atlas_kanban_dag_prefill_v1 (
            task_id, sequence_id, procedure_id, morton_code, task_ordinal,
            cluster_id, position_x, position_y, position_z, final_score,
            latent64, execution_status, canonical_authority
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, false)
        ON CONFLICT (task_id) DO UPDATE SET
            sequence_id      = EXCLUDED.sequence_id,
            procedure_id     = EXCLUDED.procedure_id,
            morton_code      = EXCLUDED.morton_code,
            cluster_id       = EXCLUDED.cluster_id,
            position_x       = EXCLUDED.position_x,
            position_y       = EXCLUDED.position_y,
            position_z       = EXCLUDED.position_z,
            final_score      = EXCLUDED.final_score,
            latent64         = EXCLUDED.latent64,
            execution_status = EXCLUDED.execution_status,
            updated_at       = clock_timestamp();
      `;

      await client.query(queryText, [
        taskId,
        sequenceId,
        procedureId,
        rec.mortonCode,
        rec.taskOrdinal,
        rec.clusterId,
        rec.position[0],
        rec.position[1],
        rec.position[2],
        rec.finalScore,
        latentBuffer,
        executionStatus
      ]);

      hasher.update(taskId);
      processed++;
    }

    await client.query('COMMIT;');
  } catch (err) {
    await client.query('ROLLBACK;');
    throw err;
  } finally {
    client.release();
    if (typeof poolOrUri === 'string') {
      await pool.end();
    }
  }
  const durationMs = Number((performance.now() - t0).toFixed(2));
  return {
    success: true,
    rowsProcessed: processed,
    dbHost: typeof poolOrUri === 'string' ? new URL(connectionString!).hostname : 'pool',
    durationMs,
    sha256Digest: hasher.digest('hex'),
    canonicalAuthority: false
  };
}
