import { createHash } from 'node:crypto';

export const CODE_SOURCE_REVISION_SCHEMA = 'atlas.code.source-revision.v1';

export type CodeSourceRevisionV1 = {
  schema: typeof CODE_SOURCE_REVISION_SCHEMA;
  algorithm: 'sha256';
  sourceRevision: string;
  contentDigest: string;
  byteLength: number;
};

/**
 * Derives a revision from exact UTF-8 source bytes. This is a pure contract;
 * it does not write atlas_packets, AST rows, or projection stores.
 */
export function deriveCodeSourceRevisionV1(source: string): CodeSourceRevisionV1 {
  if (!source) throw new Error('Code source content must be non-empty');
  const bytes = Buffer.from(source, 'utf8');
  const contentDigest = createHash('sha256').update(bytes).digest('hex');
  return {
    schema: CODE_SOURCE_REVISION_SCHEMA,
    algorithm: 'sha256',
    sourceRevision: `sha256:${contentDigest}`,
    contentDigest,
    byteLength: bytes.byteLength,
  };
}
