import { createHash } from 'node:crypto';
import type {
  StructuralExtractionFabricResultV1,
} from '@deeds/parent-atlas';

import {
  isTopLevelExportRouteV1,
  parseImportStatementV1,
  resolveImportSpecifierV1,
  resolveReferenceTargetV1,
  rootIdentifierOfV1,
} from './graphify-import-target-resolver-v1.js';
import type { GraphifyImportResolutionContextV1 } from './graphify-symbol-projection-v1.js';

type StructuralReferenceFactV1 = StructuralExtractionFabricResultV1['reference_facts'][number];
type StructuralSymbolNominationV1 = StructuralExtractionFabricResultV1['symbol_nominations'][number];
type TreesitterChunkerChunkV1 = StructuralExtractionFabricResultV1['chunks'][number];
type TreesitterChunkerXrefEdgeV1 = StructuralExtractionFabricResultV1['xref_edges'][number];

export type EdgeEligibilityStatusV1 =
  | 'SOURCE_AUTHORITY_UNPROVEN'
  | 'GRAPHIFY_EDGE_SUBJECT_SYMBOL_UNMAPPED'
  | 'TARGET_SYMBOL_UNRESOLVED'
  | 'SOURCE_NODE_UNQUALIFIED'
  | 'TARGET_NODE_UNQUALIFIED'
  | 'EDGE_EVIDENCE_MISSING'
  | 'EDGE_ENDPOINT_KIND_INCOMPATIBLE'
  | 'UNSUPPORTED_EDGE_KIND'
  | 'BUILTIN_REFERENCE'
  | 'LOCAL_REFERENCE'
  | 'PARAMETER_REFERENCE'
  | 'EXTERNAL_PACKAGE_REFERENCE'
  | 'FILE_QUALIFIED'
  | 'SYMBOL_QUALIFIED'
  | 'ELIGIBLE_FOR_INCIDENCE';

export type QualifiedNodeKindV1 =
  | 'FILE'
  | 'MODULE'
  | 'IMPORT_DECLARATION'
  | 'EXPORT_DECLARATION'
  | 'EXPORTED_SYMBOL'
  | 'LOCAL_SYMBOL'
  | 'PARAMETER'
  | 'BUILTIN'
  | 'EXTERNAL_PACKAGE'
  | 'UNRESOLVED';

export type AstEdgeNodeV1 = {
  raw: string;
  qualifiedKind: QualifiedNodeKindV1;
  qualifiedName?: string;
  sourceRef?: string;
  resolutionBasis: string;
};

export type AstEdgeClassificationV1 =
  | 'BUILTIN_REFERENCE'
  | 'LOCAL_REFERENCE'
  | 'PARAMETER_REFERENCE'
  | 'EXTERNAL_PACKAGE_REFERENCE'
  | 'TARGET_SYMBOL_UNRESOLVED'
  | 'FILE_QUALIFIED'
  | 'SYMBOL_QUALIFIED'
  | 'UNRESOLVED';

export type AstEdgeEligibilityFileInputV1 = {
  sourceRef: string;
  sourceRevisionAuthority: 'PROVEN' | 'UNPROVEN';
  fabric: Pick<StructuralExtractionFabricResultV1,
    'chunks' | 'xref_edges' | 'symbol_nominations' | 'reference_facts'>;
  importResolutionContext?: GraphifyImportResolutionContextV1;
  referenceEvidenceByReferenceId?: Readonly<Record<string, {
    startByte: number;
    endByte: number;
    evidenceRefs: readonly string[];
  }>>;
};

export type AstEdgeEligibilityV1 = {
  schema: 'atlas.ast-edge-eligibility.v1';
  sourceRef: string;
  edgeOrdinal: number;
  edgeKind: string;
  source: AstEdgeNodeV1;
  target: AstEdgeNodeV1;
  sourceAuthority: 'PROVEN' | 'UNPROVEN';
  evidence: { referenceId: string | null; startByte: number | null; endByte: number | null; evidenceRefs: string[] };
  classification: AstEdgeClassificationV1;
  status: EdgeEligibilityStatusV1;
  rejectionReasons: EdgeEligibilityStatusV1[];
  admissionStatus: 'NOT_ADMISSIBLE' | 'INCIDENCE_CANDIDATE_ONLY';
  resolution: 'ELIGIBLE' | 'REJECTED';
  canonicalAuthority: false;
};

