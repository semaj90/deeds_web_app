export type RerankEndpointEnvironment = {
	RERANK_URL?: string | null;
	RERANK_BASE_URL?: string | null;
	RERANKER_SIDECAR_URL?: string | null;
};

/** Resolve the configured reranker without ever producing an `undefined/...` URL. */
export function resolveRerankEndpoint(env: RerankEndpointEnvironment): string | null {
	for (const value of [env.RERANK_URL, env.RERANK_BASE_URL, env.RERANKER_SIDECAR_URL]) {
		const normalized = typeof value === 'string' ? value.trim().replace(/\/$/, '') : '';
		if (normalized.length > 0 && normalized !== 'undefined' && normalized !== 'null') {
			return normalized;
		}
	}
	return null;
}
