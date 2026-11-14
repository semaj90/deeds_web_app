/**
 * Evidence markup revision (V2 save) — step 1 only: commit a flattened marked-up image as a NEW derived revision.
 *
 * Contract (do not weaken):
 *  - The original evidence object and row are never modified. The revision is a DERIVED artifact: it goes to the artifacts
 *    bucket (assertArtifactBucket), never the legal-originals bucket, and its exact bytes are stored (no padding, so the
 *    stored SHA-256 always equals the SHA-256 of the object).
 *  - The caller must prove the parent: parentSha256 must equal the evidence row's stored hash, and the evidence must belong
 *    to the stated case. A missing stored hash fails closed.
 *  - `committed` means the object is stored and the evidence_versions row is committed. Indexing is a SEPARATE milestone and is
 *    reported as `index.status: 'not_requested'`; nothing here claims anything is searchable.
 *  - evidence_versions.changed_by is a uuid but users.id is an integer, so the actor is recorded inside metadata and
 *    changed_by stays NULL. No schema change.
 *  - Storage and database are separate stores, so this is not atomic: on a database failure the object this call uploaded is
 *    deleted best-effort and the original error is rethrown. Re-saving identical bytes is idempotent (no upload, same row).
 */
import crypto from 'node:crypto';
import { z } from 'zod';

export const EVIDENCE_REVISION_SCHEMA_V1 = 'atlas.evidence-revision.v1' as const;
export const EVIDENCE_ANNOTATION_REVISION_SCHEMA_V1 = 'atlas.evidence-annotation-revision.v1' as const;
export const MAX_REVISION_IMAGE_BYTES = 25 * 1024 * 1024;

const annotationLocationV1Schema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('document') }).strict(),
  z.object({ kind: z.literal('pdf-page'), page: z.number().int().min(1).max(1_000_000) }).strict(),
  z.object({ kind: z.literal('image-point'), x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict(),
  z.object({ kind: z.literal('video-time'), timeMs: z.number().int().nonnegative().max(31_536_000_000) }).strict(),
  z.object({ kind: z.literal('audio-range'), startMs: z.number().int().nonnegative().max(31_536_000_000), endMs: z.number().int().nonnegative().max(31_536_000_000) }).strict()
    .refine((range) => range.endMs > range.startMs, { message: 'Audio annotation end must follow start.' }),
  z.object({ kind: z.literal('scene-object'), objectId: z.string().min(1).max(256), assetRevision: z.string().min(1).max(256) }).strict(),
]);

export const evidenceAnnotationDocumentV1Schema = z.object({
  schema: z.literal('atlas.evidence-annotation.v1'),
  modality: z.enum(['pdf', 'image', 'video', 'audio', 'scene', 'document']),
  notes: z.string().max(4000).default(''),
  annotations: z.array(z.object({
    id: z.string().min(1).max(64),
    kind: z.enum(['note', 'marker', 'highlight']),
    text: z.string().min(1).max(2000),
    location: annotationLocationV1Schema,
  }).strict()).max(200),
}).strict();
export type EvidenceAnnotationDocumentV1 = z.infer<typeof evidenceAnnotationDocumentV1Schema>;

const unit = z.number().min(0).max(1);
const label = z.string().max(200);

const markupItemSchema = z.discriminatedUnion('kind', [
  z.object({ id: z.string().min(1).max(64), kind: z.literal('pin'), x: unit, y: unit, label: label.min(1), timecodeMs: z.number().int().nonnegative().optional() }).strict(),
  z.object({ id: z.string().min(1).max(64), kind: z.literal('rectangle'), x: unit, y: unit, width: unit, height: unit, label: label.optional(), color: z.string().max(32).optional() }).strict(),
  z.object({ id: z.string().min(1).max(64), kind: z.literal('arrow'), x1: unit, y1: unit, x2: unit, y2: unit, label: label.optional(), color: z.string().max(32).optional() }).strict(),
  z.object({ id: z.string().min(1).max(64), kind: z.literal('text'), x: unit, y: unit, text: z.string().min(1).max(500), color: z.string().max(32).optional() }).strict(),
]);

