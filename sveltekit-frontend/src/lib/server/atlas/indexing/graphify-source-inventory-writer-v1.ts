import { z } from 'zod';

import {
  deriveCodeRevisionAuthorityV1,
  type CodeRevisionAuthorityV1,
} from './code-revision-authority-v1.js';

export const GRAPHIFY_SOURCE_INVENTORY_WRITER_SCHEMA = 'atlas.graphify-source-inventory-writer.v1' as const;
export const GRAPHIFY_SOURCE_INVENTORY_WRITER_REVISION = 'atlas.graphify-source-inventory-writer.2026-08-22.v1' as const;

export const graphifySourceInventoryStorageSemanticsV1Schema = z.enum([
  'CODE_SOURCE_REVISION_V1',
  'LEGACY_GIT_SHA_WITH_CONTENT_HASH_V1',
]);
export type GraphifySourceInventoryStorageSemanticsV1 = z.infer<
  typeof graphifySourceInventoryStorageSemanticsV1Schema
>;

export const graphifySourceInventoryWriterReceiptV1Schema = z.object({
  schema: z.literal(GRAPHIFY_SOURCE_INVENTORY_WRITER_SCHEMA),
  writerRevision: z.literal(GRAPHIFY_SOURCE_INVENTORY_WRITER_REVISION),
  workspaceId: z.string().uuid(),
  runId: z.string().uuid(),
  fileId: z.string().uuid(),
  workspaceRevision: z.string().min(1),
  sourceRef: z.string().min(1),
  codeSourceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  storedSourceRevision: z.string().min(1),
  sourceRevisionAuthorityField: z.enum(['SOURCE_REVISION', 'CONTENT_HASH']),
  sourceContentDigest: z.string().regex(/^[a-f0-9]{64}$/),
  sourceByteLength: z.number().int().nonnegative(),
  storageSemantics: graphifySourceInventoryStorageSemanticsV1Schema,
  parserContractVersion: z.string().min(1),
  extractionContractVersion: z.string().min(1),
  runReadbackVerified: z.literal(true),
  fileReadbackVerified: z.literal(true),
  revisionsCreatedInsideWriterBoundary: z.literal(true),
  callerRevisionAuthorityAccepted: z.literal(false),
  canonicalWriteAttempted: z.literal(true),
}).strict();
export type GraphifySourceInventoryWriterReceiptV1 = z.infer<
  typeof graphifySourceInventoryWriterReceiptV1Schema
>;

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

function expectedStoredSourceRevision(
  authority: CodeRevisionAuthorityV1,
  semantics: GraphifySourceInventoryStorageSemanticsV1,
): string {
  return semantics === 'CODE_SOURCE_REVISION_V1'
    ? authority.sourceRevision
    : authority.workspaceRevision;
}

function authorityField(
  semantics: GraphifySourceInventoryStorageSemanticsV1,
): 'SOURCE_REVISION' | 'CONTENT_HASH' {
  return semantics === 'CODE_SOURCE_REVISION_V1' ? 'SOURCE_REVISION' : 'CONTENT_HASH';
}

/**
 * The single canonical Graphify source-inventory write primitive.
 *
 * Revision authority is created inside this boundary:
 * - workspaceRevision := git rev-parse HEAD
 * - CodeSourceRevisionV1 := sha256(exact UTF-8 source bytes)
 *
 * Historical Graphify compatibility is explicit. When the persisted layout is
 * LEGACY_GIT_SHA_WITH_CONTENT_HASH_V1, graphify_files.source_revision keeps the
 * Git provenance coordinate and graphify_files.content_hash is the exact-byte
 * authority. The writer never reinterprets or overwrites that legacy meaning.
 *
 * The caller must already be inside a transaction. Use
 * writeGraphifySourceInventoryFileV1() for the begin/commit wrapper, or call
 * this function directly from a controlled transaction/rollback canary.
 */
