import { describe, expect, it } from 'vitest';
import type {
  StructuralExtractionFabricResultV1,
} from '@deeds/parent-atlas';

import { classifyRawStructuralEdgesV1, type AstEdgeEligibilityFileInputV1 } from './graphify-edge-eligibility-v1.js';
import type { GraphifyImportResolutionContextV1 } from './graphify-symbol-projection-v1.js';

type StructuralReferenceFactV1 = StructuralExtractionFabricResultV1['reference_facts'][number];
type StructuralSymbolNominationV1 = StructuralExtractionFabricResultV1['symbol_nominations'][number];
type TreesitterChunkerChunkV1 = StructuralExtractionFabricResultV1['chunks'][number];
type TreesitterChunkerXrefEdgeV1 = StructuralExtractionFabricResultV1['xref_edges'][number];

const digest = 'a'.repeat(64);

function chunk(input: Partial<TreesitterChunkerChunkV1> & Pick<TreesitterChunkerChunkV1, 'upstream_node_id' | 'source_ref' | 'symbol_name'>): TreesitterChunkerChunkV1 {
  return {
    upstream_node_id: input.upstream_node_id,
    upstream_file_id: input.upstream_file_id ?? `file:${input.source_ref}`,
    upstream_symbol_id: input.upstream_symbol_id ?? `symbol:${input.upstream_node_id}`,
    upstream_chunk_id: input.upstream_chunk_id ?? `chunk:${input.upstream_node_id}`,
    source_ref: input.source_ref,
    language: input.language ?? 'typescript',
    node_type: input.node_type ?? 'function_declaration',
    kind: input.kind ?? 'function',
    symbol_name: input.symbol_name,
    parent_route: input.parent_route ?? ['function_declaration'],
    byte_start: input.byte_start ?? 0,
    byte_end: input.byte_end ?? 12,
    start_line: input.start_line ?? 0,
    end_line: input.end_line ?? 0,
    content_hash: input.content_hash ?? digest,
    calls: [],
    imports: [],
    exports: [],
  };
}

function nomination(input: {
  nodeId: string;
  sourceRef: string;
  name: string;
  qualifiedName?: string;
  symbolKey?: string;
  parentRoute?: string[];
}): StructuralSymbolNominationV1 {
  return {
    schema: 'atlas.structural-symbol-nomination.v1',
    nomination_id: `nom:${input.nodeId}`,
    symbol_key: input.symbolKey ?? `key:${input.nodeId}`,
    identity_status: 'nominated',
    role: 'definition',
    kind: 'function',
    language: 'typescript',
    name: input.name,
    qualified_name: input.qualifiedName ?? input.name,
    container_qualified_name: null,
    source_ref: input.sourceRef,
    source_revision: 'source-r1',
    workspace_revision: 'workspace-r1',
    upstream_file_id: `file:${input.sourceRef}`,
    upstream_node_id: input.nodeId,
    upstream_symbol_id: `symbol:${input.nodeId}`,
    upstream_chunk_id: `chunk:${input.nodeId}`,
    byte_start: 0,
    byte_end: 12,
    parent_route: input.parentRoute ?? ['function_declaration'],
    declaration_hash: digest,
    exported: false,
    export_name: null,
    extractor: 'treesitter_chunker',
    extractor_revision: 'chunker-r1',
  };
}

function referenceFact(edge: TreesitterChunkerXrefEdgeV1, targetText = edge.dst): StructuralReferenceFactV1 {
  return {
    schema: 'atlas.structural-reference-fact.v1',
    reference_id: `ref:${edge.src}:${edge.dst}:${edge.type}`,
    reference_kind: edge.type === 'CALLS' ? 'call' : edge.type === 'IMPORTS' ? 'import' : 'type_ref',
    source_ref: 'src/caller.ts',
    source_revision: 'source-r1',
    workspace_revision: 'workspace-r1',
    upstream_source_node_id: edge.src,
    upstream_target_node_id: undefined,
    upstream_chunk_id: `chunk:${edge.src}`,
    target_text: targetText,
    resolution_status: 'unresolved',
    captures: { xref_source_key: edge.src, xref_target_key: edge.dst, xref_type: edge.type },
    evidence_refs: [],
    extractor: 'treesitter_chunker',
    extractor_revision: 'chunker-r1',
  };
}

