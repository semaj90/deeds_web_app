import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';

import {
  artifactAddressSchema,
  type ArtifactAddressV1,
} from './artifact-work-item-v1.js';

export type ArtifactVerificationGate =
  | 'ACTION_KEY_PRESENT'
  | 'PRODUCER_REVISION_PRESENT'
  | 'REVISION_SET_HASH_PRESENT'
  | 'ARTIFACT_EXISTS'
  | 'ARTIFACT_IS_FILE'
  | 'BYTE_LENGTH_MATCH'
  | 'CHECKSUM_MATCH'
  | 'STORAGE_VERIFIER_AVAILABLE';

export type ArtifactMaterializationVerificationV1 = {
  schema: 'atlas.artifact-materialization-verification.v1';
  artifactId: string;
  storage: ArtifactAddressV1['locator']['storage'];
  status: 'PROVEN' | 'REJECTED' | 'NOT_PROVEN';
  gates: Record<ArtifactVerificationGate, boolean>;
  actualByteLength: number | null;
  actualChecksum: string | null;
  reason: string | null;
};

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

function baseGates(input: {
  actionKey: string;
  producerRevision: string;
  artifact: ArtifactAddressV1;
}): Record<ArtifactVerificationGate, boolean> {
  return {
    ACTION_KEY_PRESENT: input.actionKey.trim().length >= 16,
    PRODUCER_REVISION_PRESENT: input.producerRevision.trim().length > 0,
    REVISION_SET_HASH_PRESENT: input.artifact.revisionSetHash.trim().length >= 16,
    ARTIFACT_EXISTS: false,
    ARTIFACT_IS_FILE: false,
    BYTE_LENGTH_MATCH: false,
    CHECKSUM_MATCH: false,
    STORAGE_VERIFIER_AVAILABLE: false,
  };
}

async function verifyFileBackedArtifact(input: {
  actionKey: string;
  producerRevision: string;
  artifact: ArtifactAddressV1;
  path: string;
  expectedByteLength?: number;
}): Promise<ArtifactMaterializationVerificationV1> {
  const gates = baseGates(input);
  gates.STORAGE_VERIFIER_AVAILABLE = true;

  let info;
  try {
    info = await stat(input.path);
    gates.ARTIFACT_EXISTS = true;
  } catch {
    return {
      schema: 'atlas.artifact-materialization-verification.v1',
      artifactId: input.artifact.artifactId,
      storage: input.artifact.locator.storage,
      status: 'REJECTED',
      gates,
      actualByteLength: null,
      actualChecksum: null,
      reason: 'ARTIFACT_NOT_FOUND',
    };
  }

  gates.ARTIFACT_IS_FILE = info.isFile();
  if (!gates.ARTIFACT_IS_FILE) {
    return {
      schema: 'atlas.artifact-materialization-verification.v1',
      artifactId: input.artifact.artifactId,
      storage: input.artifact.locator.storage,
      status: 'REJECTED',
      gates,
      actualByteLength: info.size,
      actualChecksum: null,
      reason: 'ARTIFACT_NOT_FILE',
    };
  }

  gates.BYTE_LENGTH_MATCH =
    input.expectedByteLength === undefined || info.size === input.expectedByteLength;
  if (!gates.BYTE_LENGTH_MATCH) {
    return {
      schema: 'atlas.artifact-materialization-verification.v1',
      artifactId: input.artifact.artifactId,
      storage: input.artifact.locator.storage,
      status: 'REJECTED',
      gates,
      actualByteLength: info.size,
      actualChecksum: null,
      reason: 'BYTE_LENGTH_MISMATCH',
    };
  }

  const actualChecksum = await sha256File(input.path);
  gates.CHECKSUM_MATCH = actualChecksum === input.artifact.checksum;
  const required = [
    gates.ACTION_KEY_PRESENT,
    gates.PRODUCER_REVISION_PRESENT,
    gates.REVISION_SET_HASH_PRESENT,
    gates.ARTIFACT_EXISTS,
    gates.ARTIFACT_IS_FILE,
    gates.BYTE_LENGTH_MATCH,
    gates.CHECKSUM_MATCH,
    gates.STORAGE_VERIFIER_AVAILABLE,
  ];

  return {
    schema: 'atlas.artifact-materialization-verification.v1',
    artifactId: input.artifact.artifactId,
    storage: input.artifact.locator.storage,
    status: required.every(Boolean) ? 'PROVEN' : 'REJECTED',
    gates,
    actualByteLength: info.size,
    actualChecksum,
    reason: gates.CHECKSUM_MATCH ? null : 'CHECKSUM_MISMATCH',
  };
}

async function verifyPostgresArtifact(input: {
  actionKey: string;
  producerRevision: string;
  artifact: ArtifactAddressV1;
}): Promise<ArtifactMaterializationVerificationV1> {
  const gates = baseGates(input);
  gates.STORAGE_VERIFIER_AVAILABLE = true;

  try {
    // Keep the common MMAP/Arrow verifier import-safe for unit tests and CLI
    // tooling that do not have DATABASE_URL configured.
    const { readPostgresJsonArtifact } = await import('./postgres-json-artifact-v1.js');
    await readPostgresJsonArtifact(input.artifact);
    gates.ARTIFACT_EXISTS = true;
    gates.BYTE_LENGTH_MATCH = true;
    gates.CHECKSUM_MATCH = true;
  } catch (error) {
    return {
      schema: 'atlas.artifact-materialization-verification.v1',
      artifactId: input.artifact.artifactId,
      storage: input.artifact.locator.storage,
      status: 'REJECTED',
      gates,
      actualByteLength: null,
      actualChecksum: null,
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  const required = [
    gates.ACTION_KEY_PRESENT,
    gates.PRODUCER_REVISION_PRESENT,
    gates.REVISION_SET_HASH_PRESENT,
    gates.ARTIFACT_EXISTS,
    gates.CHECKSUM_MATCH,
    gates.STORAGE_VERIFIER_AVAILABLE,
  ];

  return {
    schema: 'atlas.artifact-materialization-verification.v1',
    artifactId: input.artifact.artifactId,
    storage: input.artifact.locator.storage,
    status: required.every(Boolean) ? 'PROVEN' : 'REJECTED',
    gates,
    actualByteLength: null,
    actualChecksum: input.artifact.checksum,
    reason: null,
  };
}

export async function verifyArtifactMaterialization(input: {
  actionKey: string;
  producerRevision: string;
  artifact: ArtifactAddressV1;
}): Promise<ArtifactMaterializationVerificationV1> {
  const artifact = artifactAddressSchema.parse(input.artifact);
  switch (artifact.locator.storage) {
    case 'MMAP':
      return verifyFileBackedArtifact({
        ...input,
        artifact,
        path: artifact.locator.path,
        expectedByteLength: artifact.locator.byteLength,
      });
    case 'ARROW_IPC':
      return verifyFileBackedArtifact({
        ...input,
        artifact,
        path: artifact.locator.path,
      });
    case 'POSTGRES':
      return verifyPostgresArtifact({ ...input, artifact });
    case 'QDRANT':
    case 'VALKEY':
    case 'GPU_RESIDENT': {
      const gates = baseGates({ ...input, artifact });
      return {
        schema: 'atlas.artifact-materialization-verification.v1',
        artifactId: artifact.artifactId,
        storage: artifact.locator.storage,
        status: 'NOT_PROVEN',
        gates,
        actualByteLength: null,
        actualChecksum: null,
        reason: `STORAGE_VERIFIER_NOT_IMPLEMENTED:${artifact.locator.storage}`,
      };
    }
  }
}
