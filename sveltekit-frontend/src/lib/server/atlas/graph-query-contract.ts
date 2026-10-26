/**
 * graph-query-contract.ts
 *
 * Consolidated Typed Contract for the Unified Graph Query Boundary (`atlas.graph.query`).
 *
 * Connects the 4 Execution Tiers:
 *  1. Client Layer (Antigravity IDE / VS Code / MCP)
 *  2. MCP Boundary (`atlas.graph.query` dispatcher)
 *  3. Computation & Extraction Engines (Tree-sitter, OAKLIB, cuGraph CSR SpMV, PyTorch ATen)
 *  4. Single Fusion Owner & Canonical Store (SearchRuntime RRF, ContextManifestV2, PostgreSQL 18)
 *
 * Invariants:
 *  - topK is bounded (1..100, default 20)
 *  - maxHops is bounded (0..4, default 2)
 *  - Snapshot revisions must match; no silent querying of older projections
 *  - Zero canonical mutations (`writesPerformed: false`)
 */

import { z } from 'zod';

export const graphQueryOperationSchema = z.enum([
  'topk',
  'neighbors',
  'paths',
  'ontology',
]);
export type GraphQueryOperation = z.infer<typeof graphQueryOperationSchema>;

export const graphQuerySchema = z
  .object({
    operation: graphQueryOperationSchema,
    query: z.string().trim().min(1).max(4096),
    topK: z.number().int().min(1).max(100).default(20),
    maxHops: z.number().int().min(0).max(4).default(2),
    predicates: z
      .array(z.string().trim().min(1).max(128))
      .max(16)
      .default([]),
    source: z.enum(['canonical', 'ontology']).default('canonical'),
    workspaceRevision: z.string().min(1),
    graphRevision: z.string().min(1),
    ontologyRevision: z.string().optional(),
    requestId: z.string().uuid(),
  })
  .strict();

export type GraphQuery = z.infer<typeof graphQuerySchema>;

export const ontologyLinkedTupleSchema = z
  .object({
    subject: z.string().min(1),
    predicate: z.string().min(1),
    object: z.string().min(1),
    subjectPacketKey: z.string().optional(),
    objectPacketKey: z.string().optional(),
    evidenceRefs: z.array(z.string().min(1)),
    provenance: z
      .object({
        source: z.enum(['oaklib', 'graphify', 'neo4j']),
        workspaceRevision: z.string().min(1),
        graphRevision: z.string().min(1),
        ontologyRevision: z.string().optional(),
        asserted: z.boolean(),
        relationKind: z.enum(['direct', 'ancestor', 'entailed', 'synthetic']).default('direct'),
      })
      .strict(),
  })
  .strict();

export type OntologyLinkedTuple = z.infer<typeof ontologyLinkedTupleSchema>;

export const rankedGraphCandidateSchema = z
  .object({
    canonicalId: z.string().min(1),
    packetKey: z.string().min(1),
    score: z.number(),
    rank: z.number().int().nonnegative(),
    tuples: z.array(ontologyLinkedTupleSchema),
    evidenceRefs: z.array(z.string().min(1)),
  })
  .strict();

export type RankedGraphCandidate = z.infer<typeof rankedGraphCandidateSchema>;

export const graphQueryResultSchema = z
  .object({
    schema: z.literal('atlas.graph-query-result.v1'),
    requestId: z.string().uuid(),
    operation: graphQueryOperationSchema,
    workspaceRevision: z.string().min(1),
    graphRevision: z.string().min(1),
    ontologyRevision: z.string().optional(),
    candidates: z.array(rankedGraphCandidateSchema),
    totalCandidates: z.number().int().nonnegative(),
    durationMs: z.number().nonnegative(),
    writesPerformed: z.literal(false),
    kvCachePersisted: z.literal(false),
  })
  .strict();

export type GraphQueryResult = z.infer<typeof graphQueryResultSchema>;
