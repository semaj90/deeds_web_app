import { z } from 'zod';

import {
  workspaceRevisionRecordV1Schema,
  workspaceSourceBindingV1Schema,
  type WorkspaceRevisionRecordV1,
  type WorkspaceSourceBindingV1,
} from '../identity/workspace-source-binding-v1.js';

export const GRAPHIFY_SOURCE_INVENTORY_WRITER_V2 = 'atlas.graphify-source-inventory-writer.v2' as const;

const uuid = z.string().uuid();
const contentRevision = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

export const graphifySourceInventoryWriterReceiptV2Schema = z.object({
  schema: z.literal(GRAPHIFY_SOURCE_INVENTORY_WRITER_V2),
  workspaceId: uuid,
  runId: uuid,
  workspaceRevision: contentRevision,
  sourceManifestDigest: sha256,
  repositoryRevision: z.string().min(1),
  parserContractVersion: z.string().min(1),
  extractionContractVersion: z.string().min(1),
  selectedSourceCount: z.number().int().positive(),
  writtenSourceCount: z.number().int().positive(),
  readbackVerified: z.literal(true),
  callerRevisionAuthorityAccepted: z.literal(false),
  canonicalWriteAttempted: z.literal(true),
  files: z.array(z.object({
    fileId: uuid,
    sourceRef: z.string().min(1),
    sourceRevision: contentRevision,
    contentDigest: sha256,
    byteLength: z.number().int().nonnegative(),
    legacySourceRevision: z.string().min(1),
    readbackVerified: z.literal(true),
  }).strict()).min(1),
}).strict();

export type GraphifySourceInventoryWriterReceiptV2 = z.infer<typeof graphifySourceInventoryWriterReceiptV2Schema>;

export interface GraphifySourceInventorySqlClientV2 {
  query: (text: string, values?: readonly unknown[]) => Promise<{
    rowCount: number | null;
    rows: Array<Record<string, unknown>>;
  }>;
}

function normalizeDigest(value: unknown): string {
  const raw = String(value ?? '').trim().toLowerCase();
  const match = /^(?:sha256:)?([a-f0-9]{64})$/.exec(raw);
  if (!match) throw new Error(`GRAPHIFY_CONTENT_DIGEST_INVALID:${raw}`);
  return match[1]!;
}

function normalizeSourceRef(value: unknown): string {
  return String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '');
}

function selectBindings(
  record: WorkspaceRevisionRecordV1,
  bindings: readonly WorkspaceSourceBindingV1[],
  selectedSourceRefs?: readonly string[],
): WorkspaceSourceBindingV1[] {
  const parsed = bindings.map((item) => workspaceSourceBindingV1Schema.parse(item));
  for (const binding of parsed) {
    if (binding.workspaceRevision !== record.workspaceRevision) {
      throw new Error(`GRAPHIFY_BINDING_WORKSPACE_REVISION_MISMATCH:${binding.sourceRef}`);
    }
    if (binding.sourceRevision !== `sha256:${binding.contentDigest}`) {
      throw new Error(`GRAPHIFY_BINDING_SOURCE_REVISION_MISMATCH:${binding.sourceRef}`);
    }
  }

  if (!selectedSourceRefs?.length) return parsed;
  const wanted = new Set(selectedSourceRefs.map((value) => normalizeSourceRef(value)));
  const selected = parsed.filter((item) => wanted.has(item.sourceRef));
  if (selected.length !== wanted.size) {
    const found = new Set(selected.map((item) => item.sourceRef));
    const missing = [...wanted].filter((item) => !found.has(item));
    throw new Error(`GRAPHIFY_SELECTED_SOURCE_NOT_IN_MANIFEST:${missing.join(',')}`);
  }
  return selected;
}