export const markupDocumentV1Schema = z
  .object({ schemaVersion: z.literal('evidence-markup-v1'), notes: z.string().max(4000).default(''), items: z.array(markupItemSchema).max(100) })
  .strict();
export type MarkupDocumentV1 = z.infer<typeof markupDocumentV1Schema>;

const SHA256_PLAIN = /^[0-9a-f]{64}$/;
/** Accepts `sha256:<hex>` or bare hex, any case; returns the canonical `sha256:<lowercase hex>` or null. */
export function normalizeSha256(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const hex = value.trim().toLowerCase().replace(/^sha256:/, '');
  return SHA256_PLAIN.test(hex) ? `sha256:${hex}` : null;
}

/** Image type from the actual bytes. The client-declared type is only cross-checked, never trusted. */
export function sniffImage(bytes: Uint8Array): { mimeType: 'image/png' | 'image/webp'; ext: 'png' | 'webp' } | null {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length > 8 && png.every((b, i) => bytes[i] === b)) return { mimeType: 'image/png', ext: 'png' };
  const riff = [0x52, 0x49, 0x46, 0x46];
  const webp = [0x57, 0x45, 0x42, 0x50];
  if (bytes.length > 12 && riff.every((b, i) => bytes[i] === b) && webp.every((b, i) => bytes[8 + i] === b)) {
    return { mimeType: 'image/webp', ext: 'webp' };
  }
  return null;
}

export class EvidenceRevisionErrorV1 extends Error {
  constructor(
    readonly code:
      | 'INVALID_MARKUP'
      | 'INVALID_PARENT_SHA256'
      | 'IMAGE_EMPTY'
      | 'IMAGE_TOO_LARGE'
      | 'IMAGE_TYPE_UNSUPPORTED'
      | 'IMAGE_TYPE_MISMATCH'
      | 'EVIDENCE_NOT_FOUND'
      | 'EVIDENCE_CASE_MISMATCH'
      | 'PARENT_HASH_UNAVAILABLE'
      | 'PARENT_HASH_MISMATCH',
    message: string,
  ) {
    super(message);
    this.name = 'EvidenceRevisionErrorV1';
  }
}

export interface EvidenceRevisionPortsV1 {
  artifactBucket: string;
  loadEvidence(evidenceId: string): Promise<{ id: string; caseId: string | null; hash: string | null; deletedAt?: Date | string | null } | null>;
  findRevisionBySha256(evidenceId: string, sha256: string): Promise<{ id: string; version: number } | null>;
  putObject(args: { bucket: string; objectKey: string; bytes: Uint8Array; contentType: string; metadata: Record<string, string> }): Promise<void>;
  deleteObject(bucket: string, objectKey: string): Promise<void>;
  /** Must run in ONE transaction: lock the evidence row, take max(version)+1, insert. Must re-check sha256 inside the lock. */
  insertRevision(args: { evidenceId: string; caseId: string; parentSha256: string; sha256: string; metadata: Record<string, unknown>; changeReason: string | null }): Promise<{ id: string; version: number; created: boolean }>;
  findAnnotationRevision(evidenceId: string, annotationSha256: string): Promise<{ id: string; version: number } | null>;
  /** Must lock the source row, recheck its hash/case, dedupe, and append evidence_versions in one transaction. */
  insertAnnotationRevision(args: { evidenceId: string; caseId: string; parentSha256: string; annotationSha256: string; actorUserId: number; metadata: Record<string, unknown>; changeReason: string | null }): Promise<{ id: string; version: number; created: boolean }>;
}

export interface SaveEvidenceRevisionInputV1 {
  caseId: string;
  evidenceId: string;
  actorUserId: number;
  parentSha256: string;
  declaredMimeType?: string;
  bytes: Uint8Array;
  markup: unknown;
  revisionNotes?: string;
}

