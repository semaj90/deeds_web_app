import path from 'node:path';
import { z } from 'zod';

import { deriveCodeRevisionAuthorityV1 } from './code-revision-authority-v1.js';
import {
  materializeWorkspaceRevisionOriginV1,
  type WorkspaceRevisionOriginRuntimeV1,
} from './workspace-revision-origin-runtime-v1.js';

export const GRAPHIFY_SOURCE_INVENTORY_WRITER_SCHEMA = 'atlas.graphify-source-inventory-writer.v1' as const;
export const GRAPHIFY_SOURCE_INVENTORY_WRITER_REVISION = 'atlas.graphify-source-inventory-writer.2026-08-22.v2' as const;

export const graphifySourceInventoryWriterReceiptV1Schema = z.object({
  schema: z.literal(GRAPHIFY_SOURCE_INVENTORY_WRITER_SCHEMA),
  writerRevision: z.literal(GRAPHIFY_SOURCE_INVENTORY_WRITER_REVISION),
  workspaceId: z.string().uuid(),
  runId: z.string().uuid(),
  fileId: z.string().uuid(),
  workspaceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  sourceManifestDigest: z.string().regex(/^[a-f0-9]{64}$/),
  repositoryRevision: z.string().min(1),
  sourceRef: z.string().min(1),
  codeSourceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  legacySourceRevision: z.string().min(1),
  sourceContentDigest: z.string().regex(/^[a-f0-9]{64}$/),
  sourceByteLength: z.number().int().nonnegative(),
  parserContractVersion: z.string().min(1),
  extractionContractVersion: z.string().min(1),
  runReadbackVerified: z.literal(true),
  fileReadbackVerified: z.literal(true),
  revisionsCreatedInsideWriterBoundary: z.literal(true),
  gitRevisionIsProvenanceOnly: z.literal(true),
  callerRevisionAuthorityAccepted: z.literal(false),
  canonicalWriteAttempted: z.literal(true),
}).strict();
export type GraphifySourceInventoryWriterReceiptV1 = z.infer<typeof graphifySourceInventoryWriterReceiptV1Schema>;

export interface GraphifySourceInventorySqlClientV1 {
  query: (text: string, values?: readonly unknown[]) => Promise<{
    rowCount: number | null;
    rows: Array<Record<string, unknown>>;
  }>;
}

function normalizedDigest(value: unknown): string {
  const raw = String(value ?? '').trim().toLowerCase();
  const match = /^(?:sha256:)?([a-f0-9]{64})$/.exec(raw);
  if (!match) throw new Error(`GRAPHIFY_CONTENT_HASH_INVALID:${raw}`);
  return match[1]!;
}