/**
 * Persists a canonical workspace/source revision observation into Graphify.
 *
 * Identity derivation is deliberately not reimplemented here. The caller must
 * supply a validated WorkspaceRevisionRecordV1 + WorkspaceSourceBindingV1 set
 * produced by the existing workspace/source identity owner. This function owns
 * only durable Graphify persistence and exact readback.
 *
 * The caller must already be inside a transaction. Use the wrapper below when
 * the operation should own BEGIN/COMMIT/ROLLBACK.
 */
export async function writeGraphifySourceInventoryInTransactionV2(input: {
  client: GraphifySourceInventorySqlClientV2;
  workspaceId: string;
  record: WorkspaceRevisionRecordV1;
  bindings: readonly WorkspaceSourceBindingV1[];
  selectedSourceRefs?: readonly string[];
  parserContractVersion: string;
  extractionContractVersion: string;
  configuration?: Record<string, unknown>;
}): Promise<GraphifySourceInventoryWriterReceiptV2> {
  const workspaceId = uuid.parse(input.workspaceId);
  const record = workspaceRevisionRecordV1Schema.parse(input.record);
  const parserContractVersion = z.string().min(1).parse(input.parserContractVersion);
  const extractionContractVersion = z.string().min(1).parse(input.extractionContractVersion);
  const selected = selectBindings(record, input.bindings, input.selectedSourceRefs);
  if (!selected.length) throw new Error('GRAPHIFY_SOURCE_INVENTORY_EMPTY_SELECTION');

  const runInsert = await input.client.query(
    `INSERT INTO public.graphify_runs (
       workspace_id,
       repository_revision,
       workspace_revision,
       source_manifest_digest,
       source_manifest_source_count,
       parser_contract_version,
       extraction_contract_version,
       status,
       dry_run,
       configuration
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,'RUNNING',false,$8::jsonb)
     ON CONFLICT (workspace_id, workspace_revision, parser_contract_version)
       WHERE workspace_revision IS NOT NULL
     DO UPDATE SET
       repository_revision = EXCLUDED.repository_revision,
       source_manifest_digest = EXCLUDED.source_manifest_digest,
       source_manifest_source_count = EXCLUDED.source_manifest_source_count,
       extraction_contract_version = EXCLUDED.extraction_contract_version,
       configuration = public.graphify_runs.configuration || EXCLUDED.configuration
     WHERE public.graphify_runs.source_manifest_digest = EXCLUDED.source_manifest_digest
       AND public.graphify_runs.extraction_contract_version = EXCLUDED.extraction_contract_version
     RETURNING run_id, workspace_id, repository_revision, workspace_revision,
               source_manifest_digest, source_manifest_source_count,
               parser_contract_version, extraction_contract_version, dry_run`,
    [
      workspaceId,
      record.baseCommitOid,
      record.workspaceRevision,
      record.sourceManifestDigest,
      record.sourceCount,
      parserContractVersion,
      extractionContractVersion,
      JSON.stringify({
        workspaceRevisionRecordChecksum: record.checksum,
        repositoryId: record.repositoryId,
        baseTreeOid: record.baseTreeOid,
        gitHeadRef: record.gitHeadRef,
        dirty: record.dirty,
        sourceCount: record.sourceCount,
        writerRevision: GRAPHIFY_SOURCE_INVENTORY_WRITER_V2,
        ...(input.configuration ?? {}),
      }),
    ],
  );

  if (runInsert.rowCount !== 1 || !runInsert.rows[0]) {
    throw new Error('GRAPHIFY_RUN_REVISION_CONFLICT_OR_READBACK_FAILED');
  }
  const run = runInsert.rows[0];
  const runId = uuid.parse(run.run_id);
  if (String(run.repository_revision) !== record.baseCommitOid) {
    throw new Error('GRAPHIFY_RUN_REPOSITORY_PROVENANCE_MISMATCH');
  }
  if (String(run.workspace_revision) !== record.workspaceRevision) {
    throw new Error('GRAPHIFY_RUN_WORKSPACE_REVISION_MISMATCH');
  }
  if (normalizeDigest(run.source_manifest_digest) !== record.sourceManifestDigest) {
    throw new Error('GRAPHIFY_RUN_SOURCE_MANIFEST_DIGEST_MISMATCH');
  }
  if (String(run.extraction_contract_version) !== extractionContractVersion) {
    throw new Error('GRAPHIFY_RUN_EXTRACTION_CONTRACT_MISMATCH');
  }
  if (Boolean(run.dry_run)) throw new Error('GRAPHIFY_RUN_DRY_RUN_MISMATCH');

  const runReadback = await input.client.query(
    `SELECT run_id, workspace_id, repository_revision, workspace_revision,
            source_manifest_digest, parser_contract_version,
            extraction_contract_version, dry_run
       FROM public.graphify_runs
      WHERE run_id = $1`,
    [runId],
  );
  if (runReadback.rowCount !== 1 || !runReadback.rows[0]) {
    throw new Error('GRAPHIFY_RUN_INDEPENDENT_READBACK_FAILED');
  }
  const persistedRun = runReadback.rows[0];
  if (String(persistedRun.run_id) !== runId || String(persistedRun.workspace_id) !== workspaceId) {
    throw new Error('GRAPHIFY_RUN_WORKSPACE_ID_READBACK_MISMATCH');
  }
  if (String(persistedRun.repository_revision) !== record.baseCommitOid || String(persistedRun.workspace_revision) !== record.workspaceRevision) {
    throw new Error('GRAPHIFY_RUN_REVISION_READBACK_MISMATCH');
  }
  if (normalizeDigest(persistedRun.source_manifest_digest) !== record.sourceManifestDigest) {
    throw new Error('GRAPHIFY_RUN_SOURCE_MANIFEST_READBACK_MISMATCH');
  }
  if (String(persistedRun.parser_contract_version) !== parserContractVersion || String(persistedRun.extraction_contract_version) !== extractionContractVersion || Boolean(persistedRun.dry_run)) {
    throw new Error('GRAPHIFY_RUN_CONTRACT_READBACK_MISMATCH');
  }

  const files: GraphifySourceInventoryWriterReceiptV2['files'] = [];
  for (const binding of selected) {
    // Legacy source_revision remains Git/base-commit provenance. For untracked
    // files this is explicitly the observed base commit, not a claim that the
    // file existed as a blob at that commit; trackedAtBaseCommit + gitBlobOid
    // remain available in the canonical WorkspaceSourceBindingV1 evidence.
    const legacySourceRevision = record.baseCommitOid;

    const fileInsert = await input.client.query(
      `INSERT INTO public.graphify_files (
         workspace_id,
         workspace_revision,
         source_ref,
         source_revision,
         content_hash,
         code_source_revision,
         byte_length,
         parse_status,
         first_seen_run_id,
         last_seen_run_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'UNPROCESSED',$8,$8)
       ON CONFLICT (workspace_id, source_ref, code_source_revision)
         WHERE code_source_revision IS NOT NULL
      DO UPDATE SET
         workspace_revision = EXCLUDED.workspace_revision,
         source_revision = EXCLUDED.source_revision,
         last_seen_run_id = EXCLUDED.last_seen_run_id
       WHERE lower(public.graphify_files.content_hash) IN (
               lower(EXCLUDED.content_hash),
               lower('sha256:' || EXCLUDED.content_hash)
             )
         AND public.graphify_files.byte_length = EXCLUDED.byte_length
      RETURNING file_id, workspace_revision, source_ref, source_revision, content_hash,
                 code_source_revision, byte_length, last_seen_run_id`,
      [
        workspaceId,
        record.workspaceRevision,
        binding.sourceRef,
        legacySourceRevision,
        binding.contentDigest,
        binding.sourceRevision,
        binding.byteLength,
        runId,
      ],
    );

    if (fileInsert.rowCount !== 1 || !fileInsert.rows[0]) {
      throw new Error(`GRAPHIFY_SOURCE_IDENTITY_CONTENT_MISMATCH:${binding.sourceRef}`);
    }
    const row = fileInsert.rows[0];
    if (normalizeSourceRef(row.source_ref) !== binding.sourceRef) {
      throw new Error(`GRAPHIFY_SOURCE_REF_READBACK_MISMATCH:${binding.sourceRef}`);
    }
    if (String(row.workspace_revision) !== record.workspaceRevision) {
      throw new Error(`GRAPHIFY_FILE_WORKSPACE_REVISION_MISMATCH:${binding.sourceRef}`);
    }
    if (String(row.code_source_revision) !== binding.sourceRevision) {
      throw new Error(`GRAPHIFY_CODE_SOURCE_REVISION_MISMATCH:${binding.sourceRef}`);
    }
    if (normalizeDigest(row.content_hash) !== binding.contentDigest) {
      throw new Error(`GRAPHIFY_CONTENT_DIGEST_READBACK_MISMATCH:${binding.sourceRef}`);
    }
    if (Number(row.byte_length) !== binding.byteLength) {
      throw new Error(`GRAPHIFY_BYTE_LENGTH_READBACK_MISMATCH:${binding.sourceRef}`);
    }
    if (String(row.last_seen_run_id) !== runId) {
      throw new Error(`GRAPHIFY_LAST_SEEN_RUN_MISMATCH:${binding.sourceRef}`);
    }

    const fileReadback = await input.client.query(
      `SELECT file_id, workspace_id, workspace_revision, source_ref, source_revision,
              content_hash, code_source_revision, byte_length, last_seen_run_id
         FROM public.graphify_files
        WHERE file_id = $1`,
      [row.file_id],
    );
    if (fileReadback.rowCount !== 1 || !fileReadback.rows[0]) {
      throw new Error(`GRAPHIFY_FILE_INDEPENDENT_READBACK_FAILED:${binding.sourceRef}`);
    }
    const persistedFile = fileReadback.rows[0];
    if (String(persistedFile.file_id) !== String(row.file_id) || String(persistedFile.workspace_id) !== workspaceId) {
      throw new Error(`GRAPHIFY_FILE_IDENTITY_READBACK_MISMATCH:${binding.sourceRef}`);
    }
    if (String(persistedFile.workspace_revision) !== record.workspaceRevision) {
      throw new Error(`GRAPHIFY_FILE_WORKSPACE_REVISION_READBACK_MISMATCH:${binding.sourceRef}`);
    }
    if (normalizeSourceRef(persistedFile.source_ref) !== binding.sourceRef || String(persistedFile.source_revision) !== legacySourceRevision) {
      throw new Error(`GRAPHIFY_FILE_SOURCE_READBACK_MISMATCH:${binding.sourceRef}`);
    }
    if (normalizeDigest(persistedFile.content_hash) !== binding.contentDigest || String(persistedFile.code_source_revision) !== binding.sourceRevision) {
      throw new Error(`GRAPHIFY_FILE_REVISION_READBACK_MISMATCH:${binding.sourceRef}`);
    }
    if (Number(persistedFile.byte_length) !== binding.byteLength || String(persistedFile.last_seen_run_id) !== runId) {
      throw new Error(`GRAPHIFY_FILE_LINKAGE_READBACK_MISMATCH:${binding.sourceRef}`);
    }

    files.push({
      fileId: uuid.parse(row.file_id),
      sourceRef: binding.sourceRef,
      sourceRevision: binding.sourceRevision,
      contentDigest: binding.contentDigest,
      byteLength: binding.byteLength,
      legacySourceRevision: String(row.source_revision),
      readbackVerified: true,
    });
  }

  return graphifySourceInventoryWriterReceiptV2Schema.parse({
    schema: GRAPHIFY_SOURCE_INVENTORY_WRITER_V2,
    workspaceId,
    runId,
    workspaceRevision: record.workspaceRevision,
    sourceManifestDigest: record.sourceManifestDigest,
    repositoryRevision: record.baseCommitOid,
    parserContractVersion,
    extractionContractVersion,
    selectedSourceCount: selected.length,
    writtenSourceCount: files.length,
    readbackVerified: true,
    callerRevisionAuthorityAccepted: false,
    canonicalWriteAttempted: true,
    files,
  });
}

