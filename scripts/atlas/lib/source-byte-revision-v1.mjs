import { createHash } from 'node:crypto';

const SOURCE_REVISION_PATTERN = /^sha256:[a-f0-9]{64}$/;

export function isSha256SourceRevisionV1(sourceRevision) {
  return typeof sourceRevision === 'string' && SOURCE_REVISION_PATTERN.test(sourceRevision);
}

export function sourceByteRevisionV1(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('SOURCE_BYTES_REQUIRED');
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export function sourceBytesMatchRevisionV1(bytes, sourceRevision) {
  return isSha256SourceRevisionV1(sourceRevision)
    && sourceByteRevisionV1(bytes) === sourceRevision;
}
