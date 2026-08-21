import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';

import { db } from '$lib/server/db/client.js';
import {
  artifactAddressSchema,
  type ArtifactAddressV1,
} from './artifact-work-item-v1.js';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256Hex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export async function materializePostgresJsonArtifact(opts: {
  schemaId: string;
  payload: unknown;
  revisions: Record<string, string>;
}): Promise<ArtifactAddressV1> {
  const canonicalPayload = canonicalJson(opts.payload);
  const checksum = sha256Hex(canonicalPayload);
  const canonicalRevisions = canonicalJson(opts.revisions);
  const revisionSetHash = sha256Hex(canonicalRevisions);
  const artifactHash = sha256Hex(
    canonicalJson({
      schemaId: opts.schemaId,
      checksum,
      revisionSetHash,
    }),
  );
  const artifactId = `sha256:${artifactHash}`;
  const payloadByteLength = Buffer.byteLength(canonicalPayload, 'utf8');

  await db.execute(sql`
    INSERT INTO workflow_artifacts (
      artifact_id, artifact_hash, schema_id, checksum, revision_set_hash,
      revisions, payload, payload_byte_length, created_at
    ) VALUES (
      ${artifactId},
      ${artifactHash},
      ${opts.schemaId},
      ${checksum},
      ${revisionSetHash},
      ${JSON.stringify(opts.revisions)}::jsonb,
      ${canonicalPayload}::jsonb,
      ${payloadByteLength},
      NOW()
    )
    ON CONFLICT (artifact_hash) DO NOTHING
  `);

  return artifactAddressSchema.parse({
    schema: 'atlas.artifact-address.v1',
    artifactId,
    artifactHash,
    schemaId: opts.schemaId,
    checksum,
    revisionSetHash,
    revisions: opts.revisions,
    locator: {
      storage: 'POSTGRES',
      table: 'workflow_artifacts',
      primaryKey: artifactId,
    },
  });
}

export async function readPostgresJsonArtifact<T = unknown>(
  addressInput: ArtifactAddressV1,
): Promise<T> {
  const address = artifactAddressSchema.parse(addressInput);
  if (address.locator.storage !== 'POSTGRES' || address.locator.table !== 'workflow_artifacts') {
    throw new Error(
      `Unsupported artifact locator for Postgres JSON materializer: ${address.locator.storage}`,
    );
  }

  const result = await db.execute<{
    artifact_hash: string;
    schema_id: string;
    checksum: string;
    revision_set_hash: string;
    revisions: Record<string, string>;
    payload: T;
  }>(sql`
    SELECT artifact_hash, schema_id, checksum, revision_set_hash, revisions, payload
    FROM workflow_artifacts
    WHERE artifact_id = ${address.locator.primaryKey}
    LIMIT 1
  `);

  const row = result.rows?.[0];
  if (!row) throw new Error(`Artifact not found: ${address.artifactId}`);
  if (row.artifact_hash !== address.artifactHash) {
    throw new Error(`Artifact hash mismatch: ${address.artifactId}`);
  }
  if (row.schema_id !== address.schemaId) {
    throw new Error(`Artifact schema mismatch: ${address.artifactId}`);
  }
  if (row.revision_set_hash !== address.revisionSetHash) {
    throw new Error(`Artifact revision mismatch: ${address.artifactId}`);
  }

  const checksum = sha256Hex(canonicalJson(row.payload));
  if (checksum !== address.checksum || row.checksum !== address.checksum) {
    throw new Error(`Artifact checksum mismatch: ${address.artifactId}`);
  }

  return row.payload;
}

export type LegacyVectorArtifactPayloadV1 = {
  documentId: string;
  embedding: number[];
  collection: string;
  metadata: Record<string, unknown>;
};

export async function materializeLegacyVectorArtifact(opts: {
  documentId: string;
  embedding: number[];
  collection: string;
  metadata?: Record<string, unknown>;
  producerRevision?: string;
}): Promise<ArtifactAddressV1> {
  if (!opts.embedding.length || opts.embedding.some((value) => !Number.isFinite(value))) {
    throw new Error('Embedding artifact requires a non-empty finite vector');
  }

  return materializePostgresJsonArtifact({
    schemaId: 'atlas.legacy-vector-index-input.v1',
    payload: {
      documentId: opts.documentId,
      embedding: opts.embedding,
      collection: opts.collection,
      metadata: opts.metadata ?? {},
    } satisfies LegacyVectorArtifactPayloadV1,
    revisions: {
      transport: 'artifact-ref-v1',
      producer: opts.producerRevision ?? 'legacy-embedding-client-v1',
    },
  });
}

export async function readLegacyVectorArtifact(
  address: ArtifactAddressV1,
): Promise<LegacyVectorArtifactPayloadV1> {
  if (address.schemaId !== 'atlas.legacy-vector-index-input.v1') {
    throw new Error(`Unexpected vector artifact schema: ${address.schemaId}`);
  }
  const payload = await readPostgresJsonArtifact<LegacyVectorArtifactPayloadV1>(address);
  if (!Array.isArray(payload.embedding) || !payload.embedding.length) {
    throw new Error(`Vector artifact contains no embedding: ${address.artifactId}`);
  }
  return payload;
}