export async function writeGraphifySourceInventoryV2(input: Parameters<
  typeof writeGraphifySourceInventoryInTransactionV2
>[0]): Promise<GraphifySourceInventoryWriterReceiptV2> {
  await input.client.query('BEGIN');
  try {
    const receipt = await writeGraphifySourceInventoryInTransactionV2(input);
    await input.client.query('COMMIT');
    return receipt;
  } catch (error) {
    try { await input.client.query('ROLLBACK'); } catch {}
    throw error;
  }
}

// GRAPHIFY-LIFECYCLE-OWNER-01 (2026-09-03): the writer above only ever INSERTs a
// `graphify_runs` row with status='RUNNING' (or upserts non-status fields on conflict).
// Nothing anywhere in this repo ever transitions a row to 'COMPLETED' — confirmed via
// `scripts/atlas/audit-graphify-lifecycle-owner-v1.mjs` (`transitionPrimitiveExists: false`)
// and a repo-wide grep. LINEAGE-01 explicitly gates on a completed `graphify_runs` row
// ("the current Graphify run is still RUNNING with no completion receipt"), so this was a
// genuine missing primitive, not a stylistic gap. This function is that primitive: it closes
// exactly one RUNNING row by run_id, with the same fail-closed + independent-readback
// discipline as the writer above. It intentionally does NOT decide which row to close, nor
// open new rows — wiring it into the live graphify:daily fanout chain (which does not
// currently open a graphify_runs row at all, since it never calls the writer above) is a
// separate, distinct piece of work: that chain would first need a resolved
// WorkspaceRevisionRecordV1, which is itself gated behind LINEAGE-01's own still-open
// namespace/revision authority work. Do not force that wiring here to avoid recreating the
// exact circular dependency this file has repeatedly flagged elsewhere.

