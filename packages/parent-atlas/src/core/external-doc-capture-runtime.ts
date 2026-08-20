import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  externalDocFetchReceiptSchema,
  type ExternalDocFetchReceiptV1,
} from './external-doc-knowledge-fabric.js';
import {
  externalDocArtifactRefSchema,
  type ExternalDocArtifactRefV1,
} from './external-doc-cold-fabric.js';
import {
  sha256Bytes,
  sha256Text,
  uploadContentAddressedExternalArtifact,
  type ColdObjectStorePort,
} from './external-doc-cold-runtime.js';

const id = z.string().min(1);
const revision = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const externalDocPageCaptureSchema = z.object({
  schema: z.literal('atlas.external-doc-page-capture.v1').default('atlas.external-doc-page-capture.v1'),
  capture_id: id,
  source_id: id,
  source_revision: revision,
  requested_url: z.string().url(),
  resolved_url: z.string().url(),
  title: z.string().min(1),
  language: z.string().min(1).default('en'),
  http_status: z.number().int().min(100).max(599),
  fetched_at: z.string().datetime(),
  markdown: z.string().min(1),
  raw_html: z.string().nullable().default(null),
  screenshot_bytes: z.instanceof(Uint8Array).nullable().default(null),
  screenshot_media_type: z.string().regex(/^image\//).nullable().default(null),
  outgoing_urls: z.array(z.string().url()).max(20_000).default([]),
  etag: z.string().min(1).nullable().default(null),
  last_modified: z.string().min(1).nullable().default(null),
  change_status: z.string().min(1).nullable().default(null),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if ((value.screenshot_bytes === null) !== (value.screenshot_media_type === null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['screenshot_bytes'], message: 'screenshot bytes/media type must be present together' });
  }
});
export type ExternalDocPageCaptureV1 = z.infer<typeof externalDocPageCaptureSchema>;

export const archivedExternalDocCaptureSchema = z.object({
  schema: z.literal('atlas.archived-external-doc-capture.v1').default('atlas.archived-external-doc-capture.v1'),
  capture_id: id,
  source_id: id,
  source_revision: revision,
  document_checksum: checksum,
  capture_checksum: checksum,
  fetch_receipt: externalDocFetchReceiptSchema,
  normalized_markdown_artifact: externalDocArtifactRefSchema,
  raw_html_artifact: externalDocArtifactRefSchema.nullable().default(null),
  screenshot_artifact: externalDocArtifactRefSchema.nullable().default(null),
  outgoing_urls: z.array(z.string().url()).max(20_000),
  change_status: z.string().min(1).nullable().default(null),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.normalized_markdown_artifact.artifact_role !== 'NORMALIZED_MARKDOWN') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['normalized_markdown_artifact'], message: 'normalized artifact role mismatch' });
  }
  if (value.raw_html_artifact !== null && value.raw_html_artifact.artifact_role !== 'RAW_HTML') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['raw_html_artifact'], message: 'raw HTML artifact role mismatch' });
  }
  if (value.screenshot_artifact !== null && value.screenshot_artifact.artifact_role !== 'SCREENSHOT') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['screenshot_artifact'], message: 'screenshot artifact role mismatch' });
  }
  if (value.document_checksum !== value.normalized_markdown_artifact.document_checksum) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['document_checksum'], message: 'document checksum must match normalized Markdown identity' });
  }
});
export type ArchivedExternalDocCaptureV1 = z.infer<typeof archivedExternalDocCaptureSchema>;

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

