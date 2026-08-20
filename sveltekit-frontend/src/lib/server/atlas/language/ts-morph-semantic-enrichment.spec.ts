import { describe, expect, it } from 'vitest';
import { extractAstGrepStructuralCandidates } from './ast-grep-structural-topk.js';
import { enrichAstCandidateWithTsMorph } from './ts-morph-semantic-enrichment.js';

async function candidateFor(code: string, name: string) {
  const candidates = await extractAstGrepStructuralCandidates({
    schema: 'atlas.ast-grep-structural-extraction-input.v1',
    code,
    filePath: '/workspace/example.ts',
    sourceRef: 'src:example.ts',
    language: 'TYPESCRIPT',
    workspaceRevision: 'ws-1',
    sourceRevision: 'src-1',
    producerRevision: 'ast-test',
  });
  const candidate = candidates.find((row) => row.name === name);
  if (!candidate) throw new Error(`candidate not found: ${name}`);
  return candidate;
}

describe('ts-morph semantic enrichment bridge', () => {
  it('enriches a structural function candidate with compiler type and return type', async () => {
    const code = `
      export function scoreCandidate(value: number): number {
        return value + 1;
      }

      const next = scoreCandidate(4);
    `;
    const candidate = await candidateFor(code, 'scoreCandidate');
    const result = enrichAstCandidateWithTsMorph({
      schema: 'atlas.ts-morph-semantic-enrichment-input.v1',
      candidate,
      code,
      filePath: '/workspace/example.ts',
      tsConfigFilePath: null,
      semanticEngineRevision: 'ts-morph-27-test',
      producerRevision: 'semantic-test',
    });

    expect(result.matchedIdentifier.text).toBe('scoreCandidate');
    expect(result.returnTypeText).toContain('number');
    expect(result.referenceCount).toBeGreaterThanOrEqual(1);
    expect(result.semanticEvidence.engine).toBe('TS_MORPH');
    expect(result.semanticEvidence.authority).toBe('COMPILER_SEMANTIC_OBSERVATION');
    expect(result.semanticEvidence.relationKind).toBe('TYPE_OF');
    expect(result.semanticEvidence.requiresCanonicalPromotion).toBe(true);
  });

  it('preserves unresolved canonical structural identity instead of fabricating it', async () => {
    const code = `export const rerank = (value: string) => value.length;`;
    const candidate = await candidateFor(code, 'rerank');
    expect(candidate.treeNodeId).toBeNull();
    expect(candidate.symbolVersionId).toBeNull();

    const result = enrichAstCandidateWithTsMorph({
      schema: 'atlas.ts-morph-semantic-enrichment-input.v1',
      candidate,
      code,
      filePath: '/workspace/example.ts',
      tsConfigFilePath: null,
      semanticEngineRevision: 'ts-morph-27-test',
      producerRevision: 'semantic-test',
    });

    expect(result.semanticEvidence.coordinate.treeNodeId).toBeNull();
    expect(result.semanticEvidence.coordinate.symbolVersionId).toBeNull();
    expect(result.semanticEvidence.subjectCanonicalId).toBeNull();
    expect(result.treeNodeIdentityInheritedOnly).toBe(true);
    expect(result.canonicalWritesAllowed).toBe(false);
    expect(result.logicalLaneVoteAdded).toBe(false);
  });

  it('projects UTF-8 byte coordinates into TypeScript UTF-16 character coordinates', async () => {
    const code = `const label = 'π';\nexport function café(value: number) { return value; }`;
    const candidate = await candidateFor(code, 'café');
    const result = enrichAstCandidateWithTsMorph({
      schema: 'atlas.ts-morph-semantic-enrichment-input.v1',
      candidate,
      code,
      filePath: '/workspace/example.ts',
      tsConfigFilePath: null,
      semanticEngineRevision: 'ts-morph-27-test',
      producerRevision: 'semantic-test',
    });

    expect(result.sourceCoordinateMatchedByByteToUtf16Projection).toBe(true);
    expect(result.semanticEvidence.coordinate.startByte).toBe(candidate.startByte);
    expect(result.semanticEvidence.coordinate.startChar).toBeLessThan(candidate.startByte);
  });

  it('refuses to enrich a candidate against a different file path', async () => {
    const code = `export function alpha() { return 1; }`;
    const candidate = await candidateFor(code, 'alpha');

    expect(() => enrichAstCandidateWithTsMorph({
      schema: 'atlas.ts-morph-semantic-enrichment-input.v1',
      candidate,
      code,
      filePath: '/workspace/other.ts',
      tsConfigFilePath: null,
      semanticEngineRevision: 'ts-morph-27-test',
      producerRevision: 'semantic-test',
    })).toThrow(/TS_MORPH_FILE_PATH_MISMATCH/);
  });
});