export const graphifyRunCompletionReceiptV2Schema = z.object({
  schema: z.literal('atlas.graphify-run-completion.v2'),
  runId: uuid,
  workspaceId: uuid,
  previousStatus: z.literal('RUNNING'),
  status: z.literal('COMPLETED'),
  completedAt: z.string().min(1),
  readbackVerified: z.literal(true),
}).strict();

export type GraphifyRunCompletionReceiptV2 = z.infer<typeof graphifyRunCompletionReceiptV2Schema>;

/**
 * Closes exactly one `graphify_runs` row (RUNNING -> COMPLETED). Fails closed: no row
 * matching (run_id, workspace_id, status='RUNNING') means no completion is recorded, not a
 * silent no-op success. The caller must already be inside a transaction; use
 * `completeGraphifyRunV2` below when the operation should own BEGIN/COMMIT/ROLLBACK.
 */
export async function completeGraphifyRunInTransactionV2(input: {
  client: GraphifySourceInventorySqlClientV2;
  runId: string;
  workspaceId: string;
}): Promise<GraphifyRunCompletionReceiptV2> {
  const runId = uuid.parse(input.runId);
  const workspaceId = uuid.parse(input.workspaceId);

  const update = await input.client.query(
    `UPDATE public.graphify_runs
        SET status = 'COMPLETED',
            completed_at = now()
      WHERE run_id = $1
        AND workspace_id = $2
        AND status = 'RUNNING'
      RETURNING run_id, workspace_id, status, completed_at`,
    [runId, workspaceId],
  );
  if (update.rowCount !== 1 || !update.rows[0]) {
    throw new Error('GRAPHIFY_RUN_COMPLETION_CONFLICT_OR_NOT_RUNNING');
  }
  const updated = update.rows[0];
  if (String(updated.status) !== 'COMPLETED' || !updated.completed_at) {
    throw new Error('GRAPHIFY_RUN_COMPLETION_WRITE_MISMATCH');
  }

  const readback = await input.client.query(
    `SELECT run_id, workspace_id, status, completed_at
       FROM public.graphify_runs
      WHERE run_id = $1`,
    [runId],
  );
  if (readback.rowCount !== 1 || !readback.rows[0]) {
    throw new Error('GRAPHIFY_RUN_COMPLETION_READBACK_FAILED');
  }
  const persisted = readback.rows[0];
  if (String(persisted.run_id) !== runId || String(persisted.workspace_id) !== workspaceId) {
    throw new Error('GRAPHIFY_RUN_COMPLETION_IDENTITY_READBACK_MISMATCH');
  }
  if (String(persisted.status) !== 'COMPLETED' || !persisted.completed_at) {
    throw new Error('GRAPHIFY_RUN_COMPLETION_STATUS_READBACK_MISMATCH');
  }

  return graphifyRunCompletionReceiptV2Schema.parse({
    schema: 'atlas.graphify-run-completion.v2',
    runId,
    workspaceId,
    previousStatus: 'RUNNING',
    status: 'COMPLETED',
    completedAt: String(persisted.completed_at),
    readbackVerified: true,
  });
}

