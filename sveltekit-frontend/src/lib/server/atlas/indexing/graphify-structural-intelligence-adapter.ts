import {
  adaptAtlasAstEvidenceToStructuralInput,
  adaptAstGrepExtractedFeature,
  adaptAstGrepMatches,
  adaptGroundedLangExtract,
  adaptSidecarGroundedExtractions,
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
  sourceRevision: string;
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
  compatibilityNodeIdCount: number;
  compatibilityFileIdCount: number;
  compatibilityChunkIdCount: number;
  diagnostics: string[];
  canonicalIdentityCreated: false;
};

export type GraphifyStructuralIntelligenceResult = {
  fabric: StructuralExtractionFabricResultV1 | null;
  receipt: GraphifyStructuralIntelligenceReceipt;
};

/**
 * Compile the existing Graphify/8095 structural evidence into the Parent Atlas
 * three-producer fabric. This is intentionally pre-GIS: it creates nominations
 * and reference facts only, never stable_symbol_id or symbol_version_id.
 *
 * `langExtractMetadata` is optional because grounded LangExtract may be an
 * expensive/explicit lane. When present, only char-grounded rows survive the
 * grounding adapter.
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
}): GraphifyStructuralIntelligenceResult {
  const { materialization } = input;
  if (!materialization.evidence) {
    return {
      fabric: null,
      receipt: {
        schema: 'atlas.graphify-structural-intelligence-receipt.v1',
        sourceRef: materialization.sourceRef,
        sourceRevision: materialization.sourceRevision,
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
        compatibilityNodeIdCount: 0,
        compatibilityFileIdCount: 0,
        compatibilityChunkIdCount: 0,
        diagnostics: [...materialization.diagnostics, 'STRUCTURAL_FABRIC_SKIPPED_NO_EVIDENCE'],
        canonicalIdentityCreated: false,
      },
    };
  }

  // First adapt chunks/XRefs so ast-grep observations can attach to exact
  // overlapping Consiliency provenance.
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

  const compatibilityCount =
    enriched.receipt.compatibility_node_id_count
    + enriched.receipt.compatibility_file_id_count
    + enriched.receipt.compatibility_chunk_id_count;
  const canonicalPromotionMayBeAttempted =
    materialization.provenanceReadiness.canonicalPromotionAllowed
    && strictNativeMode
    && compatibilityCount === 0;

  return {
    fabric,
    receipt: {
      schema: 'atlas.graphify-structural-intelligence-receipt.v1',
      sourceRef: materialization.sourceRef,
      sourceRevision: materialization.sourceRevision,
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
      compatibilityNodeIdCount: enriched.receipt.compatibility_node_id_count,
      compatibilityFileIdCount: enriched.receipt.compatibility_file_id_count,
      compatibilityChunkIdCount: enriched.receipt.compatibility_chunk_id_count,
      diagnostics: [
        ...materialization.diagnostics,
        ...enriched.receipt.diagnostics,
        ...groundedLangExtract.receipt.rejected_ungrounded_count > 0
          ? [`LANGEXTRACT_UNGROUNDED_REJECTED:${groundedLangExtract.receipt.rejected_ungrounded_count}`]
          : [],
        ...fabric.receipt.diagnostics,
      ],
      canonicalIdentityCreated: false,
    },
  };
}
