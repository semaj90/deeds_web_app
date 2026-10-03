/**
 * DISCOVERY-01 (parent-atlas-deep-research-ingestion): schema-validated, derived
 * SearchObservationV1/SearchSnapshotV1 adapters around the EXISTING web-search
 * adapter (`web-search.ts`'s `webSearch()`). Reuses `canonicalSha256V1` from
 * `atlas/prefill/canonical-hash-v1.ts` -- the same canonical-encoding checksum
 * primitive already used across `atlas/retrieval/*`, per this repo's Duplication
 * Prevention rule (checked before writing this: `local-research-circuit-v1.ts`
 * operates one layer downstream, over already-resolved CandidateOrdinals/AceCards,
 * and does not overlap with this raw-provider-response layer).
 *
 * Explicitly NOT a new crawler: this module never calls a search provider
 * directly. It only wraps the return value of the existing `webSearch()` call.
 * Explicitly NOT canonical document/candidate identity: per proposal.md, these
 * observations are discovery-only and must never be treated as acquired source
 * evidence (see the "Discovery is not acquired source evidence" spec requirement).
 */
import { z } from 'zod';
import { canonicalSha256V1, sha256HexSchema } from '$lib/server/atlas/prefill/canonical-hash-v1.js';
import type { WebSearchResponse, WebSearchResult } from './web-search.js';

export const SEARCH_OBSERVATION_NORMALIZER_REVISION = 'atlas.search-observation-normalizer.v1';

/**
 * The underlying `webSearch()` adapter's real accepted-parameter surface is
 * `(query, maxResults, preferredEngines)` -- it has no `category`/`language`/
 * `timeRange` parameters at all. Requesting any of these is therefore
 * structurally unsupported today, not merely unimplemented for this observation
 * layer. Per design.md decision 2 ("Unsupported settings MUST NOT appear as
 * successfully applied"), a caller-supplied value for one of these fields is
 * recorded in `unsupportedOptions` and never copied into `effective`.
 */
const UNSUPPORTED_REQUEST_FIELDS = ['category', 'language', 'timeRange'] as const;
type UnsupportedRequestField = (typeof UNSUPPORTED_REQUEST_FIELDS)[number];

export const SearchObservationRequestV1Schema = z
  .object({
    query: z.string().min(1).max(2048),
    maxResults: z.number().int().positive().max(50).default(5),
    engines: z.array(z.string().min(1)).max(20).default([]),
    category: z.string().min(1).nullable().default(null),
    language: z.string().min(1).nullable().default(null),
    timeRange: z.string().min(1).nullable().default(null),
  })
  .strict();
export type SearchObservationRequestV1 = z.infer<typeof SearchObservationRequestV1Schema>;

const searchObservationResultSchema = z
  .object({
    title: z.string(),
    url: z.string().min(1),
    snippet: z.string(),
    source: z.enum(['duckduckgo', 'searxng', 'curated']),
  })
  .strict();

export const SearchObservationOutcomeSchema = z.enum([
  'SUCCESS_WITH_RESULTS',
  'SUCCESS_EMPTY',
  'PROVIDER_FAILURE',
  'CURATED_FALLBACK',
]);
export type SearchObservationOutcomeV1 = z.infer<typeof SearchObservationOutcomeSchema>;

export const SearchRecencyDecisionV1Schema = z.object({
  schema: z.literal('atlas.search-recency-decision.v1'),
  observedAt: z.iso.datetime(),
  evaluatedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  ttlMs: z.number().int().positive(),
  status: z.enum(['FRESH', 'EXPIRED']),
}).strict();
export type SearchRecencyDecisionV1 = z.infer<typeof SearchRecencyDecisionV1Schema>;

/**
 * TTL is an observation-freshness policy only. Its deliberately narrow result
 * contains no source, candidate, packet, or revision identity fields.
 */
