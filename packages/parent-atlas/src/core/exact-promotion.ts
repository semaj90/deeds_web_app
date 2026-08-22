import { createHash } from 'node:crypto';
import { z } from 'zod';

const id = z.string().min(1);
const revision = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const exactPromotionRevisionAuthoritySchema = z.object({
  proof_schema: z.literal('atlas.revision-owner-proof.v1'),
  proof_checksum: checksum,
  status: z.enum([
    'REVISION_OWNER_NOT_PROVEN',
    'WORKSPACE_REVISION_OWNER_PROVEN_SOURCE_REVISION_NOT_PROVEN',
    'SOURCE_REVISION_OWNER_PROVEN_WORKSPACE_REVISION_NOT_PROVEN',
    'REVISION_OWNER_PROVEN',
  ]),
  workspace_revision_proven: z.boolean(),
  source_revision_proven: z.boolean(),
}).strict();
export type ExactPromotionRevisionAuthorityV1 = z.infer<typeof exactPromotionRevisionAuthoritySchema>;

export const exactPromotionCandidateSchema = z.object({
  candidate_id: id,
  candidate_ordinal: z.number().int().nonnegative().nullable().default(null),
  canonical_id: id,
  packet_key: id.nullable().default(null),
  stable_symbol_id: id.nullable().default(null),
  symbol_version_id: id.nullable().default(null),
  tree_node_id: id.nullable().default(null),
  source_ref: id,
  workspace_revision: revision,
  source_revision: revision,
  representation_revision: revision,
  expected_source_content_hash: checksum.nullable().default(null),
  evidence_refs: z.array(id).default([]),
  qdrant_point_id: id.nullable().default(null),
}).strict().superRefine((value, ctx) => {
  if (!value.packet_key && !value.symbol_version_id && !value.tree_node_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['candidate_id'],
      message: 'exact promotion requires packet_key, symbol_version_id, or tree_node_id',
    });
  }
  if (value.qdrant_point_id && !value.packet_key && !value.symbol_version_id && !value.tree_node_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['qdrant_point_id'],
      message: 'qdrant_point_id is diagnostic projection identity and cannot satisfy exact promotion identity',
    });
  }
});
export type ExactPromotionCandidateV1 = z.infer<typeof exactPromotionCandidateSchema>;

export const exactPromotionEvidenceFactsSchema = z.object({
  packet_found: z.boolean(),
  packet_source_ref: id.nullable(),
  packet_workspace_revision: revision.nullable(),
  packet_representation_revision: revision.nullable(),
  packet_sha256: checksum.nullable(),
  packet_tree_node_id: id.nullable(),

  symbol_version_found: z.boolean(),
  symbol_version_source_ref: id.nullable(),
  symbol_version_source_revision: revision.nullable(),
  symbol_version_workspace_revision: revision.nullable(),
  symbol_version_stable_symbol_id: id.nullable(),
  symbol_version_upstream_node_id: id.nullable(),

  ast_node_found: z.boolean(),
  ast_node_source_ref: id.nullable(),
  ast_node_source_revision: revision.nullable(),
  ast_node_content_hash: checksum.nullable(),

  source_ref_found: z.boolean(),
  source_ref_content_hash: checksum.nullable(),
  source_ref_commit_sha: id.nullable(),
  source_ref_corpus_version: revision.nullable(),

  graphify_source_found: z.boolean(),
  graphify_source_revision: revision.nullable(),
  graphify_workspace_revision: revision.nullable(),
  graphify_content_hash: checksum.nullable(),

  source_bytes_found: z.boolean(),
  source_bytes_sha256: checksum.nullable(),
}).strict();
export type ExactPromotionEvidenceFactsV1 = z.infer<typeof exactPromotionEvidenceFactsSchema>;

export const EXACT_PROMOTION_STATUSES = [
  'PROVEN',
  'BLOCKED_REVISION_AUTHORITY',
  'IDENTITY_NOT_FOUND',
  'IDENTITY_MISMATCH',
  'REVISION_MISMATCH',
  'SOURCE_BYTES_UNAVAILABLE',
  'SOURCE_HASH_MISMATCH',
] as const;

