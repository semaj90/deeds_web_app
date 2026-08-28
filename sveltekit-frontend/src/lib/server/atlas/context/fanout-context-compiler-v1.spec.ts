import { describe, expect, it } from 'vitest';
import { buildFanoutEvidenceBundleV1 } from './fanout-evidence-bundle-v1.js';
import { compileFanoutContextV1 } from './fanout-context-compiler-v1.js';

function bundle() {
  return buildFanoutEvidenceBundleV1({
    schema: 'atlas.fanout-evidence-bundle.v1', workspaceRevision: 'sha256:workspace',
    candidateSnapshotRevision: 'candidate:v1', ordinalMapChecksum: 'sha256:ordinal',
    representationRevisions: { semantic_768: 'semantic:v1' }, edgePolicyRevision: 'edges:v1', maxHopDepth: 1,
    candidates: [{ candidateOrdinal: 0, packetKey: 'packet:a', sourceRef: 'src/a.ts', sourceRevision: 'sha256:source', evidence: [{ evidenceId: 'e1', kind: 'LEXICAL', sourceRef: 'src/a.ts', sourceRevision: 'sha256:source', extractorRevision: 'fts:v1', text: 'alpha', startByte: 0, endByte: 5, confidence: 1 }] }],
    summary: { tokenizerRevision: 'tokenizer:v1', tokenBudget: 10, text: 'alpha', evidenceOrder: ['e1'], checksum: 'sha256:summary' },
    canonicalAuthority: false,
  });
}

describe('FanoutContextCompilerV1', () => {
  it('compiles a bounded deterministic context payload', () => {
    const output = compileFanoutContextV1({ bundle: bundle(), estimatedTokenCount: 2 });
    expect(output.candidateOrdinals).toEqual([0]);
    expect(output.contextManifestChecksum).toMatch(/^sha256:/);
  });

  it('rejects a context that exceeds the bundle budget', () => {
    expect(() => compileFanoutContextV1({ bundle: bundle(), estimatedTokenCount: 11 })).toThrow('FANOUT_TOKEN_BUDGET_EXCEEDED');
  });
});
