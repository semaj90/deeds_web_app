import { createMiniforgeNlpSidecarClient, type AtlasStructuralEvidence } from '$lib/server/nlp/miniforge-nlp-sidecar.js';
import { normalizeAtlasAstEvidence, type NormalizedAtlasStructuralEvidence } from '$lib/server/analysis/atlas-ast-evidence-normalizer.js';

export type SourceRevisionAuthorityV1 = 'PROVEN' | 'CONTENT_ANCHOR_ONLY' | 'UNPROVEN';

/** Input accepted by the Graphify materializer owner. */
export type StructuralSourceInputV1 = {
  sourceRef: string;
  sourceRevision: string | null;
  sourceVersionAnchor: string;
  sourceRevisionAuthority: SourceRevisionAuthorityV1;
  language: string;
  source: string;
};

/**
 * Legacy parser-provider request shape. `sourceRevision` here is an opaque
 * parser correlation token; it is NOT canonical revision authority by itself.
 */
export type CanonicalSourceRef = {
  sourceRef: string;
  sourceRevision: string;
  language: string;
  source: string;
};

export type AstProviderId = 'treesitter-chunker-8095' | 'node-tree-sitter-challenger';

export type AstProviderResult = {
  provider: AstProviderId;
  status: 'PROVEN' | 'RECOVERED_WITH_ERRORS' | 'FAILED';
  evidence?: AtlasStructuralEvidence;
  errorTag?: string;
  diagnostics: string[];
};

export interface AstProvider {
  materialize(input: CanonicalSourceRef): Promise<AstProviderResult>;
}