export function evaluateSearchRecencyV1(
  snapshot: Pick<SearchSnapshotV1, 'observedAt'>,
  ttlMs: number,
  evaluatedAt: string = new Date().toISOString(),
): SearchRecencyDecisionV1 {
  const ttl = z.number().int().positive().max(30 * 24 * 60 * 60 * 1000).parse(ttlMs);
  const observedAtMs = Date.parse(z.iso.datetime().parse(snapshot.observedAt));
  const evaluatedAtValue = z.iso.datetime().parse(evaluatedAt);
  const evaluatedAtMs = Date.parse(evaluatedAtValue);
  const expiresAt = new Date(observedAtMs + ttl).toISOString();
  return SearchRecencyDecisionV1Schema.parse({
    schema: 'atlas.search-recency-decision.v1',
    observedAt: snapshot.observedAt,
    evaluatedAt: evaluatedAtValue,
    expiresAt,
    ttlMs: ttl,
    status: evaluatedAtMs < observedAtMs + ttl ? 'FRESH' : 'EXPIRED',
  });
}

/** Normalized description of one live web-search call, pre-freeze (not yet checksummed). */
export const SearchObservationV1Schema = z
  .object({
    schema: z.literal('atlas.search-observation.v1'),
    normalizedQuery: z.string().min(1),
    normalizerRevision: z.string().min(1),
    requested: SearchObservationRequestV1Schema,
    effective: z
      .object({
        provider: z.enum(['duckduckgo', 'searxng', 'none']),
        /**
         * Honest gap, not guessed: `webSearch()`'s current return shape
         * (`WebSearchResponse`) does not report which engines were actually
         * queried on the winning path (default SearXNG engine set vs. the
         * `['wp']` fallback vs. DuckDuckGo has no engine concept at all).
         * Recording `requested.engines` here as if it were confirmed-applied
         * would violate design.md decision 2. Left explicitly unobservable
         * with the current adapter contract -- a real, disclosed limitation,
         * not a bug in this module.
         */
        enginesObservable: z.literal(false),
      })
      .strict(),
    unsupportedOptions: z.array(z.enum(UNSUPPORTED_REQUEST_FIELDS)),
    outcome: SearchObservationOutcomeSchema,
    observedAt: z.iso.datetime(),
    results: z.array(searchObservationResultSchema),
  })
  .strict();
export type SearchObservationV1 = z.infer<typeof SearchObservationV1Schema>;

/** SearchObservationV1 frozen with canonical checksums for deterministic replay. */
export const SearchSnapshotV1Schema = SearchObservationV1Schema.extend({
  schema: z.literal('atlas.search-snapshot.v1'),
  /** Binds normalizedQuery + normalizerRevision + requested options. */
  queryChecksum: sha256HexSchema,
  /** Binds the ordered `results` array (order-sensitive, per design.md decision 3). */
  resultSetChecksum: sha256HexSchema,
  /** Binds the complete observation, including `observedAt`. */
  snapshotChecksum: sha256HexSchema,
}).strict();
export type SearchSnapshotV1 = z.infer<typeof SearchSnapshotV1Schema>;

function normalizeQuery(rawQuery: string): string {
  return rawQuery.normalize('NFC').trim().replace(/\s+/g, ' ');
}

function detectUnsupportedOptions(
  request: SearchObservationRequestV1,
): UnsupportedRequestField[] {
  return UNSUPPORTED_REQUEST_FIELDS.filter((field) => request[field] !== null);
}

function classifyOutcome(response: WebSearchResponse): SearchObservationOutcomeV1 {
  if (response.provider === 'none') return 'PROVIDER_FAILURE';
  return response.results.length > 0 ? 'SUCCESS_WITH_RESULTS' : 'SUCCESS_EMPTY';
}

