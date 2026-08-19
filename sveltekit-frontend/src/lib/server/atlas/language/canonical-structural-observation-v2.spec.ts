import { describe, expect, it } from 'vitest';
import {
  CanonicalStructuralObservationV2Schema,
  enumerateCanonicalStructuralObservationsV2,
  projectCanonicalStructuralObservationV2ToV1,
  type TreeSitterNodeLike,
} from './canonical-structural-observation-v2.js';

function node(input: Partial<TreeSitterNodeLike> & Pick<TreeSitterNodeLike, 'type'>): TreeSitterNodeLike {
  return {
    type: input.type,
    isNamed: input.isNamed ?? true,
    startIndex: input.startIndex ?? 0,
    endIndex: input.endIndex ?? 1,
    startPosition: input.startPosition ?? { row: 0, column: 0 },
    endPosition: input.endPosition ?? { row: 0, column: 1 },
    text: input.text ?? input.type,
    children: input.children ?? [],
    namedChildren: input.namedChildren,
    fieldNameForChild: input.fieldNameForChild,
  };
}

function fixture() {
  const identifier = node({
    type: 'identifier', startIndex: 9, endIndex: 14,
    startPosition: { row: 0, column: 9 }, endPosition: { row: 0, column: 14 }, text: 'hello',
  });
  const body = node({
    type: 'statement_block', startIndex: 17, endIndex: 29,
    startPosition: { row: 0, column: 17 }, endPosition: { row: 0, column: 29 }, text: '{ return 1; }',
    children: [],
  });
  const fn = node({
    type: 'function_declaration', startIndex: 0, endIndex: 29,
    startPosition: { row: 0, column: 0 }, endPosition: { row: 0, column: 29 }, text: 'function hello() { return 1; }',
    children: [identifier, body], namedChildren: [identifier, body],
    fieldNameForChild: (index) => index === 0 ? 'name' : index === 1 ? 'body' : null,
  });
  return node({
    type: 'program', startIndex: 0, endIndex: 29,
    startPosition: { row: 0, column: 0 }, endPosition: { row: 0, column: 29 }, text: fn.text,
    children: [fn], namedChildren: [fn],
  });
}

const context = {
  repoId: 'deeds-web-app',
  sourceRef: 'sveltekit-frontend/src/example.ts',
  filePath: 'sveltekit-frontend/src/example.ts',
  language: 'typescript',
  workspaceRevision: 'workspace-1',
  sourceRevision: 'source-1',
  parserRevision: 'tree-sitter-node-0.25.1',
  grammarName: 'tree-sitter-typescript',
  grammarRevision: '0.23.2',
  producerRevision: 'test',
  qualifiedSymbolForNode: (n: TreeSitterNodeLike) => n.type === 'function_declaration' ? 'hello' : null,
  normalizedSignatureForNode: (n: TreeSitterNodeLike) => n.type === 'function_declaration' ? 'function hello()' : '',
};

describe('CanonicalStructuralObservationV2', () => {
  it('enumerates a deterministic pre-order source ordinal and child-index path', () => {
    const rows = enumerateCanonicalStructuralObservationsV2(fixture(), context);
    expect(rows.map((row) => [row.nodeType, row.sourceOrdinal])).toEqual([
      ['program', 0],
      ['function_declaration', 1],
      ['identifier', 2],
      ['statement_block', 3],
    ]);
    expect(rows[1]?.astPath).toEqual([
      { childIndex: 0, namedChildIndex: 0, fieldName: null, nodeType: 'function_declaration', named: true },
    ]);
    expect(rows[2]?.astPath.at(-1)).toEqual({
      childIndex: 0, namedChildIndex: 0, fieldName: 'name', nodeType: 'identifier', named: true,
    });
    expect(rows[2]?.parentAstPath).toEqual(rows[2]?.astPath.slice(0, -1));
  });

  it('separates logical structural identity from coordinate checksum', () => {
    const first = enumerateCanonicalStructuralObservationsV2(fixture(), context);
    const shiftedRoot = fixture();
    const shiftedFn = shiftedRoot.children[0]!;
    const shifted = node({
      ...shiftedRoot,
      children: [node({
        ...shiftedFn,
        startIndex: shiftedFn.startIndex + 100,
        endIndex: shiftedFn.endIndex + 100,
        startPosition: { row: 5, column: 0 },
        endPosition: { row: 5, column: 29 },
        children: shiftedFn.children,
        namedChildren: shiftedFn.namedChildren,
        fieldNameForChild: shiftedFn.fieldNameForChild,
      })],
    });
    const second = enumerateCanonicalStructuralObservationsV2(shifted, { ...context, sourceRevision: 'source-2' });
    const a = first.find((row) => row.nodeType === 'function_declaration')!;
    const b = second.find((row) => row.nodeType === 'function_declaration')!;
    expect(b.treeNodeId).toBe(a.treeNodeId);
    expect(b.coordinateChecksumSha256).not.toBe(a.coordinateChecksumSha256);
  });

  it('changes symbolic identity when the normalized signature changes', () => {
    const first = enumerateCanonicalStructuralObservationsV2(fixture(), context);
    const second = enumerateCanonicalStructuralObservationsV2(fixture(), {
      ...context,
      normalizedSignatureForNode: (n) => n.type === 'function_declaration' ? 'function hello(value: string)' : '',
    });
    const a = first.find((row) => row.nodeType === 'function_declaration')!;
    const b = second.find((row) => row.nodeType === 'function_declaration')!;
    expect(b.treeNodeId).not.toBe(a.treeNodeId);
  });

  it('marks anonymous syntax as an explicit path fallback instead of symbolic identity', () => {
    const rows = enumerateCanonicalStructuralObservationsV2(fixture(), {
      ...context,
      qualifiedSymbolForNode: () => null,
      normalizedSignatureForNode: () => '',
    });
    expect(rows.every((row) => row.identityMode === 'ANONYMOUS_PATH_FALLBACK')).toBe(true);
  });

  it('projects into the existing V1 canonical join contract without losing source revision or span', () => {
    const row = enumerateCanonicalStructuralObservationsV2(fixture(), context)
      .find((candidate) => candidate.nodeType === 'function_declaration')!;
    expect(CanonicalStructuralObservationV2Schema.parse(row)).toEqual(row);
    const v1 = projectCanonicalStructuralObservationV2ToV1(row);
    expect(v1).toMatchObject({
      schema: 'atlas.canonical-structural-observation.v1',
      sourceRef: 'sveltekit-frontend/src/example.ts',
      sourceRevision: 'source-1',
      treeNodeId: row.treeNodeId,
      nodeKind: 'function_declaration',
      qualifiedSymbol: 'hello',
      startByte: 0,
      endByte: 29,
      identityStatus: 'canonical_structural_identity',
    });
  });
});
