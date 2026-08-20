import { createHash } from 'node:crypto';
import { z } from 'zod';
import { AtlasKernelHostRequestKindSchema } from './atlas-kernel-session.js';

export const SkillNetworkAccessSchema = z.enum(['NONE', 'HOST_BRIDGE_ONLY', 'APPROVED_EXTERNAL']);
export const SkillFilesystemAccessSchema = z.enum(['NONE', 'READ_ONLY']);

export const AtlasSkillPermissionV1Schema = z.object({
  networkAccess: SkillNetworkAccessSchema,
  filesystemAccess: SkillFilesystemAccessSchema,
  subprocessExecution: z.boolean(),
  nativeExtensionAccess: z.boolean(),
  environmentSecretsAccess: z.boolean(),
  requiredGpuLibraries: z.array(z.string().min(1)).max(32),
  approvedExternalServices: z.array(z.string().min(1)).max(32),
}).strict();
export type AtlasSkillPermissionV1 = z.infer<typeof AtlasSkillPermissionV1Schema>;

export const AtlasSkillAdmissionReceiptV1Schema = z.object({
  schema: z.literal('atlas.skill-admission-receipt.v1'),
  skillName: z.string().regex(/^[a-z][a-z0-9-]*$/),
  importName: z.string().regex(/^[a-z][a-z0-9_]*$/),
  skillRevision: z.string().min(1),
  packageRevision: z.string().min(1),
  skillMdSha256: z.string().regex(/^[a-f0-9]{64}$/),
  pyprojectSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sourceTreeSha256: z.string().regex(/^[a-f0-9]{64}$/),
  dependencyLockSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  declaredHostRequests: z.array(AtlasKernelHostRequestKindSchema).min(1),
  permissions: AtlasSkillPermissionV1Schema,
  lintPassed: z.boolean(),
  metadataPassed: z.boolean(),
  importPassed: z.boolean(),
  fixturePassed: z.boolean(),
  dependenciesResolved: z.boolean(),
  instructionReviewPassed: z.boolean(),
  approvedByHostPolicy: z.boolean(),
  admitted: z.boolean(),
  producerRevision: z.string().min(1),
}).strict().superRefine((value, ctx) => {
  const required = [
    value.lintPassed,
    value.metadataPassed,
    value.importPassed,
    value.fixturePassed,
    value.dependenciesResolved,
    value.instructionReviewPassed,
    value.approvedByHostPolicy,
  ];
  const shouldAdmit = required.every(Boolean);
  if (value.admitted !== shouldAdmit) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['admitted'],
      message: `admitted must equal all mandatory admission gates (${shouldAdmit})`,
    });
  }
  if (value.permissions.networkAccess === 'APPROVED_EXTERNAL' && value.permissions.approvedExternalServices.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['permissions', 'approvedExternalServices'],
      message: 'APPROVED_EXTERNAL requires at least one approved external service',
    });
  }
});
export type AtlasSkillAdmissionReceiptV1 = z.infer<typeof AtlasSkillAdmissionReceiptV1Schema>;

export type SkillSourceFileV1 = { path: string; content: string | Uint8Array };

export function sha256Bytes(content: string | Uint8Array): string {
  const hash = createHash('sha256');
  if (typeof content === 'string') hash.update(content, 'utf8');
  else hash.update(content);
  return hash.digest('hex');
}

/** Deterministic source-tree hash: normalized path order + path/content delimiters. */
export function hashSkillSourceTree(files: readonly SkillSourceFileV1[]): string {
  if (files.length === 0) throw new Error('skill source tree cannot be empty');
  const normalized = files.map((file) => ({
    path: file.path.replaceAll('\\', '/').replace(/^\.\//, ''),
    content: file.content,
  })).sort((a, b) => a.path.localeCompare(b.path));

  const seen = new Set<string>();
  const hash = createHash('sha256');
  for (const file of normalized) {
    if (!file.path || file.path.startsWith('../') || file.path.includes('/../')) {
      throw new Error(`invalid skill source path ${file.path}`);
    }
    if (seen.has(file.path)) throw new Error(`duplicate skill source path ${file.path}`);
    seen.add(file.path);
    const bytes = typeof file.content === 'string' ? Buffer.from(file.content, 'utf8') : Buffer.from(file.content);
    const pathBytes = Buffer.from(file.path, 'utf8');
    const length = Buffer.allocUnsafe(8);
    length.writeBigUInt64BE(BigInt(bytes.byteLength));
    hash.update(pathBytes);
    hash.update(Buffer.from([0]));
    hash.update(length);
    hash.update(bytes);
  }
  return hash.digest('hex');
}

export function deriveSkillRevision(input: {
  skillMdSha256: string;
  pyprojectSha256: string;
  sourceTreeSha256: string;
  dependencyLockSha256?: string | null;
  permissions: AtlasSkillPermissionV1;
  declaredHostRequests: readonly z.infer<typeof AtlasKernelHostRequestKindSchema>[];
}): string {
  const canonical = JSON.stringify({
    declaredHostRequests: [...input.declaredHostRequests].sort(),
    dependencyLockSha256: input.dependencyLockSha256 ?? null,
    permissions: input.permissions,
    pyprojectSha256: input.pyprojectSha256,
    skillMdSha256: input.skillMdSha256,
    sourceTreeSha256: input.sourceTreeSha256,
  });
  return sha256Bytes(canonical);
}

export function buildAtlasSkillAdmissionReceipt(input: Omit<AtlasSkillAdmissionReceiptV1,
  'schema' | 'skillRevision' | 'admitted'> & { skillRevision?: string }): AtlasSkillAdmissionReceiptV1 {
  const skillRevision = input.skillRevision ?? deriveSkillRevision({
    skillMdSha256: input.skillMdSha256,
    pyprojectSha256: input.pyprojectSha256,
    sourceTreeSha256: input.sourceTreeSha256,
    dependencyLockSha256: input.dependencyLockSha256,
    permissions: input.permissions,
    declaredHostRequests: input.declaredHostRequests,
  });
  const admitted = [
    input.lintPassed,
    input.metadataPassed,
    input.importPassed,
    input.fixturePassed,
    input.dependenciesResolved,
    input.instructionReviewPassed,
    input.approvedByHostPolicy,
  ].every(Boolean);
  return AtlasSkillAdmissionReceiptV1Schema.parse({
    schema: 'atlas.skill-admission-receipt.v1',
    ...input,
    skillRevision,
    admitted,
  });
}

export function skillAdmissionStillValid(input: {
  receipt: AtlasSkillAdmissionReceiptV1;
  skillMd: string | Uint8Array;
  pyproject: string | Uint8Array;
  sourceFiles: readonly SkillSourceFileV1[];
  dependencyLock?: string | Uint8Array | null;
}): boolean {
  const receipt = AtlasSkillAdmissionReceiptV1Schema.parse(input.receipt);
  if (!receipt.admitted) return false;
  if (sha256Bytes(input.skillMd) !== receipt.skillMdSha256) return false;
  if (sha256Bytes(input.pyproject) !== receipt.pyprojectSha256) return false;
  if (hashSkillSourceTree(input.sourceFiles) !== receipt.sourceTreeSha256) return false;
  const lockHash = input.dependencyLock == null ? null : sha256Bytes(input.dependencyLock);
  return lockHash === receipt.dependencyLockSha256;
}
