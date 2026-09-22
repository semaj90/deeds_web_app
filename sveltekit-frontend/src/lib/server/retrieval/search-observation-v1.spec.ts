import { describe, expect, it } from 'vitest';
import {
  buildSearchObservationV1,
  freezeSearchSnapshotV1,
  observeAndFreezeWebSearchV1,
  SearchObservationV1Schema,
  SearchSnapshotV1Schema,
} from './search-observation-v1.js';
import type { WebSearchResponse } from './web-search.js';

const baseRequest = { query: '  hearsay   exception  ', maxResults: 5 };

const successResponse: WebSearchResponse = {
  provider: 'searxng',
  query: 'hearsay exception',
  searchMs: 42,
  results: [
    { title: 'A', url: 'https://a.example/1', snippet: 'first', source: 'searxng' },
    { title: 'B', url: 'https://b.example/2', snippet: 'second', source: 'searxng' },
  ],
};

const emptyResponse: WebSearchResponse = {
  provider: 'duckduckgo',
  query: 'hearsay exception',
  searchMs: 5,
  results: [],
};

const failedResponse: WebSearchResponse = {
  provider: 'none',
  query: 'hearsay exception',
  searchMs: 8000,
  results: [],
};

describe('SearchObservationV1 / SearchSnapshotV1 (DISCOVERY-01)', () => {
  it('normalizes whitespace and validates against the schema', () => {
    const observation = buildSearchObservationV1(baseRequest, successResponse, '2026-01-01T00:00:00.000Z');
    expect(observation.normalizedQuery).toBe('hearsay exception');
    expect(() => SearchObservationV1Schema.parse(observation)).not.toThrow();
  });

  it('classifies SUCCESS_WITH_RESULTS, SUCCESS_EMPTY, and PROVIDER_FAILURE distinctly', () => {
    const withResults = buildSearchObservationV1(baseRequest, successResponse);
    const empty = buildSearchObservationV1(baseRequest, emptyResponse);
    const failed = buildSearchObservationV1(baseRequest, failedResponse);
    expect(withResults.outcome).toBe('SUCCESS_WITH_RESULTS');
    expect(empty.outcome).toBe('SUCCESS_EMPTY');
    expect(failed.outcome).toBe('PROVIDER_FAILURE');
    // Real distinction, not just a status string: empty is a real provider
    // answering with zero results; failure is no provider answering at all.
    expect(empty.effective.provider).not.toBe('none');
    expect(failed.effective.provider).toBe('none');
  });

  it('flags unsupported request fields instead of silently dropping or applying them', () => {
    const observation = buildSearchObservationV1(
      { ...baseRequest, category: 'news', language: 'en', timeRange: 'week' },
      successResponse,
    );
    expect(observation.unsupportedOptions.sort()).toEqual(['category', 'language', 'timeRange']);
    // The unsupported values are preserved in `requested` (what was asked for)
    // but never copied into `effective` (what was actually applied).
    expect(observation.requested.category).toBe('news');
    expect('category' in observation.effective).toBe(false);
  });

  it('reports engines as not observable rather than assuming requested == applied', () => {
    const observation = buildSearchObservationV1(
      { ...baseRequest, engines: ['duckduckgo', 'bing'] },
      successResponse,
    );
    expect(observation.effective.enginesObservable).toBe(false);
  });

  it('freezes to identical checksums on identical inputs (replay determinism)', () => {
    const observedAt = '2026-01-01T00:00:00.000Z';
    const observationA = buildSearchObservationV1(baseRequest, successResponse, observedAt);
    const observationB = buildSearchObservationV1(baseRequest, successResponse, observedAt);
    const snapshotA = freezeSearchSnapshotV1(observationA);
    const snapshotB = freezeSearchSnapshotV1(observationB);
    expect(snapshotA.queryChecksum).toBe(snapshotB.queryChecksum);
    expect(snapshotA.resultSetChecksum).toBe(snapshotB.resultSetChecksum);
    expect(snapshotA.snapshotChecksum).toBe(snapshotB.snapshotChecksum);
    expect(() => SearchSnapshotV1Schema.parse(snapshotA)).not.toThrow();
  });

  it('changes queryChecksum when the query changes, holding results constant', () => {
    const observedAt = '2026-01-01T00:00:00.000Z';
    const a = freezeSearchSnapshotV1(buildSearchObservationV1(baseRequest, successResponse, observedAt));
    const b = freezeSearchSnapshotV1(
      buildSearchObservationV1({ ...baseRequest, query: 'best evidence rule' }, successResponse, observedAt),
    );
    expect(a.queryChecksum).not.toBe(b.queryChecksum);
    expect(a.resultSetChecksum).toBe(b.resultSetChecksum);
    expect(a.snapshotChecksum).not.toBe(b.snapshotChecksum);
  });

  it('changes queryChecksum when options change, holding the query text constant', () => {
    const observedAt = '2026-01-01T00:00:00.000Z';
    const a = freezeSearchSnapshotV1(buildSearchObservationV1(baseRequest, successResponse, observedAt));
    const b = freezeSearchSnapshotV1(
      buildSearchObservationV1({ ...baseRequest, maxResults: 10 }, successResponse, observedAt),
    );
    expect(a.queryChecksum).not.toBe(b.queryChecksum);
  });

  it('changes resultSetChecksum when result order changes (order-sensitive)', () => {
    const observedAt = '2026-01-01T00:00:00.000Z';
    const reordered: WebSearchResponse = { ...successResponse, results: [...successResponse.results].reverse() };
    const a = freezeSearchSnapshotV1(buildSearchObservationV1(baseRequest, successResponse, observedAt));
    const b = freezeSearchSnapshotV1(buildSearchObservationV1(baseRequest, reordered, observedAt));
    expect(a.resultSetChecksum).not.toBe(b.resultSetChecksum);
  });

  it('changes snapshotChecksum (but not queryChecksum/resultSetChecksum) when only observedAt changes', () => {
    const a = freezeSearchSnapshotV1(buildSearchObservationV1(baseRequest, successResponse, '2026-01-01T00:00:00.000Z'));
    const b = freezeSearchSnapshotV1(buildSearchObservationV1(baseRequest, successResponse, '2026-01-02T00:00:00.000Z'));
    expect(a.queryChecksum).toBe(b.queryChecksum);
    expect(a.resultSetChecksum).toBe(b.resultSetChecksum);
    expect(a.snapshotChecksum).not.toBe(b.snapshotChecksum);
  });

  it('observeAndFreezeWebSearchV1 wraps an injected search function without calling the network itself', async () => {
    const injected = async (query: string, maxResults?: number, engines?: string[]) => {
      // The raw (unnormalized) requested query is what's sent to the actual
      // search call -- normalization only affects the derived observation's
      // normalizedQuery/checksum fields, not what the provider receives.
      expect(query).toBe(baseRequest.query);
      expect(maxResults).toBe(5);
      expect(engines).toBeUndefined();
      return successResponse;
    };
    const snapshot = await observeAndFreezeWebSearchV1(baseRequest, injected);
    expect(snapshot.schema).toBe('atlas.search-snapshot.v1');
    expect(snapshot.outcome).toBe('SUCCESS_WITH_RESULTS');
  });
});
