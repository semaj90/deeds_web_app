// sveltekit-frontend/src/lib/server/atlas/kanban/kanban-dag-prefill-v1.ts
import { Pool } from 'pg';
import { createHash } from 'node:crypto';

export type KanbanCanonicalTaskStatus = 'UNVERIFIED' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED';
export type KanbanRoutingStatus = 'ROUTED_ACTIVE' | 'UNROUTED';

export interface UpsertReceiptV1 {
  success: boolean;
  rowsProcessed: number;
  readbackVerifiedRows: number;
  dbHost: string;
  durationMs: number;
  sha256Digest: string;
  cohortRevision: string;
  sourceRevisions: string[];
  canonicalAuthority: false;
}

export interface KanbanPrefillMetadataInput {
  canonicalTaskKey: string;
  sourceRevision: string;
  cohortRevision: string;
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
    cohort_revision          TEXT,
    source_revision          TEXT,
    source_sha256            TEXT,
    workspace_revision       TEXT,
    representation_family    TEXT,
    representation_revision  TEXT,
    embedding_model_digest   TEXT,
    vector_artifact_ref      TEXT,
    vector_artifact_sha256   TEXT,
    fusion_packet_schema     TEXT,
    fusion_packet_sha256     TEXT,
    nes_palette_checksum     TEXT,
    glyph_schema             TEXT,
    glyph_instance64         BYTEA,
    canonical_authority BOOLEAN NOT NULL DEFAULT FALSE CHECK (canonical_authority = FALSE),
    CONSTRAINT atlas_kanban_dag_prefill_v1_no_synthetic_ordinal_chk
        CHECK (task_id !~ '^task:ordinal:' AND canonical_task_key !~ '^task:ordinal:'),
    CONSTRAINT atlas_kanban_dag_prefill_v1_array_shape_chk
        CHECK (array_length(umap_xyz, 1) = 3 AND array_length(rot_6d, 1) = 6
               AND (latent_64d IS NULL OR array_length(latent_64d, 1) = 64)),
    CONSTRAINT atlas_kanban_dag_prefill_v1_provenance_format_chk
        CHECK ((source_sha256 IS NULL OR source_sha256 ~ '^sha256:[0-9a-f]{64}$')
               AND (vector_artifact_sha256 IS NULL OR vector_artifact_sha256 ~ '^sha256:[0-9a-f]{64}$')
               AND (fusion_packet_sha256 IS NULL OR fusion_packet_sha256 ~ '^sha256:[0-9a-f]{64}$')
               AND (workspace_revision IS NULL OR workspace_revision ~ '^sha256:[0-9a-f]{64}$')
               AND (glyph_instance64 IS NULL OR octet_length(glyph_instance64) = 64)),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_atlas_kanban_dag_prefill_v1_canonical_key
    ON public.atlas_kanban_dag_prefill_v1 (canonical_task_key);

CREATE INDEX IF NOT EXISTS idx_atlas_kanban_dag_prefill_v1_community_score
    ON public.atlas_kanban_dag_prefill_v1 (community_id, final_score DESC);

CREATE INDEX IF NOT EXISTS idx_atlas_kanban_dag_prefill_v1_morton
    ON public.atlas_kanban_dag_prefill_v1 (morton_code);

CREATE INDEX IF NOT EXISTS idx_atlas_kanban_dag_prefill_v1_cohort
    ON public.atlas_kanban_dag_prefill_v1 (cohort_revision, cohort_ordinal);
`.trim();

const FORBIDDEN_PRODUCTION_TOKENS = ['legal_ai_db', 'production', 'main_db'] as const;
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
  if (Number(parsed.port || 5432) !== 5434) {
    throw new Error('[SECURITY GATE P0] Scratch database must use the isolated PostgreSQL port 5434.');
  }

  return url;
}

/**
 * Validates direct Pool instances so callers cannot bypass URI security gate.
 */
export function assertScratchPoolSafety(pool: Pool): void {
  const options = (
    pool as unknown as {
      options?: { connectionString?: string; database?: string; host?: string; port?: number };
    }
  ).options;

  if (!options) {
    throw new Error('[SECURITY GATE P0] Injected Pool must expose verifiable scratch connection options.');
  }

  if (options.connectionString) {
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

  if (!options.host || !ALLOWED_LOOPBACK_HOSTS.has(options.host.toLowerCase())) {
    throw new Error(
      `[SECURITY GATE P0] FATAL: Pool host '${options.host}' must be loopback (127.0.0.1, localhost, or ::1).`
    );
  }

  if (options.database?.toLowerCase() !== 'legal_ai_live_integration_scratch') {
    throw new Error(
      `[SECURITY GATE P0] FATAL: Pool database '${options.database}' must be the exact authorized scratch database.`
    );
  }
  if (Number(options.port ?? 5432) !== 5434) {
    throw new Error('[SECURITY GATE P0] Injected Pool must target isolated PostgreSQL port 5434.');
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
    throw new Error(
      `RECORD_LENGTH_MISMATCH: got ${recordBuffer.byteLength}, expected ${taskCount * RECORD_SIZE}`
    );
  }
  if (latentBuffer.byteLength !== taskCount * LATENT_DIM * 4) {
    throw new Error(
      `LATENT_LENGTH_MISMATCH: got ${latentBuffer.byteLength}, expected ${taskCount * LATENT_DIM * 4}`
    );
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
 * Derives the non-canonical routing status strictly from the binary record's
 * routing_active_bit (features[5]), never conflating routing thresholds with
 * canonical task status (UNVERIFIED | IN_PROGRESS | COMPLETED | BLOCKED).
 */
export function deriveRoutingStatusFromRecord(rec: DecodedTaskRecordV2): {
  routingActiveBit: boolean;
  routingStatus: KanbanRoutingStatus;
} {
  const encodedBit = rec.features?.[5] ?? 0;
  if (encodedBit !== 0 && encodedBit !== 1) {
    throw new Error('PREFILL_ROUTING_ACTIVE_BIT_MUST_BE_EXPLICIT_BINARY');
  }
  const routingActiveBit = encodedBit === 1;
  return {
    routingActiveBit,
    routingStatus: routingActiveBit ? 'ROUTED_ACTIVE' : 'UNROUTED'
  };
}

function digestPrefillPayload(row: Record<string, unknown>): string {
  const pick = (snake: string, camel: string): unknown => row[snake] ?? row[camel];
  const vector = (snake: string, camel: string): number[] => {
    const value = pick(snake, camel);
    if (!Array.isArray(value) && !(value instanceof Float32Array)) {
      throw new Error(`PREFILL_READBACK_VECTOR_MISSING:${snake}`);
    }
    return Array.from(value as ArrayLike<number>, (item) => Math.fround(Number(item)));
  };
  const payload = {
    taskId: String(pick('task_id', 'taskId')),
    canonicalTaskKey: String(pick('canonical_task_key', 'canonicalTaskKey')),
    cohortOrdinal: Number(pick('cohort_ordinal', 'cohortOrdinal')),
    changeId: String(pick('change_id', 'changeId')),
    status: String(row.status),
    routingStatus: String(pick('routing_status', 'routingStatus')),
    communityId: Number(pick('community_id', 'communityId')),
    domainId: Number(pick('domain_id', 'domainId')),
    mortonCode: Number(pick('morton_code', 'mortonCode')),
    priorityScore: Math.fround(Number(pick('priority_score', 'priorityScore'))),
    finalScore: Math.fround(Number(pick('final_score', 'finalScore'))),
    routingActiveBit: Boolean(pick('routing_active_bit', 'routingActiveBit')),
    cohortRevision: String(pick('cohort_revision', 'cohortRevision')),
    sourceRevision: String(pick('source_revision', 'sourceRevision')),
    sourceSha256: String(pick('source_sha256', 'sourceSha256')),
    umapXyz: vector('umap_xyz', 'umapXyz'),
    rot6d: vector('rot_6d', 'rot6d'),
    latent64d: vector('latent_64d', 'latent64d'),
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/**
 * Upserts the decoded OpenSpec DAG tasks into PostgreSQL 18 public.atlas_kanban_dag_prefill_v1
 * using the unified Option A schema contract (20261108_atlas_kanban_dag_prefill_v1.sql)
 * with batch transactions and ON CONFLICT (task_id) DO UPDATE.
 */
export async function upsertKanbanDagPrefill(
  poolOrUri: Pool | string,
  records: DecodedTaskRecordV2[],
  taskIdsOrMeta: KanbanPrefillMetadataInput[],
): Promise<UpsertReceiptV1> {
  if (records.length === 0 || records.length !== taskIdsOrMeta.length) {
    throw new Error('PREFILL_INPUT_CARDINALITY_MISMATCH: records and metadata must be non-empty and one-to-one.');
  }
  const metadataKeys = taskIdsOrMeta.map((meta) => meta?.canonicalTaskKey?.trim() ?? '');
  if (metadataKeys.some((key) => !key) || new Set(metadataKeys).size !== metadataKeys.length) {
    throw new Error('PREFILL_TASK_IDENTITY_INVALID: task identities must be present and unique.');
  }
  const cohortRevisions = new Set(taskIdsOrMeta.map((meta) => meta?.cohortRevision?.trim() ?? ''));
  if (cohortRevisions.size !== 1) {
    throw new Error('PREFILL_COHORT_REVISION_MISMATCH: one upsert batch must use one cohort revision.');
  }
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
  const sourceRevisions = new Set<string>();
  const expectedRows = new Map<string, string>();

  const client = await pool.connect();
  let transactionCommitted = false;
  let clientReleased = false;
  try {
    await client.query('BEGIN;');

    const identity = (await client.query(`
      SELECT current_database() AS database_name,
             current_setting('server_version_num')::int AS server_version_num
    `)).rows?.[0] as { database_name?: string; server_version_num?: number } | undefined;
    if (identity?.database_name !== 'legal_ai_live_integration_scratch' || Number(identity.server_version_num) < 180000) {
      throw new Error('[SECURITY GATE P0] Expected the exact PostgreSQL 18 scratch database before upsert.');
    }

    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      const meta = taskIdsOrMeta[i];

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
      const sourceRevision = String(meta.sourceRevision ?? '').trim();
      const cohortRevision = String(meta.cohortRevision ?? '').trim();
      if (!/^sha256:[0-9a-f]{64}$/.test(sourceRevision) || !/^sha256:[0-9a-f]{64}$/.test(cohortRevision)) {
        throw new Error(`SOURCE_OR_COHORT_REVISION_NOT_SHA256: ${canonicalTaskKey}`);
      }
      sourceRevisions.add(sourceRevision);

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
            priority_score, final_score, routing_active_bit, cohort_revision, source_revision, source_sha256,
            umap_xyz, rot_6d, latent_64d, canonical_authority
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::real[], $17::real[], $18::real[], FALSE)
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
            cohort_revision     = EXCLUDED.cohort_revision,
            source_revision     = EXCLUDED.source_revision,
            source_sha256       = EXCLUDED.source_sha256,
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
        cohortRevision,
        sourceRevision,
        sourceRevision,
        umapXyz,
        rot6d,
        latent64d
      ]);

      const payloadDigest = digestPrefillPayload({
        taskId: canonicalTaskKey,
        canonicalTaskKey,
        cohortOrdinal: rec.taskOrdinal,
        changeId,
        status: canonicalStatus,
        routingStatus,
        communityId: rec.clusterId,
        domainId,
        mortonCode: rec.mortonCode,
        priorityScore,
        finalScore: rec.finalScore,
        routingActiveBit,
        cohortRevision,
        sourceRevision,
        sourceSha256: sourceRevision,
        umapXyz,
        rot6d,
        latent64d,
      });
      expectedRows.set(canonicalTaskKey, payloadDigest);
      hasher.update(payloadDigest);
      processed++;
    }

    const verifyPersistedRows = (rows: Record<string, unknown>[]): void => {
      const actualById = new Map(rows.map((row) => [String(row.task_id), row]));
      const mismatches = [...expectedRows].filter(([taskId, expectedDigest]) => {
        const row = actualById.get(taskId);
        return !row || row.canonical_authority !== false || digestPrefillPayload(row) !== expectedDigest;
      });
      if (mismatches.length > 0 || actualById.size !== expectedRows.size) {
        throw new Error(`PREFILL_POST_UPSERT_READBACK_MISMATCH:${mismatches[0]?.[0] ?? 'row_count'}`);
      }
    };

    const transactionalReadback = await client.query(`
      SELECT task_id, canonical_task_key, cohort_ordinal, change_id, status, routing_status,
             community_id, domain_id, morton_code, priority_score, final_score, routing_active_bit,
             cohort_revision, source_revision, source_sha256, umap_xyz, rot_6d, latent_64d,
             canonical_authority
        FROM public.atlas_kanban_dag_prefill_v1
       WHERE task_id = ANY($1::text[])
    `, [[...expectedRows.keys()]]);
    verifyPersistedRows(transactionalReadback.rows ?? []);

    await client.query('COMMIT;');
    transactionCommitted = true;
    client.release();
    clientReleased = true;

    // Verify committed state from a fresh connection, independent of the upsert transaction.
    const readbackClient = await pool.connect();
    let readbackRows: Record<string, unknown>[];
    try {
      const readback = await readbackClient.query(`
      SELECT task_id, canonical_task_key, cohort_ordinal, change_id, status, routing_status,
             community_id, domain_id, morton_code, priority_score, final_score, routing_active_bit,
             cohort_revision, source_revision, source_sha256, umap_xyz, rot_6d, latent_64d,
             canonical_authority
        FROM public.atlas_kanban_dag_prefill_v1
       WHERE task_id = ANY($1::text[])
      `, [[...expectedRows.keys()]]);
      readbackRows = readback.rows ?? [];
    } finally {
      readbackClient.release();
    }
    verifyPersistedRows(readbackRows);
    readbackVerifiedRows = expectedRows.size;

  } catch (err) {
    if (!transactionCommitted) await client.query('ROLLBACK;');
    throw err;
  } finally {
    if (!clientReleased) client.release();
    if (typeof poolOrUri === 'string') {
      await pool.end();
    }
  }

  const durationMs = Number((performance.now() - t0).toFixed(2));
  return {
    success: true,
    rowsProcessed: processed,
    readbackVerifiedRows,
    dbHost: validatedHost,
    durationMs,
    sha256Digest: hasher.digest('hex'),
    cohortRevision: taskIdsOrMeta[0]?.cohortRevision ?? '',
    sourceRevisions: [...sourceRevisions].sort(),
    canonicalAuthority: false
  };
}
