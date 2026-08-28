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
