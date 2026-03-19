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

/**
 * Return empty metadata immediately so page renders fast.
 * Actual metadata is fetched client-side with IDB caching in +page.svelte.
 */
export const load = async () => {
  return { apiMetadata: EMPTY_METADATA };
};
