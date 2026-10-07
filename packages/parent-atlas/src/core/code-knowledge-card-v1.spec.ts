import { describe, expect, it } from 'vitest';
import { compileSymbolEvidenceBundleV1, validateKnowledgeCardV1, type SymbolKnowledgeCardV1 } from './code-knowledge-card-v1';

const sha = 'sha256:' + 'a'.repeat(64);
const card: SymbolKnowledgeCardV1 = {
  schema_version: 'atlas.code-knowledge-card.v1',
  card_kind: 'symbol',
  packet_key: 'packet-test',
  citation: { source_ref: 'src/a.ts', source_revision: sha, workspace_revision: sha, content_hash: sha, start_byte: 0, end_byte: 10 },
  receipt_id: 'receipt-1', predicate_id: 'predicate-1', admitted: true,
  symbol_version_id: 'sv-1', language: 'typescript', symbol_kind: 'function', qualified_name: 'a', signature: 'a()', 
};
describe('Code knowledge card proposal boundary', () => {
  it('keeps valid shaped cards proposal-only', () => {
    expect(validateKnowledgeCardV1(card)).toEqual([]);
    expect(compileSymbolEvidenceBundleV1([card]).status).toBe('PROPOSAL_ONLY');
  });
  it('rejects unqualified revisions and zero-width spans', () => {
    const invalid = { ...card, citation: { ...card.citation, source_revision: 'workspace:0', end_byte: 0 } };
    expect(validateKnowledgeCardV1(invalid)).toContain('PROVENANCE_UNQUALIFIED');
    expect(validateKnowledgeCardV1(invalid)).toContain('SPAN_INVALID');
    expect(compileSymbolEvidenceBundleV1([invalid]).status).toBe('BLOCKED');
  });
  it('rejects cards without admitted predicate receipts', () => {
    expect(compileSymbolEvidenceBundleV1([{ ...card, admitted: false, receipt_id: null }]).cards).toEqual([]);
  });
});
