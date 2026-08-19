import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import {
  enrichOrderedStructuredMembers,
  type OrderedStructuredMemberV1,
} from './ordered-structured-member-enrichment.js';

const SOURCE = `
export function fetchRows(query: string, limit = 20, ...tags: string[]) {
  return { query, limit, tags };
}

fetchRows('atlas', 10, 'ast', 'semantic');
`;

function projectWithSource(): Project {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { strict: true, noEmit: true } });
  project.createSourceFile('/workspace/src/search.ts', SOURCE);
  return project;
}

function span(text: string, occurrence = 0): [number, number] {
  let from = 0;
  let index = -1;
  for (let i = 0; i <= occurrence; i += 1) {
    index = SOURCE.indexOf(text, from);
    from = index + text.length;
  }
  if (index < 0) throw new Error(`fixture token not found: ${text}`);
  return [index, index + text.length];
}

function member(ordinal: number, text: string, kind: OrderedStructuredMemberV1['kind'], occurrence = 0): OrderedStructuredMemberV1 {
  const [startChar, endChar] = span(text, occurrence);
  return {
    schema: 'atlas.ordered-structured-member.v1',
    parentTreeNodeId: 'tree:function:fetchRows',
    treeNodeId: `tree:member:${ordinal}`,
    sourceRef: 'src/search.ts#source-9',
    filePath: '/workspace/src/search.ts',
    kind,
    ordinal,
    keyText: text,
    startChar,
    endChar,
    startByte: startChar,
    endByte: endChar,
    workspaceRevision: 'ws-9',
    sourceRevision: 'source-9',
    grammarRevision: 'tree-sitter-typescript-test',
  };
}

describe('ordered structured member enrichment', () => {
  it('preserves Tree-sitter parameter ordinals while adding ts-morph types', () => {
    const rows = [
      member(2, 'tags', 'PARAMETER'),
      member(0, 'query', 'PARAMETER'),
      member(1, 'limit', 'PARAMETER'),
    ];

    const result = enrichOrderedStructuredMembers({
      project: projectWithSource(),
      members: rows,
      semanticEngineRevision: 'ts-morph-test',
      producerRevision: 'test',
    });

    expect(result.members.map((row) => row.structural.ordinal)).toEqual([0, 1, 2]);
    expect(result.members.map((row) => row.structural.keyText)).toEqual(['query', 'limit', 'tags']);
    expect(result.members[0]?.typeText).toBe('string');
    expect(result.members[1]?.typeText).toBe('number');
    expect(result.members[2]?.typeText).toContain('string');
    expect(result.treeSitterOwnsOrdinals).toBe(true);
    expect(result.semanticEnrichmentMayNotReorderMembers).toBe(true);
    expect(result.arrowProjectionShape).toBe('LIST_STRUCT');
  });

  it('retains structural identity and source coordinates exactly', () => {
    const input = member(0, 'query', 'PARAMETER');
    const result = enrichOrderedStructuredMembers({
      project: projectWithSource(),
      members: [input],
      semanticEngineRevision: 'ts-morph-test',
      producerRevision: 'test',
    });

    expect(result.members[0]?.structural).toEqual(input);
    expect(result.members[0]?.structuralCoordinatesPreserved).toBe(true);
    expect(result.members[0]?.canonicalWritesAllowed).toBe(false);
    expect(result.members[0]?.logicalLaneVoteAdded).toBe(false);
  });

  it('rejects duplicate structural ordinals instead of silently reordering them', () => {
    expect(() => enrichOrderedStructuredMembers({
      project: projectWithSource(),
      members: [member(0, 'query', 'PARAMETER'), member(0, 'limit', 'PARAMETER')],
      semanticEngineRevision: 'ts-morph-test',
      producerRevision: 'test',
    })).toThrow(/DUPLICATE_STRUCTURAL_ORDINAL/);
  });

  it('records non-contiguous source ordinals without renumbering them', () => {
    const result = enrichOrderedStructuredMembers({
      project: projectWithSource(),
      members: [member(0, 'query', 'PARAMETER'), member(2, 'tags', 'PARAMETER')],
      semanticEngineRevision: 'ts-morph-test',
      producerRevision: 'test',
    });

    expect(result.members.map((row) => row.structural.ordinal)).toEqual([0, 2]);
    expect(result.ordinalsContiguous).toBe(false);
  });
});
