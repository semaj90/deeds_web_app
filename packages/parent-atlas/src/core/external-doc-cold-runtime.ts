import { createHash } from 'node:crypto';
import {
  coldArtifactHydrationReceiptSchema,
  coldArtifactHydrationRequestSchema,
  contentAddressedObjectKey,
  externalDocArtifactRefSchema,
  type ColdArtifactHydrationReceiptV1,
  type ColdArtifactHydrationRequestV1,
  type ExternalDocArtifactRefV1,
} from './external-doc-cold-fabric.js';
import { seaweedS3ArtifactRefSchema } from './adaptive-semantic-memory.js';

export type ObjectStorePutResult = {
  etag?: string | null;
};

export type ObjectStoreHeadResult = {
  contentLength: number;
  contentType?: string | null;
  etag?: string | null;
};

export interface ColdObjectStorePort {
  putObject(input: {
    bucket: string;
    objectKey: string;
    bytes: Uint8Array;
    contentType: string;
    metadata?: Record<string, string>;
  }): Promise<ObjectStorePutResult>;
  getObject(input: {
    bucket: string;
    objectKey: string;
    maximumBytes: number;
  }): Promise<Uint8Array>;
  headObject?(input: {
    bucket: string;
    objectKey: string;
  }): Promise<ObjectStoreHeadResult>;
}

export function sha256Bytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function sha256Text(text: string): string {
  return sha256Bytes(Buffer.from(text, 'utf8'));
}

export async function uploadContentAddressedExternalArtifact(input: {
  store: ColdObjectStorePort;
  endpointId: string;
  bucket: string;
  namespace: string;
  filename: string;
  bytes: Uint8Array;
  contentType: string;
  artifactId: string;
  artifactRevision: string;
  artifactRole: ExternalDocArtifactRefV1['artifact_role'];
  sourceId: string;
  sourceRevision: string;
  sourceUrl?: string | null;
  documentChecksum?: string | null;
  indexableText?: boolean;
  exactSourceEligible?: boolean;
  storageClass?: 'HOT_REPLICA' | 'WARM_ERASURE_CODED' | 'COLD_ARCHIVE';
}): Promise<ExternalDocArtifactRefV1> {
  const contentChecksum = sha256Bytes(input.bytes);
  const objectKey = contentAddressedObjectKey({
    namespace: input.namespace,
    checksum: contentChecksum,
    filename: input.filename,
  });

  const put = await input.store.putObject({
    bucket: input.bucket,
    objectKey,
    bytes: input.bytes,
    contentType: input.contentType,
    metadata: {
      'atlas-sha256': contentChecksum,
      'atlas-artifact-id': input.artifactId,
      'atlas-artifact-revision': input.artifactRevision,
    },
  });

  if (input.store.headObject) {
    const head = await input.store.headObject({ bucket: input.bucket, objectKey });
    if (head.contentLength !== input.bytes.byteLength) {
      throw new Error(`SEAWEED_HEAD_LENGTH_MISMATCH:${head.contentLength}:${input.bytes.byteLength}`);
    }
  }

  const artifact = seaweedS3ArtifactRefSchema.parse({
    artifact_id: input.artifactId,
    artifact_revision: input.artifactRevision,
    backend: 'SEAWEEDFS_S3',
    endpoint_id: input.endpointId,
    bucket: input.bucket,
    object_key: objectKey,
    content_checksum: contentChecksum,
    content_length_bytes: input.bytes.byteLength,
    media_type: input.contentType,
    etag: put.etag ?? null,
    storage_class: input.storageClass ?? 'COLD_ARCHIVE',
    immutable: true,
    canonical_authority: false,
  });

  return externalDocArtifactRefSchema.parse({
    artifact_role: input.artifactRole,
    source_id: input.sourceId,
    source_revision: input.sourceRevision,
    document_checksum: input.documentChecksum ?? null,
    source_url: input.sourceUrl ?? null,
    artifact,
    indexable_text: input.indexableText ?? false,
    exact_source_eligible: input.exactSourceEligible ?? false,
    canonical_authority: false,
  });
}

