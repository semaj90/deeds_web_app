import { createHash } from 'node:crypto';

export interface AceCacheIdentity {
  queryHash: string;
  workspaceRevision: string;
  specificationRevision: string;
  retrievalSnapshot: string;
  playbookRevision: string;
  embeddingContract: string;
  tokenizerContract: string;
  generatorContract: string;
}

export function createQueryHash(query: string): string {
  return createHash('sha256')
    .update(String(query ?? '').trim().toLowerCase())
    .digest('hex')
    .slice(0, 16);
}
