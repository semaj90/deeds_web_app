export const load = async ({ fetch }: { fetch: typeof globalThis.fetch }) => {
	try {
		// Load comprehensive route metadata (active + archived)
		const metadataRes = await fetch('/api/routes/metadata?includeArchived=true');
		const metadata = await metadataRes.json();

		return {
			routes: [], // Legacy route monitoring data (will be populated by SSE)
			apiMetadata: metadata.success ? metadata.data : {
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
					sse: 0
				}
			}
		};
	} catch (err) {
		console.error('[all-routes +page.ts] Failed to load metadata:', err);
		return {
			routes: [],
			apiMetadata: {
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
					sse: 0
				}
			}
		};
	}
};