function fileInput(input: {
  sourceRef?: string;
  authority?: 'PROVEN' | 'UNPROVEN';
  chunks?: TreesitterChunkerChunkV1[];
  edges?: TreesitterChunkerXrefEdgeV1[];
  nominations?: StructuralSymbolNominationV1[];
  facts?: StructuralReferenceFactV1[];
  importContext?: GraphifyImportResolutionContextV1;
}): AstEdgeEligibilityFileInputV1 {
  const sourceRef = input.sourceRef ?? 'src/caller.ts';
  const facts = input.facts ?? (input.edges ?? []).map((edge) => referenceFact(edge));
  return {
    sourceRef,
    sourceRevisionAuthority: input.authority ?? 'PROVEN',
    fabric: {
      chunks: input.chunks ?? [],
      xref_edges: input.edges ?? [],
      symbol_nominations: input.nominations ?? [],
      reference_facts: facts,
    } as Pick<StructuralExtractionFabricResultV1, 'chunks' | 'xref_edges' | 'symbol_nominations' | 'reference_facts'>,
    importResolutionContext: input.importContext,
    referenceEvidenceByReferenceId: Object.fromEntries(facts.map((fact) => [fact.reference_id, {
      startByte: 2,
      endByte: 8,
      evidenceRefs: [`span:${fact.reference_id}`],
    }])),
  };
}

