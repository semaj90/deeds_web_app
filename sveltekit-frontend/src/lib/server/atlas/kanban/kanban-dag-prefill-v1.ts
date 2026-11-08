// sveltekit-frontend/src/lib/server/atlas/kanban/kanban-dag-prefill-v1.ts
//
// Decodes the v2 64-byte task records + latent64 file and upserts them into a SCRATCH PostgreSQL 18
// database. Nothing here is canonical: rows are proposals (canonical_authority is always false).
//
// Safety contract (fail closed):
//  - The target database is identified structurally (parsed URL AND current_database() read back inside the
//    transaction), never by substring matching. The name must end in `_scratch`, the server must be PG18+,
//    and the host must be loopback unless explicitly allowed. This applies to a caller-supplied Pool too.
//  - Writes need the explicit opt-in ATLAS_SCRATCH_PG18_ALLOW_WRITES=1 in BOTH modes.
//  - `rehearse` (default) always ends in ROLLBACK and PASSes only if an independent connection sees the
//    target rows exactly as they were. `apply` COMMITs and PASSes only if an independent connection reads
//    the rows back.
//  - A connection string or password is never placed in an error message or receipt.
import { Pool, type PoolClient } from 'pg';
import { createHash } from 'node:crypto';

export type PrefillModeV1 = 'rehearse' | 'apply';

export interface UpsertReceiptV1 {
  schema: 'atlas.kanban-dag-prefill-receipt.v1';
  status: 'PASS' | 'FAIL';
  mode: PrefillModeV1;
  rowsStaged: number;
  committed: boolean;
  rolledBack: boolean;
  independentlyVerified: boolean;
  failReason: string | null;
  dbName: string;
  dbHost: string;
  durationMs: number;
  /** sha256 over `taskId \t taskOrdinal \t finalScore` lines; not a row-content digest. */
  sha256Digest: string;
  canonicalAuthority: false;
}

const TABLE = 'public.atlas_kanban_dag_prefill_v1';
const SCRATCH_DB_RE = /^[a-z0-9_]+_scratch$/;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const MIN_SERVER_VERSION_NUM = 180000;
const RECORD_SIZE = 64;
const LATENT_DIM = 64;

export interface ScratchTargetV1 {
  host: string;
  database: string;
}

/** Structural parse of the scratch URL. Never echoes the URL or its password in an error. */
export function parseScratchDatabaseUri(connectionString?: string, env: NodeJS.ProcessEnv = process.env): ScratchTargetV1 {
  const raw = (connectionString ?? env.ATLAS_SCRATCH_PG18_URL ?? '').trim();
  if (!raw) throw new Error('SCRATCH_GATE: ATLAS_SCRATCH_PG18_URL is missing');
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('SCRATCH_GATE: connection string is not a valid URL'); }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') throw new Error('SCRATCH_GATE: protocol must be postgres(ql)');
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!SCRATCH_DB_RE.test(database)) throw new Error('SCRATCH_GATE: database name must match /^[a-z0-9_]+_scratch$/');
  const host = url.hostname;
  if (!LOOPBACK_HOSTS.has(host) && env.ATLAS_SCRATCH_PG18_ALLOW_REMOTE_HOST !== host) {
    throw new Error('SCRATCH_GATE: host is not loopback and is not named in ATLAS_SCRATCH_PG18_ALLOW_REMOTE_HOST');
  }
  return { host, database };
}

/** Back-compat name: validates and returns the URL unchanged. */
export function assertScratchDatabaseUri(connectionString?: string, env: NodeJS.ProcessEnv = process.env): string {
  parseScratchDatabaseUri(connectionString, env);
  return (connectionString ?? env.ATLAS_SCRATCH_PG18_URL ?? '').trim();
}

function assertWritesOptedIn(env: NodeJS.ProcessEnv): void {
  if (env.ATLAS_SCRATCH_PG18_ALLOW_WRITES !== '1') {
    throw new Error('SCRATCH_GATE: set ATLAS_SCRATCH_PG18_ALLOW_WRITES=1 to allow writes (rehearsal rows are rolled back, but they are still written)');
  }
}

