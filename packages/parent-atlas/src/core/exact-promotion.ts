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
  /** Optional expected full-file digest. Never substitute a span digest here. */
  expected_file_content_hash: checksum.nullable().default(null),
  /** Optional expected exact selected-span digest. */
  expected_span_content_hash: checksum.nullable().default(null),
  evidence_refs: z.array(id).default([]),
  /** Projection diagnostic only; never accepted as canonical identity. */
  qdrant_point_id: id.nullable().default(null),
}).strict().superRefine((value, ctx) => {
  if (!value.packet_key && !value.symbol_version_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['candidate_id'],
      message: 'exact promotion requires canonical packet_key or symbol_version_id identity; tree_node_id is structural evidence only',
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
  packet_byte_start: z.number().int().nonnegative().nullable(),
  packet_byte_end: z.number().int().nonnegative().nullable(),

  symbol_version_found: z.boolean(),
  symbol_version_source_ref: id.nullable(),
  symbol_version_source_revision: revision.nullable(),
  symbol_version_workspace_revision: revision.nullable(),
  symbol_version_stable_symbol_id: id.nullable(),
  symbol_version_upstream_node_id: id.nullable(),
  symbol_version_byte_start: z.number().int().nonnegative().nullable(),
  symbol_version_byte_end: z.number().int().nonnegative().nullable(),

  ast_node_found: z.boolean(),
  ast_node_source_ref: id.nullable(),
  ast_node_source_revision: revision.nullable(),
  ast_node_content_hash: checksum.nullable(),
  ast_node_byte_start: z.number().int().nonnegative().nullable(),
  ast_node_byte_end: z.number().int().nonnegative().nullable(),

  source_ref_found: z.boolean(),
  source_ref_content_hash: checksum.nullable(),
  source_ref_commit_sha: id.nullable(),
  source_ref_corpus_version: revision.nullable(),

  graphify_source_found: z.boolean(),
  graphify_source_revision: revision.nullable(),
  graphify_workspace_revision: revision.nullable(),
  /** Graphify file-level content digest. */
  graphify_content_hash: checksum.nullable(),

  selected_span_basis: z.enum(['AST_NODE', 'SYMBOL_VERSION', 'PACKET']).nullable(),
  selected_span_start: z.number().int().nonnegative().nullable(),
  selected_span_end: z.number().int().nonnegative().nullable(),
  selected_span_expected_hash: checksum.nullable(),

  source_file_bytes_found: z.boolean(),
  source_file_bytes_sha256: checksum.nullable(),
  source_span_bytes_found: z.boolean(),
  source_span_bytes_sha256: checksum.nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.selected_span_start !== null && value.selected_span_end !== null && value.selected_span_end < value.selected_span_start) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['selected_span_end'], message: 'selected span end must be >= start' });
  }
});
export type ExactPromotionEvidenceFactsV1 = z.infer<typeof exactPromotionEvidenceFactsSchema>;

export const EXACT_PROMOTION_STATUSES = [
  'PROVEN',
  'BLOCKED_REVISION_AUTHORITY',
  'IDENTITY_NOT_FOUND',
  'IDENTITY_MISMATCH',
  'REVISION_MISMATCH',
  'SOURCE_BYTES_UNAVAILABLE',
  'SOURCE_HASH_MISMATCH',
  'SOURCE_SPAN_UNAVAILABLE',
  'SOURCE_SPAN_HASH_MISMATCH',
] as const;