function captureChecksum(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

export async function archiveExternalDocCapture(input: {
  store: ColdObjectStorePort;
  capture: ExternalDocPageCaptureV1;
  endpointId: string;
  bucket: string;
  namespace: string;
  parserRevision: string;
  producerRevision: string;
}): Promise<ArchivedExternalDocCaptureV1> {
  const capture = externalDocPageCaptureSchema.parse(input.capture);
  const documentChecksum = sha256Text(capture.markdown);
  const rawChecksum = capture.raw_html === null ? documentChecksum : sha256Text(capture.raw_html);
  const captureRevision = `${capture.source_revision}:${documentChecksum.slice(0, 16)}`;

  const normalized = await uploadContentAddressedExternalArtifact({
    store: input.store,
    endpointId: input.endpointId,
    bucket: input.bucket,
    namespace: input.namespace,
    filename: 'normalized.md',
    bytes: Buffer.from(capture.markdown, 'utf8'),
    contentType: 'text/markdown; charset=utf-8',
    artifactId: `${capture.capture_id}:markdown`,
    artifactRevision: captureRevision,
    artifactRole: 'NORMALIZED_MARKDOWN',
    sourceId: capture.source_id,
    sourceRevision: capture.source_revision,
    sourceUrl: capture.resolved_url,
    documentChecksum,
    indexableText: true,
    exactSourceEligible: true,
    storageClass: 'COLD_ARCHIVE',
  });

  let rawHtml: ExternalDocArtifactRefV1 | null = null;
  if (capture.raw_html !== null) {
    rawHtml = await uploadContentAddressedExternalArtifact({
      store: input.store,
      endpointId: input.endpointId,
      bucket: input.bucket,
      namespace: input.namespace,
      filename: 'raw.html',
      bytes: Buffer.from(capture.raw_html, 'utf8'),
      contentType: 'text/html; charset=utf-8',
      artifactId: `${capture.capture_id}:raw-html`,
      artifactRevision: captureRevision,
      artifactRole: 'RAW_HTML',
      sourceId: capture.source_id,
      sourceRevision: capture.source_revision,
      sourceUrl: capture.resolved_url,
      documentChecksum,
      indexableText: false,
      exactSourceEligible: false,
      storageClass: 'COLD_ARCHIVE',
    });
  }

  let screenshot: ExternalDocArtifactRefV1 | null = null;
  if (capture.screenshot_bytes !== null && capture.screenshot_media_type !== null) {
    const extension = capture.screenshot_media_type.includes('webp') ? 'webp'
      : capture.screenshot_media_type.includes('jpeg') ? 'jpg'
      : 'png';
    screenshot = await uploadContentAddressedExternalArtifact({
      store: input.store,
      endpointId: input.endpointId,
      bucket: input.bucket,
      namespace: input.namespace,
      filename: `screenshot.${extension}`,
      bytes: capture.screenshot_bytes,
      contentType: capture.screenshot_media_type,
      artifactId: `${capture.capture_id}:screenshot`,
      artifactRevision: captureRevision,
      artifactRole: 'SCREENSHOT',
      sourceId: capture.source_id,
      sourceRevision: capture.source_revision,
      sourceUrl: capture.resolved_url,
      documentChecksum,
      indexableText: false,
      exactSourceEligible: false,
      storageClass: 'COLD_ARCHIVE',
    });
  }

  const fetchReceipt: ExternalDocFetchReceiptV1 = externalDocFetchReceiptSchema.parse({
    fetch_id: capture.capture_id,
    source_id: capture.source_id,
    source_revision: capture.source_revision,
    requested_url: capture.requested_url,
    resolved_url: capture.resolved_url,
    fetcher: 'FIRECRAWL_V2',
    http_status: capture.http_status,
    content_type: 'text/html',
    etag: capture.etag,
    last_modified: capture.last_modified,
    fetched_at: capture.fetched_at,
    raw_content_checksum: rawChecksum,
    normalized_content_checksum: documentChecksum,
    parser: 'firecrawl-v2',
    parser_revision: input.parserRevision,
    title: capture.title,
    language: capture.language,
    outgoing_urls: capture.outgoing_urls,
    canonical_authority: false,
  });

  const logicalCapture = {
    capture_id: capture.capture_id,
    source_id: capture.source_id,
    source_revision: capture.source_revision,
    document_checksum: documentChecksum,
    raw_checksum: rawChecksum,
    screenshot_checksum: capture.screenshot_bytes ? sha256Bytes(capture.screenshot_bytes) : null,
    normalized_object_key: normalized.artifact.object_key,
    raw_object_key: rawHtml?.artifact.object_key ?? null,
    screenshot_object_key: screenshot?.artifact.object_key ?? null,
    outgoing_urls: [...capture.outgoing_urls].sort(),
    change_status: capture.change_status,
  };

  return archivedExternalDocCaptureSchema.parse({
    capture_id: capture.capture_id,
    source_id: capture.source_id,
    source_revision: capture.source_revision,
    document_checksum: documentChecksum,
    capture_checksum: captureChecksum(logicalCapture),
    fetch_receipt: fetchReceipt,
    normalized_markdown_artifact: normalized,
    raw_html_artifact: rawHtml,
    screenshot_artifact: screenshot,
    outgoing_urls: capture.outgoing_urls,
    change_status: capture.change_status,
    canonical_authority: false,
  });
}
