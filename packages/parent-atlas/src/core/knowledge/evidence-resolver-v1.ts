import type {
  AtlasEvidenceNamespaceV1,
  AtlasEvidenceResourceV1,
  ResolvedEvidencePayloadV1,
} from './evidence-resource-v1.js';
import { atlasEvidenceResourceV1Schema } from './evidence-resource-v1.js';

export interface AtlasEvidenceResolverV1 {
  readonly namespace: AtlasEvidenceNamespaceV1;
  readonly resolverRevision: string;
  resolve(resource: AtlasEvidenceResourceV1, previousEvidenceVersion?: string): Promise<ResolvedEvidencePayloadV1 | null>;
}

export class AtlasEvidenceResolverRegistryV1 {
  private readonly resolvers = new Map<AtlasEvidenceNamespaceV1, AtlasEvidenceResolverV1>();

  register(resolver: AtlasEvidenceResolverV1): void {
    if (!resolver.resolverRevision.trim()) throw new Error('EVIDENCE_RESOLVER_REVISION_REQUIRED');
    if (this.resolvers.has(resolver.namespace)) throw new Error(`EVIDENCE_RESOLVER_DUPLICATE_NAMESPACE:${resolver.namespace}`);
    this.resolvers.set(resolver.namespace, resolver);
  }

  get(namespace: AtlasEvidenceNamespaceV1): AtlasEvidenceResolverV1 {
    const resolver = this.resolvers.get(namespace);
    if (!resolver) throw new Error(`EVIDENCE_RESOLVER_UNREGISTERED_NAMESPACE:${namespace}`);
    return resolver;
  }

  resolve(resourceInput: AtlasEvidenceResourceV1, previousEvidenceVersion?: string): Promise<ResolvedEvidencePayloadV1 | null> {
    const resource = atlasEvidenceResourceV1Schema.parse(resourceInput);
    return this.get(resource.namespace).resolve(resource, previousEvidenceVersion);
  }
}

export function createPhaseScopedEvidenceResolverV1(registry: AtlasEvidenceResolverRegistryV1) {
  const cache = new Map<string, Promise<ResolvedEvidencePayloadV1 | null>>();
  return {
    resolve(resource: AtlasEvidenceResourceV1, previousEvidenceVersion?: string): Promise<ResolvedEvidencePayloadV1 | null> {
      const key = JSON.stringify([resource.resourceKey, previousEvidenceVersion ?? null]);
      const current = cache.get(key);
      if (current) return current;
      const pending = registry.resolve(resource, previousEvidenceVersion);
      cache.set(key, pending);
      return pending;
    },
    cacheSize(): number {
      return cache.size;
    },
  };
}
