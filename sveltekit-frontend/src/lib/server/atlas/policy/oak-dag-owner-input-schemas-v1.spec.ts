import { describe, expect, it } from 'vitest';
import {
  oakDagAstScanInputSchema,
  oakDagGraphExpandInputSchema,
  oakDagPostgresInputSchema,
  oakDagQdrantSearchInputSchema,
} from './oak-dag-owner-input-schemas-v1.js';

describe('OaK DAG owner input schemas', () => {
  it('accepts revision-qualified AST, graph, Postgres, and 768-D search inputs', () => {
    expect(oakDagAstScanInputSchema.safeParse({ sourceRef: 'src/a.ts', sourceRevision: 'sha256:a', language: 'typescript', source: 'const a = 1;' }).success).toBe(true);
    expect(oakDagGraphExpandInputSchema.safeParse({ packetKey: 'packet:a', maxHops: 2, graphRevision: 'graph:v1', workspaceRevision: 'workspace:v1', graphOrdinalMapChecksum: 'a'.repeat(64) }).success).toBe(true);
    expect(oakDagPostgresInputSchema.safeParse({ canonicalIds: ['packet:a'] }).success).toBe(true);
    expect(oakDagQdrantSearchInputSchema.safeParse({ embedding: Array.from({ length: 768 }, () => 0.1) }).success).toBe(true);
  });

  it('rejects missing graph lineage and non-768 embeddings', () => {
    expect(oakDagGraphExpandInputSchema.safeParse({ packetKey: 'packet:a', maxHops: 2 }).success).toBe(false);
    expect(oakDagQdrantSearchInputSchema.safeParse({ embedding: [0.1] }).success).toBe(false);
  });
});
