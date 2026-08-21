import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

import type {
  ArtifactFailedEventV1,
  ArtifactMaterializedEventV1,
} from './event-fabric.js';

export type ArtifactVerificationFailureReason =
  | 'ARTIFACT_NOT_FOUND'
  | 'NOT_REGULAR_FILE'
  | 'BYTE_LENGTH_MISMATCH'
  | 'CHECKSUM_MISMATCH'
  | 'LOCATOR_PATH_MISSING'
  | 'STORAGE_VERIFIER_UNAVAILABLE';

export type ArtifactVerificationResultV1 =
  | {
      status: 'PROVEN';
      byteLength: number;
      checksum: string;
    }
  | {
      status: 'REJECTED';
      reason: ArtifactVerificationFailureReason;
      actualByteLength?: number;
      actualChecksum?: string;
    };

export type ExecutionReuseDecisionV1 =
  | 'RETRY'
  | 'SELECT_ALTERNATIVE'
  | 'REEXECUTE';

export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  const stream = createReadStream(path);

  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }

  return hash.digest('hex');
}

export async function verifyMaterializedArtifact(
  event: ArtifactMaterializedEventV1,
): Promise<ArtifactVerificationResultV1> {
  const { payload } = event;

  if (payload.storage !== 'MMAP' && payload.storage !== 'ARROW_IPC') {
    return {
      status: 'REJECTED',
      reason: 'STORAGE_VERIFIER_UNAVAILABLE',
    };
  }

  if (!payload.locatorPath) {
    return {
      status: 'REJECTED',
      reason: 'LOCATOR_PATH_MISSING',
    };
  }

  let info;
  try {
    info = await stat(payload.locatorPath);
  } catch {
    return {
      status: 'REJECTED',
      reason: 'ARTIFACT_NOT_FOUND',
    };
  }

  if (!info.isFile()) {
    return {
      status: 'REJECTED',
      reason: 'NOT_REGULAR_FILE',
      actualByteLength: info.size,
    };
  }

  if (payload.byteLength !== undefined && info.size !== payload.byteLength) {
    return {
      status: 'REJECTED',
      reason: 'BYTE_LENGTH_MISMATCH',
      actualByteLength: info.size,
    };
  }

  const actualChecksum = await sha256File(payload.locatorPath);
  if (actualChecksum !== payload.checksum) {
    return {
      status: 'REJECTED',
      reason: 'CHECKSUM_MISMATCH',
      actualByteLength: info.size,
      actualChecksum,
    };
  }

  return {
    status: 'PROVEN',
    byteLength: info.size,
    checksum: actualChecksum,
  };
}

export async function verifyArtifactMaterializedEvent(
  event: ArtifactMaterializedEventV1,
): Promise<void> {
  const result = await verifyMaterializedArtifact(event);
  if (result.status !== 'PROVEN') {
    throw new Error(
      `Artifact materialization verification failed for ${event.payload.artifactId}: ${result.reason}`,
    );
  }
}

/**
 * Pure projection only. Persistence belongs to the canonical action/procedural
 * memory owner; the queue must not create a second action registry.
 */
export function deriveArtifactFailureDecision(
  event: ArtifactFailedEventV1,
): ExecutionReuseDecisionV1 {
  const { payload } = event;

  if (!payload.retryable) {
    return 'SELECT_ALTERNATIVE';
  }

  if (payload.retryCount < payload.retryBudget) {
    return 'RETRY';
  }

  return 'SELECT_ALTERNATIVE';
}

/**
 * Bounded process-local replay guard. This prevents duplicate projection and
 * analytics effects within a worker lifetime. Restart-safe idempotency still
 * requires the durable projection owner to persist consumed event IDs.
 */
export class EventReplayGuard {
  readonly #seen = new Set<string>();
  readonly #order: string[] = [];

  constructor(private readonly maxEntries = 10_000) {
    if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
      throw new Error('maxEntries must be a positive integer');
    }
  }

  has(eventId: string): boolean {
    return this.#seen.has(eventId);
  }

  mark(eventId: string): void {
    if (this.#seen.has(eventId)) return;

    this.#seen.add(eventId);
    this.#order.push(eventId);

    while (this.#order.length > this.maxEntries) {
      const evicted = this.#order.shift();
      if (evicted) this.#seen.delete(evicted);
    }
  }
}