async function readBackIdentity(client: Pick<PoolClient, 'query'>): Promise<string> {
  const res = await client.query('SELECT current_database() AS db, current_setting(\'server_version_num\')::int AS v');
  const row = res.rows?.[0] as { db?: string; v?: number } | undefined;
  if (!row || typeof row.db !== 'string' || !SCRATCH_DB_RE.test(row.db)) throw new Error('SCRATCH_IDENTITY_MISMATCH: current_database() is not a *_scratch database');
  if (typeof row.v !== 'number' || row.v < MIN_SERVER_VERSION_NUM) throw new Error('SCRATCH_IDENTITY_MISMATCH: server is not PostgreSQL 18+');
  return row.db;
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

function viewOf(b: ArrayBuffer | ArrayBufferView): DataView {
  return b instanceof ArrayBuffer ? new DataView(b) : new DataView(b.buffer, b.byteOffset, b.byteLength);
}

/** Decodes the v2 64-byte records (`<IIH2x3fd8f`, little-endian) and the separate latent64 float32 file. */
export function decodeTaskRecordsAndLatents(
  recordBuffer: ArrayBuffer | ArrayBufferView,
  latentBuffer: ArrayBuffer | ArrayBufferView,
  taskCount = 6527
): DecodedTaskRecordV2[] {
  if (recordBuffer.byteLength !== taskCount * RECORD_SIZE) {
    throw new Error(`RECORD_LENGTH_MISMATCH: got ${recordBuffer.byteLength}, expected ${taskCount * RECORD_SIZE}`);
  }
  if (latentBuffer.byteLength !== taskCount * LATENT_DIM * 4) {
    throw new Error(`LATENT_LENGTH_MISMATCH: got ${latentBuffer.byteLength}, expected ${taskCount * LATENT_DIM * 4}`);
  }
  const recView = viewOf(recordBuffer);
  const latView = viewOf(latentBuffer);
  const results: DecodedTaskRecordV2[] = [];

  for (let i = 0; i < taskCount; i++) {
    const o = i * RECORD_SIZE;
    if (recView.getUint16(o + 10, true) !== 0) throw new Error(`RECORD_RESERVED_NONZERO:${i}`);
    const position: [number, number, number] = [
      recView.getFloat32(o + 12, true), recView.getFloat32(o + 16, true), recView.getFloat32(o + 20, true),
    ];
    const finalScore = recView.getFloat64(o + 24, true);
    const features: number[] = [];
    for (let f = 0; f < 8; f++) features.push(recView.getFloat32(o + 32 + f * 4, true));
    if (![...position, finalScore, ...features].every(Number.isFinite)) throw new Error(`RECORD_NON_FINITE:${i}`);

    const latent64 = new Float32Array(LATENT_DIM);
    const latBase = i * LATENT_DIM * 4;
    for (let d = 0; d < LATENT_DIM; d++) latent64[d] = latView.getFloat32(latBase + d * 4, true);
    if (!latent64.every(Number.isFinite)) throw new Error(`LATENT_NON_FINITE:${i}`);

    results.push({
      mortonCode: recView.getUint32(o, true),
      taskOrdinal: recView.getUint32(o + 4, true),
      clusterId: recView.getUint16(o + 8, true),
      position, finalScore, features, latent64,
    });
  }
  return results;
}

async function snapshotRows(pool: Pool, taskIds: string[]): Promise<{ n: number; digest: string }> {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT count(*)::int AS n, md5(coalesce(string_agg(t::text, '|' ORDER BY t.task_id), '')) AS digest FROM ${TABLE} t WHERE t.task_id = ANY($1)`,
      [taskIds],
    );
    const row = res.rows?.[0] as { n?: number; digest?: string } | undefined;
    return { n: Number(row?.n ?? -1), digest: String(row?.digest ?? '') };
  } finally {
    client.release();
  }
}

export interface UpsertOptionsV1 {
  mode?: PrefillModeV1;
  env?: NodeJS.ProcessEnv;
}

/**
 * Stages the decoded records into the scratch table. `taskIds` must be supplied one-to-one (no invented ids).
 * `execution_status` is inserted as 'UNROUTED' for new rows and is never overwritten on conflict, so a re-run
 * cannot clobber state written by another producer.
 */
export async function upsertKanbanDagPrefill(
  poolOrUri: Pool | string,
  records: DecodedTaskRecordV2[],
  taskIds: string[],
  options: UpsertOptionsV1 = {}
): Promise<UpsertReceiptV1> {
  const t0 = performance.now();
  const env = options.env ?? process.env;
  const mode: PrefillModeV1 = options.mode ?? 'rehearse';

  if (taskIds.length !== records.length) throw new Error('TASK_ID_COUNT_MISMATCH');
  if (new Set(taskIds).size !== taskIds.length) throw new Error('TASK_ID_DUPLICATE');
  if (taskIds.some((id) => typeof id !== 'string' || id.length === 0 || id.length > 256)) throw new Error('TASK_ID_INVALID');
  assertWritesOptedIn(env);

  let dbHost = 'pool';
  let ownedPool: Pool | null = null;
  let pool: Pool;
  if (typeof poolOrUri === 'string') {
    const target = parseScratchDatabaseUri(poolOrUri, env);
    dbHost = target.host;
    ownedPool = new Pool({ connectionString: poolOrUri, max: 2 });
    pool = ownedPool;
  } else {
    pool = poolOrUri;
  }

  const hasher = createHash('sha256');
  let committed = false;
  let rolledBack = false;
  let dbName = '';
  let failReason: string | null = null;
  let independentlyVerified = false;

  try {
    const before = await snapshotRows(pool, taskIds);
    const client = await pool.connect();
    let broken = false;
    try {
      await client.query('BEGIN;');
      dbName = await readBackIdentity(client);

      for (let i = 0; i < records.length; i++) {
        const rec = records[i]!;
        const taskId = taskIds[i]!;
        const latent = Buffer.from(rec.latent64.buffer, rec.latent64.byteOffset, rec.latent64.byteLength);
        await client.query(
          `INSERT INTO ${TABLE} (
              task_id, sequence_id, procedure_id, morton_code, task_ordinal,
              cluster_id, position_x, position_y, position_z, final_score,
              latent64, execution_status, canonical_authority
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'UNROUTED', false)
           ON CONFLICT (task_id) DO UPDATE SET
              sequence_id  = EXCLUDED.sequence_id,
              procedure_id = EXCLUDED.procedure_id,
              morton_code  = EXCLUDED.morton_code,
              cluster_id   = EXCLUDED.cluster_id,
              position_x   = EXCLUDED.position_x,
              position_y   = EXCLUDED.position_y,
              position_z   = EXCLUDED.position_z,
              final_score  = EXCLUDED.final_score,
              latent64     = EXCLUDED.latent64,
              updated_at   = clock_timestamp()`,
          [taskId, i + 1, `proc:comm:${rec.clusterId}:task:${rec.taskOrdinal}`, rec.mortonCode, rec.taskOrdinal,
            rec.clusterId, rec.position[0], rec.position[1], rec.position[2], rec.finalScore, latent],
        );
        hasher.update(`${taskId}\t${rec.taskOrdinal}\t${rec.finalScore}\n`);
      }

      if (mode === 'apply') { await client.query('COMMIT;'); committed = true; }
      else { await client.query('ROLLBACK;'); rolledBack = true; }
    } catch (err) {
      try { await client.query('ROLLBACK;'); rolledBack = true; } catch { broken = true; }
      throw err;
    } finally {
      client.release(broken ? true : undefined); // discard a connection whose rollback failed
    }

    // Independent readback on a fresh checkout of the pool.
    const after = await snapshotRows(pool, taskIds);
    if (mode === 'rehearse') {
      independentlyVerified = after.n === before.n && after.digest === before.digest;
      if (!independentlyVerified) failReason = 'ROLLBACK_NOT_VERIFIED: target rows differ after ROLLBACK';
    } else {
      independentlyVerified = after.n === taskIds.length;
      if (!independentlyVerified) failReason = 'APPLY_NOT_VERIFIED: committed rows not all read back';
    }
  } finally {
    if (ownedPool) await ownedPool.end();
  }

  return {
    schema: 'atlas.kanban-dag-prefill-receipt.v1',
    status: independentlyVerified && failReason === null ? 'PASS' : 'FAIL',
    mode,
    rowsStaged: records.length,
    committed,
    rolledBack,
    independentlyVerified,
    failReason,
    dbName,
    dbHost,
    durationMs: Number((performance.now() - t0).toFixed(2)),
    sha256Digest: hasher.digest('hex'),
    canonicalAuthority: false,
  };
}
