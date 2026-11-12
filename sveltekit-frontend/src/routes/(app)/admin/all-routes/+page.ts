import type { PageLoad } from './$types';

const EMPTY_METADATA = {
  allEndpoints: [],
  activeAPI: [],
  archived: [],
  categories: [],
  stats: {
    totalRoutes: 0,
    activeRoutes: 0,
    archivedRoutes: 0,
    apiEndpoints: 0,
    pageServers: 0,
    pages: 0,
    categories: 0,
    methodCounts: { GET: 0, POST: 0, PUT: 0, DELETE: 0, PATCH: 0, load: 0, actions: 0 },
    groupCounts: { app: 0, dev: 0, admin: 0, api: 0, other: 0, archived: 0 },
    authRequired: 0,
    sse: 0,
  },
};

export const ssr = true;

// Typed with the generated PageLoad so `data` carries the server load's real shape
// (routes, errorClusters, stats). The previous untyped `Record<string, unknown>` spread
// contributed no known keys, so the page's reads of them had no static type.
export const load: PageLoad = async ({ data }) => {
  // Same runtime guard as before; the assertion keeps the server-data type instead of widening to `{}`.
  const serverData = (data ?? {}) as typeof data;
  return {
    ...serverData,
    apiMetadata: ((data as { apiMetadata?: typeof EMPTY_METADATA } | undefined)?.apiMetadata) ?? EMPTY_METADATA,
  };
};