function normalizedSourceRef(workspaceRoot: string, absoluteSourcePath: string): string {
  const relative = path.relative(path.resolve(workspaceRoot), path.resolve(absoluteSourcePath))
    .replaceAll('\\', '/')
    .replace(/^\.\//, '');
  if (!relative || relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) {
    throw new Error(`GRAPHIFY_SOURCE_OUTSIDE_WORKSPACE:${absoluteSourcePath}`);
  }
  return relative;
}

async function assertV2Schema(client: GraphifySourceInventorySqlClientV1): Promise<void> {
  const result = await client.query(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          (table_name = 'graphify_runs' AND column_name = ANY($1::text[]))
          OR (table_name = 'graphify_files' AND column_name = ANY($2::text[]))
        )`,
    [
      ['workspace_revision', 'source_manifest_digest'],
      ['code_source_revision'],
    ],
  );
  const run = new Set(result.rows.filter((row) => row.table_name === 'graphify_runs').map((row) => String(row.column_name)));
  const file = new Set(result.rows.filter((row) => row.table_name === 'graphify_files').map((row) => String(row.column_name)));
  if (!run.has('workspace_revision') || !run.has('source_manifest_digest') || !file.has('code_source_revision')) {
    throw new Error('GRAPHIFY_REVISION_AUTHORITY_V2_MIGRATION_REQUIRED');
  }
}

/**
 * Single canonical Graphify source-inventory write primitive.
 *
 * The writer computes the complete WorkspaceRevisionRecordV1 from the actual
 * indexed byte set inside its own boundary, then selects the requested source
 * binding from that manifest. Historical Git columns remain provenance:
 *
 *   graphify_runs.repository_revision = base Git commit OID
 *   graphify_files.source_revision    = base Git commit provenance
 *
 * Logical authority is stored separately:
 *
 *   graphify_runs.workspace_revision    = sha256:<source manifest digest>
 *   graphify_files.code_source_revision = sha256:<exact source byte digest>
 */
export async function writeGraphifySourceInventoryFileInTransactionV1(input: {
  client: GraphifySourceInventorySqlClientV1;
  workspaceId: string;
  workspaceRoot: string;
  repositoryId: string;
  absoluteSourcePath: string;
  parserContractVersion: string;
  extractionContractVersion: string;
  producerRevision?: string;
  language?: string | null;
  parserName?: string | null;
  parserVersion?: string | null;
  originMaterializer?: (input: {
    workspaceRoot: string;
    repositoryId: string;
    producerRevision: string;
  }) => WorkspaceRevisionOriginRuntimeV1;
}): Promise<GraphifySourceInventoryWriterReceiptV1> {
  const workspaceId = z.string().uuid().parse(input.workspaceId);
  const parserContractVersion = z.string().min(1).parse(input.parserContractVersion);
  const extractionContractVersion = z.string().min(1).parse(input.extractionContractVersion);
  const producerRevision = input.producerRevision ?? GRAPHIFY_SOURCE_INVENTORY_WRITER_REVISION;

  await assertV2Schema(input.client);

  const materialize = input.originMaterializer ?? ((args) => materializeWorkspaceRevisionOriginV1(args));
  const origin = materialize({
    workspaceRoot: input.workspaceRoot,
    repositoryId: input.repositoryId,
    producerRevision,
  });
  const sourceRef = normalizedSourceRef(input.workspaceRoot, input.absoluteSourcePath);
  const sourceBinding = origin.bindings.find((binding) => binding.sourceRef === sourceRef);
  if (!sourceBinding) throw new Error(`GRAPHIFY_SOURCE_NOT_IN_WORKSPACE_MANIFEST:${sourceRef}`);

  const authority = deriveCodeRevisionAuthorityV1({
    workspaceRoot: input.workspaceRoot,
    absoluteSourcePath: input.absoluteSourcePath,
    workspaceRecord: origin.record,
    sourceBinding,
    producerRevision,
    canonicalWritesAllowed: true,
  });

  const insertedRun = await input.client.query(
    `INSERT INTO graphify_runs (
       workspace_id, repository_revision, workspace_revision, source_manifest_digest,
       parser_contract_version, extraction_contract_version, status, dry_run, configuration
     ) VALUES ($1,$2,$3,$4,$5,$6,'RUNNING',false,$7::jsonb)
     ON CONFLICT (workspace_id, workspace_revision, parser_contract_version)
       WHERE workspace_revision IS NOT NULL
     DO NOTHING
     RETURNING run_id, workspace_id, repository_revision, workspace_revision,
               source_manifest_digest, parser_contract_version,
               extraction_contract_version, dry_run`,
    [
      workspaceId,
      authority.baseGitCommitOid,
      authority.workspaceRevision,
      authority.workspaceSourceManifestDigest,
      parserContractVersion,
      extractionContractVersion,
      JSON.stringify({
        revisionAuthority: 'WorkspaceRevisionRecordV1+CodeSourceRevisionV1',
        writerRevision: GRAPHIFY_SOURCE_INVENTORY_WRITER_REVISION,
        gitCommitIsProvenanceOnly: true,
      }),
    ],
  );

  let runRow = insertedRun.rows[0];
  if (!runRow) {
    const existingRun = await input.client.query(
      `SELECT run_id, workspace_id, repository_revision, workspace_revision,
              source_manifest_digest, parser_contract_version,
              extraction_contract_version, dry_run
         FROM graphify_runs
        WHERE workspace_id = $1
          AND workspace_revision = $2
          AND parser_contract_version = $3
        FOR UPDATE`,
      [workspaceId, authority.workspaceRevision, parserContractVersion],
    );
    if (existingRun.rowCount !== 1) throw new Error('GRAPHIFY_RUN_READBACK_MISSING');
    runRow = existingRun.rows[0];
  }

  if (String(runRow.workspace_revision) !== authority.workspaceRevision) {
    throw new Error('GRAPHIFY_RUN_WORKSPACE_REVISION_MISMATCH');
  }
  if (String(runRow.repository_revision).toLowerCase() !== authority.baseGitCommitOid.toLowerCase()) {
    throw new Error('GRAPHIFY_RUN_GIT_PROVENANCE_MISMATCH');
  }
  if (String(runRow.source_manifest_digest).toLowerCase() !== authority.workspaceSourceManifestDigest) {
    throw new Error('GRAPHIFY_RUN_SOURCE_MANIFEST_DIGEST_MISMATCH');
  }
  if (String(runRow.extraction_contract_version) !== extractionContractVersion) {
    throw new Error('GRAPHIFY_RUN_EXTRACTION_CONTRACT_MISMATCH');
  }
  if (Boolean(runRow.dry_run)) throw new Error('GRAPHIFY_CANONICAL_WRITER_BOUND_TO_DRY_RUN');

  const runId = z.string().uuid().parse(runRow.run_id);
  const legacySourceRevision = authority.baseGitCommitOid;

  const insertedFile = await input.client.query(
    `INSERT INTO graphify_files (
       workspace_id, source_ref, source_revision, code_source_revision,
       content_hash, byte_length, language, parser_name, parser_version,
       parse_status, first_seen_run_id, last_seen_run_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'UNPROCESSED',$10,$10)
     ON CONFLICT (workspace_id, source_ref, code_source_revision)
       WHERE code_source_revision IS NOT NULL
     DO UPDATE SET last_seen_run_id = EXCLUDED.last_seen_run_id
       WHERE lower(graphify_files.content_hash) = lower(EXCLUDED.content_hash)
         AND graphify_files.byte_length = EXCLUDED.byte_length
     RETURNING file_id, workspace_id, source_ref, source_revision,
               code_source_revision, content_hash, byte_length,
               first_seen_run_id, last_seen_run_id`,
    [
      workspaceId,
      authority.sourceRef,
      legacySourceRevision,
      authority.sourceRevision,
      authority.sourceContentDigest,
      authority.sourceByteLength,
      input.language ?? null,
      input.parserName ?? null,
      input.parserVersion ?? null,
      runId,
    ],
  );

  let fileRow = insertedFile.rows[0];
  if (!fileRow) {
    const conflicting = await input.client.query(
      `SELECT file_id, workspace_id, source_ref, source_revision,
              code_source_revision, content_hash, byte_length,
              first_seen_run_id, last_seen_run_id
         FROM graphify_files
        WHERE workspace_id = $1
          AND replace(source_ref, '\\', '/') = $2
          AND code_source_revision = $3
        FOR UPDATE`,
      [workspaceId, authority.sourceRef, authority.sourceRevision],
    );
    if (conflicting.rowCount !== 1) throw new Error('GRAPHIFY_FILE_READBACK_MISSING');
    fileRow = conflicting.rows[0];
  }

  if (normalizedSourceRef(input.workspaceRoot, path.resolve(input.workspaceRoot, String(fileRow.source_ref))) !== authority.sourceRef) {
    throw new Error('GRAPHIFY_SOURCE_REF_READBACK_MISMATCH');
  }
  if (String(fileRow.code_source_revision) !== authority.sourceRevision) {
    throw new Error('GRAPHIFY_CODE_SOURCE_REVISION_MISMATCH');
  }
  if (normalizedDigest(fileRow.content_hash) !== authority.sourceContentDigest) {
    throw new Error('GRAPHIFY_SOURCE_CONTENT_DIGEST_MISMATCH');
  }
  if (Number(fileRow.byte_length) !== authority.sourceByteLength) {
    throw new Error('GRAPHIFY_SOURCE_BYTE_LENGTH_MISMATCH');
  }
  if (String(fileRow.last_seen_run_id) !== runId) {
    throw new Error('GRAPHIFY_LAST_SEEN_RUN_MISMATCH');
  }

  return graphifySourceInventoryWriterReceiptV1Schema.parse({
    schema: GRAPHIFY_SOURCE_INVENTORY_WRITER_SCHEMA,
    writerRevision: GRAPHIFY_SOURCE_INVENTORY_WRITER_REVISION,
    workspaceId,
    runId,
    fileId: fileRow.file_id,
    workspaceRevision: authority.workspaceRevision,
    sourceManifestDigest: authority.workspaceSourceManifestDigest,
    repositoryRevision: authority.baseGitCommitOid,
    sourceRef: authority.sourceRef,
    codeSourceRevision: authority.sourceRevision,
    legacySourceRevision: String(fileRow.source_revision),
    sourceContentDigest: authority.sourceContentDigest,
    sourceByteLength: authority.sourceByteLength,
    parserContractVersion,
    extractionContractVersion,
    runReadbackVerified: true,
    fileReadbackVerified: true,
    revisionsCreatedInsideWriterBoundary: true,
    gitRevisionIsProvenanceOnly: true,
    callerRevisionAuthorityAccepted: false,
    canonicalWriteAttempted: true,
  });
}

export async function writeGraphifySourceInventoryFileV1(input: Parameters<
  typeof writeGraphifySourceInventoryFileInTransactionV1
>[0]): Promise<GraphifySourceInventoryWriterReceiptV1> {
  await input.client.query('BEGIN');
  try {
    const receipt = await writeGraphifySourceInventoryFileInTransactionV1(input);
    await input.client.query('COMMIT');
    return receipt;
  } catch (error) {
    try { await input.client.query('ROLLBACK'); } catch {}
    throw error;
  }
}