export const exactPromotionChecksSchema = z.object({
  revision_authority_proven: z.boolean(),
  identity_found: z.boolean(),
  canonical_identity_match: z.boolean(),
  source_ref_match: z.boolean(),
  stable_symbol_match: z.boolean(),
  workspace_revision_match: z.boolean(),
  source_revision_match: z.boolean(),
  representation_revision_match: z.boolean(),
  source_file_bytes_present: z.boolean(),
  source_file_hash_match: z.boolean(),
  source_span_selected: z.boolean(),
  source_span_bytes_present: z.boolean(),
  source_span_hash_match: z.boolean(),
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

function allObservedMatch(expected: string, observed: Array<string | null>): boolean {
  const values = observed.filter((value): value is string => value !== null);
  return values.length > 0 && values.every((value) => value === expected);
}

function allHashesMatch(actual: string | null, expected: Array<string | null>): boolean {
  const values = expected.filter((value): value is string => value !== null);
  return actual !== null && values.length > 0 && values.every((value) => value === actual);
}

/** Canonical identity precedence shared with the retrieval fabric. */
function expectedCanonicalId(candidate: ExactPromotionCandidateV1): string {
  return candidate.symbol_version_id ?? candidate.packet_key!;
}

/**
 * Pure promotion decision over already-read facts. Database/filesystem adapters
 * only collect evidence and cannot relax these gates.
 *
 * Full-file freshness and exact-span evidence are deliberately separate. AST and
 * source-ref hashes may describe a symbol/span; Graphify's content hash describes
 * the file. They are never compared as though they were the same byte range.
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
  );
  const canonicalIdentityMatch = candidate.canonical_id === expectedCanonicalId(candidate);

  const sourceRefObservations = [
    candidate.packet_key ? facts.packet_source_ref : null,
    candidate.symbol_version_id ? facts.symbol_version_source_ref : null,
    candidate.tree_node_id ? facts.ast_node_source_ref : null,
  ].filter((value): value is string => value !== null);
  const sourceRefMatch = sourceRefObservations.length > 0
    && sourceRefObservations.every((value) => value === candidate.source_ref);

  const stableSymbolMatch = !candidate.stable_symbol_id
    || (facts.symbol_version_found && facts.symbol_version_stable_symbol_id === candidate.stable_symbol_id);

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

  const representationRevisionMatch = !candidate.packet_key
    || facts.packet_representation_revision === candidate.representation_revision;

  const fileHashMatch = allHashesMatch(facts.source_file_bytes_sha256, [
    candidate.expected_file_content_hash,
    facts.graphify_content_hash,
  ]);

  const spanSelected = facts.selected_span_basis !== null
    && facts.selected_span_start !== null
    && facts.selected_span_end !== null;
  const spanHashMatch = allHashesMatch(facts.source_span_bytes_sha256, [
    candidate.expected_span_content_hash,
    facts.selected_span_expected_hash,
  ]);

  const revisionAuthorityProven = authority.status === 'REVISION_OWNER_PROVEN'
    && authority.workspace_revision_proven
    && authority.source_revision_proven;

  const checks = exactPromotionChecksSchema.parse({
    revision_authority_proven: revisionAuthorityProven,
    identity_found: identityFound,
    canonical_identity_match: canonicalIdentityMatch,
    source_ref_match: sourceRefMatch,
    stable_symbol_match: stableSymbolMatch,
    workspace_revision_match: workspaceRevisionMatch,
    source_revision_match: sourceRevisionMatch,
    representation_revision_match: representationRevisionMatch,
    source_file_bytes_present: facts.source_file_bytes_found,
    source_file_hash_match: fileHashMatch,
    source_span_selected: spanSelected,
    source_span_bytes_present: facts.source_span_bytes_found,
    source_span_hash_match: spanHashMatch,
  });

  const reasonCodes: string[] = [];
  if (!revisionAuthorityProven) reasonCodes.push('REVISION_AUTHORITY_NOT_PROVEN');
  if (!identityFound) reasonCodes.push('IDENTITY_NOT_FOUND');
  if (!canonicalIdentityMatch) reasonCodes.push('CANONICAL_IDENTITY_MISMATCH');
  if (identityFound && (!sourceRefMatch || !stableSymbolMatch)) reasonCodes.push('IDENTITY_EVIDENCE_MISMATCH');
  if (identityFound && !workspaceRevisionMatch) reasonCodes.push('WORKSPACE_REVISION_MISMATCH');
  if (identityFound && !sourceRevisionMatch) reasonCodes.push('SOURCE_REVISION_MISMATCH');
  if (identityFound && !representationRevisionMatch) reasonCodes.push('REPRESENTATION_REVISION_MISMATCH');
  if (!facts.source_file_bytes_found) reasonCodes.push('SOURCE_FILE_BYTES_UNAVAILABLE');
  else if (!fileHashMatch) reasonCodes.push('SOURCE_FILE_HASH_MISMATCH');
  if (!spanSelected || !facts.source_span_bytes_found) reasonCodes.push('SOURCE_SPAN_UNAVAILABLE');
  else if (!spanHashMatch) reasonCodes.push('SOURCE_SPAN_HASH_MISMATCH');

  let status: ExactPromotionReceiptV1['status'];
  if (!revisionAuthorityProven) status = 'BLOCKED_REVISION_AUTHORITY';
  else if (!identityFound) status = 'IDENTITY_NOT_FOUND';
  else if (!canonicalIdentityMatch || !sourceRefMatch || !stableSymbolMatch) status = 'IDENTITY_MISMATCH';
  else if (!workspaceRevisionMatch || !sourceRevisionMatch || !representationRevisionMatch) status = 'REVISION_MISMATCH';
  else if (!facts.source_file_bytes_found) status = 'SOURCE_BYTES_UNAVAILABLE';
  else if (!fileHashMatch) status = 'SOURCE_HASH_MISMATCH';
  else if (!spanSelected || !facts.source_span_bytes_found) status = 'SOURCE_SPAN_UNAVAILABLE';
  else if (!spanHashMatch) status = 'SOURCE_SPAN_HASH_MISMATCH';
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
    canonical_id: candidate.canonical_id,
    workspace_revision: candidate.workspace_revision,
    source_revision: candidate.source_revision,
    representation_revision: candidate.representation_revision,
    proof_checksum: authority.proof_checksum,
    source_file_bytes_sha256: facts.source_file_bytes_sha256,
    source_span_bytes_sha256: facts.source_span_bytes_sha256,
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