export async function writeGraphifySourceInventoryFileInTransactionV1(input: {
  client: GraphifySourceInventorySqlClientV1;
  workspaceId: string;
  workspaceRoot: string;
  absoluteSourcePath: string;
  sourceText: string;
  storageSemantics: GraphifySourceInventoryStorageSemanticsV1;
  parserContractVersion: string;
  extractionContractVersion: string;
  producerRevision?: string;
  language?: string | null;
  parserName?: string | null;
  parserVersion?: string | null;
  workspaceRevisionResolver?: (workspaceRoot: string) => string;
}): Promise<GraphifySourceInventoryWriterReceiptV1> {
  const workspaceId = z.string().uuid().parse(input.workspaceId);
  const storageSemantics = graphifySourceInventoryStorageSemanticsV1Schema.parse(input.storageSemantics);
  const parserContractVersion = z.string().min(1).parse(input.parserContractVersion);
  const extractionContractVersion = z.string().min(1).parse(input.extractionContractVersion);

  const authority = deriveCodeRevisionAuthorityV1({
    workspaceRoot: input.workspaceRoot,
    absoluteSourcePath: input.absoluteSourcePath,
    sourceText: input.sourceText,
    producerRevision: input.producerRevision ?? GRAPHIFY_SOURCE_INVENTORY_WRITER_REVISION,
    canonicalWritesAllowed: true,
    workspaceRevisionResolver: input.workspaceRevisionResolver,
  });

  const storedSourceRevision = expectedStoredSourceRevision(authority, storageSemantics);
  const sourceRevisionAuthorityField = authorityField(storageSemantics);

  const insertedRun = await input.client.query(
    `INSERT INTO graphify_runs (
       workspace_id, repository_revision, parser_contract_version,
       extraction_contract_version, status, dry_run, configuration
     ) VALUES ($1,$2,$3,$4,'RUNNING',false,$5::jsonb)
     ON CONFLICT (workspace_id, repository_revision, parser_contract_version)
     DO NOTHING
     RETURNING run_id, workspace_id, repository_revision, parser_contract_version,
               extraction_contract_version, dry_run`,
    [
      workspaceId,
      authority.workspaceRevision,
      parserContractVersion,
      extractionContractVersion,
      JSON.stringify({
        revisionAuthority: 'CodeRevisionAuthorityV1',
        sourceRevisionStorageSemantics: storageSemantics,
        sourceRevisionAuthorityField,
        writerRevision: GRAPHIFY_SOURCE_INVENTORY_WRITER_REVISION,
      }),
    ],
  );

  let runRow = insertedRun.rows[0];
  if (!runRow) {
    const existingRun = await input.client.query(
      `SELECT run_id, workspace_id, repository_revision, parser_contract_version,
              extraction_contract_version, dry_run
         FROM graphify_runs
        WHERE workspace_id = $1
          AND lower(repository_revision) = lower($2)
          AND parser_contract_version = $3
        FOR UPDATE`,
      [workspaceId, authority.workspaceRevision, parserContractVersion],
    );
    if (existingRun.rowCount !== 1) throw new Error('GRAPHIFY_RUN_READBACK_MISSING');
    runRow = existingRun.rows[0];
  }

  if (String(runRow.repository_revision).toLowerCase() !== authority.workspaceRevision.toLowerCase()) {
    throw new Error('GRAPHIFY_RUN_WORKSPACE_REVISION_MISMATCH');
  }
  if (String(runRow.extraction_contract_version) !== extractionContractVersion) {
    throw new Error('GRAPHIFY_RUN_EXTRACTION_CONTRACT_MISMATCH');
  }
  if (Boolean(runRow.dry_run)) throw new Error('GRAPHIFY_CANONICAL_WRITER_BOUND_TO_DRY_RUN');

  const runId = z.string().uuid().parse(runRow.run_id);

  const insertedFile = await input.client.query(
    `INSERT INTO graphify_files (
       workspace_id, source_ref, source_revision, content_hash, byte_length,
       language, parser_name, parser_version, parse_status,
       first_seen_run_id, last_seen_run_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'UNPROCESSED',$9,$9)
     ON CONFLICT (workspace_id, source_ref, source_revision)
     DO UPDATE SET last_seen_run_id = EXCLUDED.last_seen_run_id
       WHERE lower(graphify_files.content_hash) IN (lower(EXCLUDED.content_hash), lower('sha256:' || EXCLUDED.content_hash))
         AND graphify_files.byte_length = EXCLUDED.byte_length
     RETURNING file_id, workspace_id, source_ref, source_revision, content_hash,
               byte_length, first_seen_run_id, last_seen_run_id`,
    [
      workspaceId,
      authority.sourceRef,
      storedSourceRevision,
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
      `SELECT file_id, workspace_id, source_ref, source_revision, content_hash,
              byte_length, first_seen_run_id, last_seen_run_id
         FROM graphify_files
        WHERE workspace_id = $1
          AND replace(source_ref, '\\', '/') = $2
          AND source_revision = $3
        FOR UPDATE`,
      [workspaceId, authority.sourceRef, storedSourceRevision],
    );
    if (conflicting.rowCount !== 1) throw new Error('GRAPHIFY_FILE_READBACK_MISSING');
    fileRow = conflicting.rows[0];
    const existingDigest = normalizedDigest(fileRow.content_hash);
    if (existingDigest !== authority.sourceContentDigest
        || Number(fileRow.byte_length) !== authority.sourceByteLength) {
      throw new Error('GRAPHIFY_SOURCE_IDENTITY_CONTENT_MISMATCH');
    }
  }

  const storedDigest = normalizedDigest(fileRow.content_hash);
  if (replaceSlashes(String(fileRow.source_ref)) !== authority.sourceRef) {
    throw new Error('GRAPHIFY_SOURCE_REF_READBACK_MISMATCH');
  }
  if (String(fileRow.source_revision) !== storedSourceRevision) {
    throw new Error('GRAPHIFY_STORED_SOURCE_REVISION_MISMATCH');
  }
  if (storedDigest !== authority.sourceContentDigest) {
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
    sourceRef: authority.sourceRef,
    codeSourceRevision: authority.sourceRevision,
    storedSourceRevision,
    sourceRevisionAuthorityField,
    sourceContentDigest: authority.sourceContentDigest,
    sourceByteLength: authority.sourceByteLength,
    storageSemantics,
    parserContractVersion,
    extractionContractVersion,
    runReadbackVerified: true,
    fileReadbackVerified: true,
    revisionsCreatedInsideWriterBoundary: true,
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

function replaceSlashes(value: string): string {
  return value.replaceAll('\\', '/');
}