export type AstEdgeEligibilityMatrixRowV1 = {
  sourceRef: string;
  edgeKind: string;
  total: number;
  subjectOk: number;
  targetOk: number;
  qualified: number;
  eligible: number;
};

export type AstEdgeEligibilityReportV1 = {
  schema: 'atlas.ast-edge-eligibility-report.v1';
  edges: AstEdgeEligibilityV1[];
  perFileMatrix: AstEdgeEligibilityMatrixRowV1[];
  failureBuckets: Partial<Record<EdgeEligibilityStatusV1, number>>;
  canonicalAuthority: false;
  writesPerformed: false;
  checksum: string;
};

const SUPPORTED_EDGE_KINDS = new Set(['CALLS', 'DEFINES', 'IMPORTS', 'EXPORTS', 'INHERITS', 'IMPLEMENTS', 'REFERENCES']);
const DEFAULT_BUILTINS: Readonly<Record<string, ReadonlySet<string>>> = Object.freeze({
  javascript: new Set(['Array', 'BigInt', 'Boolean', 'Date', 'Error', 'Function', 'JSON', 'Map', 'Math', 'Number', 'Object', 'Promise', 'Proxy', 'Reflect', 'RegExp', 'Set', 'String', 'Symbol', 'WeakMap', 'WeakSet']),
  javascriptreact: new Set(['Array', 'BigInt', 'Boolean', 'Date', 'Error', 'Function', 'JSON', 'Map', 'Math', 'Number', 'Object', 'Promise', 'Proxy', 'Reflect', 'RegExp', 'Set', 'String', 'Symbol', 'WeakMap', 'WeakSet']),
  typescript: new Set(['Array', 'BigInt', 'Boolean', 'Date', 'Error', 'Function', 'JSON', 'Map', 'Math', 'Number', 'Object', 'Promise', 'Proxy', 'Reflect', 'RegExp', 'Set', 'String', 'Symbol', 'WeakMap', 'WeakSet']),
  tsx: new Set(['Array', 'BigInt', 'Boolean', 'Date', 'Error', 'Function', 'JSON', 'Map', 'Math', 'Number', 'Object', 'Promise', 'Proxy', 'Reflect', 'RegExp', 'Set', 'String', 'Symbol', 'WeakMap', 'WeakSet']),
});

const DISQUALIFYING_KINDS = new Set<QualifiedNodeKindV1>(['PARAMETER', 'BUILTIN', 'EXTERNAL_PACKAGE', 'UNRESOLVED']);

type IndexedChunk = { sourceRef: string; chunk: TreesitterChunkerChunkV1 };

