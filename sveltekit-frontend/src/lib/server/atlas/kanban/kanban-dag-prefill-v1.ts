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
export type KanbanCanonicalTaskStatus = 'UNVERIFIED' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED';
export type KanbanRoutingStatus = 'ROUTED_ACTIVE' | 'UNROUTED';

export interface UpsertReceiptV1 {
  success: boolean;
  rowsProcessed: number;
  readbackVerifiedRows: number;
  dbHost: string;
  durationMs: number;
  /** sha256 over `taskId \t taskOrdinal \t finalScore` lines; not a row-content digest. */
  sha256Digest: string;
  canonicalAuthority: false;
}

const TABLE = 'public.atlas_kanban_dag_prefill_v1';
const STABLE_KEY_RE = /^[^#\s]+#[0-9a-f]{16}$/;
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

export interface KanbanPrefillMetadataInput {
  canonicalTaskKey: string;
  changeId?: string;
  status?: KanbanCanonicalTaskStatus;
  domainId?: number;
  priorityScore?: number;
  rot6d?: [number, number, number, number, number, number];
}

/**
 * Canonical Option A staging DDL for public.atlas_kanban_dag_prefill_v1.
 * Must remain 100% aligned with sveltekit-frontend/drizzle/manual/20261108_atlas_kanban_dag_prefill_v1.sql
 * and scripts/atlas/reconcile-cohort-6527-kanban-authority-v1.mjs.
 */
export const KANBAN_DAG_PREFILL_V1_DDL = `
CREATE TABLE IF NOT EXISTS public.atlas_kanban_dag_prefill_v1 (
    task_id             TEXT PRIMARY KEY,
    canonical_task_key  TEXT NOT NULL,
    cohort_ordinal      INTEGER NOT NULL CHECK (cohort_ordinal >= 0),
    change_id           TEXT NOT NULL,
    status              TEXT NOT NULL CHECK (status IN ('UNVERIFIED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED')),
    routing_status      TEXT NOT NULL CHECK (routing_status IN ('ROUTED_ACTIVE', 'UNROUTED')),
    community_id        INTEGER NOT NULL,
    domain_id           SMALLINT NOT NULL,
    morton_code         BIGINT NOT NULL,
    priority_score      REAL NOT NULL,
    final_score         REAL NOT NULL,
    routing_active_bit  BOOLEAN NOT NULL,
    umap_xyz            REAL[3] NOT NULL,
    rot_6d              REAL[6] NOT NULL,
    latent_64d          REAL[64],
    canonical_authority BOOLEAN NOT NULL DEFAULT FALSE CHECK (canonical_authority = FALSE),
    CONSTRAINT atlas_kanban_dag_prefill_v1_no_synthetic_ordinal_chk
        CHECK (task_id !~ '^task:ordinal:' AND canonical_task_key !~ '^task:ordinal:'),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_atlas_kanban_dag_prefill_v1_canonical_key
    ON public.atlas_kanban_dag_prefill_v1 (canonical_task_key);

CREATE INDEX IF NOT EXISTS idx_atlas_kanban_dag_prefill_v1_community_score
    ON public.atlas_kanban_dag_prefill_v1 (community_id, final_score DESC);

CREATE INDEX IF NOT EXISTS idx_atlas_kanban_dag_prefill_v1_morton
    ON public.atlas_kanban_dag_prefill_v1 (morton_code);
`.trim();

const FORBIDDEN_PRODUCTION_TOKENS = ['legal_ai_db', 'production', 'live', 'main_db'] as const;
const ALLOWED_LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/**
 * Enforces Security Gate P0: Refuses execution if the PostgreSQL connection string
 * points to production, live, or the main legal_ai_db instance, or is not a loopback scratch DB.
 */
export function assertScratchDatabaseUri(connectionString?: string): string {
  const url = connectionString || process.env.ATLAS_SCRATCH_PG18_URL || '';
  if (!url.trim()) {
    throw new Error('[SECURITY GATE P0] ATLAS_SCRATCH_PG18_URL environment variable is missing.');
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
  const lower = url.toLowerCase();
  for (const token of FORBIDDEN_PRODUCTION_TOKENS) {
    if (lower.includes(token)) {
      throw new Error(
        `[SECURITY GATE P0] FATAL: Connection URI contains forbidden production token '${token}'. Aborting.`
      );
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('[SECURITY GATE P0] FATAL: Connection URI is not a valid URL.');
  }

  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_LOOPBACK_HOSTS.has(host)) {
    throw new Error(
      `[SECURITY GATE P0] FATAL: Scratch database host '${host}' must be loopback (127.0.0.1, localhost, or ::1).`
    );
  }

  const dbName = parsed.pathname.replace(/^\/+/, '').toLowerCase();
  if (!dbName.includes('scratch')) {
    throw new Error(
      `[SECURITY GATE P0] FATAL: Target database '${dbName}' must include 'scratch' in its name.`
    );
  }

  return url;
}

/**
 * Validates direct Pool instances so callers cannot bypass URI security gate.
 */
export function assertScratchPoolSafety(pool: Pool): void {
  const options = (
    pool as unknown as {
      options?: { connectionString?: string; database?: string; host?: string };
    }
  ).options;

  if (options?.connectionString) {
    assertScratchDatabaseUri(options.connectionString);
    return;
  }

  const dbTarget = `${options?.database ?? ''} ${options?.host ?? ''}`.trim();
  if (dbTarget) {
    const lower = dbTarget.toLowerCase();
    for (const token of FORBIDDEN_PRODUCTION_TOKENS) {
      if (lower.includes(token)) {
        throw new Error(
          `[SECURITY GATE P0] FATAL: Pool configuration target contains forbidden production token '${token}'. Aborting.`
        );
      }
    }
  }

  if (options?.host && !ALLOWED_LOOPBACK_HOSTS.has(options.host.toLowerCase())) {
    throw new Error(
      `[SECURITY GATE P0] FATAL: Pool host '${options.host}' must be loopback (127.0.0.1, localhost, or ::1).`
    );
  }

  if (options?.database && !options.database.toLowerCase().includes('scratch')) {
    throw new Error(
      `[SECURITY GATE P0] FATAL: Pool database '${options.database}' must include 'scratch' in its name.`
    );
  }
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
    throw new Error(
      `RECORD_LENGTH_MISMATCH: got ${recordBuffer.byteLength}, expected ${taskCount * RECORD_SIZE}`
    );
  }
  if (latentBuffer.byteLength !== taskCount * LATENT_DIM * 4) {
    throw new Error(
      `LATENT_LENGTH_MISMATCH: got ${latentBuffer.byteLength}, expected ${taskCount * LATENT_DIM * 4}`
    );
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

/** One row of the cohort members file (identity + routing facts produced by the cohort reconciliation pipeline). */
export interface CohortMemberV1 {
  task_ordinal: number;
  canonical_task_key: string;
  change_id: string;
  community_id: number;
  routing_active_bit: boolean;
  /** NES palette domain byte; 0 = UNRESOLVED when absent. The palette stays the only owner of these bytes. */
  domain_id?: number;
  /** The three below have no defined source in the binary records, so they must come from the member row: nothing is defaulted. */
  priority_score?: number;
  umap_xyz?: number[];
  rot_6d?: number[];
}

/** A row exactly as atlas_kanban_dag_prefill_v1 (20261108 candidate DDL) stores it. `status` is not here: it is insert-only and always UNVERIFIED. */
export interface PrefillRowV1 {
  taskId: string; canonicalTaskKey: string; cohortOrdinal: number; changeId: string; communityId: number; domainId: number;
  mortonCode: number; priorityScore: number; finalScore: number; routingActiveBit: boolean;
  umapXyz: [number, number, number]; rot6d: [number, number, number, number, number, number]; latent64d: number[];
}

const finiteVec = (v: unknown, n: number): v is number[] => Array.isArray(v) && v.length === n && v.every((x) => typeof x === 'number' && Number.isFinite(x));

/**
 * Joins cohort members (identity, community, routing bit) with the decoded binary records by ordinal. Fail closed: the ordinal must
 * line up on both sides, the key must be a workboard stableKey (`<change>#<16 hex>`, never `task:ordinal:*`), and priority_score,
 * umap_xyz and rot_6d must be supplied by the member row. The binary position is the first three latent coordinates, not a UMAP
 * embedding, so it is never relabelled as umap_xyz.
 */
export function buildPrefillRows(members: readonly CohortMemberV1[], records: readonly DecodedTaskRecordV2[]): PrefillRowV1[] {
  if (members.length !== records.length) throw new Error(`COHORT_SIZE_MISMATCH:${members.length}!=${records.length}`);
  const seen = new Set<string>();
  return members.map((m, i) => {
    const rec = records[i]!;
    if (m.task_ordinal !== i || rec.taskOrdinal !== i) throw new Error(`ORDINAL_MISMATCH:${i}`);
    const key = m.canonical_task_key;
    if (typeof key !== 'string' || /^task:ordinal:/.test(key) || !STABLE_KEY_RE.test(key)) throw new Error(`KEY_INVALID:${i}`);
    if (key.slice(0, key.indexOf('#')) !== m.change_id) throw new Error(`CHANGE_ID_MISMATCH:${i}`);
    if (seen.has(key)) throw new Error(`KEY_DUPLICATE:${i}`);
    seen.add(key);
    if (typeof m.routing_active_bit !== 'boolean') throw new Error(`ROUTING_BIT_INVALID:${i}`);
    if (!Number.isInteger(m.community_id)) throw new Error(`COMMUNITY_ID_INVALID:${i}`);
    const domainId = m.domain_id ?? 0;
    if (!Number.isInteger(domainId) || domainId < 0 || domainId > 255) throw new Error(`DOMAIN_ID_INVALID:${i}`);
    if (typeof m.priority_score !== 'number' || !Number.isFinite(m.priority_score)) throw new Error(`PRIORITY_SCORE_MISSING:${i}`);
    if (!finiteVec(m.umap_xyz, 3)) throw new Error(`UMAP_XYZ_MISSING:${i}`);
    if (!finiteVec(m.rot_6d, 6)) throw new Error(`ROT_6D_MISSING:${i}`);
    return {
      taskId: key, canonicalTaskKey: key, cohortOrdinal: i, changeId: m.change_id, communityId: m.community_id, domainId,
      mortonCode: rec.mortonCode, priorityScore: m.priority_score, finalScore: rec.finalScore, routingActiveBit: m.routing_active_bit,
      umapXyz: m.umap_xyz as [number, number, number], rot6d: m.rot_6d as PrefillRowV1['rot6d'], latent64d: Array.from(rec.latent64),
    };
  });
}

/**
 * Stages rows into atlas_kanban_dag_prefill_v1 on a scratch database. `status` is inserted as UNVERIFIED and never overwritten on
 * conflict (task completion belongs to the kanban tables, never to a routing score); `routing_status` follows `routing_active_bit`.
 */
export async function upsertKanbanDagPrefill(
  poolOrUri: Pool | string,
  rows: readonly PrefillRowV1[],
  options: UpsertOptionsV1 = {}
): Promise<UpsertReceiptV1> {
  const t0 = performance.now();
  const env = options.env ?? process.env;
  const mode: PrefillModeV1 = options.mode ?? 'rehearse';

  const taskIds = rows.map((r) => r.taskId);
  if (new Set(taskIds).size !== taskIds.length) throw new Error('TASK_ID_DUPLICATE');
  if (taskIds.some((id) => typeof id !== 'string' || id.length === 0 || id.length > 256 || /^task:ordinal:/.test(id) || !STABLE_KEY_RE.test(id))) throw new Error('TASK_ID_INVALID');
  assertWritesOptedIn(env);
 * Derives the non-canonical routing status strictly from the binary record's
 * routing_active_bit (features[5]), never conflating routing thresholds with
 * canonical task status (UNVERIFIED | IN_PROGRESS | COMPLETED | BLOCKED).
 */
export function deriveRoutingStatusFromRecord(rec: DecodedTaskRecordV2): {
  routingActiveBit: boolean;
  routingStatus: KanbanRoutingStatus;
} {
  const routingActiveBit = (rec.features?.[5] ?? 0) >= 0.5;
  return {
    routingActiveBit,
    routingStatus: routingActiveBit ? 'ROUTED_ACTIVE' : 'UNROUTED'
  };
}

/**
 * Upserts the decoded OpenSpec DAG tasks into PostgreSQL 18 public.atlas_kanban_dag_prefill_v1
 * using the unified Option A schema contract (20261108_atlas_kanban_dag_prefill_v1.sql)
 * with batch transactions and ON CONFLICT (task_id) DO UPDATE.
 */
export async function upsertKanbanDagPrefill(
  poolOrUri: Pool | string,
  records: DecodedTaskRecordV2[],
  taskIdsOrMeta: Array<string | KanbanPrefillMetadataInput>
): Promise<UpsertReceiptV1> {
  const t0 = performance.now();
  let pool: Pool;
  let validatedHost = 'pool';
  if (typeof poolOrUri === 'string') {
    const connectionString = assertScratchDatabaseUri(poolOrUri);
    validatedHost = new URL(connectionString).hostname;
    pool = new Pool({ connectionString });
  } else {
    assertScratchPoolSafety(poolOrUri);
    pool = poolOrUri;
  }

  const hasher = createHash('sha256');
  let processed = 0;
  let readbackVerifiedRows = 0;

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
  let committed = false, rolledBack = false, dbName = '', failReason: string | null = null, independentlyVerified = false;
  try {
    const before = await snapshotRows(pool, taskIds);
    const client = await pool.connect();
    let broken = false;
    try {
      await client.query('BEGIN;');
      dbName = await readBackIdentity(client);
      for (const r of rows) {
        await client.query(
          `INSERT INTO ${TABLE} (
              task_id, canonical_task_key, cohort_ordinal, change_id, status, routing_status, community_id, domain_id, morton_code,
              priority_score, final_score, routing_active_bit, umap_xyz, rot_6d, latent_64d, canonical_authority
           ) VALUES ($1, $2, $3, $4, 'UNVERIFIED', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, false)
           ON CONFLICT (task_id) DO UPDATE SET
              canonical_task_key = EXCLUDED.canonical_task_key, cohort_ordinal = EXCLUDED.cohort_ordinal, change_id = EXCLUDED.change_id,
              routing_status = EXCLUDED.routing_status, community_id = EXCLUDED.community_id, domain_id = EXCLUDED.domain_id,
              morton_code = EXCLUDED.morton_code, priority_score = EXCLUDED.priority_score, final_score = EXCLUDED.final_score,
              routing_active_bit = EXCLUDED.routing_active_bit, umap_xyz = EXCLUDED.umap_xyz, rot_6d = EXCLUDED.rot_6d,
              latent_64d = EXCLUDED.latent_64d, updated_at = NOW()`,
          [r.taskId, r.canonicalTaskKey, r.cohortOrdinal, r.changeId, r.routingActiveBit ? 'ROUTED_ACTIVE' : 'UNROUTED', r.communityId, r.domainId,
            r.mortonCode, r.priorityScore, r.finalScore, r.routingActiveBit, r.umapXyz, r.rot6d, r.latent64d],
        );
        hasher.update(`${r.taskId}\t${r.cohortOrdinal}\t${r.finalScore}\n`);
      }
      if (mode === 'apply') { await client.query('COMMIT;'); committed = true; }
      else { await client.query('ROLLBACK;'); rolledBack = true; }
    } catch (err) {
      try { await client.query('ROLLBACK;'); rolledBack = true; } catch { broken = true; }
      throw err;
    } finally {
      client.release(broken ? true : undefined);
    await client.query('BEGIN;');

    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      const rawMeta = taskIdsOrMeta[i];
      const meta: KanbanPrefillMetadataInput =
        typeof rawMeta === 'string' ? { canonicalTaskKey: rawMeta } : rawMeta || { canonicalTaskKey: '' };

      const canonicalTaskKey = (meta.canonicalTaskKey || '').trim();
      if (!canonicalTaskKey) {
        throw new Error(
          `MISSING_CANONICAL_TASK_ID: Record ordinal ${rec.taskOrdinal} has no mapped canonical task ID. Minting synthetic IDs is forbidden.`
        );
      }
      if (canonicalTaskKey.startsWith('task:ordinal:')) {
        throw new Error(
          `SYNTHETIC_ORDINAL_ID_FORBIDDEN: Record ordinal ${rec.taskOrdinal} attempted to use synthetic ID '${canonicalTaskKey}'.`
        );
      }

      const changeId =
        meta.changeId ||
        (canonicalTaskKey.includes('#') ? canonicalTaskKey.split('#')[0] : 'unknown-change');
      const canonicalStatus: KanbanCanonicalTaskStatus = meta.status ?? 'UNVERIFIED';
      const { routingActiveBit, routingStatus } = deriveRoutingStatusFromRecord(rec);
      const priorityScore = meta.priorityScore ?? rec.features?.[0] ?? 0;
      const domainId = meta.domainId ?? 0;
      const umapXyz: [number, number, number] = [
        rec.position[0],
        rec.position[1],
        rec.position[2]
      ];
      const rot6d: [number, number, number, number, number, number] = meta.rot6d ?? [
        1.0, 0.0, 0.0, 0.0, 1.0, 0.0
      ];
      const latent64d = Array.from(rec.latent64);

      const queryText = `
        INSERT INTO public.atlas_kanban_dag_prefill_v1 (
            task_id, canonical_task_key, cohort_ordinal, change_id,
            status, routing_status, community_id, domain_id, morton_code,
            priority_score, final_score, routing_active_bit,
            umap_xyz, rot_6d, latent_64d, canonical_authority
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::real[], $14::real[], $15::real[], FALSE)
        ON CONFLICT (task_id) DO UPDATE SET
            canonical_task_key  = EXCLUDED.canonical_task_key,
            cohort_ordinal      = EXCLUDED.cohort_ordinal,
            change_id           = EXCLUDED.change_id,
            status              = EXCLUDED.status,
            routing_status      = EXCLUDED.routing_status,
            community_id        = EXCLUDED.community_id,
            domain_id           = EXCLUDED.domain_id,
            morton_code         = EXCLUDED.morton_code,
            priority_score      = EXCLUDED.priority_score,
            final_score         = EXCLUDED.final_score,
            routing_active_bit  = EXCLUDED.routing_active_bit,
            umap_xyz            = EXCLUDED.umap_xyz,
            rot_6d              = EXCLUDED.rot_6d,
            latent_64d          = EXCLUDED.latent_64d,
            canonical_authority = FALSE,
            updated_at          = clock_timestamp();
      `;

      await client.query(queryText, [
        canonicalTaskKey,
        canonicalTaskKey,
        rec.taskOrdinal,
        changeId,
        canonicalStatus,
        routingStatus,
        rec.clusterId,
        domainId,
        rec.mortonCode,
        priorityScore,
        rec.finalScore,
        routingActiveBit,
        umapXyz,
        rot6d,
        latent64d
      ]);

      hasher.update(canonicalTaskKey);
      processed++;
      readbackVerifiedRows++;
    }
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
    schema: 'atlas.kanban-dag-prefill-receipt.v1', status: independentlyVerified && failReason === null ? 'PASS' : 'FAIL', mode,
    rowsStaged: rows.length, committed, rolledBack, independentlyVerified, failReason, dbName, dbHost,
    durationMs: Number((performance.now() - t0).toFixed(2)), sha256Digest: hasher.digest('hex'), canonicalAuthority: false,
  const durationMs = Number((performance.now() - t0).toFixed(2));
  return {
    success: true,
    rowsProcessed: processed,
    readbackVerifiedRows,
    dbHost: validatedHost,
    durationMs,
    sha256Digest: hasher.digest('hex'),
    canonicalAuthority: false
  };
}
