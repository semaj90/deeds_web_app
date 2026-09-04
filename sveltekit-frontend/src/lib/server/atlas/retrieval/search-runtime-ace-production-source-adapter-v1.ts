import type {
  SearchRuntimeAceResolverSourcesV1,
  SearchRuntimeAceResolverV1,
} from './search-runtime-ace-resolver-v1.js';
import { createSearchRuntimeAceResolverV1 } from './search-runtime-ace-resolver-v1.js';

export const SEARCH_RUNTIME_ACE_PRODUCTION_SOURCE_OWNER_V1 =
  'parent-atlas.search-runtime.ace-production-source-owner.v1' as const;

export interface SearchRuntimeAceProductionSourceOwnerV1 {
  readonly implementationRef: typeof SEARCH_RUNTIME_ACE_PRODUCTION_SOURCE_OWNER_V1;
  readonly resolveCanonicalSources: (
    input: { query: string; requestId: string; workspaceRevision: string },
  ) => Promise<SearchRuntimeAceResolverSourcesV1 | null>;
}

/**
 * Production binding boundary for ACE. The caller must inject the existing
 * canonical SearchRuntime/ordinal/feature owners; this adapter does not query
 * stores, allocate ordinals, infer revisions, or write cache state.
 */
export function createSearchRuntimeAceProductionSourceAdapterV1(
  owner: SearchRuntimeAceProductionSourceOwnerV1,
): SearchRuntimeAceResolverV1 {
  if (owner.implementationRef !== SEARCH_RUNTIME_ACE_PRODUCTION_SOURCE_OWNER_V1) {
    throw new Error('ACE_PRODUCTION_SOURCE_OWNER_IMPLEMENTATION_REF_MISMATCH');
  }

  return createSearchRuntimeAceResolverV1(async (input) => {
    const sources = await owner.resolveCanonicalSources(input);
    if (sources === null) throw new Error('ACE_PRODUCTION_SOURCE_OWNER_UNAVAILABLE');
    return sources;
  });
}
