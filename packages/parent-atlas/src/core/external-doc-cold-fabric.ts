import { createHash } from 'node:crypto';
import { z } from 'zod';

import { seaweedS3ArtifactRefSchema } from './adaptive-semantic-memory.js';

const id = z.string().min(1);
const revision = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const bytes = z.number().int().nonnegative();
const gitCommitSha = z.string().regex(/^[a-f0-9]{40}$/);
const okfNamespace = z.string().regex(/^docs\/\.okf\/[a-zA-Z0-9_./-]+$/);

export const EXTERNAL_DOC_ARTIFACT_ROLES = [
  'RAW_HTML',
  'NORMALIZED_MARKDOWN',
  'PDF_ORIGINAL',
  'SCREENSHOT',
  'CITATION_BUNDLE',
  'REPOSITORY_ARCHIVE',
  'FILE_INDEX_ARROW',
  'ARROW_SNAPSHOT',
  'QDRANT_SNAPSHOT',
] as const;

export const HYDRATION_REASONS = [
  'QUERY_FALLBACK',
  'CITATION_OPEN',
  'AGENT_PREFETCH',
  'REINDEX',
  'ARCHIVE_RESTORE',
  'EXACT_SOURCE_PROMOTION',
] as const;

export const HYDRATION_TARGETS = [
  'NVME_CONTENT_CACHE',
  'HOST_RAM_SESSION',
] as const;

export const externalDocArtifactRefSchema = z.object({
  schema: z.literal('atlas.external-doc-artifact-ref.v1').default('atlas.external-doc-artifact-ref.v1'),
  artifact_role: z.enum(EXTERNAL_DOC_ARTIFACT_ROLES),
  source_id: id,
  source_revision: revision,
  document_checksum: checksum.nullable().default(null),
  source_url: z.string().url().nullable().default(null),
  artifact: seaweedS3ArtifactRefSchema,
  indexable_text: z.boolean().default(false),
  exact_source_eligible: z.boolean().default(false),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.artifact_role === 'SCREENSHOT' && !value.artifact.media_type.startsWith('image/')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['artifact', 'media_type'], message: 'screenshot artifact must use an image media type' });
  }
  if (value.artifact_role === 'QDRANT_SNAPSHOT' && !value.artifact.object_key.endsWith('.snapshot')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['artifact', 'object_key'], message: 'Qdrant snapshot object must end in .snapshot' });
  }
  if (value.exact_source_eligible && value.document_checksum === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['document_checksum'], message: 'exact source artifacts require a document checksum' });
  }
});
export type ExternalDocArtifactRefV1 = z.infer<typeof externalDocArtifactRefSchema>;

export const screenshotClipSchema = z.object({
  x: z.number().finite().nonnegative(),
  y: z.number().finite().nonnegative(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
  device_scale_factor: z.number().finite().positive().default(1),
}).strict();
export type ScreenshotClipV1 = z.infer<typeof screenshotClipSchema>;

export const docCitationSnapshotSchema = z.object({
  schema: z.literal('atlas.doc-citation-snapshot.v1').default('atlas.doc-citation-snapshot.v1'),
  citation_id: id,
  citation_revision: revision,
  source_id: id,
  source_revision: revision,
  source_url: z.string().url(),
  document_checksum: checksum,
  heading_path: z.array(z.string().min(1)).max(32).default([]),
  start_char: z.number().int().nonnegative(),
  end_char: z.number().int().positive(),
  snippet_checksum: checksum,
  fetch_receipt_id: id,
  authority_class: z.enum(['OFFICIAL_PRIMARY', 'PRIMARY_PROJECT', 'REPUTABLE_SECONDARY', 'DISCOVERY_ONLY']),
  normalized_markdown_artifact: externalDocArtifactRefSchema.nullable().default(null),
  screenshot_artifact: externalDocArtifactRefSchema.nullable().default(null),
  screenshot_clip: screenshotClipSchema.nullable().default(null),
  exact_source_promotion_required: z.literal(true).default(true),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.end_char <= value.start_char) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['end_char'], message: 'citation end_char must exceed start_char' });
  }
  if (value.screenshot_clip !== null && value.screenshot_artifact === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['screenshot_clip'], message: 'screenshot clip requires screenshot artifact' });
  }
  if (value.screenshot_artifact !== null && value.screenshot_artifact.artifact_role !== 'SCREENSHOT') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['screenshot_artifact'], message: 'citation screenshot must use SCREENSHOT artifact role' });
  }
  if (value.normalized_markdown_artifact !== null && value.normalized_markdown_artifact.artifact_role !== 'NORMALIZED_MARKDOWN') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['normalized_markdown_artifact'], message: 'citation text artifact must use NORMALIZED_MARKDOWN role' });
  }
});
export type DocCitationSnapshotV1 = z.infer<typeof docCitationSnapshotSchema>;