export async function hydrateColdArtifact(input: {
  store: ColdObjectStorePort;
  request: ColdArtifactHydrationRequestV1;
  producerRevision: string;
  completedAtEpochMs?: number;
}): Promise<{ receipt: ColdArtifactHydrationReceiptV1; bytes: Uint8Array | null }> {
  const request = coldArtifactHydrationRequestSchema.parse(input.request);
  const completedAt = input.completedAtEpochMs ?? Date.now();
  let bytes: Uint8Array;
  try {
    bytes = await input.store.getObject({
      bucket: request.artifact_ref.artifact.bucket,
      objectKey: request.artifact_ref.artifact.object_key,
      maximumBytes: request.maximum_bytes,
    });
  } catch {
    return {
      bytes: null,
      receipt: coldArtifactHydrationReceiptSchema.parse({
        receipt_id: `hydrate-receipt:${request.request_id}:${request.attempt}`,
        request_id: request.request_id,
        request_revision: request.request_revision,
        artifact_id: request.artifact_ref.artifact.artifact_id,
        target: request.target,
        expected_checksum: request.expected_checksum,
        hydrated_bytes: 0,
        status: 'FAILED',
        error_class: 'S3_READ_FAILED',
        completed_at_epoch_ms: completedAt,
        producer_revision: input.producerRevision,
        canonical_authority: false,
      }),
    };
  }

  if (bytes.byteLength > request.maximum_bytes) {
    return {
      bytes: null,
      receipt: coldArtifactHydrationReceiptSchema.parse({
        receipt_id: `hydrate-receipt:${request.request_id}:${request.attempt}`,
        request_id: request.request_id,
        request_revision: request.request_revision,
        artifact_id: request.artifact_ref.artifact.artifact_id,
        target: request.target,
        expected_checksum: request.expected_checksum,
        hydrated_bytes: bytes.byteLength,
        status: 'FAILED',
        error_class: 'BYTE_BUDGET_EXCEEDED',
        completed_at_epoch_ms: completedAt,
        producer_revision: input.producerRevision,
        canonical_authority: false,
      }),
    };
  }

  const observedChecksum = sha256Bytes(bytes);
  if (observedChecksum !== request.expected_checksum) {
    return {
      bytes: null,
      receipt: coldArtifactHydrationReceiptSchema.parse({
        receipt_id: `hydrate-receipt:${request.request_id}:${request.attempt}`,
        request_id: request.request_id,
        request_revision: request.request_revision,
        artifact_id: request.artifact_ref.artifact.artifact_id,
        target: request.target,
        expected_checksum: request.expected_checksum,
        observed_checksum: observedChecksum,
        hydrated_bytes: bytes.byteLength,
        status: 'FAILED',
        error_class: 'CHECKSUM_MISMATCH',
        completed_at_epoch_ms: completedAt,
        producer_revision: input.producerRevision,
        canonical_authority: false,
      }),
    };
  }

  const cacheKey = `sha256/${observedChecksum.slice(0, 2)}/${observedChecksum}`;
  return {
    bytes,
    receipt: coldArtifactHydrationReceiptSchema.parse({
      receipt_id: `hydrate-receipt:${request.request_id}:${request.attempt}`,
      request_id: request.request_id,
      request_revision: request.request_revision,
      artifact_id: request.artifact_ref.artifact.artifact_id,
      target: request.target,
      expected_checksum: request.expected_checksum,
      observed_checksum: observedChecksum,
      hydrated_bytes: bytes.byteLength,
      cache_key: cacheKey,
      status: 'VERIFIED_READY',
      completed_at_epoch_ms: completedAt,
      producer_revision: input.producerRevision,
      canonical_authority: false,
    }),
  };
}
