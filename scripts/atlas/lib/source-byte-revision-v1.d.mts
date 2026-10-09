export function isSha256SourceRevisionV1(sourceRevision: unknown): sourceRevision is string;

export function sourceByteRevisionV1(bytes: Uint8Array): string;

export function sourceBytesMatchRevisionV1(bytes: Uint8Array, sourceRevision: unknown): boolean;