export const coldArtifactHydrationRequestSchema = z.object({
  schema: z.literal('atlas.cold-artifact-hydration-request.v1').default('atlas.cold-artifact-hydration-request.v1'),
  request_id: id,
  request_revision: revision,
  reason: z.enum(HYDRATION_REASONS),
  priority: z.number().int().min(0).max(100),
  artifact_ref: externalDocArtifactRefSchema,
  expected_checksum: checksum,
  target: z.enum(HYDRATION_TARGETS),
  maximum_bytes: bytes,
  ttl_seconds: z.number().int().positive().max(604_800),
  attempt: z.number().int().min(0).max(16).default(0),
  queued_at_epoch_ms: z.number().int().nonnegative(),
  status: z.enum(['QUEUED', 'FETCHING']).default('QUEUED'),
  exact_checksum_required: z.literal(true).default(true),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.expected_checksum !== value.artifact_ref.artifact.content_checksum) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expected_checksum'], message: 'hydration checksum must match immutable artifact reference' });
  }
  if (value.maximum_bytes < value.artifact_ref.artifact.content_length_bytes) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['maximum_bytes'], message: 'maximum_bytes cannot be smaller than referenced artifact' });
  }
});
export type ColdArtifactHydrationRequestV1 = z.infer<typeof coldArtifactHydrationRequestSchema>;

export const coldArtifactHydrationReceiptSchema = z.object({
  schema: z.literal('atlas.cold-artifact-hydration-receipt.v1').default('atlas.cold-artifact-hydration-receipt.v1'),
  receipt_id: id,
  request_id: id,
  request_revision: revision,
  artifact_id: id,
  target: z.enum(HYDRATION_TARGETS),
  expected_checksum: checksum,
  observed_checksum: checksum.nullable().default(null),
  hydrated_bytes: bytes,
  cache_key: z.string().min(1).nullable().default(null),
  status: z.enum(['VERIFIED_READY', 'FAILED', 'EVICTED']),
  error_class: z.enum(['S3_READ_FAILED', 'CHECKSUM_MISMATCH', 'BYTE_BUDGET_EXCEEDED', 'CACHE_WRITE_FAILED']).nullable().default(null),
  completed_at_epoch_ms: z.number().int().nonnegative(),
  producer_revision: revision,
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.cache_key !== null && (value.cache_key.startsWith('/') || value.cache_key.includes('../') || value.cache_key.includes('..\\'))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cache_key'], message: 'cache_key must be relative and traversal-free' });
  }
  if (value.status === 'VERIFIED_READY') {
    if (value.observed_checksum === null || value.observed_checksum !== value.expected_checksum) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['observed_checksum'], message: 'verified hydration requires exact checksum match' });
    }
    if (value.error_class !== null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['error_class'], message: 'verified hydration cannot include an error class' });
    }
  }
  if (value.status === 'FAILED' && value.error_class === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['error_class'], message: 'failed hydration requires error class' });
  }
});
export type ColdArtifactHydrationReceiptV1 = z.infer<typeof coldArtifactHydrationReceiptSchema>;

