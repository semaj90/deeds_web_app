import { createHash } from 'node:crypto';

/**
 * GraphifyInputIdentityV1 (atlas.graphify-input-identity.v1) — identity of the requested logical Graphify computation.
 * Same identity => same logical input; it is NOT proof that a derived output is valid or reusable.
 * Property order below is part of the contract: reordering changes every hash (pinned by graphify-input-identity.spec.ts).
 */
export const GRAPHIFY_INPUT_IDENTITY_SCHEMA = 'atlas.graphify-input-identity.v1';

export interface SourceSelectionEntry {
  /** repository_id + ':' + repository_relative_path (NOT source_ref). */
  sourceIdentityKey: string;
  /** code_source_revision, 'sha256:<64 hex>'. */
  sourceRevision: string;
  byteLength: number;
}

export interface GraphifyInputIdentityInput {
  workspaceId: string;
  workspaceRevision: string;
  sourceSelectionChecksum: string;
  parserContractVersion: string;
  extractionContractVersion: string;
  graphAlgorithmRevision: string;
}

const sha256Prefixed = (text: string) => `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;

/** Content-bearing selection checksum; entries sorted by UTF-8 BYTE order of sourceIdentityKey (not UTF-16 sort). */
export function sourceSelectionChecksumV1(entries: readonly SourceSelectionEntry[]): string {
  const sorted = entries
    .map((e) => ({ sourceIdentityKey: e.sourceIdentityKey, sourceRevision: e.sourceRevision, byteLength: Number(e.byteLength) }))
    .sort((a, b) => Buffer.compare(Buffer.from(a.sourceIdentityKey, 'utf8'), Buffer.from(b.sourceIdentityKey, 'utf8')));
  return sha256Prefixed(JSON.stringify(sorted));
}

export function canonicalGraphifyInputIdentityPayloadV1(p: GraphifyInputIdentityInput): string {
  return JSON.stringify({
    schema: GRAPHIFY_INPUT_IDENTITY_SCHEMA,
    workspaceId: p.workspaceId,
    workspaceRevision: p.workspaceRevision,
    sourceSelectionChecksum: p.sourceSelectionChecksum,
    parserContractVersion: p.parserContractVersion,
    extractionContractVersion: p.extractionContractVersion,
    graphAlgorithmRevision: p.graphAlgorithmRevision,
  });
}

export const graphifyInputIdentityV1 = (p: GraphifyInputIdentityInput): string => sha256Prefixed(canonicalGraphifyInputIdentityPayloadV1(p));