export interface EvidenceRevisionReceiptV1 {
  schema: typeof EVIDENCE_REVISION_SCHEMA_V1;
  committed: true;
  idempotent: boolean;
  versionId: string;
  version: number;
  parentSha256: string;
  sha256: string;
  bucket: string;
  objectKey: string;
  byteSize: number;
  mimeType: string;
  /** Indexing is a separate milestone; nothing is searchable because of this save. */
  index: { status: 'not_requested' };
}

export interface EvidenceAnnotationRevisionReceiptV1 {
  schema: typeof EVIDENCE_ANNOTATION_REVISION_SCHEMA_V1;
  committed: true;
  idempotent: boolean;
  versionId: string;
  version: number;
  parentSha256: string;
  annotationSha256: string;
  index: { status: 'not_requested' };
  canonicalAuthority: false;
}

/** Saves source-bound annotations for every modality without rewriting or copying the original bytes. */
export async function saveEvidenceAnnotationRevisionV1(input: {
  caseId: string;
  evidenceId: string;
  actorUserId: number;
  parentSha256: string;
  annotation: unknown;
  revisionNotes?: string;
}, ports: EvidenceRevisionPortsV1): Promise<EvidenceAnnotationRevisionReceiptV1> {
  const parentSha256 = normalizeSha256(input.parentSha256);
  if (!parentSha256) throw new EvidenceRevisionErrorV1('INVALID_PARENT_SHA256', 'parentSha256 must be sha256:<64 hex>.');
  const annotation = evidenceAnnotationDocumentV1Schema.safeParse(input.annotation);
  if (!annotation.success) throw new EvidenceRevisionErrorV1('INVALID_MARKUP', 'Annotation document is invalid.');

  const parent = await ports.loadEvidence(input.evidenceId);
  if (!parent || parent.deletedAt) throw new EvidenceRevisionErrorV1('EVIDENCE_NOT_FOUND', 'Evidence not found.');
  if (parent.caseId !== input.caseId) throw new EvidenceRevisionErrorV1('EVIDENCE_CASE_MISMATCH', 'Evidence does not belong to the stated case.');
  const storedHash = normalizeSha256(parent.hash);
  if (!storedHash) throw new EvidenceRevisionErrorV1('PARENT_HASH_UNAVAILABLE', 'The source evidence has no stored SHA-256, so the parent cannot be verified.');
  if (storedHash !== parentSha256) throw new EvidenceRevisionErrorV1('PARENT_HASH_MISMATCH', 'Source evidence changed since review started.');

  // Canonical object-key order is fixed by this construction; annotation array order is preserved as editor order.
  const canonicalAnnotation = {
    schema: annotation.data.schema,
    modality: annotation.data.modality,
    notes: annotation.data.notes,
    annotations: annotation.data.annotations.map((item) => ({
      id: item.id,
      kind: item.kind,
      text: item.text,
      location: item.location,
    })),
  };
  const annotationSha256 = `sha256:${crypto.createHash('sha256').update(JSON.stringify({
    evidenceId: input.evidenceId,
    caseId: input.caseId,
    parentSha256,
    annotation: canonicalAnnotation,
  }), 'utf8').digest('hex')}`;
  const existing = await ports.findAnnotationRevision(input.evidenceId, annotationSha256);
  if (existing) return {
    schema: EVIDENCE_ANNOTATION_REVISION_SCHEMA_V1,
    committed: true,
    idempotent: true,
    versionId: existing.id,
    version: existing.version,
    parentSha256,
    annotationSha256,
    index: { status: 'not_requested' },
    canonicalAuthority: false,
  };

  const row = await ports.insertAnnotationRevision({
    evidenceId: input.evidenceId,
    caseId: input.caseId,
    parentSha256,
    annotationSha256,
    actorUserId: input.actorUserId,
    changeReason: input.revisionNotes?.trim() ? input.revisionNotes.trim().slice(0, 1000) : null,
    metadata: {
      schema: EVIDENCE_ANNOTATION_REVISION_SCHEMA_V1,
      evidenceId: input.evidenceId,
      caseId: input.caseId,
      actorUserId: input.actorUserId,
      parentSha256,
      annotationSha256,
      annotation: canonicalAnnotation,
      canonicalAuthority: false,
      index: { status: 'not_requested' },
    },
  });
  return {
    schema: EVIDENCE_ANNOTATION_REVISION_SCHEMA_V1,
    committed: true,
    idempotent: !row.created,
    versionId: row.id,
    version: row.version,
    parentSha256,
    annotationSha256,
    index: { status: 'not_requested' },
    canonicalAuthority: false,
  };
}