export const exactPromotionChecksSchema = z.object({
  revision_authority_proven: z.boolean(),
  identity_found: z.boolean(),
  source_ref_match: z.boolean(),
  workspace_revision_match: z.boolean(),
  source_revision_match: z.boolean(),
  representation_revision_match: z.boolean(),
  source_bytes_present: z.boolean(),
  source_hash_match: z.boolean(),
}).strict();

export const exactPromotionReceiptSchema = z.object({
  schema: z.literal('atlas.exact-promotion-receipt.v1').default('atlas.exact-promotion-receipt.v1'),
  receipt_id: id,
  request_id: id,
  candidate: exactPromotionCandidateSchema,
  revision_authority: exactPromotionRevisionAuthoritySchema,
  facts: exactPromotionEvidenceFactsSchema,
  checks: exactPromotionChecksSchema,
  status: z.enum(EXACT_PROMOTION_STATUSES),
  reason_codes: z.array(id),
  evidence_refs: z.array(id),
  read_only: z.literal(true).default(true),
  canonical_authority: z.literal(false).default(false),
  mutation_authorized: z.literal(false).default(false),
  producer_revision: revision,
  receipt_checksum: checksum,
}).strict();
export type ExactPromotionReceiptV1 = z.infer<typeof exactPromotionReceiptSchema>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

function normalizeDigest(value: string | null): string | null {
  return value?.replace(/^sha256:/, '').toLowerCase() ?? null;
}

function sameRevision(expected: string, observed: string | null): boolean {
  return observed !== null && expected === observed;
}

function allObservedMatch(expected: string, observed: Array<string | null>): boolean {
  const values = observed.filter((value): value is string => value !== null);
  return values.length > 0 && values.every((value) => value === expected);
}

/**
 * Pure promotion decision over already-read facts. This is the canonical policy
 * owner; Postgres/filesystem adapters only collect facts and cannot relax it.
 */