export const externalDocsStorageSearchPolicySchema = z.object({
  schema: z.literal('atlas.external-docs-storage-search-policy.v1').default('atlas.external-docs-storage-search-policy.v1'),
  policy_revision: revision,
  manifest_root: z.literal('docs/.okf'),
  bulky_artifact_backend: z.literal('SEAWEEDFS_S3'),
  live_qdrant_storage: z.literal('LOCAL_POSIX_NVME'),
  qdrant_snapshot_backend: z.literal('SEAWEEDFS_S3'),
  production_sparse_owner: z.literal('QDRANT_BM25_IDF'),
  sparse_challengers: z.array(z.enum(['BM42_EXPERIMENTAL', 'SPLADE', 'MINICOIL'])).default(['BM42_EXPERIMENTAL']),
  semantic_lane_votes: z.literal(1).default(1),
  qdrant_memory: z.object({
    dense_vectors: z.enum(['CACHED', 'COLD']).default('COLD'),
    hnsw: z.enum(['PINNED', 'CACHED', 'COLD']).default('COLD'),
    quantized_vectors: z.enum(['PINNED', 'CACHED', 'COLD']).default('PINNED'),
    sparse_index: z.enum(['PINNED', 'COLD']).default('PINNED'),
    payloads: z.enum(['CACHED', 'COLD']).default('COLD'),
    payload_indexes: z.enum(['PINNED', 'CACHED', 'COLD']).default('PINNED'),
  }).default({
    dense_vectors: 'COLD',
    hnsw: 'COLD',
    quantized_vectors: 'PINNED',
    sparse_index: 'PINNED',
    payloads: 'COLD',
    payload_indexes: 'PINNED',
  }),
  fallback_order: z.tuple([
    z.literal('LOCAL_EXACT'),
    z.literal('LEXICAL_BM25'),
    z.literal('SEMANTIC'),
    z.literal('NVME_CONTENT_CACHE'),
    z.literal('SEAWEED_S3_HYDRATION'),
    z.literal('WEB_DISCOVERY'),
  ]),
  exact_source_promotion_required: z.literal(true).default(true),
  canonical_authority: z.literal(false).default(false),
}).strict();
export type ExternalDocsStorageSearchPolicyV1 = z.infer<typeof externalDocsStorageSearchPolicySchema>;

export const legacyRepositoryArchiveManifestSchema = z.object({
  schema: z.literal('atlas.legacy-repository-archive-manifest.v1').default('atlas.legacy-repository-archive-manifest.v1'),
  manifest_revision: revision,
  repository_full_name: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  repository_commit_sha: gitCommitSha,
  source_revision: revision,
  okf_namespace: okfNamespace,
  archive_artifact: externalDocArtifactRefSchema,
  file_index_artifact: externalDocArtifactRefSchema.nullable().default(null),
  include_paths: z.array(z.string().min(1)).default([]),
  exclude_paths: z.array(z.string().min(1)).default([]),
  hydrate_on_demand: z.literal(true).default(true),
  index_current_worktree_as_authority: z.literal(false).default(false),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.archive_artifact.artifact_role !== 'REPOSITORY_ARCHIVE') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['archive_artifact'], message: 'legacy repository archive requires REPOSITORY_ARCHIVE role' });
  }
  if (value.file_index_artifact !== null && value.file_index_artifact.artifact_role !== 'FILE_INDEX_ARROW') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['file_index_artifact'], message: 'legacy file index requires FILE_INDEX_ARROW role' });
  }
});
export type LegacyRepositoryArchiveManifestV1 = z.infer<typeof legacyRepositoryArchiveManifestSchema>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function externalDocColdFabricChecksum(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

export function contentAddressedObjectKey(input: {
  namespace: string;
  checksum: string;
  filename: string;
}): string {
  const parsedChecksum = z.string().regex(/^[a-f0-9]{64}$/).parse(input.checksum);
  const namespace = input.namespace.replace(/^\/+|\/+$/g, '');
  const filename = input.filename.replace(/^\/+/, '');
  if (!namespace || namespace.includes('../') || filename.includes('../') || filename.includes('..\\')) {
    throw new Error('content-addressed object key must be traversal-free');
  }
  return `${namespace}/${parsedChecksum.slice(0, 2)}/${parsedChecksum}/${filename}`;
}

export function orderHydrationQueue(requests: readonly ColdArtifactHydrationRequestV1[]): ColdArtifactHydrationRequestV1[] {
  return [...requests].sort((a, b) => (
    b.priority - a.priority ||
    a.queued_at_epoch_ms - b.queued_at_epoch_ms ||
    a.request_id.localeCompare(b.request_id)
  ));
}
