import { createHash } from 'node:crypto';
import { posix as pathPosix } from 'node:path';
import { z } from 'zod';

const sha256Revision = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const nonEmpty = z.string().min(1);

export const SOURCE_ARTIFACT_V1 = 'atlas.source-artifact.v1' as const;
export const DIRECTORY_INVENTORY_POLICY_V1 = 'atlas.directory-inventory-policy.v1' as const;

export const sourceArtifactV1Schema = z.object({
  schema: z.literal(SOURCE_ARTIFACT_V1),
  sourceRef: nonEmpty,
  relativePath: nonEmpty,
  contentHash: sha256Revision,
  sourceRevision: sha256Revision,
  byteLength: z.number().int().nonnegative(),
  workspaceRevision: sha256Revision,
  parserRevision: nonEmpty,
  producerRevision: nonEmpty,
  revisionAuthority: z.enum(['EXISTING_CANONICAL_OWNER', 'CONTENT_SHA256']),
  language: nonEmpty.optional(),
  extension: z.string().optional(),
  mimeType: nonEmpty.optional(),
  diagnosticMtime: z.string().datetime().optional(),
}).strict();

export type SourceArtifactV1 = z.infer<typeof sourceArtifactV1Schema>;

export const sourceSelectionBindingCompatV1Schema = z.object({
  sourceRef: nonEmpty,
  codeSourceRevision: sha256Revision,
  contentHash: z.string().regex(/^(sha256:)?[a-f0-9]{64}$/),
  byteLength: z.number().int().nonnegative(),
}).strict();

export type SourceSelectionBindingCompatV1 = z.infer<typeof sourceSelectionBindingCompatV1Schema>;

export const directoryInventoryPolicyV1Schema = z.object({
  schema: z.literal(DIRECTORY_INVENTORY_POLICY_V1),
  policyRevision: nonEmpty,
  includeRoots: z.array(nonEmpty).min(1),
  excludeSegments: z.array(nonEmpty),
  allowedExtensions: z.array(z.string().regex(/^\.[a-z0-9]+$/)).min(1),
  followSymlinks: z.literal(false),
  includeHiddenFiles: z.boolean(),
}).strict();

export type DirectoryInventoryPolicyV1 = z.infer<typeof directoryInventoryPolicyV1Schema>;

export const DEFAULT_DIRECTORY_INVENTORY_POLICY_V1: DirectoryInventoryPolicyV1 = {
  schema: DIRECTORY_INVENTORY_POLICY_V1,
  policyRevision: 'dir-inventory-policy:2026-09-04:v1',
  includeRoots: ['docs', 'openspec', 'memory', 'packages', 'sveltekit-frontend/src', 'scripts/atlas'],
  excludeSegments: [
    '.git',
    '.venv',
    'node_modules',
    'dist',
    'build',
    '.cache',
    'coverage',
    'models',
    'deeds_labs/archive',
  ],
  allowedExtensions: [
    '.ts', '.tsx', '.js', '.mjs', '.mts', '.svelte', '.py', '.go', '.rs', '.java', '.sql',
    '.md', '.txt', '.json', '.jsonc', '.yaml', '.yml', '.toml', '.okf',
  ],
  followSymlinks: false,
  includeHiddenFiles: true,
};

function normalizeSha256(value: string): string {
  return value.startsWith('sha256:') ? value : `sha256:${value}`;
}