export async function saveEvidenceMarkupRevisionV1(input: SaveEvidenceRevisionInputV1, ports: EvidenceRevisionPortsV1): Promise<EvidenceRevisionReceiptV1> {
  const parentSha256 = normalizeSha256(input.parentSha256);
  if (!parentSha256) throw new EvidenceRevisionErrorV1('INVALID_PARENT_SHA256', 'parentSha256 must be sha256:<64 hex>.');

  const markup = markupDocumentV1Schema.safeParse(input.markup);
  if (!markup.success) {
    throw new EvidenceRevisionErrorV1('INVALID_MARKUP', markup.error.issues.slice(0, 3).map((i) => `${i.path.join('.') || 'markup'}: ${i.message}`).join('; '));
  }

  if (input.bytes.byteLength === 0) throw new EvidenceRevisionErrorV1('IMAGE_EMPTY', 'The flattened image is empty.');
  if (input.bytes.byteLength > MAX_REVISION_IMAGE_BYTES) throw new EvidenceRevisionErrorV1('IMAGE_TOO_LARGE', `Image exceeds ${MAX_REVISION_IMAGE_BYTES} bytes.`);
  const sniffed = sniffImage(input.bytes);
  if (!sniffed) throw new EvidenceRevisionErrorV1('IMAGE_TYPE_UNSUPPORTED', 'Only PNG or WebP images are accepted.');
  if (input.declaredMimeType && input.declaredMimeType !== sniffed.mimeType) {
    throw new EvidenceRevisionErrorV1('IMAGE_TYPE_MISMATCH', `Declared ${input.declaredMimeType} but the bytes are ${sniffed.mimeType}.`);
  }

  const parent = await ports.loadEvidence(input.evidenceId);
  if (!parent || parent.deletedAt) throw new EvidenceRevisionErrorV1('EVIDENCE_NOT_FOUND', 'Evidence not found.');
  if (parent.caseId !== input.caseId) throw new EvidenceRevisionErrorV1('EVIDENCE_CASE_MISMATCH', 'Evidence does not belong to the stated case.');
  const storedHash = normalizeSha256(parent.hash);
  if (!storedHash) throw new EvidenceRevisionErrorV1('PARENT_HASH_UNAVAILABLE', 'The source evidence has no stored SHA-256, so the parent cannot be verified.');
  if (storedHash !== parentSha256) throw new EvidenceRevisionErrorV1('PARENT_HASH_MISMATCH', 'Source evidence changed since review started.');

  const hex = crypto.createHash('sha256').update(input.bytes).digest('hex');
  const sha256 = `sha256:${hex}`;
  const bucket = ports.artifactBucket;
  const objectKey = `evidence-revisions/${input.caseId}/${input.evidenceId}/${hex}.${sniffed.ext}`;
  const receipt = (v: { id: string; version: number }, idempotent: boolean): EvidenceRevisionReceiptV1 => ({
    schema: EVIDENCE_REVISION_SCHEMA_V1, committed: true, idempotent, versionId: v.id, version: v.version, parentSha256, sha256, bucket, objectKey,
    byteSize: input.bytes.byteLength, mimeType: sniffed.mimeType, index: { status: 'not_requested' },
  });

  const existing = await ports.findRevisionBySha256(input.evidenceId, sha256);
  if (existing) return receipt(existing, true);

  await ports.putObject({ bucket, objectKey, bytes: input.bytes, contentType: sniffed.mimeType, metadata: { 'x-atlas-schema': EVIDENCE_REVISION_SCHEMA_V1, 'x-atlas-parent-sha256': parentSha256 } });
  try {
    const row = await ports.insertRevision({
      evidenceId: input.evidenceId,
      caseId: input.caseId,
      parentSha256,
      sha256,
      changeReason: input.revisionNotes?.trim() ? input.revisionNotes.trim().slice(0, 1000) : null,
      metadata: {
        schema: EVIDENCE_REVISION_SCHEMA_V1,
        kind: 'markup_flattened_image',
        parentSha256,
        sha256,
        bucket,
        objectKey,
        byteSize: input.bytes.byteLength,
        mimeType: sniffed.mimeType,
        markup: markup.data,
        actorUserId: input.actorUserId,
        caseId: input.caseId,
        canonicalAuthority: false,
        index: { status: 'not_requested' },
      },
    });
    return receipt(row, !row.created);
  } catch (err) {
    // The key is content-addressed, so a concurrent save of identical bytes may have committed a row that points at this
    // very object. Only delete when no committed revision references it (fail safe: if the lookup fails, keep the object).
    try {
      const referenced = await ports.findRevisionBySha256(input.evidenceId, sha256);
      if (!referenced) await ports.deleteObject(bucket, objectKey);
    } catch { /* best effort; an orphan is content-addressed and harmless */ }
    throw err;
  }
}

