import { createHash } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';

import {
  workspaceRevisionRecordV1Schema,
  workspaceSourceBindingV1Schema,
  type WorkspaceRevisionRecordV1,
  type WorkspaceSourceBindingV1,
} from '../identity/workspace-source-binding-v1.js';

export const CODE_REVISION_AUTHORITY_V2_SCHEMA = 'atlas.code-revision-authority.v2' as const;
export const CODE_REVISION_AUTHORITY_V2_REVISION = 'atlas.code-revision-authority.workspace-manifest-plus-source-sha256.v2' as const;

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const sourceRevision = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const revision = z.string().min(1);

export const codeRevisionAuthorityV2Schema = z.object({
  schema: z.literal(CODE_REVISION_AUTHORITY_V2_SCHEMA),
  authorityRevision: z.literal(CODE_REVISION_AUTHORITY_V2_REVISION),
  workspaceRoot: z.string().min(1),
  workspaceRevision: sourceRevision,
  workspaceRevisionKind: z.literal('SHA256_SOURCE_MANIFEST'),
  workspaceSourceManifestDigest: sha256,
  baseGitCommitOid: revision,
  baseGitTreeOid: revision,
  sourceRef: z.string().min(1),
  sourceRevision,
  sourceRevisionKind: z.literal('SHA256_EXACT_UTF8_SOURCE_BYTES'),
  sourceContentDigest: sha256,
  sourceByteLength: z.number().int().nonnegative(),
  workspaceRevisionCreatedByWriter: z.literal(true),
  sourceRevisionCreatedByWriter: z.literal(true),
  callerSuppliedWorkspaceRevisionAccepted: z.literal(false),
  callerSuppliedSourceRevisionAccepted: z.literal(false),
  gitCommitIsProvenanceOnly: z.literal(true),
  canonicalWritesAllowed: z.boolean(),
  producerRevision: revision,
  authorityChecksum: sha256,
}).strict();
export type CodeRevisionAuthorityV2 = z.infer<typeof codeRevisionAuthorityV2Schema>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function digest(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

function normalizeSourceRef(workspaceRoot: string, absolutePath: string): string {
  const relative = path.relative(workspaceRoot, absolutePath).replaceAll('\\', '/').replace(/^\.\//, '');
  if (!relative || relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) {
    throw new Error(`CODE_REVISION_SOURCE_OUTSIDE_WORKSPACE:${absolutePath}`);
  }
  return relative;
}

export function deriveCodeRevisionAuthorityV2(input: {
  workspaceRoot: string;
  absoluteSourcePath: string;
  workspaceRecord: WorkspaceRevisionRecordV1;
  sourceBinding: WorkspaceSourceBindingV1;
  producerRevision: string;
  canonicalWritesAllowed?: boolean;
}): CodeRevisionAuthorityV2 {
  const workspaceRoot = path.resolve(input.workspaceRoot);
  const absoluteSourcePath = path.resolve(input.absoluteSourcePath);
  const sourceRef = normalizeSourceRef(workspaceRoot, absoluteSourcePath);
  const workspaceRecord = workspaceRevisionRecordV1Schema.parse(input.workspaceRecord);
  const sourceBinding = workspaceSourceBindingV1Schema.parse(input.sourceBinding);

  if (sourceBinding.sourceRef !== sourceRef) {
    throw new Error(`CODE_REVISION_SOURCE_BINDING_REF_MISMATCH:${sourceRef}:${sourceBinding.sourceRef}`);
  }
  if (sourceBinding.workspaceRevision !== workspaceRecord.workspaceRevision) {
    throw new Error('CODE_REVISION_WORKSPACE_BINDING_REVISION_MISMATCH');
  }
  if (sourceBinding.baseCommitOid !== workspaceRecord.baseCommitOid) {
    throw new Error('CODE_REVISION_WORKSPACE_BINDING_GIT_COMMIT_MISMATCH');
  }
  if (sourceBinding.sourceRevision !== `sha256:${sourceBinding.contentDigest}`) {
    throw new Error('CODE_REVISION_SOURCE_BINDING_DIGEST_MISMATCH');
  }

  const payload = {
    schema: CODE_REVISION_AUTHORITY_V2_SCHEMA,
    authorityRevision: CODE_REVISION_AUTHORITY_V2_REVISION,
    workspaceRoot,
    workspaceRevision: workspaceRecord.workspaceRevision,
    workspaceRevisionKind: 'SHA256_SOURCE_MANIFEST' as const,
    workspaceSourceManifestDigest: workspaceRecord.sourceManifestDigest,
    baseGitCommitOid: workspaceRecord.baseCommitOid,
    baseGitTreeOid: workspaceRecord.baseTreeOid,
    sourceRef,
    sourceRevision: sourceBinding.sourceRevision,
    sourceRevisionKind: 'SHA256_EXACT_UTF8_SOURCE_BYTES' as const,
    sourceContentDigest: sourceBinding.contentDigest,
    sourceByteLength: sourceBinding.byteLength,
    workspaceRevisionCreatedByWriter: true as const,
    sourceRevisionCreatedByWriter: true as const,
    callerSuppliedWorkspaceRevisionAccepted: false as const,
    callerSuppliedSourceRevisionAccepted: false as const,
    gitCommitIsProvenanceOnly: true as const,
    canonicalWritesAllowed: input.canonicalWritesAllowed ?? false,
    producerRevision: input.producerRevision,
  };

  return codeRevisionAuthorityV2Schema.parse({
    ...payload,
    authorityChecksum: digest(payload),
  });
}