function normalizeRelativePath(value: string): string {
  const normalized = value.replace(/\\/g, '/').replace(/^\.\//, '');
  const safe = pathPosix.normalize(normalized);
  if (safe.startsWith('../') || safe === '..' || pathPosix.isAbsolute(safe)) {
    throw new Error('SOURCE_ARTIFACT_PATH_ESCAPES_REPOSITORY_ROOT');
  }
  return safe;
}

function sha256Bytes(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

/**
 * Adapts the newer Graphify source-selection binding without redefining source revision semantics.
 * `diagnosticMtime` is accepted only as diagnostics and never participates in identity/checksums.
 */
export function adaptSourceSelectionBindingV1(input: {
  binding: SourceSelectionBindingCompatV1;
  relativePath: string;
  workspaceRevision: string;
  parserRevision: string;
  producerRevision: string;
  language?: string;
  mimeType?: string;
  diagnosticMtime?: string;
}): SourceArtifactV1 {
  const binding = sourceSelectionBindingCompatV1Schema.parse(input.binding);
  const relativePath = normalizeRelativePath(input.relativePath);
  const extension = pathPosix.extname(relativePath).toLowerCase();

  return sourceArtifactV1Schema.parse({
    schema: SOURCE_ARTIFACT_V1,
    sourceRef: binding.sourceRef,
    relativePath,
    contentHash: normalizeSha256(binding.contentHash),
    sourceRevision: binding.codeSourceRevision,
    byteLength: binding.byteLength,
    workspaceRevision: input.workspaceRevision,
    parserRevision: input.parserRevision,
    producerRevision: input.producerRevision,
    revisionAuthority: 'EXISTING_CANONICAL_OWNER',
    language: input.language,
    extension,
    mimeType: input.mimeType,
    diagnosticMtime: input.diagnosticMtime,
  });
}

/**
 * Creates identity only for a directory/document namespace that has no pre-existing canonical
 * revision owner. In that narrow case sourceRevision is the immutable content SHA-256.
 */
export function buildContentOwnedSourceArtifactV1(input: {
  sourceRef: string;
  relativePath: string;
  bytes: Uint8Array;
  workspaceRevision: string;
  parserRevision: string;
  producerRevision: string;
  language?: string;
  mimeType?: string;
  diagnosticMtime?: string;
}): SourceArtifactV1 {
  const relativePath = normalizeRelativePath(input.relativePath);
  const contentHash = sha256Bytes(input.bytes);
  const extension = pathPosix.extname(relativePath).toLowerCase();

  return sourceArtifactV1Schema.parse({
    schema: SOURCE_ARTIFACT_V1,
    sourceRef: input.sourceRef,
    relativePath,
    contentHash,
    sourceRevision: contentHash,
    byteLength: input.bytes.byteLength,
    workspaceRevision: input.workspaceRevision,
    parserRevision: input.parserRevision,
    producerRevision: input.producerRevision,
    revisionAuthority: 'CONTENT_SHA256',
    language: input.language,
    extension,
    mimeType: input.mimeType,
    diagnosticMtime: input.diagnosticMtime,
  });
}

export function pathIsAdmittedByDirectoryInventoryPolicyV1(
  relativePathInput: string,
  policyInput: DirectoryInventoryPolicyV1 = DEFAULT_DIRECTORY_INVENTORY_POLICY_V1,
): boolean {
  const policy = directoryInventoryPolicyV1Schema.parse(policyInput);
  const relativePath = normalizeRelativePath(relativePathInput);
  const segments = relativePath.split('/');

  const included = policy.includeRoots.some((root) => {
    const normalizedRoot = normalizeRelativePath(root).replace(/\/$/, '');
    return relativePath === normalizedRoot || relativePath.startsWith(`${normalizedRoot}/`);
  });
  if (!included) return false;

  if (!policy.includeHiddenFiles && segments.some((segment) => segment.startsWith('.'))) return false;
  if (policy.excludeSegments.some((excluded) => {
    const normalized = normalizeRelativePath(excluded);
    return relativePath === normalized || relativePath.startsWith(`${normalized}/`) || relativePath.includes(`/${normalized}/`);
  })) return false;

  const extension = pathPosix.extname(relativePath).toLowerCase();
  return policy.allowedExtensions.includes(extension);
}

/** Canonical replay checksum excludes diagnostic metadata such as mtime. */
export function computeSourceArtifactInventoryChecksumV1(artifacts: readonly SourceArtifactV1[]): string {
  const normalized = artifacts
    .map((artifact) => sourceArtifactV1Schema.parse(artifact))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath) || a.sourceRef.localeCompare(b.sourceRef))
    .map(({ diagnosticMtime: _diagnosticMtime, ...artifact }) => artifact);

  return `sha256:${createHash('sha256').update(JSON.stringify(normalized), 'utf8').digest('hex')}`;
}

export function sortSourceArtifactsV1(artifacts: readonly SourceArtifactV1[]): SourceArtifactV1[] {
  return artifacts
    .map((artifact) => sourceArtifactV1Schema.parse(artifact))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath) || a.sourceRef.localeCompare(b.sourceRef));
}
