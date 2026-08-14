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

export type StructuralMaterializationResult = {
  sourceRef: string;
  sourceRevision: string;
  provider: AstProviderResult['provider'];
  status: AstProviderResult['status'];
  normalized: NormalizedAtlasStructuralEvidence | null;
  diagnostics: string[];
  persistence: 'NOT_ATTEMPTED';
  fallback: 'NONE';
};

/**
 * Canonical Graphify owner boundary. It owns orchestration and receipt shape;
 * 8095 owns structural parsing evidence. Identity persistence and projections
 * remain downstream and are intentionally not performed here.
 */
export class GraphifyStructuralMaterializer {
  constructor(private readonly astProvider: AstProvider = create8095AstProvider()) {}

  async materialize(input: CanonicalSourceRef): Promise<StructuralMaterializationResult> {
    const result = await this.astProvider.materialize(input);
    const normalized = result.evidence && result.status !== 'FAILED'
      ? normalizeAtlasAstEvidence(result.evidence)
      : null;
    return {
      sourceRef: input.sourceRef,
      sourceRevision: input.sourceRevision,
      provider: result.provider,
      status: result.status,
      normalized,
      diagnostics: [...result.diagnostics],
      persistence: 'NOT_ATTEMPTED',
      fallback: 'NONE',
    };
  }
}
