export const ARTIFACT_REFERENCE_TASK_ENVELOPE_LIMIT_BYTES = 64 * 1024;

export type ArtifactEnvelopeSizeStats = {
  checked: number;
  accepted: number;
  rejected: number;
  largestBytes: number;
  lastRejectedBytes: number | null;
};

const stats: ArtifactEnvelopeSizeStats = {
  checked: 0,
  accepted: 0,
  rejected: 0,
  largestBytes: 0,
  lastRejectedBytes: null,
};

export class ArtifactEnvelopeTooLargeError extends Error {
  readonly code = 'ARTIFACT_ENVELOPE_TOO_LARGE' as const;

  constructor(
    readonly actualBytes: number,
    readonly limitBytes: number,
  ) {
    super(
      `Artifact task envelope is ${actualBytes} bytes; policy limit is ${limitBytes} bytes. ` +
      'Materialize large vectors/tensors/source bodies and send ArtifactAddressV1 references instead.',
    );
    this.name = 'ArtifactEnvelopeTooLargeError';
  }
}

export function measureJsonMessageBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

export function assertArtifactReferenceEnvelopeSize(
  value: unknown,
  limitBytes = ARTIFACT_REFERENCE_TASK_ENVELOPE_LIMIT_BYTES,
): number {
  const bytes = measureJsonMessageBytes(value);
  stats.checked += 1;
  stats.largestBytes = Math.max(stats.largestBytes, bytes);

  if (bytes > limitBytes) {
    stats.rejected += 1;
    stats.lastRejectedBytes = bytes;
    throw new ArtifactEnvelopeTooLargeError(bytes, limitBytes);
  }

  stats.accepted += 1;
  return bytes;
}

export function getArtifactEnvelopeSizeStats(): Readonly<ArtifactEnvelopeSizeStats> {
  return { ...stats };
}

export function resetArtifactEnvelopeSizeStatsForTest(): void {
  stats.checked = 0;
  stats.accepted = 0;
  stats.rejected = 0;
  stats.largestBytes = 0;
  stats.lastRejectedBytes = null;
}
