import { describe, expect, it } from 'vitest';
import { compileStructuralExtractionFabric } from '@deeds/parent-atlas';
import {
  graphifyEdgeProjectionCandidateV1Schema,
  mapStructuralFabricToGraphifyProjectionV1,
} from './graphify-symbol-projection-v1.js';

const workspaceId = '625743d2-092b-4fa8-abe0-9dc094920c80';
const fileId = '11111111-1111-4111-8111-111111111111';
const sourceRef = 'src/lib/example.ts';
const workspaceRevision = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const sourceRevision = 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const declarationHash = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';

function makeFabric(overrides: { sourceRevision?: string; workspaceRevision?: string } = {}) {
  const srcRev = overrides.sourceRevision ?? sourceRevision;
  const wsRev = overrides.workspaceRevision ?? workspaceRevision;
  return compileStructuralExtractionFabric({
    schema: 'atlas.structural-extraction-input.v1',
    source_ref: sourceRef,
    source_revision: srcRev,
    workspace_revision: wsRev,
    language: 'typescript',
    chunker_revision: 'treesitter-chunker:test',
    ast_grep_revision: 'ast-grep:test',
    langextract_revision: 'langextract:test',
    chunks: [
      {
        upstream_node_id: 'node-parent',
        upstream_file_id: 'file-native',
        upstream_symbol_id: 'symbol-parent',
        upstream_chunk_id: 'chunk-parent',
        source_ref: sourceRef,
        language: 'typescript',
        node_type: 'class_declaration',
        kind: 'class',
        symbol_name: 'Example',
        parent_route: ['module'],
        parent_context: 'module',
        byte_start: 0,
        byte_end: 90,
        start_line: 0,
        end_line: 4,
        content_hash: declarationHash,
        calls: [],
        imports: [],
        exports: ['Example'],
      },
      {
        upstream_node_id: 'node-method',
        upstream_file_id: 'file-native',
        upstream_symbol_id: 'symbol-method',
        upstream_chunk_id: 'chunk-method',
        source_ref: sourceRef,
        language: 'typescript',
        node_type: 'method_definition',
        kind: 'method',
        symbol_name: 'run',
        parent_route: ['module', 'Example'],
        parent_context: 'Example',
        byte_start: 24,
        byte_end: 82,
        start_line: 1,
        end_line: 3,
        content_hash: 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
        calls: ['helper'],
        imports: [],
        exports: [],
      },
    ],
    xref_edges: [
      {
        src: 'node-method',
        dst: 'external:helper',
        type: 'CALLS',
        weight: 1,
      },
    ],
    lsp_observations: [],
    ast_grep_observations: [],
    langextract_observations: [],
    diagnostics: [],
  }, { producer_revision: 'fabric:test' });
}

function coordinates() {
  return {
    'node-parent': {
      upstreamNodeId: 'node-parent',
      startByte: 0,
      endByte: 90,
      startRow: 0,
      endRow: 4,
      astFingerprint: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    },
    'node-method': {
      upstreamNodeId: 'node-method',
      startByte: 24,
      endByte: 82,
      startRow: 1,
      endRow: 3,
      astFingerprint: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    },
  } as const;
}

function referenceEvidence() {
  const referenceId = `treesitter-chunker-xref:node-method:external:helper:CALLS:${sourceRevision}`;
  return {
    [referenceId]: {
      referenceId,
      evidenceKind: 'treesitter_chunker_xref',
      startByte: 48,
      endByte: 56,
      startRow: 2,
      endRow: 2,
      confidence: 1,
      evidenceRefs: ['fixture:call-helper'],
    },
  } as const;
}

type ProjectionInput = Parameters<typeof mapStructuralFabricToGraphifyProjectionV1>[0];

function mapFixture(overrides: Partial<ProjectionInput> = {}) {
  return mapStructuralFabricToGraphifyProjectionV1({
    workspaceId,
    fileId,
    workspaceRevision,
    sourceRef,
    sourceRevision,
    fabric: makeFabric(),
    nativeCoordinatesByUpstreamNodeId: coordinates(),
    referenceEvidenceByReferenceId: referenceEvidence(),
    parentStableSymbolKeyByNominationId: {
      [`treesitter-chunker:node-parent:${sourceRevision}`]: null,
      [`treesitter-chunker:node-method:${sourceRevision}`]: 'upstream-symbol:symbol-parent',
    },
    ...overrides,
  });
}

