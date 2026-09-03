import type { OakDagActionHandlerV1 } from './oak-dag-execution-adapter-v1.js';
import { createOakDagAstEvidenceHandlerV1 } from './oak-dag-ast-evidence-handler-v1.js';
import { createOakDagContextManifestHandlerV1 } from './oak-dag-context-manifest-handler-v1.js';
import { createOakDagGraphHandlerV1 } from './oak-dag-graph-handler-v1.js';
import { createOakDagKagNeighborHandlerV1 } from './oak-dag-kag-neighbor-handler-v1.js';
import { createOakDagLexicalHandlerV1 } from './oak-dag-lexical-handler-v1.js';
import { createOakDagSemanticQdrantHandlerV1 } from './oak-dag-semantic-qdrant-handler-v1.js';
import { createOakDagNeuralLatentHandlerV1 } from './oak-dag-neural-latent-handler-v1.js';

export type OakDagRuntimeRegistryV1 = Readonly<{
  handlers: readonly OakDagActionHandlerV1[];
  implementationRefs: readonly string[];
  canonicalAuthority: false;
}>;

/**
 * Static governed owner registry for the OaK replay subset.
 * References are exact module-and-export identities; no dynamic imports,
 * reflection, or coarse action-kind fallback is permitted here.
 */
export function createOakDagRuntimeRegistryV1(): OakDagRuntimeRegistryV1 {
  const handlers = [
    createOakDagAstEvidenceHandlerV1(),
    createOakDagContextManifestHandlerV1(),
    createOakDagGraphHandlerV1(),
    createOakDagKagNeighborHandlerV1(),
    createOakDagLexicalHandlerV1(),
    createOakDagSemanticQdrantHandlerV1(),
    createOakDagNeuralLatentHandlerV1(),
  ] as const;
  const refs = handlers.map((handler) => handler.implementationRef);
  if (new Set(refs).size !== refs.length) {
    throw new Error('OAK_RUNTIME_REGISTRY_DUPLICATE_IMPLEMENTATION');
  }
  return {
    handlers,
    implementationRefs: [...refs].sort(),
    canonicalAuthority: false,
  };
}

export function resolveOakDagRuntimeHandlerV1(
  registry: OakDagRuntimeRegistryV1,
  implementationRef: string,
): OakDagActionHandlerV1 {
  const handler = registry.handlers.find((candidate) => candidate.implementationRef === implementationRef);
  if (!handler) throw new Error(`OAK_RUNTIME_IMPLEMENTATION_UNREGISTERED:${implementationRef}`);
  return handler;
}
