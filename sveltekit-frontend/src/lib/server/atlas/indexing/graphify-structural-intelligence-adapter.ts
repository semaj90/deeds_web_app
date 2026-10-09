import { createHash } from 'node:crypto';
import {
  adaptAtlasAstEvidenceToStructuralInput,
  adaptAstGrepExtractedFeature,
  adaptAstGrepMatches,
  adaptGroundedLangExtract,
  groundLangExtractUtf8SpansV1,
  adaptSidecarGroundedExtractions,
  buildGroundedDomainCandidates,
  compileAstRelationGraphAdapterV1,
  type GroundedDomainCandidateV1,
  type AstRelationGraphAdapterResultV1,
  compileStructuralExtractionFabric,
  type StructuralExtractionFabricResultV1,
} from '@deeds/parent-atlas';
import type { ExtractedFeature } from '$lib/server/analysis/ast-grep-extractor.js';
import type { StructuralMaterializationResult } from './graphify-structural-materializer.js';
import type { ExecutionStageReceiptV1 } from './graphify-daily-coordinator-v1.js';
import type {
  GraphifyNativeSymbolCoordinateV1,
  GraphifyReferenceEvidenceV1,
} from './graphify-symbol-projection-v1.js';

export type StructuralFabricCompilationStatus =
  | 'COMPILED_NATIVE'
  | 'COMPILED_NONPROMOTABLE'
  | 'SKIPPED_NO_EVIDENCE';

export type GraphifyStructuralIntelligenceReceipt = {
  schema: 'atlas.graphify-structural-intelligence-receipt.v1';
  sourceRef: string;
  sourceRevision: string | null;
  sourceVersionAnchor: string;
  sourceRevisionAuthority: StructuralMaterializationResult['sourceRevisionAuthority'];
  parserSourceRevisionToken: string;
  workspaceRevision: string;
  status: StructuralFabricCompilationStatus;
  providerStatus: StructuralMaterializationResult['status'];
  provenanceStatus: StructuralMaterializationResult['provenanceReadiness']['status'];
  strictNativeMode: boolean;
  canonicalPromotionMayBeAttempted: boolean;
  chunkCount: number;
  symbolNominationCount: number;
  referenceFactCount: number;
  astGrepObservationCount: number;
  langExtractObservationCount: number;
  langExtractParserBufferPresent: boolean;
  langExtractParserBufferChecksum: string | null;
  langExtractParserBufferMatchesSource: boolean;
  langExtractOffsetBasis: 'PYTHON_CODEPOINT';
  langExtractSourceTextEncodingRevision: 'UTF8_PARSER_BUFFER_V1';
  langExtractFallbackUsed: boolean;
  langExtractFallbackReason: string | null;
  langExtractUtf8SpanCount: number;
  langExtractUtf8RejectionCount: number;
  langExtractUtf8MismatchCount: number;
  groundedDomainCandidateCount: number;
  compatibilityNodeIdCount: number;
  compatibilityFileIdCount: number;
  compatibilityChunkIdCount: number;
  diagnostics: string[];
  canonicalIdentityCreated: false;
  relationGraphStatus: AstRelationGraphAdapterResultV1['status'];
  relationGraphReason: AstRelationGraphAdapterResultV1['reason'];
  relationGraphChecksum: string | null;
  relationGraphNodeCount: number;
  relationGraphEdgeCount: number;
};

export type GraphifyStructuralIntelligenceResult = {
  fabric: StructuralExtractionFabricResultV1 | null;
  relationGraph: AstRelationGraphAdapterResultV1 | null;
  groundedDomainCandidates: GroundedDomainCandidateV1[];
  projectionEvidence: {
    schema: 'atlas.graphify-symbol-projection-evidence.v1';
    sourceRef: string;
    sourceRevision: string;
    workspaceRevision: string;
    producerRevision: string;
    nativeCoordinatesByUpstreamNodeId: Record<string, GraphifyNativeSymbolCoordinateV1>;
    referenceEvidenceByReferenceId: Record<string, GraphifyReferenceEvidenceV1>;
    diagnostics: string[];
    checksum: string;
    canonicalAuthority: false;
  } | null;
  receipt: GraphifyStructuralIntelligenceReceipt;
};

function structuralStageChecksum(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;
}

