import {
  adaptAtlasAstEvidenceToStructuralInput,
  adaptAstGrepExtractedFeature,
  adaptAstGrepMatches,
  adaptGroundedLangExtract,
  adaptSidecarGroundedExtractions,
  buildGroundedDomainCandidates,
  type GroundedDomainCandidateV1,
  compileStructuralExtractionFabric,
  type StructuralExtractionFabricResultV1,
} from '@deeds/parent-atlas';
import type { ExtractedFeature } from '$lib/server/analysis/ast-grep-extractor.js';
import type { StructuralMaterializationResult } from './graphify-structural-materializer.js';

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
    && compatibilityCount === 0;

  const langExtractDiagnostics = groundedLangExtract.receipt.rejected_ungrounded_count > 0
    ? [`LANGEXTRACT_UNGROUNDED_REJECTED:${groundedLangExtract.receipt.rejected_ungrounded_count}`]
    : [];

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
      groundedDomainCandidateCount: groundedDomainCandidates.length,
      compatibilityNodeIdCount: enriched.receipt.compatibility_node_id_count,
      compatibilityFileIdCount: enriched.receipt.compatibility_file_id_count,
      compatibilityChunkIdCount: enriched.receipt.compatibility_chunk_id_count,
      diagnostics: unique([
        ...materialization.diagnostics,
        ...enriched.receipt.diagnostics,
        ...langExtractDiagnostics,
        ...fabric.receipt.diagnostics,
      ]),
      canonicalIdentityCreated: false,
    },
  };
}