describe('graphify raw edge eligibility gate v1', () => {
  it('admits only exact local symbol endpoints with source authority and span evidence', () => {
    const edge = { src: 'src-fn', dst: 'dst-fn', type: 'CALLS', weight: 1 };
    const source = chunk({ upstream_node_id: 'src-fn', source_ref: 'src/caller.ts', symbol_name: 'caller' });
    const target = chunk({ upstream_node_id: 'dst-fn', source_ref: 'src/caller.ts', symbol_name: 'target' });
    const report = classifyRawStructuralEdgesV1([fileInput({
      chunks: [source, target],
      edges: [edge],
      nominations: [nomination({ nodeId: 'src-fn', sourceRef: 'src/caller.ts', name: 'caller' }), nomination({ nodeId: 'dst-fn', sourceRef: 'src/caller.ts', name: 'target' })],
    })]);

    expect(report.edges[0]).toMatchObject({ status: 'ELIGIBLE_FOR_INCIDENCE', resolution: 'ELIGIBLE', admissionStatus: 'INCIDENCE_CANDIDATE_ONLY', classification: 'LOCAL_REFERENCE' });
    expect(report.edges[0].source.qualifiedName).toBe('local:src/caller.ts#caller');
    expect(report.edges[0].target.qualifiedName).toBe('local:src/caller.ts#target');
    expect('canonicalId' in report.edges[0].source).toBe(false);
    expect(report.perFileMatrix).toEqual([{ sourceRef: 'src/caller.ts', edgeKind: 'CALLS', total: 1, subjectOk: 1, targetOk: 1, qualified: 1, eligible: 1 }]);
    expect(report).toMatchObject({ canonicalAuthority: false, writesPerformed: false });
  });

  it('keeps source authority as a hard prerequisite even when both endpoints resolve', () => {
    const edge = { src: 'src-fn', dst: 'dst-fn', type: 'CALLS', weight: 1 };
    const source = chunk({ upstream_node_id: 'src-fn', source_ref: 'src/caller.ts', symbol_name: 'caller' });
    const target = chunk({ upstream_node_id: 'dst-fn', source_ref: 'src/caller.ts', symbol_name: 'target' });
    const report = classifyRawStructuralEdgesV1([fileInput({
      authority: 'UNPROVEN', chunks: [source, target], edges: [edge],
      nominations: [nomination({ nodeId: 'src-fn', sourceRef: 'src/caller.ts', name: 'caller' }), nomination({ nodeId: 'dst-fn', sourceRef: 'src/caller.ts', name: 'target' })],
    })]);

    expect(report.edges[0]).toMatchObject({ status: 'SOURCE_AUTHORITY_UNPROVEN', resolution: 'REJECTED', admissionStatus: 'NOT_ADMISSIBLE' });
    expect(report.edges[0].rejectionReasons).toContain('SOURCE_AUTHORITY_UNPROVEN');
    expect(report.perFileMatrix[0].qualified).toBe(1);
    expect(report.perFileMatrix[0].eligible).toBe(0);
  });

  it('classifies exact built-ins separately and never admits them as graph endpoints', () => {
    const edge = { src: 'src-fn', dst: 'Array', type: 'REFERENCES', weight: 1 };
    const source = chunk({ upstream_node_id: 'src-fn', source_ref: 'src/caller.ts', symbol_name: 'caller' });
    const report = classifyRawStructuralEdgesV1([fileInput({
      chunks: [source], edges: [edge], nominations: [nomination({ nodeId: 'src-fn', sourceRef: 'src/caller.ts', name: 'caller' })],
    })]);

    expect(report.edges[0]).toMatchObject({ status: 'BUILTIN_REFERENCE', resolution: 'REJECTED' });
    expect(report.edges[0].target).toMatchObject({ qualifiedKind: 'BUILTIN', qualifiedName: 'builtin:Array' });
    expect(report.failureBuckets.BUILTIN_REFERENCE).toBe(1);
  });

  it('resolves an imported local binding only through the exact exported symbol map', () => {
    const callerEdge = { src: 'caller-node', dst: 'run()', type: 'CALLS', weight: 1 };
    const targetFile = 'src/target.ts';
    const targetNomination = nomination({
      nodeId: 'target-node', sourceRef: targetFile, name: 'run', symbolKey: 'target-run',
      parentRoute: ['export_statement', 'function_declaration'],
    });
    const context: GraphifyImportResolutionContextV1 = {
      bindingsByLocalName: new Map([['run', { localName: 'run', importedName: 'run', specifier: './target.js', typeOnly: false }]]),
      knownSourceRefs: new Set(['src/caller.ts', targetFile]),
      exportsBySourceRef: new Map([[targetFile, new Map([['run', ['target-run']]])]]),
    };
    const caller = fileInput({
      chunks: [chunk({ upstream_node_id: 'caller-node', source_ref: 'src/caller.ts', symbol_name: 'caller' })],
      edges: [callerEdge],
      nominations: [nomination({ nodeId: 'caller-node', sourceRef: 'src/caller.ts', name: 'caller' })],
      facts: [referenceFact(callerEdge, 'run()')],
      importContext: context,
    });
    const target = fileInput({
      sourceRef: targetFile,
      chunks: [chunk({ upstream_node_id: 'target-node', source_ref: targetFile, symbol_name: 'run', parent_route: ['export_statement', 'function_declaration'] })],
      nominations: [targetNomination],
    });
    const report = classifyRawStructuralEdgesV1([caller, target]);
    const edge = report.edges.find((row) => row.sourceRef === 'src/caller.ts');

    expect(edge).toMatchObject({ status: 'ELIGIBLE_FOR_INCIDENCE', resolution: 'ELIGIBLE', classification: 'SYMBOL_QUALIFIED' });
    expect(edge?.target).toMatchObject({ qualifiedKind: 'EXPORTED_SYMBOL', qualifiedName: 'symbol:src/target.ts#run' });
  });

  it('labels bare external import specifiers as packages, not symbols', () => {
    const edge = { src: 'src-fn', dst: "import { z } from 'zod'", type: 'IMPORTS', weight: 1 };
    const context: GraphifyImportResolutionContextV1 = {
      bindingsByLocalName: new Map(),
      knownSourceRefs: new Set(['src/caller.ts']),
      exportsBySourceRef: new Map(),
    };
    const report = classifyRawStructuralEdgesV1([fileInput({
      chunks: [chunk({ upstream_node_id: 'src-fn', source_ref: 'src/caller.ts', symbol_name: 'caller' })],
      edges: [edge],
      nominations: [nomination({ nodeId: 'src-fn', sourceRef: 'src/caller.ts', name: 'caller' })],
      facts: [referenceFact(edge, "import { z } from 'zod'")],
      importContext: context,
    })]);

    expect(report.edges[0]).toMatchObject({ status: 'EXTERNAL_PACKAGE_REFERENCE', resolution: 'REJECTED' });
    expect(report.edges[0].target).toMatchObject({ qualifiedKind: 'EXTERNAL_PACKAGE', qualifiedName: 'package:zod' });
  });

  it('keeps unresolved bare names out and reports unmapped subjects independently', () => {
    const edge = { src: 'not-a-chunk', dst: 'mysteryThing', type: 'REFERENCES', weight: 1 };
    const report = classifyRawStructuralEdgesV1([fileInput({ edges: [edge] })]);

    expect(report.edges[0].status).toBe('GRAPHIFY_EDGE_SUBJECT_SYMBOL_UNMAPPED');
    expect(report.edges[0].source.qualifiedKind).toBe('UNRESOLVED');
    expect(report.edges[0].target).toMatchObject({ qualifiedKind: 'UNRESOLVED', resolutionBasis: 'NO_EXACT_TARGET_MATCH' });
    expect(report.edges[0].rejectionReasons).toEqual(expect.arrayContaining([
      'GRAPHIFY_EDGE_SUBJECT_SYMBOL_UNMAPPED', 'TARGET_SYMBOL_UNRESOLVED',
    ]));
    expect(report.edges[0].rejectionReasons).not.toContain('EDGE_ENDPOINT_KIND_INCOMPATIBLE');
  });

  it('accepts an exact file-level import without inventing a symbol nomination', () => {
    const edge = { src: 'file:src/caller.ts', dst: 'src/target.ts', type: 'IMPORTS', weight: 1 };
    const report = classifyRawStructuralEdgesV1([
      fileInput({ edges: [edge], facts: [referenceFact(edge)] }),
      fileInput({ sourceRef: 'src/target.ts' }),
    ]);

    expect(report.edges[0]).toMatchObject({
      status: 'ELIGIBLE_FOR_INCIDENCE',
      source: { qualifiedKind: 'FILE', qualifiedName: 'file:src/caller.ts' },
      target: { qualifiedKind: 'FILE', qualifiedName: 'file:src/target.ts' },
    });
  });

  it('qualifies an import declaration subject only from its exact source fact and span', () => {
    const edge = { src: 'import-declaration-1', dst: 'src/target.ts', type: 'IMPORTS', weight: 1 };
    const report = classifyRawStructuralEdgesV1([
      fileInput({ edges: [edge], facts: [referenceFact(edge)] }),
      fileInput({ sourceRef: 'src/target.ts' }),
    ]);

    expect(report.edges[0]).toMatchObject({
      status: 'ELIGIBLE_FOR_INCIDENCE',
      source: {
        qualifiedKind: 'IMPORT_DECLARATION',
        qualifiedName: 'import:src/caller.ts@2:8',
        resolutionBasis: 'EXACT_REFERENCE_FACT_AND_SOURCE_SPAN',
      },
      target: { qualifiedKind: 'FILE', qualifiedName: 'file:src/target.ts' },
    });
  });

  it('rejects file-to-symbol CALLS instead of treating file identity as a callable symbol', () => {
    const edge = { src: 'file:src/caller.ts', dst: 'target-node', type: 'CALLS', weight: 1 };
    const target = chunk({ upstream_node_id: 'target-node', source_ref: 'src/target.ts', symbol_name: 'target' });
    const report = classifyRawStructuralEdgesV1([
      fileInput({ edges: [edge], facts: [referenceFact(edge)] }),
      fileInput({
        sourceRef: 'src/target.ts',
        chunks: [target],
        nominations: [nomination({ nodeId: 'target-node', sourceRef: 'src/target.ts', name: 'target' })],
      }),
    ]);

    expect(report.edges[0].status).toBe('EDGE_ENDPOINT_KIND_INCOMPATIBLE');
    expect(report.edges[0].resolution).toBe('REJECTED');
  });
});