/** Production ports. Dynamic imports keep the pure logic above free of database and S3 side effects at import time. */
export async function createDrizzleRevisionPortsV1(override?: { db: (typeof import('$lib/server/db/client'))['db'] }): Promise<EvidenceRevisionPortsV1> {
  // `override.db` lets a rehearsal drive these exact ports through a transaction it will roll back. Storage is imported lazily
  // (only putObject/deleteObject need it) so a database-only rehearsal never touches SeaweedFS.
  const [client, schema, orm, buckets] = await Promise.all([
    override ? Promise.resolve(null) : import('$lib/server/db/client'),
    import('$lib/server/db/schema-postgres.js'),
    import('drizzle-orm'),
    import('$lib/server/storage/storage-buckets.js'),
  ]);
  const db = override?.db ?? client!.db;
  const { evidence, evidenceVersions } = schema;
  const { eq, and, sql } = orm;
  const bucket = buckets.storageBuckets.artifacts;
  buckets.assertArtifactBucket(bucket);
  const byShaFilter = (evidenceId: string, sha256: string) =>
    and(eq(evidenceVersions.evidenceId, evidenceId), sql`${evidenceVersions.metadata}->>'schema' = ${EVIDENCE_REVISION_SCHEMA_V1}`, sql`${evidenceVersions.metadata}->>'sha256' = ${sha256}`);
  const byAnnotationFilter = (evidenceId: string, annotationSha256: string) =>
    and(eq(evidenceVersions.evidenceId, evidenceId), sql`${evidenceVersions.metadata}->>'schema' = ${EVIDENCE_ANNOTATION_REVISION_SCHEMA_V1}`, sql`${evidenceVersions.metadata}->>'annotationSha256' = ${annotationSha256}`);
  return {
    artifactBucket: bucket,
    async loadEvidence(evidenceId) {
      const [row] = await db.select({ id: evidence.id, caseId: evidence.caseId, hash: evidence.hash, deletedAt: evidence.deletedAt }).from(evidence).where(eq(evidence.id, evidenceId)).limit(1);
      return row ?? null;
    },
    async findRevisionBySha256(evidenceId, sha256) {
      const [row] = await db.select({ id: evidenceVersions.id, version: evidenceVersions.version }).from(evidenceVersions).where(byShaFilter(evidenceId, sha256)).limit(1);
      return row ?? null;
    },
    async putObject(args) {
      buckets.assertArtifactBucket(args.bucket);
      const seaweed = await import('$lib/server/storage/seaweed.js');
      await seaweed.putFileToSeaweed({ bucket: args.bucket, objectKey: args.objectKey, bytes: args.bytes, contentType: args.contentType, metadata: args.metadata });
    },
    async deleteObject(b, key) {
      buckets.assertArtifactBucket(b);
      const seaweed = await import('$lib/server/storage/seaweed.js');
      await seaweed.deleteFileFromSeaweed(key, b);
    },
    async insertRevision({ evidenceId, caseId, parentSha256, sha256, metadata, changeReason }) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`SELECT 1 FROM ${evidence} WHERE ${evidence.id} = ${evidenceId} FOR UPDATE`);
        const [parent] = await tx.select({ id: evidence.id, caseId: evidence.caseId, hash: evidence.hash, deletedAt: evidence.deletedAt }).from(evidence).where(eq(evidence.id, evidenceId)).limit(1);
        if (!parent || parent.deletedAt) throw new EvidenceRevisionErrorV1('EVIDENCE_NOT_FOUND', 'Evidence not found.');
        if (parent.caseId !== caseId) throw new EvidenceRevisionErrorV1('EVIDENCE_CASE_MISMATCH', 'Evidence does not belong to the stated case.');
        if (normalizeSha256(parent.hash) !== parentSha256) throw new EvidenceRevisionErrorV1('PARENT_HASH_MISMATCH', 'Source evidence changed while saving the revision.');
        const [dup] = await tx.select({ id: evidenceVersions.id, version: evidenceVersions.version }).from(evidenceVersions).where(byShaFilter(evidenceId, sha256)).limit(1);
        if (dup) return { ...dup, created: false };
        const [max] = await tx.select({ m: sql<number>`coalesce(max(${evidenceVersions.version}), 0)` }).from(evidenceVersions).where(eq(evidenceVersions.evidenceId, evidenceId));
        const [row] = await tx
          .insert(evidenceVersions)
          .values({ evidenceId, version: Number(max?.m ?? 0) + 1, title: null, description: null, metadata, changedBy: null, changeReason })
          .returning({ id: evidenceVersions.id, version: evidenceVersions.version });
        if (!row) throw new Error('EVIDENCE_REVISION_INSERT_NO_ROW');
        return { ...row, created: true };
      });
    },
    async findAnnotationRevision(evidenceId, annotationSha256) {
      const [row] = await db.select({ id: evidenceVersions.id, version: evidenceVersions.version }).from(evidenceVersions).where(byAnnotationFilter(evidenceId, annotationSha256)).limit(1);
      return row ?? null;
    },
    async insertAnnotationRevision({ evidenceId, caseId, parentSha256, annotationSha256, metadata, changeReason }) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`SELECT 1 FROM ${evidence} WHERE ${evidence.id} = ${evidenceId} FOR UPDATE`);
        const [parent] = await tx.select({ id: evidence.id, caseId: evidence.caseId, hash: evidence.hash, deletedAt: evidence.deletedAt }).from(evidence).where(eq(evidence.id, evidenceId)).limit(1);
        if (!parent || parent.deletedAt) throw new EvidenceRevisionErrorV1('EVIDENCE_NOT_FOUND', 'Evidence not found.');
        if (parent.caseId !== caseId) throw new EvidenceRevisionErrorV1('EVIDENCE_CASE_MISMATCH', 'Evidence does not belong to the stated case.');
        if (normalizeSha256(parent.hash) !== parentSha256) throw new EvidenceRevisionErrorV1('PARENT_HASH_MISMATCH', 'Source evidence changed while saving annotations.');
        const [dup] = await tx.select({ id: evidenceVersions.id, version: evidenceVersions.version }).from(evidenceVersions).where(byAnnotationFilter(evidenceId, annotationSha256)).limit(1);
        if (dup) return { ...dup, created: false };
        const [max] = await tx.select({ m: sql<number>`coalesce(max(${evidenceVersions.version}), 0)` }).from(evidenceVersions).where(eq(evidenceVersions.evidenceId, evidenceId));
        const [row] = await tx.insert(evidenceVersions).values({
          evidenceId,
          version: Number(max?.m ?? 0) + 1,
          title: null,
          description: null,
          metadata,
          changedBy: null,
          changeReason,
        }).returning({ id: evidenceVersions.id, version: evidenceVersions.version });
        if (!row) throw new Error('EVIDENCE_ANNOTATION_REVISION_INSERT_NO_ROW');
        return { ...row, created: true };
      });
    },
  };
}