export async function completeGraphifyRunV2(input: Parameters<
  typeof completeGraphifyRunInTransactionV2
>[0]): Promise<GraphifyRunCompletionReceiptV2> {
  await input.client.query('BEGIN');
  try {
    const receipt = await completeGraphifyRunInTransactionV2(input);
    await input.client.query('COMMIT');
    return receipt;
  } catch (error) {
    try { await input.client.query('ROLLBACK'); } catch {}
    throw error;
  }
}

// GRAPHIFY-OPEN-CLOSE-WIRING-01 (2026-09-03, operator-directed): workspace_revision is run
// LIFECYCLE METADATA, not run IDENTITY. run_id/workspace_id/repository_revision/started_at are
// the run's identity and are already known at open time; workspace_revision/
// source_manifest_digest become known only once source inventory finishes and must remain NULL
// until then rather than being synthesized. Verified live against the real schema before writing
// this: workspace_revision and source_manifest_digest are already nullable
// (information_schema.columns.is_nullable = 'YES'), and the existing unique constraint
// (graphify_runs_workspace_revision_parser_uq_v2) is already a PARTIAL index
// `WHERE workspace_revision IS NOT NULL` -- NULL rows are excluded from that constraint
// entirely, so no migration was needed for this. run_id (the primary key) is this pair's actual
// identity; do not rely on the workspace_revision unique constraint to exclude concurrent
// same-workspace RUNNING rows with NULL workspace_revision -- it does not do that.

