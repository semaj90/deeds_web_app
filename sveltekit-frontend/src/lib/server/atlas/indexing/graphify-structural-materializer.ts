import { createMiniforgeNlpSidecarClient, type AtlasStructuralEvidence } from '$lib/server/nlp/miniforge-nlp-sidecar.js';
import {
  normalizeAtlasAstEvidence,
  type NormalizedAtlasStructuralEvidence,
} from '$lib/server/analysis/atlas-ast-evidence-normalizer.js';

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

export type StructuralPromotionGate =
  | 'ELIGIBLE_FOR_GIS_EVALUATION'
  | 'BLOCKED_NATIVE_PROVENANCE_INCOMPLETE'
  | 'BLOCKED_PROVIDER_FAILURE';

export type StructuralMaterializationResult = {
  sourceRef: string;
  sourceRevision: string;
  provider: AstProviderResult['provider'];
  status: AstProviderResult['status'];
  normalized: NormalizedAtlasStructuralEvidence | null;
  diagnostics: string[];
  nativeProvenanceComplete: boolean;
  promotionGate: StructuralPromotionGate;
  /** Canonical IDs remain owned by GIS/persistence and are never minted here. */
  canonicalIdentity: {
    symbolId: null;
    symbolVersionId: null;
    packetKey: null;
  };
  persistence: 'NOT_ATTEMPTED';
  fallback: 'NONE';
};

/**
 * Canonical Graphify structural owner boundary.
 *
 * 8095/Consiliency owns parse/chunk evidence. This materializer preserves native
 * provenance and exposes whether GIS MAY evaluate canonical promotion. It never
 * promotes or persists identity itself.
 */
export class GraphifyStructuralMaterializer {
  constructor(private readonly astProvider: AstProvider = create8095AstProvider()) {}

  async materialize(input: CanonicalSourceRef): Promise<StructuralMaterializationResult> {
    const result = await this.astProvider.materialize(input);
    const normalized = result.evidence && result.status !== 'FAILED'
      ? normalizeAtlasAstEvidence(result.evidence)
      : null;
    const nativeProvenanceComplete = Boolean(normalized?.nativeProvenance.complete);
    const promotionGate: StructuralPromotionGate = result.status === 'FAILED'
      ? 'BLOCKED_PROVIDER_FAILURE'
      : nativeProvenanceComplete
        ? 'ELIGIBLE_FOR_GIS_EVALUATION'
        : 'BLOCKED_NATIVE_PROVENANCE_INCOMPLETE';

    return {
      sourceRef: input.sourceRef,
      sourceRevision: input.sourceRevision,
      provider: result.provider,
      status: result.status,
      normalized,
      diagnostics: [...result.diagnostics],
      nativeProvenanceComplete,
      promotionGate,
      canonicalIdentity: { symbolId: null, symbolVersionId: null, packetKey: null },
      persistence: 'NOT_ATTEMPTED',
      fallback: 'NONE',
    };
  }
}
