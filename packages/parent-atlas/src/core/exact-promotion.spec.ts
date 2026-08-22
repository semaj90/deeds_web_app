import { describe, expect, it } from 'vitest';
import {
  buildExactPromotionReceipt,
  exactPromotionCandidateSchema,
  type ExactPromotionEvidenceFactsV1,
  type ExactPromotionRevisionAuthorityV1,
} from './exact-promotion.js';

const FILE_HASH = 'a'.repeat(64);
const SPAN_HASH = 'b'.repeat(64);
const OTHER_HASH = 'c'.repeat(64);
const PROOF_HASH = 'd'.repeat(64);

const authority: ExactPromotionRevisionAuthorityV1 = {
  proof_schema: 'atlas.revision-owner-proof.v1',
  proof_checksum: PROOF_HASH,
  status: 'REVISION_OWNER_PROVEN',
  workspace_revision_proven: true,
  source_revision_proven: true,
};

const candidate = {
  candidate_id: 'candidate:1',
  candidate_ordinal: 7,
  canonical_id: 'symbol:stable-1',
  packet_key: 'packet:1',
  stable_symbol_id: 'symbol:stable-1',
  symbol_version_id: 'symbol-version:1',
  tree_node_id: 'tree:1',
  source_ref: 'src/example.ts',
  workspace_revision: 'W1',
  source_revision: 'S1',
  representation_revision: '1',
  expected_file_content_hash: FILE_HASH,
  expected_span_content_hash: SPAN_HASH,
  evidence_refs: ['retrieval:1'],
  qdrant_point_id: 'qdrant:diagnostic-only',
} as const;

function matchingFacts(): ExactPromotionEvidenceFactsV1 {
  return {
    packet_found: true,
    packet_source_ref: 'src/example.ts',
    packet_workspace_revision: 'W1',
    packet_representation_revision: '1',
    packet_sha256: SPAN_HASH,
    packet_tree_node_id: 'tree:1',
    packet_byte_start: 10,
    packet_byte_end: 30,

    symbol_version_found: true,
    symbol_version_source_ref: 'src/example.ts',
    symbol_version_source_revision: 'S1',
    symbol_version_workspace_revision: 'W1',
    symbol_version_stable_symbol_id: 'symbol:stable-1',
    symbol_version_upstream_node_id: 'tree:1',
    symbol_version_byte_start: 10,
    symbol_version_byte_end: 30,

    ast_node_found: true,
    ast_node_source_ref: 'src/example.ts',
    ast_node_source_revision: 'S1',
    ast_node_content_hash: SPAN_HASH,
    ast_node_byte_start: 10,
    ast_node_byte_end: 30,

    source_ref_found: true,
    // This may be a source-ref/span digest. It is intentionally NOT compared
    // to the full-file digest below.
    source_ref_content_hash: OTHER_HASH,
    source_ref_commit_sha: 'git:abc123',
    source_ref_corpus_version: 'corpus:1',

    graphify_source_found: true,
    graphify_source_revision: 'S1',
    graphify_workspace_revision: 'W1',
    graphify_content_hash: FILE_HASH,

    selected_span_basis: 'AST_NODE',
    selected_span_start: 10,
    selected_span_end: 30,
    selected_span_expected_hash: SPAN_HASH,

    source_file_bytes_found: true,
    source_file_bytes_sha256: FILE_HASH,
    source_span_bytes_found: true,
    source_span_bytes_sha256: SPAN_HASH,
  };
}

describe('ExactPromotionReceiptV1', () => {
  it('proves revision-qualified file + exact-span evidence without authorizing mutation', () => {
    const receipt = buildExactPromotionReceipt({
      request_id: 'request:1', candidate, revision_authority: authority,
      facts: matchingFacts(), producer_revision: 'exact-promotion:test:v1',
    });
    expect(receipt.status).toBe('PROVEN');
    expect(receipt.checks.source_file_hash_match).toBe(true);
    expect(receipt.checks.source_span_hash_match).toBe(true);
    expect(receipt.mutation_authorized).toBe(false);
    expect(receipt.canonical_authority).toBe(false);
    expect(receipt.receipt_checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('does not compare a span-level source-ref hash to the full-file digest', () => {
    const facts = matchingFacts();
    facts.source_ref_content_hash = OTHER_HASH;
    const receipt = buildExactPromotionReceipt({
      request_id: 'request:2', candidate, revision_authority: authority,
      facts, producer_revision: 'exact-promotion:test:v1',
    });
    expect(receipt.status).toBe('PROVEN');
  });

  it('fails closed while revision authority remains unproven', () => {
    const receipt = buildExactPromotionReceipt({
      request_id: 'request:3', candidate,
      revision_authority: {
        ...authority,
        status: 'REVISION_OWNER_NOT_PROVEN',
        workspace_revision_proven: false,
        source_revision_proven: false,
      },
      facts: matchingFacts(),
      producer_revision: 'exact-promotion:test:v1',
    });
    expect(receipt.status).toBe('BLOCKED_REVISION_AUTHORITY');
    expect(receipt.reason_codes).toContain('REVISION_AUTHORITY_NOT_PROVEN');
  });

  it('rejects a mismatched exact span even when the full file is current', () => {
    const facts = matchingFacts();
    facts.source_span_bytes_sha256 = OTHER_HASH;
    const receipt = buildExactPromotionReceipt({
      request_id: 'request:4', candidate, revision_authority: authority,
      facts, producer_revision: 'exact-promotion:test:v1',
    });
    expect(receipt.status).toBe('SOURCE_SPAN_HASH_MISMATCH');
    expect(receipt.checks.source_file_hash_match).toBe(true);
    expect(receipt.checks.source_span_hash_match).toBe(false);
  });

  it('rejects source revision drift', () => {
    const facts = matchingFacts();
    facts.symbol_version_source_revision = 'S2';
    const receipt = buildExactPromotionReceipt({
      request_id: 'request:5', candidate, revision_authority: authority,
      facts, producer_revision: 'exact-promotion:test:v1',
    });
    expect(receipt.status).toBe('REVISION_MISMATCH');
    expect(receipt.reason_codes).toContain('SOURCE_REVISION_MISMATCH');
  });

  it('does not allow a Qdrant point id to be the only identity', () => {
    expect(() => exactPromotionCandidateSchema.parse({
      ...candidate,
      packet_key: null,
      symbol_version_id: null,
      tree_node_id: null,
      qdrant_point_id: 'qdrant:42',
    })).toThrow(/requires packet_key, symbol_version_id, or tree_node_id/);
  });
});