export const graphifyRunOpenReceiptV1Schema = z.object({
  schema: z.literal('atlas.graphify-run-open.v1'),
  runId: uuid,
  workspaceId: uuid,
  repositoryRevision: z.string().min(1),
  parserContractVersion: z.string().min(1),
  extractionContractVersion: z.string().min(1),
  status: z.literal('RUNNING'),
  workspaceRevision: z.null(),
  readbackVerified: z.literal(true),
}).strict();

export type GraphifyRunOpenReceiptV1 = z.infer<typeof graphifyRunOpenReceiptV1Schema>;

/**
 * Opens a bare `graphify_runs` row -- run identity only (run_id, workspace_id,
 * repository_revision), no workspace_revision. Deliberately does NOT reuse the upsert-on-conflict
 * INSERT in writeGraphifySourceInventoryInTransactionV2 above: that INSERT always binds a real
 * workspaceRevision as part of one INSERT+file-write call, which is exactly the "manufacture a
 * revision merely so graphify_runs can contain a RUNNING row" pattern this primitive exists to
 * avoid. This one only ever writes workspace_revision = NULL.
 */
export async function openGraphifyRunInTransactionV1(input: {
  client: GraphifySourceInventorySqlClientV2;
  workspaceId: string;
  repositoryRevision: string;
  parserContractVersion: string;
  extractionContractVersion: string;
  dryRun?: boolean;
  configuration?: Record<string, unknown>;
}): Promise<GraphifyRunOpenReceiptV1> {
  const workspaceId = uuid.parse(input.workspaceId);
  const repositoryRevision = z.string().min(1).parse(input.repositoryRevision);
  const parserContractVersion = z.string().min(1).parse(input.parserContractVersion);
  const extractionContractVersion = z.string().min(1).parse(input.extractionContractVersion);
  const dryRun = input.dryRun ?? false;

  const insert = await input.client.query(
    `INSERT INTO public.graphify_runs (
       workspace_id,
       repository_revision,
       parser_contract_version,
       extraction_contract_version,
       status,
       dry_run,
       configuration
     ) VALUES ($1,$2,$3,$4,'RUNNING',$5,$6::jsonb)
     RETURNING run_id, workspace_id, repository_revision, parser_contract_version,
               extraction_contract_version, status, workspace_revision, dry_run`,
    [
      workspaceId,
      repositoryRevision,
      parserContractVersion,
      extractionContractVersion,
      dryRun,
      JSON.stringify({ writerRevision: 'atlas.graphify-run-open.v1', ...(input.configuration ?? {}) }),
    ],
  );
  if (insert.rowCount !== 1 || !insert.rows[0]) throw new Error('GRAPHIFY_RUN_OPEN_INSERT_FAILED');
  const row = insert.rows[0];
  const runId = uuid.parse(row.run_id);
  if (row.workspace_revision !== null) throw new Error('GRAPHIFY_RUN_OPEN_UNEXPECTED_WORKSPACE_REVISION');
  if (String(row.status) !== 'RUNNING') throw new Error('GRAPHIFY_RUN_OPEN_STATUS_MISMATCH');

  const readback = await input.client.query(
    `SELECT run_id, workspace_id, repository_revision, parser_contract_version,
            extraction_contract_version, status, workspace_revision
       FROM public.graphify_runs
      WHERE run_id = $1`,
    [runId],
  );
  if (readback.rowCount !== 1 || !readback.rows[0]) throw new Error('GRAPHIFY_RUN_OPEN_READBACK_FAILED');
  const persisted = readback.rows[0];
  if (String(persisted.run_id) !== runId || String(persisted.workspace_id) !== workspaceId) {
    throw new Error('GRAPHIFY_RUN_OPEN_IDENTITY_READBACK_MISMATCH');
  }
  if (persisted.workspace_revision !== null || String(persisted.status) !== 'RUNNING') {
    throw new Error('GRAPHIFY_RUN_OPEN_STATE_READBACK_MISMATCH');
  }

  return graphifyRunOpenReceiptV1Schema.parse({
    schema: 'atlas.graphify-run-open.v1',
    runId,
    workspaceId,
    repositoryRevision,
    parserContractVersion,
    extractionContractVersion,
    status: 'RUNNING',
    workspaceRevision: null,
    readbackVerified: true,
  });
}