function bytesChecksum(value: Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function sourceByteAtPosition(sourceBytes: Uint8Array, line1Based: number, byteColumn0Based: number): number | null {
  if (!Number.isInteger(line1Based) || line1Based < 1 || !Number.isInteger(byteColumn0Based) || byteColumn0Based < 0) {
    return null;
  }
  let lineStart = 0;
  for (let line = 1; line < line1Based; line += 1) {
    const newline = sourceBytes.indexOf(10, lineStart);
    if (newline < 0) return null;
    lineStart = newline + 1;
  }
  let lineEnd = sourceBytes.indexOf(10, lineStart);
  if (lineEnd < 0) lineEnd = sourceBytes.length;
  else if (lineEnd > lineStart && sourceBytes[lineEnd - 1] === 13) lineEnd -= 1;
  const byte = lineStart + byteColumn0Based;
  return byte <= lineEnd ? byte : null;
}

function buildProjectionEvidenceV1(input: {
  source: string;
  sourceRevision: string;
  evidence: NonNullable<StructuralMaterializationResult['evidence']>;
  fabric: StructuralExtractionFabricResultV1;
}): NonNullable<GraphifyStructuralIntelligenceResult['projectionEvidence']> {
  const sourceBytes = Buffer.from(input.source, 'utf8');
  const nativeCoordinatesByUpstreamNodeId: Record<string, GraphifyNativeSymbolCoordinateV1> = {};
  const referenceEvidenceByReferenceId: Record<string, GraphifyReferenceEvidenceV1> = {};
  const diagnostics: string[] = [];

  for (const chunk of input.fabric.chunks) {
    if (chunk.byte_end > sourceBytes.length) {
      diagnostics.push(`PROJECTION_COORDINATE_OUTSIDE_SOURCE:${chunk.upstream_node_id}`);
      continue;
    }
    const sourceSpanHash = createHash('sha256')
      .update(sourceBytes.subarray(chunk.byte_start, chunk.byte_end))
      .digest('hex');
    const astFingerprint = createHash('sha256').update(JSON.stringify([
      'atlas.graphify-ast-span-fingerprint.v1',
      input.evidence.engine,
      input.evidence.engine_version,
      input.fabric.receipt.chunker_revision,
      chunk.upstream_node_id,
      chunk.node_type,
      chunk.kind,
      chunk.byte_start,
      chunk.byte_end,
      sourceSpanHash,
    ]), 'utf8').digest('hex');
    const coordinate: GraphifyNativeSymbolCoordinateV1 = {
      upstreamNodeId: chunk.upstream_node_id,
      startByte: chunk.byte_start,
      endByte: chunk.byte_end,
      startRow: chunk.start_line,
      endRow: chunk.end_line,
      astFingerprint,
    };
    const prior = nativeCoordinatesByUpstreamNodeId[chunk.upstream_node_id];
    if (prior && JSON.stringify(prior) !== JSON.stringify(coordinate)) {
      delete nativeCoordinatesByUpstreamNodeId[chunk.upstream_node_id];
      diagnostics.push(`PROJECTION_COORDINATE_AMBIGUOUS:${chunk.upstream_node_id}`);
      continue;
    }
    if (!diagnostics.includes(`PROJECTION_COORDINATE_AMBIGUOUS:${chunk.upstream_node_id}`)) {
      nativeCoordinatesByUpstreamNodeId[chunk.upstream_node_id] = coordinate;
    }
  }

  for (const fact of input.fabric.reference_facts) {
    if (fact.source_ref !== input.evidence.file_path || fact.source_revision !== input.sourceRevision) {
      diagnostics.push(`PROJECTION_REFERENCE_REVISION_MISMATCH:${fact.reference_id}`);
      continue;
    }
    const sourceKey = fact.captures.xref_source_key;
    const targetKey = fact.captures.xref_target_key;
    const xrefType = fact.captures.xref_type;
    const matchingEdges = input.evidence.edges.filter((edge) =>
      edge.from_evidence_key === sourceKey
      && edge.to_evidence_key === targetKey
      && edge.type.toUpperCase() === xrefType?.toUpperCase());
    if (matchingEdges.length === 0) {
      diagnostics.push(`PROJECTION_REFERENCE_EDGE_MISSING:${fact.reference_id}`);
      continue;
    }
    const targetBytes = Buffer.from(fact.target_text, 'utf8');
    const exactOccurrenceMap = new Map<string, { line: number; startByte: number; endByte: number }>();
    for (const edge of matchingEdges) {
      for (const [line, column] of edge.occurrence_positions ?? []) {
        const startByte = sourceByteAtPosition(sourceBytes, line, column);
        if (startByte === null) continue;
        const endByte = startByte + targetBytes.length;
        if (endByte > sourceBytes.length || !sourceBytes.subarray(startByte, endByte).equals(targetBytes)) continue;
        exactOccurrenceMap.set(`${line}:${startByte}:${endByte}`, { line, startByte, endByte });
      }
      if ((edge.occurrence_positions ?? []).length === 0) {
        const spanStart = sourceByteAtPosition(sourceBytes, edge.evidence_start_line, edge.evidence_start_column);
        const spanEnd = sourceByteAtPosition(sourceBytes, edge.evidence_end_line, edge.evidence_end_column);
        if (spanStart === null || spanEnd === null || spanEnd <= spanStart) continue;
        const enclosingSpan = sourceBytes.subarray(spanStart, spanEnd);
        const targetOffset = enclosingSpan.indexOf(targetBytes);
        if (targetOffset < 0 || enclosingSpan.indexOf(targetBytes, targetOffset + 1) >= 0) continue;
        const startByte = spanStart + targetOffset;
        const endByte = startByte + targetBytes.length;
        const line = edge.evidence_start_line
          + sourceBytes.subarray(spanStart, startByte).filter((byte) => byte === 10).length;
        exactOccurrenceMap.set(`${line}:${startByte}:${endByte}`, { line, startByte, endByte });
      }
    }
    const exactOccurrences = [...exactOccurrenceMap.values()]
      .sort((left, right) => left.startByte - right.startByte);
    if (exactOccurrences.length === 0) {
      diagnostics.push(`PROJECTION_REFERENCE_EXACT_SPAN_MISSING:${fact.reference_id}`);
      continue;
    }
    const occurrence = exactOccurrences[0]!;
    const occurrenceRefs = exactOccurrences.map(({ line, startByte, endByte }) => {
      const checksum = createHash('sha256').update(sourceBytes.subarray(startByte, endByte)).digest('hex');
      return `source-span:${fact.source_ref}@${fact.source_revision}:${line}:${startByte}-${endByte}:sha256:${checksum}`;
    });
    referenceEvidenceByReferenceId[fact.reference_id] = {
      referenceId: fact.reference_id,
      evidenceKind: 'treesitter_chunker_exact_occurrence',
      startByte: occurrence.startByte,
      endByte: occurrence.endByte,
      startRow: occurrence.line - 1,
      endRow: occurrence.line - 1,
      confidence: 1,
      evidenceRefs: occurrenceRefs,
    };
  }

  const checksumInput = {
    schema: 'atlas.graphify-symbol-projection-evidence.v1',
    sourceRef: input.evidence.file_path,
    sourceRevision: input.sourceRevision,
    workspaceRevision: input.fabric.receipt.workspace_revision,
    producerRevision: input.fabric.receipt.producer_revision,
    coordinates: Object.entries(nativeCoordinatesByUpstreamNodeId).sort(([a], [b]) => a.localeCompare(b)),
    references: Object.entries(referenceEvidenceByReferenceId).sort(([a], [b]) => a.localeCompare(b)),
    diagnostics: [...diagnostics].sort(),
  };
  return {
    schema: 'atlas.graphify-symbol-projection-evidence.v1',
    sourceRef: input.evidence.file_path,
    sourceRevision: input.sourceRevision,
    workspaceRevision: input.fabric.receipt.workspace_revision,
    producerRevision: input.fabric.receipt.producer_revision,
    nativeCoordinatesByUpstreamNodeId,
    referenceEvidenceByReferenceId,
    diagnostics,
    checksum: bytesChecksum(Buffer.from(JSON.stringify(checksumInput), 'utf8')),
    canonicalAuthority: false,
  };
}

/** Pure bridge from the existing structural receipt to coordinator stage receipts. It does not
 * persist, promote identity, or infer missing revisions; callers still decide when a receipt is
 * safe to bind to a particular execution_id. */
export function buildGraphifyStructuralStageReceiptsV1(input: {
  result: GraphifyStructuralIntelligenceResult;
}): { astParse: ExecutionStageReceiptV1; structuralExtract: ExecutionStageReceiptV1 } {
  const { receipt, fabric } = input.result;
  const astInput = structuralStageChecksum({
    sourceRef: receipt.sourceRef,
    sourceRevision: receipt.sourceRevision,
    workspaceRevision: receipt.workspaceRevision,
    parserSourceRevisionToken: receipt.parserSourceRevisionToken,
  });
  const astOutput = structuralStageChecksum({
    schema: receipt.schema,
    providerStatus: receipt.providerStatus,
    provenanceStatus: receipt.provenanceStatus,
    diagnostics: receipt.diagnostics,
  });
  const extractOutput = structuralStageChecksum({
    receipt,
    fabricReceipt: fabric?.receipt ?? null,
    projectionEvidenceChecksum: input.result.projectionEvidence?.checksum ?? null,
    relationGraphChecksum: input.result.relationGraph?.graph?.checksum ?? null,
    relationGraphStatus: receipt.relationGraphStatus,
  });
  return {
    astParse: { inputChecksum: astInput, outputChecksum: astOutput },
    structuralExtract: { inputChecksum: astOutput, outputChecksum: extractOutput },
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

/**
 * Compile the existing Graphify structural evidence into the Parent Atlas
 * three-producer fabric. Parser evidence retains its legacy string-valued
 * `source_revision` correlation token, but the receipt separately records
 * whether Atlas has proven canonical revision authority.
 */
export function compileGraphifyStructuralIntelligence(input: {
  source: string;
  parserBuffer?: Uint8Array;
  workspaceRevision: string;
  materialization: StructuralMaterializationResult;
  astGrepFeatures?: ExtractedFeature[];
  langExtractMetadata?: Record<string, unknown>;
  revisions: {
    chunker: string;
    astGrep: string;
    langExtract: string;
    adapter: string;
    fabric: string;
  };
  groundedDomainMapping?: {
    extractionClassToDomain: ReadonlyMap<string, string>;
    taxonomyRevision: string;
    evidenceRefPrefix?: string;
  };
}): GraphifyStructuralIntelligenceResult {
  const { materialization } = input;
  if (!materialization.evidence) {
    return {
        fabric: null,
      relationGraph: null,
      groundedDomainCandidates: [],
      projectionEvidence: null,
      receipt: {
        schema: 'atlas.graphify-structural-intelligence-receipt.v1',
        sourceRef: materialization.sourceRef,
        sourceRevision: materialization.sourceRevision,
        sourceVersionAnchor: materialization.sourceVersionAnchor,
        sourceRevisionAuthority: materialization.sourceRevisionAuthority,
        parserSourceRevisionToken: materialization.parserSourceRevisionToken,
        workspaceRevision: input.workspaceRevision,
        status: 'SKIPPED_NO_EVIDENCE',
        providerStatus: materialization.status,
        provenanceStatus: materialization.provenanceReadiness.status,
        strictNativeMode: false,
        canonicalPromotionMayBeAttempted: false,
        chunkCount: 0,
        symbolNominationCount: 0,
        referenceFactCount: 0,
        astGrepObservationCount: 0,
        langExtractObservationCount: 0,
        langExtractParserBufferPresent: false,
        langExtractParserBufferChecksum: null,
        langExtractParserBufferMatchesSource: false,
        langExtractOffsetBasis: 'PYTHON_CODEPOINT',
        langExtractSourceTextEncodingRevision: 'UTF8_PARSER_BUFFER_V1',
        langExtractFallbackUsed: false,
        langExtractFallbackReason: null,
        langExtractUtf8SpanCount: 0,
        langExtractUtf8RejectionCount: 0,
        langExtractUtf8MismatchCount: 0,
        groundedDomainCandidateCount: 0,
        compatibilityNodeIdCount: 0,
        compatibilityFileIdCount: 0,
        compatibilityChunkIdCount: 0,
        diagnostics: unique([...materialization.diagnostics, 'STRUCTURAL_FABRIC_SKIPPED_NO_EVIDENCE']),
        canonicalIdentityCreated: false,
        relationGraphStatus: 'DEFERRED',
        relationGraphReason: 'NO_STRUCTURAL_EVIDENCE',
        relationGraphChecksum: null,
        relationGraphNodeCount: 0,
        relationGraphEdgeCount: 0,
      },
    };
  }

  const strictNativeMode = materialization.provenanceReadiness.status === 'NATIVE_READY';
  const base = adaptAtlasAstEvidenceToStructuralInput({
    evidence: materialization.evidence,
    source_text: input.source,
    workspace_revision: input.workspaceRevision,
    chunker_revision: input.revisions.chunker,
    ast_grep_revision: input.revisions.astGrep,
    langextract_revision: input.revisions.langExtract,
    allow_compatibility_ids: !strictNativeMode,
    producer_revision: input.revisions.adapter,
  });

  const astMatches = (input.astGrepFeatures ?? [])
    .map((feature) => adaptAstGrepExtractedFeature(feature))
    .filter((match): match is NonNullable<typeof match> => match !== null);
  const astGrepObservations = adaptAstGrepMatches({
    source_ref: materialization.evidence.file_path,
    source_revision: materialization.evidence.source_revision,
    extractor_revision: input.revisions.astGrep,
    chunks: base.structural_input.chunks,
    matches: astMatches,
  });

  const rawLangExtract = adaptSidecarGroundedExtractions(input.langExtractMetadata ?? {});
  const parserBufferPresent = input.parserBuffer !== undefined;
  const parserBuffer = input.parserBuffer ?? Buffer.from(input.source, 'utf8');
  const utf8Grounding = groundLangExtractUtf8SpansV1({
    source_ref: materialization.evidence.file_path,
    source_revision: materialization.evidence.source_revision,
    expected_source_revision: materialization.evidence.source_revision,
    workspace_revision: input.workspaceRevision,
    parser_buffer: parserBuffer,
    offset_basis: 'PYTHON_CODEPOINT',
    extractions: rawLangExtract,
  });
  // Spans are returned in input order with rejected entries omitted. Only
  // exact byte-grounded spans may enter structural observations; the UTF-8
  // receipt is an admission gate, not merely diagnostics.
  const rejectedExtractionIndexes = new Set(utf8Grounding.rejections.map(({ index }) => index));
  let spanIndex = 0;
  const parserBufferText = new TextDecoder('utf-8', { fatal: true }).decode(parserBuffer);
  const parserBufferMatchesSource = parserBufferText === input.source;
  const byteVerifiedExtractions = rawLangExtract.flatMap((raw, index) => {
    if (rejectedExtractionIndexes.has(index)) return [];
    const span = utf8Grounding.spans[spanIndex++];
    if (!parserBufferMatchesSource || span?.text_matches_extraction !== true) return [];
    return [{
      ...raw,
      attributes: {
        ...raw.attributes,
        atlas_source_text_encoding_revision: span.source_text_encoding_revision,
        atlas_utf8_start_byte: span.utf8_start_byte,
        atlas_utf8_end_byte: span.utf8_end_byte,
        atlas_slice_sha256: span.slice_sha256,
        atlas_evidence_checksum: span.evidence_checksum,
      },
    }];
  });
  const groundedLangExtract = adaptGroundedLangExtract({
    source_ref: materialization.evidence.file_path,
    source_revision: materialization.evidence.source_revision,
    source_text: parserBufferText,
    extractor_revision: input.revisions.langExtract,
    producer_revision: input.revisions.adapter,
    extractions: byteVerifiedExtractions,
  });

  const enriched = adaptAtlasAstEvidenceToStructuralInput({
    evidence: materialization.evidence,
    source_text: input.source,
    workspace_revision: input.workspaceRevision,
    chunker_revision: input.revisions.chunker,
    ast_grep_revision: input.revisions.astGrep,
    langextract_revision: input.revisions.langExtract,
    ast_grep_observations: astGrepObservations,
    langextract_observations: groundedLangExtract.observations,
    allow_compatibility_ids: !strictNativeMode,
    producer_revision: input.revisions.adapter,
  });

  const fabric = compileStructuralExtractionFabric(enriched.structural_input, {
    producer_revision: input.revisions.fabric,
  });
  const relationGraph = compileAstRelationGraphAdapterV1({
    fabric,
    sourceText: input.source,
    sourceRevision: materialization.sourceRevisionAuthority === 'PROVEN'
      ? materialization.sourceRevision
      : null,
    workspaceRevision: input.workspaceRevision,
    graphProducerRevision: input.revisions.fabric,
  });
  const projectionEvidence = materialization.sourceRevision && materialization.sourceRevisionAuthority === 'PROVEN'
    && materialization.evidence.source_revision === materialization.parserSourceRevisionToken
    ? buildProjectionEvidenceV1({
      source: input.source,
      sourceRevision: materialization.sourceRevision,
      evidence: materialization.evidence,
      fabric,
    })
    : null;

  const groundedDomainCandidates = input.groundedDomainMapping
    ? buildGroundedDomainCandidates({
      observations: groundedLangExtract.observations,
      extractionClassToDomain: input.groundedDomainMapping.extractionClassToDomain,
      taxonomyRevision: input.groundedDomainMapping.taxonomyRevision,
      producerRevision: input.revisions.adapter,
      evidenceRefPrefix: input.groundedDomainMapping.evidenceRefPrefix
        ?? `langextract:${materialization.evidence.file_path}`,
    })
    : [];

  const compatibilityCount =
    enriched.receipt.compatibility_node_id_count
    + enriched.receipt.compatibility_file_id_count
    + enriched.receipt.compatibility_chunk_id_count;
  const canonicalPromotionMayBeAttempted =
    materialization.provenanceReadiness.canonicalPromotionAllowed
    && materialization.sourceRevisionAuthority === 'PROVEN'
    && materialization.sourceRevision !== null
    && strictNativeMode
    && parserBufferPresent
    && parserBufferMatchesSource
    && compatibilityCount === 0;

  const utf8Diagnostics = [
    ...(utf8Grounding.rejections.length > 0 ? [`LANGEXTRACT_UTF8_REJECTED:${utf8Grounding.rejections.length}`] : []),
    ...(utf8Grounding.spans.some((span) => !span.text_matches_extraction)
      ? [`LANGEXTRACT_UTF8_TEXT_MISMATCH:${utf8Grounding.spans.filter((span) => !span.text_matches_extraction).length}`]
      : []),
  ];

  return {
    fabric,
    relationGraph,
    groundedDomainCandidates,
    projectionEvidence,
    receipt: {
      schema: 'atlas.graphify-structural-intelligence-receipt.v1',
      sourceRef: materialization.sourceRef,
      sourceRevision: materialization.sourceRevision,
      sourceVersionAnchor: materialization.sourceVersionAnchor,
      sourceRevisionAuthority: materialization.sourceRevisionAuthority,
      parserSourceRevisionToken: materialization.parserSourceRevisionToken,
      workspaceRevision: input.workspaceRevision,
      status: canonicalPromotionMayBeAttempted ? 'COMPILED_NATIVE' : 'COMPILED_NONPROMOTABLE',
      providerStatus: materialization.status,
      provenanceStatus: materialization.provenanceReadiness.status,
      strictNativeMode,
      canonicalPromotionMayBeAttempted,
      chunkCount: fabric.receipt.chunk_count,
      symbolNominationCount: fabric.receipt.symbol_nomination_count,
      referenceFactCount: fabric.receipt.reference_fact_count,
      astGrepObservationCount: fabric.receipt.ast_grep_observation_count,
      langExtractObservationCount: fabric.receipt.grounded_langextract_count,
      langExtractParserBufferPresent: parserBufferPresent,
      langExtractParserBufferChecksum: bytesChecksum(parserBuffer),
      langExtractOffsetBasis: 'PYTHON_CODEPOINT',
      langExtractSourceTextEncodingRevision: 'UTF8_PARSER_BUFFER_V1',
      langExtractFallbackUsed: !parserBufferPresent,
      langExtractFallbackReason: parserBufferPresent ? null : 'PARSER_BUFFER_DERIVED_FROM_SOURCE_TEXT',
      langExtractParserBufferMatchesSource: parserBufferMatchesSource,
      langExtractUtf8SpanCount: utf8Grounding.spans.length,
      langExtractUtf8RejectionCount: utf8Grounding.rejections.length,
      langExtractUtf8MismatchCount: utf8Grounding.spans.filter((span) => !span.text_matches_extraction).length,
      groundedDomainCandidateCount: groundedDomainCandidates.length,
      compatibilityNodeIdCount: enriched.receipt.compatibility_node_id_count,
      compatibilityFileIdCount: enriched.receipt.compatibility_file_id_count,
      compatibilityChunkIdCount: enriched.receipt.compatibility_chunk_id_count,
      diagnostics: unique([
        ...materialization.diagnostics,
        ...enriched.receipt.diagnostics,
        ...(!parserBufferMatchesSource ? ['LANGEXTRACT_PARSER_BUFFER_SOURCE_TEXT_MISMATCH'] : []),
        ...utf8Diagnostics,
        ...fabric.receipt.diagnostics,
        ...(projectionEvidence?.diagnostics ?? []),
        ...(relationGraph.reason ? [`AST_RELATION_GRAPH_DEFERRED:${relationGraph.reason}`] : []),
      ]),
      canonicalIdentityCreated: false,
      relationGraphStatus: relationGraph.status,
      relationGraphReason: relationGraph.reason,
      relationGraphChecksum: relationGraph.graph?.checksum ?? null,
      relationGraphNodeCount: relationGraph.graph?.nodes.length ?? 0,
      relationGraphEdgeCount: relationGraph.graph?.edges.length ?? 0,
    },
  };
}
