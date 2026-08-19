/**
 * Atlas Identity Builders — Canonical Packet Identity Construction
 *
 * Exports deterministic packet identity plus revision-resolution utilities.
 * Canonical source revision comes from the Postgres source/chunk fabric and is
 * deliberately separate from workspace revision, representation revision, and
 * content hash.
 */

export * from './packet-key-builder.js';
export * from './tree-node-id-extractor.js';
export {
  SourceRevisionResolutionStatusSchema,
  SourceRevisionResolveInputV1Schema,
  SourceRevisionEvidenceRowV1Schema,
  SourceRevisionResolutionV1Schema,
  normalizeSourceRevisionEvidenceRow,
  resolveSourceRevisionFromEvidence,
  resolveSourceRevisionsFromPostgres,
} from './source-revision-resolver.js';
export type {
  SourceRevisionResolutionStatus,
  SourceRevisionResolveInputV1,
  SourceRevisionEvidenceRowV1,
  SourceRevisionResolutionV1,
} from './source-revision-resolver.js';
