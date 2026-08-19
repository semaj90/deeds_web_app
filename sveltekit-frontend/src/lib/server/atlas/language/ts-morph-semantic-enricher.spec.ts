import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import {
  enrichGroundedTypeScriptCandidate,
  type TsMorphGroundedCandidateV1,
} from './ts-morph-semantic-enricher.js';

const SOURCE = `
export interface SearchRow {
  id: string;
  score: number;
}

export function rerankCandidates(rows: SearchRow[]): SearchRow[] {
  return [...rows].sort((a, b) => b.score - a.score);
}

export const selected = rerankCandidates([{ id: 'a', score: 1 }]);
`;

function projectWithSource(): Project {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { strict: true, noEmit: true },
  });
  project.createSourceFile('/workspace/src/search.ts', SOURCE);
  return project;
}

function candidate(treeNodeId: string | null = null): TsMorphGroundedCandidateV1 {
  const startChar = SOURCE.indexOf('rerankCandidates');
  return {
    schema: 'atlas.ts-morph-grounded-candidate.v1',
    canonicalId: 'CANONICAL:rerankCandidates',
    symbolVersionId: 'symbol-v7',
    treeNodeId,
    sourceRef: 'src/search.ts#source-7',
    filePath: '/workspace/src/search.ts',
    startChar,
    endChar: startChar + 'rerankCandidates'.length,
    startByte: startChar,
    endByte: startChar + 'rerankCandidates'.length,
    startLine: 7,
    endLine: 7,
    workspaceRevision: 'ws-7',
    sourceRevision: 'source-7',
    grammarRevision: 'tree-sitter-typescript-test',
    producerRevision: 'test',
  };
}

const OPTIONS = {
  schema: 'atlas.ts-morph-semantic-enrichment-options.v1' as const,
  tsConfigFilePath: null,
  maxReferences: 128,
  includeImplementations: true,
  includeDefinitions: true,
  includeReferences: true,
  semanticEngineRevision: 'ts-morph-test',
  producerRevision: 'test',
};

describe('ts-morph semantic enrichment', () => {
  it('enriches an already-grounded Tree-sitter coordinate with compiler semantics', () => {
    const result = enrichGroundedTypeScriptCandidate(projectWithSource(), candidate(), OPTIONS);

    expect(result.symbolName).toBe('rerankCandidates');
    expect(result.typeText).toContain('SearchRow');
    expect(result.definitions.length).toBeGreaterThan(0);
    expect(result.references.some((reference) => !reference.isDefinition)).toBe(true);
    expect(result.evidence.some((row) => row.relationKind === 'TYPE_OF')).toBe(true);
    expect(result.evidence.some((row) => row.relationKind === 'REFERENCES')).toBe(true);
  });

  it('preserves canonical Tree-sitter/GIS coordinates rather than inventing identity', () => {
    const input = candidate('tree-node-8421');
    const result = enrichGroundedTypeScriptCandidate(projectWithSource(), input, OPTIONS);

    expect(result.candidate.treeNodeId).toBe('tree-node-8421');
    expect(result.candidate.symbolVersionId).toBe('symbol-v7');
    expect(result.candidate.canonicalId).toBe('CANONICAL:rerankCandidates');
    expect(result.treeNodeIdInvented).toBe(false);
    expect(result.structuralCoordinatesPreserved).toBe(true);
    expect(result.sourceOrderPreserved).toBe(true);
    expect(result.canonicalWritesAllowed).toBe(false);
    expect(result.logicalLane).toBe('ast');
    expect(result.logicalLaneVoteAdded).toBe(false);
  });

  it('keeps a missing treeNodeId missing until the canonical structural join supplies it', () => {
    const result = enrichGroundedTypeScriptCandidate(projectWithSource(), candidate(null), OPTIONS);
    expect(result.candidate.treeNodeId).toBeNull();
    expect(result.evidence.every((row) => row.coordinate.treeNodeId === null)).toBe(true);
  });

  it('bounds and deterministically orders reference observations', () => {
    const result = enrichGroundedTypeScriptCandidate(projectWithSource(), candidate(), {
      ...OPTIONS,
      maxReferences: 2,
    });

    expect(result.references.length).toBeLessThanOrEqual(2);
    expect(result.references).toEqual([...result.references].sort((a, b) =>
      a.filePath.localeCompare(b.filePath) || a.startChar - b.startChar || a.endChar - b.endChar,
    ));
  });

  it('fails closed when the grounded source file does not exist in the semantic project', () => {
    const missing = { ...candidate(), filePath: '/workspace/src/missing.ts' };
    expect(() => enrichGroundedTypeScriptCandidate(projectWithSource(), missing, OPTIONS))
      .toThrow(/TS_MORPH_SOURCE_FILE_NOT_FOUND/);
  });
});