export function buildExactPromotionReceipt(input: {
  request_id: string;
  candidate: ExactPromotionCandidateV1;
  revision_authority: ExactPromotionRevisionAuthorityV1;
  facts: ExactPromotionEvidenceFactsV1;
  producer_revision: string;
}): ExactPromotionReceiptV1 {
  const candidate = exactPromotionCandidateSchema.parse(input.candidate);
  const authority = exactPromotionRevisionAuthoritySchema.parse(input.revision_authority);
  const facts = exactPromotionEvidenceFactsSchema.parse(input.facts);

  const identityFound = Boolean(
    (candidate.packet_key && facts.packet_found)
    || (candidate.symbol_version_id && facts.symbol_version_found)
    || (candidate.tree_node_id && facts.ast_node_found)
  );

  const sourceRefObservations = [
    candidate.packet_key ? facts.packet_source_ref : null,
    candidate.symbol_version_id ? facts.symbol_version_source_ref : null,
    candidate.tree_node_id ? facts.ast_node_source_ref : null,
  ].filter((value): value is string => value !== null);
  const sourceRefMatch = sourceRefObservations.length > 0
    && sourceRefObservations.every((value) => value === candidate.source_ref);

  const workspaceRevisionMatch = allObservedMatch(candidate.workspace_revision, [
    candidate.packet_key ? facts.packet_workspace_revision : null,
    candidate.symbol_version_id ? facts.symbol_version_workspace_revision : null,
    facts.graphify_source_found ? facts.graphify_workspace_revision : null,
  ]);

  const sourceRevisionMatch = allObservedMatch(candidate.source_revision, [
    candidate.symbol_version_id ? facts.symbol_version_source_revision : null,
    candidate.tree_node_id ? facts.ast_node_source_revision : null,
    facts.graphify_source_found ? facts.graphify_source_revision : null,
  ]);

  const representationRevisionMatch = candidate.packet_key
    ? sameRevision(candidate.representation_revision, facts.packet_representation_revision)
    : true;

  const expectedHashes = [
    candidate.expected_source_content_hash,
    facts.source_ref_content_hash,
    facts.graphify_content_hash,
  ].map(normalizeDigest).filter((value): value is string => value !== null);
  const actualSourceHash = normalizeDigest(facts.source_bytes_sha256);
  const sourceHashMatch = Boolean(
    facts.source_bytes_found
    && actualSourceHash
    && expectedHashes.length > 0
    && expectedHashes.every((value) => value === actualSourceHash)
  );

  const revisionAuthorityProven = authority.status === 'REVISION_OWNER_PROVEN'
    && authority.workspace_revision_proven
    && authority.source_revision_proven;

  const checks = exactPromotionChecksSchema.parse({
    revision_authority_proven: revisionAuthorityProven,
    identity_found: identityFound,
    source_ref_match: sourceRefMatch,
    workspace_revision_match: workspaceRevisionMatch,
    source_revision_match: sourceRevisionMatch,
    representation_revision_match: representationRevisionMatch,
    source_bytes_present: facts.source_bytes_found,
    source_hash_match: sourceHashMatch,
  });

  const reasonCodes: string[] = [];
  if (!revisionAuthorityProven) reasonCodes.push('REVISION_AUTHORITY_NOT_PROVEN');
  if (!identityFound) reasonCodes.push('IDENTITY_NOT_FOUND');
  if (identityFound && !sourceRefMatch) reasonCodes.push('SOURCE_REF_MISMATCH');
  if (identityFound && !workspaceRevisionMatch) reasonCodes.push('WORKSPACE_REVISION_MISMATCH');
  if (identityFound && !sourceRevisionMatch) reasonCodes.push('SOURCE_REVISION_MISMATCH');
  if (identityFound && !representationRevisionMatch) reasonCodes.push('REPRESENTATION_REVISION_MISMATCH');
  if (!facts.source_bytes_found) reasonCodes.push('SOURCE_BYTES_UNAVAILABLE');
  else if (!sourceHashMatch) reasonCodes.push('SOURCE_HASH_MISMATCH');

  let status: ExactPromotionReceiptV1['status'];
  if (!revisionAuthorityProven) status = 'BLOCKED_REVISION_AUTHORITY';
  else if (!identityFound) status = 'IDENTITY_NOT_FOUND';
  else if (!sourceRefMatch) status = 'IDENTITY_MISMATCH';
  else if (!workspaceRevisionMatch || !sourceRevisionMatch || !representationRevisionMatch) status = 'REVISION_MISMATCH';
  else if (!facts.source_bytes_found) status = 'SOURCE_BYTES_UNAVAILABLE';
  else if (!sourceHashMatch) status = 'SOURCE_HASH_MISMATCH';
  else status = 'PROVEN';

  const evidenceRefs = [...new Set([
    ...candidate.evidence_refs,
    `revision-proof:${authority.proof_checksum}`,
    candidate.packet_key ? `atlas-packet:${candidate.packet_key}` : null,
    candidate.symbol_version_id ? `symbol-version:${candidate.symbol_version_id}` : null,
    candidate.tree_node_id ? `ast-node:${candidate.tree_node_id}` : null,
    `source-ref:${candidate.source_ref}`,
  ].filter((value): value is string => Boolean(value)))].sort();

  const receiptId = `exact-promotion:${sha256({
    request_id: input.request_id,
    candidate_id: candidate.candidate_id,
    workspace_revision: candidate.workspace_revision,
    source_revision: candidate.source_revision,
    representation_revision: candidate.representation_revision,
    proof_checksum: authority.proof_checksum,
    source_bytes_sha256: facts.source_bytes_sha256,
  }).slice(0, 40)}`;

  const payload = {
    schema: 'atlas.exact-promotion-receipt.v1' as const,
    receipt_id: receiptId,
    request_id: input.request_id,
    candidate,
    revision_authority: authority,
    facts,
    checks,
    status,
    reason_codes: [...new Set(reasonCodes)].sort(),
    evidence_refs: evidenceRefs,
    read_only: true as const,
    canonical_authority: false as const,
    mutation_authorized: false as const,
    producer_revision: input.producer_revision,
  };

  return exactPromotionReceiptSchema.parse({
    ...payload,
    receipt_checksum: sha256(payload),
  });
}