/** Adapts the existing agent-tool search response; it performs no search itself. */
export function buildAgentToolSearchObservationV1(
  request: z.input<typeof SearchObservationRequestV1Schema>,
  response: {
    query: string;
    results: Array<{ title: string; url: string; snippet: string; source: string }>;
    method: 'searxng' | 'duckduckgo' | 'curated';
  },
  observedAt: string = new Date().toISOString(),
): SearchObservationV1 {
  const parsedRequest = SearchObservationRequestV1Schema.parse(request);
  const observation = SearchObservationV1Schema.parse({
    schema: 'atlas.search-observation.v1',
    normalizedQuery: normalizeQuery(parsedRequest.query),
    normalizerRevision: SEARCH_OBSERVATION_NORMALIZER_REVISION,
    requested: parsedRequest,
    effective: {
      provider: response.method === 'curated' ? 'none' : response.method,
      enginesObservable: false,
    },
    unsupportedOptions: detectUnsupportedOptions(parsedRequest),
    outcome: response.method === 'curated'
      ? 'CURATED_FALLBACK'
      : response.results.length > 0 ? 'SUCCESS_WITH_RESULTS' : 'SUCCESS_EMPTY',
    observedAt,
    results: response.results.map((result) => ({
      title: result.title,
      url: result.url,
      snippet: result.snippet,
      source: response.method === 'curated' ? 'curated' : response.method,
    })),
  });
  return observation;
}

function toObservationResult(result: WebSearchResult) {
  return { title: result.title, url: result.url, snippet: result.snippet, source: result.source };
}

/**
 * Pure transform: given an already-validated request and the (already-executed)
 * response from the existing `webSearch()` adapter, builds a SearchObservationV1.
 * Does not perform any network I/O itself.
 */
export function buildSearchObservationV1(
  request: z.input<typeof SearchObservationRequestV1Schema>,
  response: WebSearchResponse,
  observedAt: string = new Date().toISOString(),
): SearchObservationV1 {
  const parsedRequest = SearchObservationRequestV1Schema.parse(request);
  const unsupportedOptions = detectUnsupportedOptions(parsedRequest);

  return SearchObservationV1Schema.parse({
    schema: 'atlas.search-observation.v1',
    normalizedQuery: normalizeQuery(parsedRequest.query),
    normalizerRevision: SEARCH_OBSERVATION_NORMALIZER_REVISION,
    requested: parsedRequest,
    effective: { provider: response.provider, enginesObservable: false },
    unsupportedOptions,
    outcome: classifyOutcome(response),
    observedAt,
    results: response.results.map(toObservationResult),
  });
}

/** Freezes a SearchObservationV1 into a checksum-bound SearchSnapshotV1 for replay. */
export function freezeSearchSnapshotV1(observation: SearchObservationV1): SearchSnapshotV1 {
  const queryChecksum = canonicalSha256V1({
    schema: 'atlas.search-observation-query.v1',
    normalizedQuery: observation.normalizedQuery,
    normalizerRevision: observation.normalizerRevision,
    requested: observation.requested,
  });
  const resultSetChecksum = canonicalSha256V1({
    schema: 'atlas.search-observation-result-set.v1',
    results: observation.results,
  });
  const snapshotChecksum = canonicalSha256V1({
    schema: 'atlas.search-snapshot.v1',
    ...observation,
    queryChecksum,
    resultSetChecksum,
  });

  return SearchSnapshotV1Schema.parse({
    ...observation,
    schema: 'atlas.search-snapshot.v1',
    queryChecksum,
    resultSetChecksum,
    snapshotChecksum,
  });
}

/**
 * Convenience one-shot: calls the existing `webSearch()` adapter (the one and
 * only network call site) and freezes its response into a SearchSnapshotV1.
 * `observedAt` is captured at call time, not inferred.
 */
export async function observeAndFreezeWebSearchV1(
  request: z.input<typeof SearchObservationRequestV1Schema>,
  webSearchFn: (query: string, maxResults?: number, engines?: string[]) => Promise<WebSearchResponse>,
): Promise<SearchSnapshotV1> {
  const parsedRequest = SearchObservationRequestV1Schema.parse(request);
  const observedAt = new Date().toISOString();
  const response = await webSearchFn(
    parsedRequest.query,
    parsedRequest.maxResults,
    parsedRequest.engines.length > 0 ? parsedRequest.engines : undefined,
  );
  const observation = buildSearchObservationV1(parsedRequest, response, observedAt);
  return freezeSearchSnapshotV1(observation);
}
