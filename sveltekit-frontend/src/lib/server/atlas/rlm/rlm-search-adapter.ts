import { createHash } from 'node:crypto';
import { bifrostRevisionedRetrievalKey } from '../../ace/cache-keys.js';
import { createAtlasSearchAdapter, type AtlasSearchResponse } from '../retrieval/search-runtime-adapter.js';
import type { RlmSearchRequest, RlmSearchResult } from './rlm-contract.js';

export interface RlmSearchCache {
	get(key: string): Promise<string | null>;
	set(key: string, value: string, mode: 'EX', ttlSeconds: number): Promise<unknown>;
}

function stableValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(stableValue);
	if (value && typeof value === 'object') {
		return Object.fromEntries(Object.entries(value as Record<string, unknown>)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, child]) => [key, stableValue(child)]));
	}
	return value;
}

function requestHash(request: RlmSearchRequest): string {
	return createHash('sha256')
		.update(JSON.stringify(stableValue({
			query: request.query,
			filters: request.filters ?? {},
			topK: request.topK ?? 20,
			workspaceRevision: request.workspaceRevision,
			policyRevision: request.policyRevision,
			taxonomyRevision: request.taxonomyRevision ?? null,
			ontologyRevision: request.ontologyRevision ?? null,
			environment: request.environment
				? {
					contextArtifactId: request.environment.contextArtifactId,
					candidateSnapshotRevision: request.environment.candidateSnapshotRevision,
					ordinalMapChecksum: request.environment.ordinalMapChecksum,
					candidateOrdinals: request.environment.candidateOrdinals,
				}
				: null,
		})))
		.digest('hex')
		.slice(0, 24);
}

function isCachedResult(value: unknown): value is RlmSearchResult {
	if (!value || typeof value !== 'object') return false;
	const item = value as Record<string, unknown>;
	return Boolean(item.response && item.trace && typeof item.trace === 'object');
}

export function createRlmSearchAdapter(options: {
	cache?: RlmSearchCache;
	search?: (request: RlmSearchRequest) => Promise<AtlasSearchResponse>;
	cacheTtlSeconds?: number;
}) {
	const search = options.search ?? (async (request: RlmSearchRequest) => createAtlasSearchAdapter().search({
		query: request.query,
		topK: request.topK,
		filters: request.filters,
		workspaceRevision: request.workspaceRevision,
	}));
	const ttlSeconds = options.cacheTtlSeconds ?? 120;

	return {
		async search(request: RlmSearchRequest): Promise<RlmSearchResult> {
			const key = bifrostRevisionedRetrievalKey(
				request.workspaceRevision,
				request.policyRevision,
				requestHash(request),
			);
			if (options.cache) {
				try {
					const raw = await options.cache.get(key);
					if (raw) {
						const cached = JSON.parse(raw) as RlmSearchResult;
						if (isCachedResult(cached)
							&& cached.trace.workspaceRevision === request.workspaceRevision
							&& cached.trace.policyRevision === request.policyRevision) {
							return {
								...cached,
								trace: {
									...cached.trace,
									steps: cached.trace.steps.map((step) => ({ ...step })),
									status: 'COMPLETED',
								},
							};
						}
					}
				} catch {
					// Cache is acceleration only; retrieval must remain available.
				}
			}

			const started = Date.now();
			const response = await search(request);
			const result: RlmSearchResult = {
				response,
				trace: {
					requestId: request.requestId,
					workspaceRevision: request.workspaceRevision,
					policyRevision: request.policyRevision,
					depthReached: 0,
					subcalls: 1,
					steps: [{
						sequence: 0,
						kind: 'SEARCH',
						query: request.query,
						selectedCanonicalIds: response.topPacketKeys,
						cacheStatus: options.cache ? 'MISS' : 'BYPASS',
						durationMs: Date.now() - started,
					}],
					status: 'COMPLETED',
				},
			};
			if (options.cache) {
				try { await options.cache.set(key, JSON.stringify(result), 'EX', ttlSeconds); } catch { /* fail open */ }
			}
			return result;
		},
	};
}
