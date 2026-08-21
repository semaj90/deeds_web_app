import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type {
  ArtifactMaterializedEventV1,
  ArtifactFailedEventV1,
  ArtifactStorage,
} from './event-fabric.js';

export const ARTIFACT_VERIFICATION_REVISION = 'atlas.artifact-materialization-verification.v1' as const;

export type ArtifactVerificationGate =
  | 'ACTION_KEY_PRESENT'
  | 'REVISION_SET_HASH_PRESENT'
  | 'PRODUCER_REVISION_PRESENT'
  | 'ARTIFACT_EXISTS'
  | 'ARTIFACT_IS_FILE'
  | 'BYTE_LENGTH_MATCH'
  | 'CHECKSUM_MATCH';

export type ArtifactVerificationStatus = 'VERIFIED' | 'FAILED' | 'NOT_PROVEN';

export interface ArtifactVerificationReceiptV1 {
  schema: 'atlas.artifact-verification-receipt.v1';
  verificationRevision: typeof ARTIFACT_VERIFICATION_REVISION;
  eventSource: string;
  eventId: string;
  actionKey: string;
  artifactId: string;
  artifactHash: string;
  storage: ArtifactStorage;
  status: ArtifactVerificationStatus;
  gates: Record<ArtifactVerificationGate, boolean | null>;
  expectedChecksum: string;
  actualChecksum: string | null;
  expectedByteLength: number | null;
  actualByteLength: number | null;
  reasonCodes: string[];
  eventCreatesArtifact: false;
  canonicalWritesAllowed: false;
}

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

function baseGates(event: ArtifactMaterializedEventV1): Record<ArtifactVerificationGate, boolean | null> {
  return {
    ACTION_KEY_PRESENT: event.payload.actionKey.trim().length >= 16,
    REVISION_SET_HASH_PRESENT: event.payload.revisionSetHash.trim().length >= 16,
    PRODUCER_REVISION_PRESENT: event.payload.producerRevision.trim().length > 0,
    ARTIFACT_EXISTS: null,
    ARTIFACT_IS_FILE: null,
    BYTE_LENGTH_MATCH: null,
    CHECKSUM_MATCH: null,
  };
}

export async function verifyArtifactMaterialization(
  event: ArtifactMaterializedEventV1,
): Promise<ArtifactVerificationReceiptV1> {
  const gates = baseGates(event);
  const common = {
    schema: 'atlas.artifact-verification-receipt.v1' as const,
    verificationRevision: ARTIFACT_VERIFICATION_REVISION,
    eventSource: event.eventSource,
    eventId: event.eventId,
    actionKey: event.payload.actionKey,
    artifactId: event.payload.artifactId,
    artifactHash: event.payload.artifactHash,
    storage: event.payload.storage,
    expectedChecksum: event.payload.checksum.toLowerCase(),
    expectedByteLength: event.payload.byteLength ?? null,
    eventCreatesArtifact: false as const,
    canonicalWritesAllowed: false as const,
  };

  if (!gates.ACTION_KEY_PRESENT || !gates.REVISION_SET_HASH_PRESENT || !gates.PRODUCER_REVISION_PRESENT) {
    return {
      ...common,
      status: 'FAILED',
      gates,
      actualChecksum: null,
      actualByteLength: null,
      reasonCodes: ['REQUIRED_PROVENANCE_MISSING'],
    };
  }

  if (event.payload.storage !== 'FILESYSTEM' && event.payload.storage !== 'ARROW_MMAP') {
    return {
      ...common,
      status: 'NOT_PROVEN',
      gates,
      actualChecksum: null,
      actualByteLength: null,
      reasonCodes: [`STORAGE_VERIFIER_NOT_IMPLEMENTED:${event.payload.storage}`],
    };
  }

  const path = event.payload.locatorPath;
  if (!path) {
    return {
      ...common,
      status: 'FAILED',
      gates,
      actualChecksum: null,
      actualByteLength: null,
      reasonCodes: ['LOCATOR_PATH_MISSING'],
    };
  }

  let info;
  try {
    info = await stat(path);
    gates.ARTIFACT_EXISTS = true;
  } catch {
    gates.ARTIFACT_EXISTS = false;
    return {
      ...common,
      status: 'FAILED',
      gates,
      actualChecksum: null,
      actualByteLength: null,
      reasonCodes: ['ARTIFACT_NOT_FOUND'],
    };
  }

  gates.ARTIFACT_IS_FILE = info.isFile();
  if (!info.isFile()) {
    return {
      ...common,
      status: 'FAILED',
      gates,
      actualChecksum: null,
      actualByteLength: info.size,
      reasonCodes: ['ARTIFACT_NOT_FILE'],
    };
  }

  gates.BYTE_LENGTH_MATCH = event.payload.byteLength == null || info.size === event.payload.byteLength;
  if (!gates.BYTE_LENGTH_MATCH) {
    return {
      ...common,
      status: 'FAILED',
      gates,
      actualChecksum: null,
      actualByteLength: info.size,
      reasonCodes: ['BYTE_LENGTH_MISMATCH'],
    };
  }

  const actualChecksum = await sha256File(path);
  gates.CHECKSUM_MATCH = actualChecksum === event.payload.checksum.toLowerCase();
  return {
    ...common,
    status: gates.CHECKSUM_MATCH ? 'VERIFIED' : 'FAILED',
    gates,
    actualChecksum,
    actualByteLength: info.size,
    reasonCodes: gates.CHECKSUM_MATCH ? ['ARTIFACT_BYTES_VERIFIED'] : ['CHECKSUM_MISMATCH'],
  };
}

export interface ArtifactFailureProjectionV1 {
  schema: 'atlas.artifact-failure-projection.v1';
  eventSource: string;
  eventId: string;
  actionKey: string;
  operation: string;
  failureClass: ArtifactFailedEventV1['payload']['failureClass'];
  errorHash: string;
  retryable: boolean;
  retryCount: number;
  retryBudget: number;
  reuseDecision: 'RETRY' | 'SELECT_ALTERNATIVE' | 'STOP_RETRY_BUDGET_EXHAUSTED';
  resultReusableAsSuccess: false;
  canonicalWritesAllowed: false;
}

export function projectArtifactFailure(event: ArtifactFailedEventV1): ArtifactFailureProjectionV1 {
  const retryBudgetExhausted = event.payload.retryCount >= event.payload.retryBudget;
  const reuseDecision = !event.payload.retryable
    ? 'SELECT_ALTERNATIVE'
    : retryBudgetExhausted
      ? 'STOP_RETRY_BUDGET_EXHAUSTED'
      : 'RETRY';
  return {
    schema: 'atlas.artifact-failure-projection.v1',
    eventSource: event.eventSource,
    eventId: event.eventId,
    actionKey: event.payload.actionKey,
    operation: event.payload.operation,
    failureClass: event.payload.failureClass,
    errorHash: event.payload.errorHash,
    retryable: event.payload.retryable,
    retryCount: event.payload.retryCount,
    retryBudget: event.payload.retryBudget,
    reuseDecision,
    resultReusableAsSuccess: false,
    canonicalWritesAllowed: false,
  };
}

export class EventReplayGuard {
  readonly #seen = new Set<string>();

  occurrenceKey(event: { eventSource: string; eventId: string }): string {
    return `${event.eventSource}\0${event.eventId}`;
  }

  accept(event: { eventSource: string; eventId: string }): boolean {
    const key = this.occurrenceKey(event);
    if (this.#seen.has(key)) return false;
    this.#seen.add(key);
    return true;
  }

  size(): number {
    return this.#seen.size;
  }
}
