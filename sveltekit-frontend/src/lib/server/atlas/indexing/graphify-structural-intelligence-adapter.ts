import { createHash } from 'node:crypto';
import {
  adaptAtlasAstEvidenceToStructuralInput,
  adaptAstGrepExtractedFeature,
  adaptAstGrepMatches,
  adaptGroundedLangExtract,
  groundLangExtractUtf8SpansV1,
  adaptSidecarGroundedExtractions,
  buildGroundedDomainCandidates,
  type GroundedDomainCandidateV1,
  compileStructuralExtractionFabric,
  type StructuralExtractionFabricResultV1,
} from '@deeds/parent-atlas';
import type { ExtractedFeature } from '$lib/server/analysis/ast-grep-extractor.js';
import type { StructuralMaterializationResult } from './graphify-structural-materializer.js';
import type { ExecutionStageReceiptV1 } from './graphify-daily-coordinator-v1.js';

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
};

export type GraphifyStructuralIntelligenceResult = {
  fabric: StructuralExtractionFabricResultV1 | null;
  groundedDomainCandidates: GroundedDomainCandidateV1[];
  receipt: GraphifyStructuralIntelligenceReceipt;
};

function structuralStageChecksum(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;
}

function bytesChecksum(value: Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
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
      groundedDomainCandidates: [],
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
  const groundedLangExtract = adaptGroundedLangExtract({
    source_ref: materialization.evidence.file_path,
    source_revision: materialization.evidence.source_revision,
    source_text: input.source,
    extractor_revision: input.revisions.langExtract,
    producer_revision: input.revisions.adapter,
    extractions: rawLangExtract,
  });
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
    && compatibilityCount === 0;

  const langExtractDiagnostics = groundedLangExtract.receipt.rejected_ungrounded_count > 0
    ? [`LANGEXTRACT_UNGROUNDED_REJECTED:${groundedLangExtract.receipt.rejected_ungrounded_count}`]
    : [];
  const utf8Diagnostics = [
    ...(utf8Grounding.rejections.length > 0 ? [`LANGEXTRACT_UTF8_REJECTED:${utf8Grounding.rejections.length}`] : []),
    ...(utf8Grounding.spans.some((span) => !span.text_matches_extraction)
      ? [`LANGEXTRACT_UTF8_TEXT_MISMATCH:${utf8Grounding.spans.filter((span) => !span.text_matches_extraction).length}`]
      : []),
  ];

  return {
    fabric,
    groundedDomainCandidates,
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
        ...langExtractDiagnostics,
        ...utf8Diagnostics,
        ...fabric.receipt.diagnostics,
      ]),
      canonicalIdentityCreated: false,
    },
  };
}