describe('Graphify symbol projection mapper v1', () => {
  it('maps structural nominations without minting canonical authority or enabling writes', () => {
    const batch = mapFixture();

    expect(batch.canonicalAuthority).toBe(false);
    expect(batch.writesAllowed).toBe(false);
    expect(batch.symbols).toHaveLength(2);
    expect(batch.symbols.map((item) => item.stableSymbolKey)).toEqual([
      'upstream-symbol:symbol-parent',
      'upstream-symbol:symbol-method',
    ]);
    expect(batch.symbols[1]?.parentStableSymbolKey).toBe('upstream-symbol:symbol-parent');
    expect(batch.symbols[1]?.astFingerprint).toBe('ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
    expect(batch.inputChecksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('preserves unresolved reference targets instead of fabricating symbol identity', () => {
    const batch = mapFixture();
    expect(batch.edges).toHaveLength(1);
    expect(batch.edges[0]).toMatchObject({
      subjectStableSymbolKey: 'upstream-symbol:symbol-method',
      predicate: 'call',
      objectStableSymbolKey: null,
      unresolvedTarget: 'external:helper',
      evidenceKind: 'treesitter_chunker_xref',
      confidence: 1,
    });
  });

  it('keeps the logical symbol key stable when source revision changes', () => {
    const nextRevision = 'sha256:9999999999999999999999999999999999999999999999999999999999999999';
    const nextFabric = makeFabric({ sourceRevision: nextRevision });
    const nextReferenceId = `treesitter-chunker-xref:node-method:external:helper:CALLS:${nextRevision}`;
    const nextBatch = mapStructuralFabricToGraphifyProjectionV1({
      workspaceId,
      fileId,
      workspaceRevision,
      sourceRef,
      sourceRevision: nextRevision,
      fabric: nextFabric,
      nativeCoordinatesByUpstreamNodeId: coordinates(),
      referenceEvidenceByReferenceId: {
        [nextReferenceId]: {
          referenceId: nextReferenceId,
          evidenceKind: 'treesitter_chunker_xref',
          startByte: 48,
          endByte: 56,
          startRow: 2,
          endRow: 2,
          confidence: 1,
          evidenceRefs: [],
        },
      },
      parentStableSymbolKeyByNominationId: {
        [`treesitter-chunker:node-parent:${nextRevision}`]: null,
        [`treesitter-chunker:node-method:${nextRevision}`]: 'upstream-symbol:symbol-parent',
      },
    });

    expect(nextBatch.symbols.map((item) => item.stableSymbolKey)).toEqual(
      mapFixture().symbols.map((item) => item.stableSymbolKey),
    );
    expect(nextBatch.sourceRevision).toBe(nextRevision);
    expect(nextBatch.inputChecksum).not.toBe(mapFixture().inputChecksum);
  });

  it('is deterministic for the same projection input', () => {
    const first = mapFixture();
    const second = mapFixture();
    expect(second).toEqual(first);
  });

  it('fails closed when an AST fingerprint/native coordinate is missing', () => {
    const incompleteCoordinates = { ...coordinates() } as Record<string, (ReturnType<typeof coordinates>)[keyof ReturnType<typeof coordinates>]>;
    delete incompleteCoordinates['node-method'];

    expect(() => mapFixture({ nativeCoordinatesByUpstreamNodeId: incompleteCoordinates })).toThrow(
      'GRAPHIFY_SYMBOL_AST_FINGERPRINT_MISSING',
    );
  });

  it('fails closed when the structural source revision does not match the bound source revision', () => {
    expect(() => mapFixture({
      sourceRevision: 'sha256:7777777777777777777777777777777777777777777777777777777777777777',
    })).toThrow('GRAPHIFY_SYMBOL_SOURCE_REVISION_MISMATCH');
  });

  it('rejects edges that claim both a resolved target and an unresolved target', () => {
    expect(() => graphifyEdgeProjectionCandidateV1Schema.parse({
      schema: 'atlas.graphify-edge-projection-candidate.v1',
      workspaceId,
      workspaceRevision,
      sourceRef,
      sourceRevision,
      subjectStableSymbolKey: 'upstream-symbol:symbol-method',
      predicate: 'call',
      objectStableSymbolKey: 'upstream-symbol:symbol-helper',
      unresolvedTarget: 'helper',
      evidenceKind: 'fixture',
      evidenceSpan: { startByte: 1, endByte: 2, startRow: 0, endRow: 0 },
      confidence: 1,
      evidenceRefs: [],
      referenceId: 'ref-bad',
    })).toThrow('exactly one of objectStableSymbolKey or unresolvedTarget is required');
  });
});
