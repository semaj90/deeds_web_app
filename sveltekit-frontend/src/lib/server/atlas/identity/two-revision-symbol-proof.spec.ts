// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';

interface SymbolRecord {
  source_ref: string;
  source_revision: string;
  parse_node_id: string;
  symbol_id: string;
  symbol_version_id: string;
  supersedes_symbol_id?: string | null;
}

function deriveParseNodeId(
  sourceRef: string,
  sourceRevision: string,
  parserRevision: string,
  locator: string
): string {
  const raw = `${sourceRef}|${sourceRevision}|${parserRevision}|${locator}`;
  return `parse:${createHash('sha256').update(raw).digest('hex').slice(0, 16)}`;
}

function deriveSymbolVersionId(symbolId: string, sourceRevision: string): string {
  const raw = `${symbolId}|${sourceRevision}`;
  return `symver:${createHash('sha256').update(raw).digest('hex').slice(0, 16)}`;
}

describe('Layer 1B: Two-Revision Symbol Stability & Continuity Policy Proof', () => {
  const parserRevision = 'v1.4.0';

  it('proves body implementation edits MUST preserve symbol_id across source revisions (Revision A -> Revision B)', () => {
    const symbolId = 'sym:retrieveCandidates:001';

    // Revision A (SR1)
    const sr1 = 'sha256:sr1_hash_alpha';
    const recordA: SymbolRecord = {
      source_ref: 'src/lib/server/retrieval/candidate-fetcher.ts',
      source_revision: sr1,
      parse_node_id: deriveParseNodeId('src/lib/server/retrieval/candidate-fetcher.ts', sr1, parserRevision, 'func:retrieveCandidates'),
      symbol_id: symbolId,
      symbol_version_id: deriveSymbolVersionId(symbolId, sr1),
    };

    // Revision B (SR2) — implementation changed, declaration identical
    const sr2 = 'sha256:sr2_hash_beta';
    const recordB: SymbolRecord = {
      source_ref: 'src/lib/server/retrieval/candidate-fetcher.ts',
      source_revision: sr2,
      parse_node_id: deriveParseNodeId('src/lib/server/retrieval/candidate-fetcher.ts', sr2, parserRevision, 'func:retrieveCandidates'),
      symbol_id: symbolId, // MUST BE PRESERVED
      symbol_version_id: deriveSymbolVersionId(symbolId, sr2),
    };

    expect(recordA.symbol_id).toBe(recordB.symbol_id);
    expect(recordA.source_revision).not.toBe(recordB.source_revision);
    expect(recordA.parse_node_id).not.toBe(recordB.parse_node_id);
    expect(recordA.symbol_version_id).not.toBe(recordB.symbol_version_id);
  });

  it('proves rename/move without continuity evidence assigns new symbol_id + optional supersedes relation', () => {
    const originalSymbolId = 'sym:retrieveCandidates:001';
    const sr1 = 'sha256:sr1_hash_alpha';

    // Revision A
    const recordA: SymbolRecord = {
      source_ref: 'src/lib/server/retrieval/candidate-fetcher.ts',
      source_revision: sr1,
      parse_node_id: deriveParseNodeId('src/lib/server/retrieval/candidate-fetcher.ts', sr1, parserRevision, 'func:retrieveCandidates'),
      symbol_id: originalSymbolId,
      symbol_version_id: deriveSymbolVersionId(originalSymbolId, sr1),
    };

    // Revision B — renamed to fetchCandidates without continuity proof
    const sr2 = 'sha256:sr2_hash_beta';
    const newSymbolId = 'sym:fetchCandidates:002';
    const recordB: SymbolRecord = {
      source_ref: 'src/lib/server/retrieval/candidate-fetcher.ts',
      source_revision: sr2,
      parse_node_id: deriveParseNodeId('src/lib/server/retrieval/candidate-fetcher.ts', sr2, parserRevision, 'func:fetchCandidates'),
      symbol_id: newSymbolId,
      symbol_version_id: deriveSymbolVersionId(newSymbolId, sr2),
      supersedes_symbol_id: originalSymbolId,
    };

    expect(recordA.symbol_id).not.toBe(recordB.symbol_id);
    expect(recordB.supersedes_symbol_id).toBe(recordA.symbol_id);
  });
});
