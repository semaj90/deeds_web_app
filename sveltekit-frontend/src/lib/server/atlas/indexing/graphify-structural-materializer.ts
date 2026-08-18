import { createMiniforgeNlpSidecarClient, type AtlasStructuralEvidence } from '$lib/server/nlp/miniforge-nlp-sidecar.js';
import { normalizeAtlasAstEvidence, type NormalizedAtlasStructuralEvidence } from '$lib/server/analysis/atlas-ast-evidence-normalizer.js';

export type CanonicalSourceRef = {
  sourceRef: string;
  sourceRevision: string;
  language: string;
  source: string;
};

export type AstProviderResult = {
  provider: 'treesitter-chunker-8095';
  status: 'PROVEN' | 'RECOVERED_WITH_ERRORS' | 'FAILED';
  evidence?: AtlasStructuralEvidence;
  errorTag?: string;
  diagnostics: string[];
};

export interface AstProvider {
  materialize(input: CanonicalSourceRef): Promise<AstProviderResult>;
}

export function create8095AstProvider(baseUrl?: string): AstProvider {
  const sidecar = createMiniforgeNlpSidecarClient(baseUrl);
  return {
    async materialize(input) {
      try {
        const evidence = await sidecar.astChunk({
          source: input.source,
          language: input.language,
          filePath: input.sourceRef,
          sourceRevision: input.sourceRevision,
        });
        const diagnostics = evidence.diagnostics ?? [];
        return {
          provider: 'treesitter-chunker-8095',
          status: diagnostics.length > 0 || evidence.syntax_status === 'RECOVERED_WITH_ERRORS' ? 'RECOVERED_WITH_ERRORS' : 'PROVEN',
          evidence,
          diagnostics,
          errorTag: evidence.error_tag ?? undefined,
        };
      } catch (error) {
        return {
          provider: 'treesitter-chunker-8095',
          status: 'FAILED',
          diagnostics: [error instanceof Error ? error.message : String(error)],
          errorTag: 'SIDECAR_UNAVAILABLE_OR_SCHEMA_FAILURE',
        };
      }
    },
  };
}

export type StructuralProvenanceReadiness = {
  status: 'NATIVE_READY' | 'COMPATIBILITY_ONLY' | 'NO_EVIDENCE';
  nativeNodeIds: number;
  nativeFileIds: number;
  nativeSymbolIds: number;
  upstreamChunkIds: number;
  symbolCount: number;
  canonicalPromotionAllowed: boolean;
  reason: string;
};

function evaluateProvenanceReadiness(normalized: NormalizedAtlasStructuralEvidence | null): StructuralProvenanceReadiness {
  if (!normalized || normalized.symbols.length === 0) {
    return {
      status: 'NO_EVIDENCE',
      nativeNodeIds: 0,
      nativeFileIds: 0,
      nativeSymbolIds: 0,
      upstreamChunkIds: 0,
      symbolCount: 0,
      canonicalPromotionAllowed: false,
      reason: 'No normalized structural symbols were produced.',
    };
  }

  const { provenance } = normalized;
  const symbolCount = normalized.symbols.length;
  const allNodesNative = provenance.nativeNodeIdCount === symbolCount;
  const allFilesNative = provenance.nativeFileIdCount === symbolCount;
  const chunksAvailable = provenance.upstreamChunkIdCount === symbolCount;

  if (allNodesNative && allFilesNative && chunksAvailable) {
    return {
      status: 'NATIVE_READY',
      nativeNodeIds: provenance.nativeNodeIdCount,
      nativeFileIds: provenance.nativeFileIdCount,
      nativeSymbolIds: provenance.nativeSymbolIdCount,
      upstreamChunkIds: provenance.upstreamChunkIdCount,
      symbolCount,
      canonicalPromotionAllowed: true,
      reason: 'All structural symbols retain native Consiliency node/file/chunk provenance; GIS may evaluate canonical promotion.',
    };
  }

  return {
    status: 'COMPATIBILITY_ONLY',
    nativeNodeIds: provenance.nativeNodeIdCount,
    nativeFileIds: provenance.nativeFileIdCount,
    nativeSymbolIds: provenance.nativeSymbolIdCount,
    upstreamChunkIds: provenance.upstreamChunkIdCount,
    symbolCount,
    canonicalPromotionAllowed: false,
    reason: 'One or more structural symbols lack native Consiliency node/file/chunk provenance; compatibility coordinates remain noncanonical.',
  };
}

export type StructuralMaterializationResult = {
  sourceRef: string;
  sourceRevision: string;
  provider: AstProviderResult['provider'];
  status: AstProviderResult['status'];
  normalized: NormalizedAtlasStructuralEvidence | null;
  provenanceReadiness: StructuralProvenanceReadiness;
  diagnostics: string[];
  persistence: 'NOT_ATTEMPTED';
  fallback: 'NONE';
};

/**
 * Canonical Graphify owner boundary. It owns orchestration and receipt shape;
 * 8095 owns structural parsing evidence. Identity persistence and projections
 * remain downstream and are intentionally not performed here.
 *
 * `canonicalPromotionAllowed=true` means only that native structural provenance
 * is complete enough for GIS to evaluate promotion. It does NOT mean identity
 * has been promoted or persisted.
 */
export class GraphifyStructuralMaterializer {
  constructor(private readonly astProvider: AstProvider = create8095AstProvider()) {}

  async materialize(input: CanonicalSourceRef): Promise<StructuralMaterializationResult> {
    const result = await this.astProvider.materialize(input);
    const normalized = result.evidence && result.status !== 'FAILED'
      ? normalizeAtlasAstEvidence(result.evidence)
      : null;
    const provenanceReadiness = evaluateProvenanceReadiness(normalized);
    const diagnostics = [...result.diagnostics];
    if (provenanceReadiness.status === 'COMPATIBILITY_ONLY') {
      diagnostics.push('STRUCTURAL_PROVENANCE_COMPATIBILITY_ONLY');
    }
    return {
      sourceRef: input.sourceRef,
      sourceRevision: input.sourceRevision,
      provider: result.provider,
      status: result.status,
      normalized,
      provenanceReadiness,
      diagnostics,
      persistence: 'NOT_ATTEMPTED',
      fallback: 'NONE',
    };
  }
}
