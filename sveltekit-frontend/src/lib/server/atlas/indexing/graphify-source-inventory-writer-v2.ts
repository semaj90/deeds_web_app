import path from 'node:path';
import { z } from 'zod';

import { deriveCodeRevisionAuthorityV2 } from './code-revision-authority-v2.js';
import {
  materializeWorkspaceRevisionOriginV1,
  type WorkspaceRevisionOriginRuntimeV1,
} from './workspace-revision-origin-runtime-v1.js';

export const GRAPHIFY_SOURCE_INVENTORY_WRITER_V2_SCHEMA = 'atlas.graphify-source-inventory-writer.v2' as const;
export const GRAPHIFY_SOURCE_INVENTORY_WRITER_V2_REVISION = 'atlas.graphify-source-inventory-writer.append-only-authority.2026-08-21.v1' as const;

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const sourceRevision = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const graphifySourceInventoryWriterV2ReceiptSchema = z.object({
  schema: z.literal(GRAPHIFY_SOURCE_INVENTORY_WRITER_V2_SCHEMA),
  writerRevision: z.literal(GRAPHIFY_SOURCE_INVENTORY_WRITER_V2_REVISION),
  workspaceId: z.string().uuid(),
  workspaceRevision: sourceRevision,
  sourceManifestDigest: sha256,
  repositoryRevision: z.string().min(1),
  sourceRef: z.string().min(1),
  codeSourceRevision: sourceRevision,
  sourceContentDigest: sha256,
  sourceByteLength: z.number().int().nonnegative(),
  workspaceAuthorityInserted: z.boolean(),
  sourceAuthorityInserted: z.boolean(),
  workspaceAuthorityReadbackVerified: z.literal(true),
  sourceAuthorityReadbackVerified: z.literal(true),
  legacyGraphifyRowsMutated: z.literal(false),
  callerRevisionAuthorityAccepted: z.literal(false),
  gitRevisionIsProvenanceOnly: z.literal(true),
  canonicalWriteAttempted: z.literal(true),
}).strict();
export type GraphifySourceInventoryWriterV2Receipt = z.infer<typeof graphifySourceInventoryWriterV2ReceiptSchema>;

export interface GraphifySourceInventorySqlClientV2 {
  query: (text: string, values?: readonly unknown[]) => Promise<{
    rowCount: number | null;
    rows: Array<Record<string, unknown>>;
  }>;
}