export function parserSourceRevisionToken(input: StructuralSourceInputV1): string {
  if (input.sourceRevisionAuthority === 'PROVEN' && input.sourceRevision?.trim()) {
    return input.sourceRevision.trim();
  }
  return `anchor:${input.sourceVersionAnchor}`;
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
        const fatalDiagnostics = diagnostics.filter(
          (diagnostic) => !diagnostic.startsWith('CONSILIENCY_LF_BYTE_SPAN_REMAPPED'),
        );
        return {
          provider: 'treesitter-chunker-8095',
          status: fatalDiagnostics.length > 0 || evidence.syntax_status === 'RECOVERED_WITH_ERRORS' ? 'RECOVERED_WITH_ERRORS' : 'PROVEN',
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
  status: 'NATIVE_READY' | 'NATIVE_RECOVERED' | 'COMPATIBILITY_ONLY' | 'NO_EVIDENCE';
  nativeNodeIds: number;
  nativeFileIds: number;
  nativeSymbolIds: number;
  upstreamChunkIds: number;
  symbolCount: number;
  sourceRevisionAuthority: SourceRevisionAuthorityV1;
  sourceRevisionAuthorityReady: boolean;
  canonicalPromotionAllowed: boolean;
  reason: string;
};

function evaluateProvenanceReadiness(
  normalized: NormalizedAtlasStructuralEvidence | null,
  providerStatus: AstProviderResult['status'],
  input: StructuralSourceInputV1,
): StructuralProvenanceReadiness {
  const revisionAuthorityReady =
    input.sourceRevisionAuthority === 'PROVEN'
    && Boolean(input.sourceRevision?.trim());

  if (!normalized || normalized.symbols.length === 0) {
    return {
      status: 'NO_EVIDENCE', nativeNodeIds: 0, nativeFileIds: 0, nativeSymbolIds: 0,
      upstreamChunkIds: 0, symbolCount: 0,
      sourceRevisionAuthority: input.sourceRevisionAuthority,
      sourceRevisionAuthorityReady: revisionAuthorityReady,
      canonicalPromotionAllowed: false,
      reason: 'No normalized structural symbols were produced.',
    };
  }

  const { provenance } = normalized;
  const symbolCount = normalized.symbols.length;
  const allNodesNative = provenance.nativeNodeIdCount === symbolCount;
  const allFilesNative = provenance.nativeFileIdCount === symbolCount;
  const chunksAvailable = provenance.upstreamChunkIdCount === symbolCount;
  const nativeComplete = allNodesNative && allFilesNative && chunksAvailable;

  if (!nativeComplete) {
    return {
      status: 'COMPATIBILITY_ONLY',
      nativeNodeIds: provenance.nativeNodeIdCount,
      nativeFileIds: provenance.nativeFileIdCount,
      nativeSymbolIds: provenance.nativeSymbolIdCount,
      upstreamChunkIds: provenance.upstreamChunkIdCount,
      symbolCount,
      sourceRevisionAuthority: input.sourceRevisionAuthority,
      sourceRevisionAuthorityReady: revisionAuthorityReady,
      canonicalPromotionAllowed: false,
      reason: 'One or more structural symbols lack native Consiliency node/file/chunk provenance; compatibility coordinates remain noncanonical.',
    };
  }

  if (providerStatus !== 'PROVEN') {
    return {
      status: 'NATIVE_RECOVERED',
      nativeNodeIds: provenance.nativeNodeIdCount,
      nativeFileIds: provenance.nativeFileIdCount,
      nativeSymbolIds: provenance.nativeSymbolIdCount,
      upstreamChunkIds: provenance.upstreamChunkIdCount,
      symbolCount,
      sourceRevisionAuthority: input.sourceRevisionAuthority,
      sourceRevisionAuthorityReady: revisionAuthorityReady,
      canonicalPromotionAllowed: false,
      reason: 'Native structural provenance is complete, but the parse was recovered/degraded; evidence may be searched but GIS promotion is blocked.',
    };
  }

  if (!revisionAuthorityReady) {
    return {
      status: 'NATIVE_READY',
      nativeNodeIds: provenance.nativeNodeIdCount,
      nativeFileIds: provenance.nativeFileIdCount,
      nativeSymbolIds: provenance.nativeSymbolIdCount,
      upstreamChunkIds: provenance.upstreamChunkIdCount,
      symbolCount,
      sourceRevisionAuthority: input.sourceRevisionAuthority,
      sourceRevisionAuthorityReady: false,
      canonicalPromotionAllowed: false,
      reason: 'Native structural provenance is complete and the parse is PROVEN, but canonical source_revision authority is not proven; GIS promotion is blocked.',
    };
  }

  return {
    status: 'NATIVE_READY',
    nativeNodeIds: provenance.nativeNodeIdCount,
    nativeFileIds: provenance.nativeFileIdCount,
    nativeSymbolIds: provenance.nativeSymbolIdCount,
    upstreamChunkIds: provenance.upstreamChunkIdCount,
    symbolCount,
    sourceRevisionAuthority: input.sourceRevisionAuthority,
    sourceRevisionAuthorityReady: true,
    canonicalPromotionAllowed: true,
    reason: 'All structural symbols retain native Consiliency node/file/chunk provenance, the provider is PROVEN, and canonical source_revision authority is proven; GIS may evaluate canonical promotion.',
  };
}

export type StructuralMaterializationResult = {
  sourceRef: string;
  sourceRevision: string | null;
  sourceVersionAnchor: string;
  sourceRevisionAuthority: SourceRevisionAuthorityV1;
  parserSourceRevisionToken: string;
  provider: AstProviderResult['provider'];
  status: AstProviderResult['status'];
  evidence: AtlasStructuralEvidence | null;
  normalized: NormalizedAtlasStructuralEvidence | null;
  provenanceReadiness: StructuralProvenanceReadiness;
  diagnostics: string[];
  persistence: 'NOT_ATTEMPTED';
  fallback: 'NONE';
};

/**
 * Canonical Graphify owner boundary. Parser providers receive only an opaque
 * string correlation token. Atlas separately records whether a canonical
 * source revision exists and who owns it.
 */
export class GraphifyStructuralMaterializer {
  constructor(private readonly astProvider: AstProvider = create8095AstProvider()) {}

  async materialize(input: StructuralSourceInputV1): Promise<StructuralMaterializationResult> {
    if (!input.sourceVersionAnchor.trim()) throw new Error('SOURCE_VERSION_ANCHOR_REQUIRED');
    if (input.sourceRevisionAuthority === 'PROVEN' && !input.sourceRevision?.trim()) {
      throw new Error('PROVEN_SOURCE_REVISION_REQUIRED');
    }
    if (input.sourceRevisionAuthority !== 'PROVEN' && input.sourceRevision !== null) {
      throw new Error('UNPROVEN_SOURCE_REVISION_MUST_BE_NULL');
    }

    const parserToken = parserSourceRevisionToken(input);
    const result = await this.astProvider.materialize({
      sourceRef: input.sourceRef,
      sourceRevision: parserToken,
      language: input.language,
      source: input.source,
    });
    const evidence = result.evidence && result.status !== 'FAILED' ? result.evidence : null;
    const normalized = evidence ? normalizeAtlasAstEvidence(evidence) : null;
    const provenanceReadiness = evaluateProvenanceReadiness(normalized, result.status, input);
    const diagnostics = [...result.diagnostics];
    if (evidence && evidence.source_revision !== parserToken) diagnostics.push('PARSER_SOURCE_REVISION_TOKEN_MISMATCH');
    if (provenanceReadiness.status === 'COMPATIBILITY_ONLY') {
      diagnostics.push('STRUCTURAL_PROVENANCE_COMPATIBILITY_ONLY');
    } else if (provenanceReadiness.status === 'NATIVE_RECOVERED') {
      diagnostics.push('STRUCTURAL_PROVENANCE_RECOVERED_NOT_PROMOTABLE');
    }
    if (!provenanceReadiness.sourceRevisionAuthorityReady) diagnostics.push('SOURCE_REVISION_AUTHORITY_UNPROVEN');

    return {
      sourceRef: input.sourceRef,
      sourceRevision: input.sourceRevision,
      sourceVersionAnchor: input.sourceVersionAnchor,
      sourceRevisionAuthority: input.sourceRevisionAuthority,
      parserSourceRevisionToken: parserToken,
      provider: result.provider,
      status: result.status,
      evidence,
      normalized,
      provenanceReadiness,
      diagnostics,
      persistence: 'NOT_ATTEMPTED',
      fallback: 'NONE',
    };
  }
}
