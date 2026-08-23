import type { AstProviderResult } from './graphify-structural-materializer.js';

export type StructuralProviderRuntimeBlockReasonV1 =
  | 'PROVIDER_FAILED'
  | 'ENGINE_UNAVAILABLE'
  | 'SIDECAR_TRANSPORT_UNAVAILABLE'
  | 'PARSER_PACKAGE_UNAVAILABLE';

export interface StructuralProviderRuntimeReadinessV1 {
  schema: 'atlas.structural-provider-runtime-readiness.v1';
  available: boolean;
  reason: StructuralProviderRuntimeBlockReasonV1 | null;
}

const SIDECAR_UNAVAILABLE_PATTERN = /SIDECAR_UNAVAILABLE|ECONNREFUSED|fetch failed/i;
const PARSER_PACKAGE_UNAVAILABLE_PATTERN = /NODE_TREE_SITTER_RUNTIME|PACKAGE_VERSION_MISSING|Cannot find module|treesitter-chunker is unavailable/i;

/** Proof-only readiness classification for AST parity providers. */
export function classifyStructuralProviderRuntimeReadiness(
  result: AstProviderResult,
): StructuralProviderRuntimeReadinessV1 {
  const diagnosticText = [...result.diagnostics, result.errorTag ?? ''].join('\n');

  if (SIDECAR_UNAVAILABLE_PATTERN.test(diagnosticText)) {
    return { schema: 'atlas.structural-provider-runtime-readiness.v1', available: false, reason: 'SIDECAR_TRANSPORT_UNAVAILABLE' };
  }
  if (result.evidence?.engine?.trim().toLowerCase() === 'unavailable') {
    return { schema: 'atlas.structural-provider-runtime-readiness.v1', available: false, reason: 'ENGINE_UNAVAILABLE' };
  }
  if (PARSER_PACKAGE_UNAVAILABLE_PATTERN.test(diagnosticText)) {
    return { schema: 'atlas.structural-provider-runtime-readiness.v1', available: false, reason: 'PARSER_PACKAGE_UNAVAILABLE' };
  }
  if (result.status === 'FAILED') {
    return { schema: 'atlas.structural-provider-runtime-readiness.v1', available: false, reason: 'PROVIDER_FAILED' };
  }
  return { schema: 'atlas.structural-provider-runtime-readiness.v1', available: true, reason: null };
}