async function assertV2Tables(client: GraphifySourceInventorySqlClientV2): Promise<void> {
  const result = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY($1::text[])
  `, [[
    'graphify_workspace_revisions_v2',
    'graphify_source_revisions_v2',
  ]]);
  const present = new Set(result.rows.map((row) => String(row.table_name)));
  const missing = [
    'graphify_workspace_revisions_v2',
    'graphify_source_revisions_v2',
  ].filter((name) => !present.has(name));
  if (missing.length > 0) {
    throw new Error(`GRAPHIFY_REVISION_AUTHORITY_V2_MIGRATION_REQUIRED:${missing.join(',')}`);
  }
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

export async function writeGraphifySourceInventoryV2InTransaction(input: {
  client: GraphifySourceInventorySqlClientV2;
  workspaceId: string;
  workspaceRoot: string;
  repositoryId: string;
  absoluteSourcePath: string;
  parserContractVersion: string;
  extractionContractVersion: string;
  producerRevision?: string;
  originMaterializer?: (input: {
    workspaceRoot: string;
    repositoryId: string;
    producerRevision: string;
  }) => WorkspaceRevisionOriginRuntimeV1;
}): Promise<GraphifySourceInventoryWriterV2Receipt> {
  const workspaceId = z.string().uuid().parse(input.workspaceId);
  const parserContractVersion = z.string().min(1).parse(input.parserContractVersion);
  const extractionContractVersion = z.string().min(1).parse(input.extractionContractVersion);
  const producerRevision = input.producerRevision ?? GRAPHIFY_SOURCE_INVENTORY_WRITER_V2_REVISION;

  await assertV2Tables(input.client);

  const materialize = input.originMaterializer ?? ((args) => materializeWorkspaceRevisionOriginV1(args));
  const origin = materialize({
    workspaceRoot: input.workspaceRoot,
    repositoryId: input.repositoryId,
    producerRevision,
  });
  const sourceRef = normalizedSourceRef(input.workspaceRoot, input.absoluteSourcePath);
  const sourceBinding = origin.bindings.find((binding) => binding.sourceRef === sourceRef);
  if (!sourceBinding) throw new Error(`GRAPHIFY_SOURCE_NOT_IN_WORKSPACE_MANIFEST:${sourceRef}`);

  const authority = deriveCodeRevisionAuthorityV2({
    workspaceRoot: input.workspaceRoot,
    absoluteSourcePath: input.absoluteSourcePath,
    workspaceRecord: origin.record,
    sourceBinding,
    producerRevision,
    canonicalWritesAllowed: true,
  });

  const workspaceInsert = await input.client.query(`
    INSERT INTO public.graphify_workspace_revisions_v2 (
      workspace_revision,
      workspace_id,
      source_manifest_digest,
      repository_revision,
      repository_revision_role,
      parser_contract_version,
      extraction_contract_version,
      source_count,
      producer_revision
    ) VALUES ($1,$2,$3,$4,'GIT_PROVENANCE_ONLY',$5,$6,$7,$8)
    ON CONFLICT (workspace_revision) DO NOTHING
    RETURNING workspace_revision
  `, [
    authority.workspaceRevision,
    workspaceId,
    authority.workspaceSourceManifestDigest,
    authority.baseGitCommitOid,
    parserContractVersion,
    extractionContractVersion,
    origin.record.sourceCount,
    producerRevision,
  ]);

  const workspaceReadback = await input.client.query(`
    SELECT workspace_revision, workspace_id, source_manifest_digest,
           repository_revision, repository_revision_role,
           parser_contract_version, extraction_contract_version,
           source_count, producer_revision
    FROM public.graphify_workspace_revisions_v2
    WHERE workspace_revision = $1
    FOR SHARE
  `, [authority.workspaceRevision]);
  if (workspaceReadback.rowCount !== 1) throw new Error('GRAPHIFY_V2_WORKSPACE_READBACK_MISSING');
  const workspaceRow = workspaceReadback.rows[0]!;
  if (String(workspaceRow.workspace_id) !== workspaceId) throw new Error('GRAPHIFY_V2_WORKSPACE_ID_MISMATCH');
  if (String(workspaceRow.source_manifest_digest).toLowerCase() !== authority.workspaceSourceManifestDigest) {
    throw new Error('GRAPHIFY_V2_WORKSPACE_MANIFEST_MISMATCH');
  }
  if (String(workspaceRow.repository_revision).toLowerCase() !== authority.baseGitCommitOid.toLowerCase()) {
    throw new Error('GRAPHIFY_V2_GIT_PROVENANCE_MISMATCH');
  }
  if (String(workspaceRow.repository_revision_role) !== 'GIT_PROVENANCE_ONLY') {
    throw new Error('GRAPHIFY_V2_GIT_ROLE_MISMATCH');
  }
  if (String(workspaceRow.parser_contract_version) !== parserContractVersion) {
    throw new Error('GRAPHIFY_V2_PARSER_CONTRACT_MISMATCH');
  }
  if (String(workspaceRow.extraction_contract_version) !== extractionContractVersion) {
    throw new Error('GRAPHIFY_V2_EXTRACTION_CONTRACT_MISMATCH');
  }
  if (Number(workspaceRow.source_count) !== origin.record.sourceCount) {
    throw new Error('GRAPHIFY_V2_SOURCE_COUNT_MISMATCH');
  }

  const sourceInsert = await input.client.query(`
    INSERT INTO public.graphify_source_revisions_v2 (
      workspace_revision,
      workspace_id,
      source_ref,
      code_source_revision,
      content_hash,
      byte_length,
      repository_revision,
      repository_revision_role,
      legacy_file_id,
      producer_revision
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,'GIT_PROVENANCE_ONLY',NULL,$8)
    ON CONFLICT (workspace_revision, source_ref, code_source_revision) DO NOTHING
    RETURNING code_source_revision
  `, [
    authority.workspaceRevision,
    workspaceId,
    authority.sourceRef,
    authority.sourceRevision,
    authority.sourceContentDigest,
    authority.sourceByteLength,
    authority.baseGitCommitOid,
    producerRevision,
  ]);

  const sourceReadback = await input.client.query(`
    SELECT workspace_revision, workspace_id, source_ref, code_source_revision,
           content_hash, byte_length, repository_revision,
           repository_revision_role, producer_revision
    FROM public.graphify_source_revisions_v2
    WHERE workspace_revision = $1
      AND source_ref = $2
      AND code_source_revision = $3
    FOR SHARE
  `, [authority.workspaceRevision, authority.sourceRef, authority.sourceRevision]);
  if (sourceReadback.rowCount !== 1) throw new Error('GRAPHIFY_V2_SOURCE_READBACK_MISSING');
  const sourceRow = sourceReadback.rows[0]!;
  if (String(sourceRow.workspace_id) !== workspaceId) throw new Error('GRAPHIFY_V2_SOURCE_WORKSPACE_ID_MISMATCH');
  if (String(sourceRow.source_ref).replaceAll('\\', '/') !== authority.sourceRef) {
    throw new Error('GRAPHIFY_V2_SOURCE_REF_MISMATCH');
  }
  if (String(sourceRow.code_source_revision) !== authority.sourceRevision) {
    throw new Error('GRAPHIFY_V2_CODE_SOURCE_REVISION_MISMATCH');
  }
  if (String(sourceRow.content_hash).toLowerCase() !== authority.sourceContentDigest) {
    throw new Error('GRAPHIFY_V2_CONTENT_HASH_MISMATCH');
  }
  if (Number(sourceRow.byte_length) !== authority.sourceByteLength) {
    throw new Error('GRAPHIFY_V2_BYTE_LENGTH_MISMATCH');
  }
  if (String(sourceRow.repository_revision).toLowerCase() !== authority.baseGitCommitOid.toLowerCase()) {
    throw new Error('GRAPHIFY_V2_SOURCE_GIT_PROVENANCE_MISMATCH');
  }
  if (String(sourceRow.repository_revision_role) !== 'GIT_PROVENANCE_ONLY') {
    throw new Error('GRAPHIFY_V2_SOURCE_GIT_ROLE_MISMATCH');
  }

  return graphifySourceInventoryWriterV2ReceiptSchema.parse({
    schema: GRAPHIFY_SOURCE_INVENTORY_WRITER_V2_SCHEMA,
    writerRevision: GRAPHIFY_SOURCE_INVENTORY_WRITER_V2_REVISION,
    workspaceId,
    workspaceRevision: authority.workspaceRevision,
    sourceManifestDigest: authority.workspaceSourceManifestDigest,
    repositoryRevision: authority.baseGitCommitOid,
    sourceRef: authority.sourceRef,
    codeSourceRevision: authority.sourceRevision,
    sourceContentDigest: authority.sourceContentDigest,
    sourceByteLength: authority.sourceByteLength,
    workspaceAuthorityInserted: workspaceInsert.rowCount === 1,
    sourceAuthorityInserted: sourceInsert.rowCount === 1,
    workspaceAuthorityReadbackVerified: true,
    sourceAuthorityReadbackVerified: true,
    legacyGraphifyRowsMutated: false,
    callerRevisionAuthorityAccepted: false,
    gitRevisionIsProvenanceOnly: true,
    canonicalWriteAttempted: true,
  });
}

export async function writeGraphifySourceInventoryV2(input: Parameters<
  typeof writeGraphifySourceInventoryV2InTransaction
>[0]): Promise<GraphifySourceInventoryWriterV2Receipt> {
  await input.client.query('BEGIN');
  try {
    const receipt = await writeGraphifySourceInventoryV2InTransaction(input);
    await input.client.query('COMMIT');
    return receipt;
  } catch (error) {
    try { await input.client.query('ROLLBACK'); } catch {}
    throw error;
  }
}