function normalizedRef(value: string): string {
  return value.trim().replaceAll('\\', '/').replace(/^\.\//, '').normalize('NFC');
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function identityKeys(chunk: TreesitterChunkerChunkV1): string[] {
  return [chunk.upstream_node_id, chunk.upstream_symbol_id, chunk.upstream_chunk_id].filter((value): value is string => Boolean(value));
}

function isParameterChunk(chunk: TreesitterChunkerChunkV1): boolean {
  return /parameter|formal_parameter/i.test(`${chunk.kind} ${chunk.node_type}`);
}

function isModuleChunk(chunk: TreesitterChunkerChunkV1): boolean {
  return /\b(module|source_file|program)\b/i.test(`${chunk.kind} ${chunk.node_type}`);
}

function qualifiedChunkNode(
  raw: string,
  indexed: IndexedChunk,
  nominations: readonly StructuralSymbolNominationV1[],
  basis: string,
): AstEdgeNodeV1 {
  const { chunk, sourceRef } = indexed;
  const matching = nominations.filter((item) => item.upstream_node_id === chunk.upstream_node_id);
  if (matching.length === 1) {
    const nomination = matching[0];
    const exported = isTopLevelExportRouteV1(nomination.parent_route);
    const qualifiedName = `${normalizedRef(sourceRef)}#${nomination.qualified_name}`;
    return {
      raw,
      qualifiedKind: exported ? 'EXPORTED_SYMBOL' : 'LOCAL_SYMBOL',
      qualifiedName: `${exported ? 'symbol' : 'local'}:${qualifiedName}`,
      sourceRef: normalizedRef(sourceRef),
      resolutionBasis: basis,
    };
  }
  if (matching.length > 1) return unresolved(raw, 'AMBIGUOUS_SYMBOL_NOMINATION');

  const name = chunk.symbol_name;
  if (isParameterChunk(chunk) && name) {
    const owner = chunk.parent_context || chunk.parent_route.join('::');
    return {
      raw,
      qualifiedKind: 'PARAMETER',
      qualifiedName: `param:${normalizedRef(sourceRef)}#${owner ? `${owner}/` : ''}${name}`,
      sourceRef: normalizedRef(sourceRef),
      resolutionBasis: basis,
    };
  }
  if (name && /function|method|class|interface|enum|type|namespace|module|variable|constant|property|field/i.test(`${chunk.kind} ${chunk.node_type}`)) {
    const qualifiedName = [...chunk.parent_route, name].filter(Boolean).join('::');
    return {
      raw,
      qualifiedKind: 'LOCAL_SYMBOL',
      qualifiedName: `local:${normalizedRef(sourceRef)}#${qualifiedName}`,
      sourceRef: normalizedRef(sourceRef),
      resolutionBasis: `${basis}_CHUNK_DECLARATION`,
    };
  }
  if (isModuleChunk(chunk)) {
    return { raw, qualifiedKind: 'MODULE', qualifiedName: `module:${normalizedRef(sourceRef)}`, sourceRef: normalizedRef(sourceRef), resolutionBasis: basis };
  }
  return unresolved(raw, 'CHUNK_HAS_NO_QUALIFIED_SYMBOL');
}

function unresolved(raw: string, basis: string): AstEdgeNodeV1 {
  return { raw, qualifiedKind: 'UNRESOLVED', resolutionBasis: basis };
}

function fileNode(raw: string, sourceRef: string, basis: string): AstEdgeNodeV1 {
  const normalized = normalizedRef(sourceRef);
  return { raw, qualifiedKind: 'FILE', qualifiedName: `file:${normalized}`, sourceRef: normalized, resolutionBasis: basis };
}

function declarationNode(
  raw: string,
  sourceRef: string,
  fact: StructuralReferenceFactV1 | undefined,
  evidence: AstEdgeEligibilityV1['evidence'] | undefined,
): AstEdgeNodeV1 | null {
  if (!fact || !evidence?.referenceId || evidence.startByte === null || evidence.endByte === null
    || evidence.endByte <= evidence.startByte || evidence.evidenceRefs.length === 0
    || normalizedRef(fact.source_ref) !== normalizedRef(sourceRef)) return null;
  const declarationKind = fact.reference_kind === 'import'
    ? 'IMPORT_DECLARATION'
    : fact.reference_kind === 'export' ? 'EXPORT_DECLARATION' : null;
  if (!declarationKind) return null;
  return {
    raw,
    qualifiedKind: declarationKind,
    qualifiedName: `${declarationKind === 'IMPORT_DECLARATION' ? 'import' : 'export'}:${normalizedRef(sourceRef)}@${evidence.startByte}:${evidence.endByte}`,
    sourceRef: normalizedRef(sourceRef),
    resolutionBasis: 'EXACT_REFERENCE_FACT_AND_SOURCE_SPAN',
  };
}

function referenceFactForEdge(
  edge: TreesitterChunkerXrefEdgeV1,
  facts: readonly StructuralReferenceFactV1[],
): StructuralReferenceFactV1 | undefined {
  const matches = facts.filter((fact) =>
    fact.captures.xref_source_key === edge.src
    && fact.captures.xref_target_key === edge.dst
    && fact.captures.xref_type?.toUpperCase() === edge.type.toUpperCase());
  return matches.length === 1 ? matches[0] : undefined;
}

function importSpecifierFromFact(fact: StructuralReferenceFactV1 | undefined): string | null {
  if (!fact || fact.reference_kind !== 'import') return null;
  const parsed = parseImportStatementV1(fact.target_text);
  if (parsed) return parsed.specifier;
  const quoted = /['"]([^'"]+)['"]/.exec(fact.target_text);
  return quoted?.[1] ?? (fact.target_text.trim() || null);
}

function relationEndpointsCompatible(
  edgeKind: string,
  sourceKind: QualifiedNodeKindV1,
  targetKind: QualifiedNodeKindV1,
): boolean {
  const sourceSymbol = sourceKind === 'EXPORTED_SYMBOL' || sourceKind === 'LOCAL_SYMBOL';
  const sourceFile = sourceKind === 'FILE' || sourceKind === 'MODULE';
  const sourceImport = sourceKind === 'IMPORT_DECLARATION';
  const sourceExport = sourceKind === 'EXPORT_DECLARATION';
  const targetSymbol = targetKind === 'EXPORTED_SYMBOL' || targetKind === 'LOCAL_SYMBOL';
  const targetFile = targetKind === 'FILE' || targetKind === 'MODULE';
  switch (edgeKind.toUpperCase()) {
    case 'CALLS':
    case 'INHERITS':
    case 'IMPLEMENTS':
    case 'REFERENCES':
      return sourceSymbol && targetSymbol;
    case 'DEFINES':
      return (sourceSymbol || sourceFile) && targetSymbol;
    case 'IMPORTS':
      return (sourceFile || sourceImport) && targetFile;
    case 'EXPORTS':
      return (sourceFile || sourceExport) && targetKind === 'EXPORTED_SYMBOL';
    default:
      return false;
  }
}

function resolveTarget(input: {
  raw: string;
  fact?: StructuralReferenceFactV1;
  sourceRef: string;
  files: readonly AstEdgeEligibilityFileInputV1[];
  indexedChunksById: ReadonlyMap<string, readonly IndexedChunk[]>;
  allNominations: readonly StructuralSymbolNominationV1[];
  localNominations: readonly StructuralSymbolNominationV1[];
  knownSourceRefs: ReadonlySet<string>;
  importContext?: GraphifyImportResolutionContextV1;
}): AstEdgeNodeV1 {
  const direct = input.indexedChunksById.get(input.raw) ?? [];
  if (direct.length === 1) return qualifiedChunkNode(input.raw, direct[0], input.allNominations, 'EXACT_LOCAL_IDENTITY');
  if (direct.length > 1) return unresolved(input.raw, 'AMBIGUOUS_EXACT_IDENTITY');

  const root = rootIdentifierOfV1(input.fact?.target_text ?? input.raw);
  if (root) {
    const localMatches = input.localNominations.filter((item) => item.name === root || item.qualified_name === root);
    if (localMatches.length === 1) {
      const nomination = localMatches[0];
      const chunk = input.files.flatMap((file) => file.fabric.chunks.map((item) => ({ sourceRef: file.sourceRef, chunk: item })))
        .find((item) => item.chunk.upstream_node_id === nomination.upstream_node_id);
      if (chunk) return qualifiedChunkNode(input.raw, chunk, input.allNominations, 'EXACT_LOCAL_SYMBOL_NAME');
    }
    if (localMatches.length > 1) return unresolved(input.raw, 'AMBIGUOUS_LOCAL_SYMBOL_NAME');
  }

  if (input.importContext && input.fact) {
    const imported = resolveReferenceTargetV1({
      targetText: input.fact.target_text,
      fromSourceRef: normalizedRef(input.sourceRef),
      ...input.importContext,
    });
    if (imported.status === 'RESOLVED_SYMBOL' && imported.targetSourceRef && imported.targetSymbolKey) {
      const matches = input.allNominations.filter((item) =>
        item.symbol_key === imported.targetSymbolKey && normalizedRef(item.source_ref) === normalizedRef(imported.targetSourceRef!));
      if (matches.length === 1) {
        const nomination = matches[0];
        const chunk = input.files.flatMap((file) => file.fabric.chunks.map((item) => ({ sourceRef: file.sourceRef, chunk: item })))
          .find((item) => item.chunk.upstream_node_id === nomination.upstream_node_id);
        if (chunk) return qualifiedChunkNode(input.raw, chunk, input.allNominations, 'EXACT_IMPORTED_EXPORT');
      }
      return unresolved(input.raw, matches.length > 1 ? 'AMBIGUOUS_IMPORTED_EXPORT' : 'EXPORTED_SYMBOL_NOMINATION_MISSING');
    }
  }

  const exactRef = normalizedRef(input.raw.replace(/^file:/, ''));
  const fileMatch = [...input.knownSourceRefs].find((sourceRef) => normalizedRef(sourceRef) === exactRef);
  if (fileMatch) return fileNode(input.raw, fileMatch, 'EXACT_SOURCE_REF');

  const specifier = importSpecifierFromFact(input.fact);
  if (specifier && input.importContext) {
    const resolution = resolveImportSpecifierV1(
      normalizedRef(input.sourceRef),
      specifier,
      input.importContext.knownSourceRefs,
    );
    if (resolution.status === 'RESOLVED' && resolution.sourceRef) {
      return fileNode(input.raw, resolution.sourceRef, 'EXACT_IMPORTED_MODULE');
    }
    if (resolution.status === 'EXTERNAL_PACKAGE') {
      return { raw: input.raw, qualifiedKind: 'EXTERNAL_PACKAGE', qualifiedName: `package:${specifier}`, resolutionBasis: 'EXACT_BARE_IMPORT_SPECIFIER' };
    }
  }

  if (root) {
    const language = input.files.find((file) => normalizedRef(file.sourceRef) === normalizedRef(input.sourceRef))?.fabric.chunks[0]?.language.toLowerCase();
    if (language && DEFAULT_BUILTINS[language]?.has(root)) {
      return { raw: input.raw, qualifiedKind: 'BUILTIN', qualifiedName: `builtin:${root}`, resolutionBasis: `EXACT_${language.toUpperCase()}_BUILTIN` };
    }
  }
  return unresolved(input.raw, 'NO_EXACT_TARGET_MATCH');
}

function classifyEdge(input: {
  sourceRef: string;
  sourceAuthority: 'PROVEN' | 'UNPROVEN';
  edge: TreesitterChunkerXrefEdgeV1;
  subject: AstEdgeNodeV1;
  target: AstEdgeNodeV1;
  evidence: AstEdgeEligibilityV1['evidence'];
}): AstEdgeEligibilityV1 {
  const rejectionReasons: EdgeEligibilityStatusV1[] = [];
  if (input.sourceAuthority !== 'PROVEN') rejectionReasons.push('SOURCE_AUTHORITY_UNPROVEN');
  if (input.subject.qualifiedKind === 'UNRESOLVED') {
    rejectionReasons.push('GRAPHIFY_EDGE_SUBJECT_SYMBOL_UNMAPPED', 'SOURCE_NODE_UNQUALIFIED');
  }
  if (input.target.qualifiedKind === 'UNRESOLVED') {
    rejectionReasons.push('TARGET_SYMBOL_UNRESOLVED', 'TARGET_NODE_UNQUALIFIED');
  }
  if (input.target.qualifiedKind === 'BUILTIN') rejectionReasons.push('BUILTIN_REFERENCE');
  if (input.target.qualifiedKind === 'EXTERNAL_PACKAGE') rejectionReasons.push('EXTERNAL_PACKAGE_REFERENCE');
  if (input.subject.qualifiedKind === 'PARAMETER' || input.target.qualifiedKind === 'PARAMETER') {
    rejectionReasons.push('PARAMETER_REFERENCE');
  }
  if (!SUPPORTED_EDGE_KINDS.has(input.edge.type.toUpperCase())) rejectionReasons.push('UNSUPPORTED_EDGE_KIND');
  else if (input.subject.qualifiedKind !== 'UNRESOLVED' && input.target.qualifiedKind !== 'UNRESOLVED'
    && !DISQUALIFYING_KINDS.has(input.subject.qualifiedKind) && !DISQUALIFYING_KINDS.has(input.target.qualifiedKind)
    && !relationEndpointsCompatible(input.edge.type, input.subject.qualifiedKind, input.target.qualifiedKind)) {
    rejectionReasons.push('EDGE_ENDPOINT_KIND_INCOMPATIBLE');
  }
  if (!input.evidence.referenceId || input.evidence.startByte === null || input.evidence.endByte === null
    || input.evidence.endByte <= input.evidence.startByte || input.evidence.evidenceRefs.length === 0) {
    rejectionReasons.push('EDGE_EVIDENCE_MISSING');
  }

  const disqualified = new Set<EdgeEligibilityStatusV1>([
    'SOURCE_AUTHORITY_UNPROVEN', 'GRAPHIFY_EDGE_SUBJECT_SYMBOL_UNMAPPED', 'SOURCE_NODE_UNQUALIFIED',
    'TARGET_SYMBOL_UNRESOLVED', 'TARGET_NODE_UNQUALIFIED', 'BUILTIN_REFERENCE', 'EXTERNAL_PACKAGE_REFERENCE',
    'PARAMETER_REFERENCE', 'UNSUPPORTED_EDGE_KIND', 'EDGE_EVIDENCE_MISSING', 'EDGE_ENDPOINT_KIND_INCOMPATIBLE',
  ]);
  const blockingReasons = rejectionReasons.filter((reason) => disqualified.has(reason));
  const resolution = blockingReasons.length === 0 ? 'ELIGIBLE' : 'REJECTED';
  const targetKind = input.target.qualifiedKind;
  const classification: AstEdgeEligibilityV1['classification'] = targetKind === 'BUILTIN'
    ? 'BUILTIN_REFERENCE'
    : targetKind === 'EXTERNAL_PACKAGE'
      ? 'EXTERNAL_PACKAGE_REFERENCE'
      : targetKind === 'PARAMETER'
        ? 'PARAMETER_REFERENCE'
        : targetKind === 'FILE' || targetKind === 'MODULE'
          ? 'FILE_QUALIFIED'
          : targetKind === 'EXPORTED_SYMBOL'
            ? 'SYMBOL_QUALIFIED'
            : targetKind === 'LOCAL_SYMBOL'
              ? 'LOCAL_REFERENCE'
              : 'TARGET_SYMBOL_UNRESOLVED';
  const status: EdgeEligibilityStatusV1 = resolution === 'ELIGIBLE'
    ? 'ELIGIBLE_FOR_INCIDENCE'
    : rejectionReasons[0] ?? 'TARGET_SYMBOL_UNRESOLVED';

  return {
    schema: 'atlas.ast-edge-eligibility.v1',
    sourceRef: normalizedRef(input.sourceRef),
    edgeOrdinal: 0,
    edgeKind: input.edge.type.toUpperCase(),
    source: input.subject,
    target: input.target,
    sourceAuthority: input.sourceAuthority,
    evidence: input.evidence,
    classification,
    status,
    rejectionReasons: [...new Set(rejectionReasons)],
    admissionStatus: resolution === 'ELIGIBLE' ? 'INCIDENCE_CANDIDATE_ONLY' : 'NOT_ADMISSIBLE',
    resolution,
    canonicalAuthority: false,
  };
}

export function classifyRawStructuralEdgesV1(
  files: readonly AstEdgeEligibilityFileInputV1[],
): AstEdgeEligibilityReportV1 {
  const normalizedFiles = [...files].sort((a, b) => normalizedRef(a.sourceRef).localeCompare(normalizedRef(b.sourceRef)));
  const knownSourceRefs = new Set(normalizedFiles.map((file) => normalizedRef(file.sourceRef)));
  const allNominations = normalizedFiles.flatMap((file) => file.fabric.symbol_nominations);
  const indexedChunks = normalizedFiles.flatMap((file) => file.fabric.chunks.map((chunk) => ({ sourceRef: normalizedRef(file.sourceRef), chunk })));
  const indexedChunksById = new Map<string, IndexedChunk[]>();
  for (const indexed of indexedChunks) {
    for (const key of identityKeys(indexed.chunk)) indexedChunksById.set(key, [...(indexedChunksById.get(key) ?? []), indexed]);
  }

  const edgeRows: AstEdgeEligibilityV1[] = [];
  for (const file of normalizedFiles) {
    const sourceRef = normalizedRef(file.sourceRef);
    const localNominations = file.fabric.symbol_nominations;
    const orderedEdges = [...file.fabric.xref_edges].sort((a, b) =>
      a.type.localeCompare(b.type) || a.src.localeCompare(b.src) || a.dst.localeCompare(b.dst) || a.weight - b.weight);
    for (const [edgeOrdinal, edge] of orderedEdges.entries()) {
      const fact = referenceFactForEdge(edge, file.fabric.reference_facts);
      const evidenceRecord = fact ? file.referenceEvidenceByReferenceId?.[fact.reference_id] : undefined;
      const evidence: AstEdgeEligibilityV1['evidence'] = {
        referenceId: fact?.reference_id ?? null,
        startByte: evidenceRecord?.startByte ?? null,
        endByte: evidenceRecord?.endByte ?? null,
        evidenceRefs: [...(evidenceRecord?.evidenceRefs ?? [])].sort(),
      };
      const subjectChunk = indexedChunksById.get(edge.src) ?? [];
      const uniqueSubjectChunk = subjectChunk.length === 1 ? subjectChunk[0] : null;
      let subject = uniqueSubjectChunk
        ? qualifiedChunkNode(edge.src, uniqueSubjectChunk, allNominations, 'EXACT_SOURCE_ENDPOINT')
        : unresolved(edge.src, subjectChunk.length > 1 ? 'AMBIGUOUS_SOURCE_ENDPOINT' : 'NO_EXACT_SOURCE_ENDPOINT');
      if (!uniqueSubjectChunk && (edge.src === sourceRef || edge.src === `file:${sourceRef}`)) {
        subject = fileNode(edge.src, sourceRef, 'EXACT_EDGE_SOURCE_REF');
      }
      if (!uniqueSubjectChunk && subject.qualifiedKind === 'UNRESOLVED') {
        subject = declarationNode(edge.src, sourceRef, fact, evidence) ?? subject;
      }

      const target = resolveTarget({
        raw: edge.dst,
        fact,
        sourceRef,
        files: normalizedFiles,
        indexedChunksById,
        allNominations,
        localNominations,
        knownSourceRefs,
        importContext: file.importResolutionContext,
      });
      const row = classifyEdge({ sourceRef, sourceAuthority: file.sourceRevisionAuthority, edge, subject, target, evidence });
      row.edgeOrdinal = edgeOrdinal;
      edgeRows.push(row);
    }
  }

  const matrixByKey = new Map<string, AstEdgeEligibilityMatrixRowV1>();
  const failureBuckets: Partial<Record<EdgeEligibilityStatusV1, number>> = {};
  for (const edge of edgeRows) {
    const key = `${edge.sourceRef}\0${edge.edgeKind}`;
    const row = matrixByKey.get(key) ?? {
      sourceRef: edge.sourceRef, edgeKind: edge.edgeKind, total: 0, subjectOk: 0, targetOk: 0, qualified: 0, eligible: 0,
    };
    row.total += 1;
    const subjectOk = edge.source.qualifiedKind !== 'UNRESOLVED';
    const targetOk = edge.target.qualifiedKind !== 'UNRESOLVED';
    if (subjectOk) row.subjectOk += 1;
    if (targetOk) row.targetOk += 1;
    if (subjectOk && targetOk) row.qualified += 1;
    if (edge.resolution === 'ELIGIBLE') row.eligible += 1;
    matrixByKey.set(key, row);
    for (const reason of edge.rejectionReasons) failureBuckets[reason] = (failureBuckets[reason] ?? 0) + 1;
  }

  edgeRows.sort((a, b) => a.sourceRef.localeCompare(b.sourceRef)
    || a.edgeKind.localeCompare(b.edgeKind)
    || a.edgeOrdinal - b.edgeOrdinal
    || a.source.raw.localeCompare(b.source.raw)
    || a.target.raw.localeCompare(b.target.raw));
  const content = {
    schema: 'atlas.ast-edge-eligibility-report.v1' as const,
    edges: edgeRows,
    perFileMatrix: [...matrixByKey.values()].sort((a, b) => a.sourceRef.localeCompare(b.sourceRef) || a.edgeKind.localeCompare(b.edgeKind)),
    failureBuckets: Object.fromEntries(Object.entries(failureBuckets).sort(([a], [b]) => a.localeCompare(b))) as Partial<Record<EdgeEligibilityStatusV1, number>>,
    canonicalAuthority: false as const,
    writesPerformed: false as const,
  };
  return { ...content, checksum: digest(content) };
}