export async function openGraphifyRunV1(input: Parameters<
  typeof openGraphifyRunInTransactionV1
>[0]): Promise<GraphifyRunOpenReceiptV1> {
  await input.client.query('BEGIN');
  try {
    const receipt = await openGraphifyRunInTransactionV1(input);
    await input.client.query('COMMIT');
    return receipt;
  } catch (error) {
    try { await input.client.query('ROLLBACK'); } catch {}
    throw error;
  }
}

export const graphifyRunRevisionBindingReceiptV1Schema = z.object({
  schema: z.literal('atlas.graphify-run-revision-binding.v1'),
  runId: uuid,
  workspaceId: uuid,
  workspaceRevision: contentRevision,
  sourceManifestDigest: sha256,
  sourceManifestSourceCount: z.number().int().positive(),
  readbackVerified: z.literal(true),
}).strict();

export type GraphifyRunRevisionBindingReceiptV1 = z.infer<typeof graphifyRunRevisionBindingReceiptV1Schema>;

/**
 * Binds a WorkspaceRevisionRecordV1 to an already-open (workspace_revision IS NULL) run, once
 * source inventory has produced one. Fails closed if the run doesn't exist, isn't RUNNING, or
 * already has a workspace_revision bound (this is a one-time bind, not an upsert -- a run's
 * source snapshot identity should not silently change after being set).
 */
export async function bindWorkspaceRevisionInTransactionV1(input: {
  client: GraphifySourceInventorySqlClientV2;
  runId: string;
  workspaceId: string;
  record: WorkspaceRevisionRecordV1;
}): Promise<GraphifyRunRevisionBindingReceiptV1> {
  const runId = uuid.parse(input.runId);
  const workspaceId = uuid.parse(input.workspaceId);
  const record = workspaceRevisionRecordV1Schema.parse(input.record);

  const update = await input.client.query(
    `UPDATE public.graphify_runs
        SET workspace_revision = $1,
            source_manifest_digest = $2,
            source_manifest_source_count = $3
      WHERE run_id = $4
        AND workspace_id = $5
        AND status = 'RUNNING'
        AND workspace_revision IS NULL
      RETURNING run_id, workspace_id, workspace_revision, source_manifest_digest,
                source_manifest_source_count`,
    [record.workspaceRevision, record.sourceManifestDigest, record.sourceCount, runId, workspaceId],
  );
  if (update.rowCount !== 1 || !update.rows[0]) {
    throw new Error('GRAPHIFY_RUN_REVISION_BINDING_CONFLICT_NOT_RUNNING_OR_ALREADY_BOUND');
  }
  const updated = update.rows[0];
  if (String(updated.workspace_revision) !== record.workspaceRevision) {
    throw new Error('GRAPHIFY_RUN_REVISION_BINDING_WRITE_MISMATCH');
  }

  const readback = await input.client.query(
    `SELECT run_id, workspace_id, workspace_revision, source_manifest_digest,
            source_manifest_source_count, status
       FROM public.graphify_runs
      WHERE run_id = $1`,
    [runId],
  );
  if (readback.rowCount !== 1 || !readback.rows[0]) throw new Error('GRAPHIFY_RUN_REVISION_BINDING_READBACK_FAILED');
  const persisted = readback.rows[0];
  if (String(persisted.run_id) !== runId || String(persisted.workspace_id) !== workspaceId) {
    throw new Error('GRAPHIFY_RUN_REVISION_BINDING_IDENTITY_READBACK_MISMATCH');
  }
  if (String(persisted.workspace_revision) !== record.workspaceRevision) {
    throw new Error('GRAPHIFY_RUN_REVISION_BINDING_STATE_READBACK_MISMATCH');
  }
  if (normalizeDigest(persisted.source_manifest_digest) !== record.sourceManifestDigest) {
    throw new Error('GRAPHIFY_RUN_REVISION_BINDING_MANIFEST_READBACK_MISMATCH');
  }

  return graphifyRunRevisionBindingReceiptV1Schema.parse({
    schema: 'atlas.graphify-run-revision-binding.v1',
    runId,
    workspaceId,
    workspaceRevision: record.workspaceRevision,
    sourceManifestDigest: record.sourceManifestDigest,
    sourceManifestSourceCount: Number(persisted.source_manifest_source_count),
    readbackVerified: true,
  });
}

export async function bindWorkspaceRevisionV1(input: Parameters<
  typeof bindWorkspaceRevisionInTransactionV1
>[0]): Promise<GraphifyRunRevisionBindingReceiptV1> {
  await input.client.query('BEGIN');
  try {
    const receipt = await bindWorkspaceRevisionInTransactionV1(input);
    await input.client.query('COMMIT');
    return receipt;
  } catch (error) {
    try { await input.client.query('ROLLBACK'); } catch {}
    throw error;
  }
}
