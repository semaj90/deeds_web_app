import { describe, expect, it } from 'vitest';
import { CANONICAL_DOMAINS } from '../domain-taxonomy';
import {
  deterministicQueryRouterSplitV1,
  QueryRouterSourceRowV2Schema,
} from './query-router-dataset-v2';

/**
 * Characterization tests for the label-taxonomy and split audit (2026-10-11).
 *
 * These pin the CURRENT state. They are not endorsements of it. When the taxonomies are reconciled,
 * the disagreement assertions below will fail on purpose: update them in the same change, with the
 * reconciliation receipt, rather than deleting them.
 */

const DOMAIN_TAXONOMY = new Set<string>(CANONICAL_DOMAINS);
const QUERY_ROUTER_LABELS = new Set<string>(QueryRouterSourceRowV2Schema.shape.domainLabel.options);

describe('label taxonomy audit (current state)', () => {
  it('domain taxonomy lists the nine canonical domains', () => {
    expect([...DOMAIN_TAXONOMY].sort()).toEqual(
      ['agent', 'auth', 'cache', 'database', 'graph', 'ml', 'network', 'retrieval', 'ui'],
    );
  });

  it('query-router domainLabel enum lists ten labels, including unknown', () => {
    expect([...QUERY_ROUTER_LABELS].sort()).toEqual(
      ['api', 'code', 'database', 'documentation', 'graph', 'retrieval', 'security', 'testing', 'unknown', 'workflow'],
    );
  });

  it('the two taxonomies share only three labels', () => {
    const shared = [...DOMAIN_TAXONOMY].filter((label) => QUERY_ROUTER_LABELS.has(label)).sort();
    expect(shared).toEqual(['database', 'graph', 'retrieval']);
  });

  it('six domain-taxonomy labels have no query-router counterpart', () => {
    const onlyDomain = [...DOMAIN_TAXONOMY].filter((label) => !QUERY_ROUTER_LABELS.has(label)).sort();
    expect(onlyDomain).toEqual(['agent', 'auth', 'cache', 'ml', 'network', 'ui']);
  });

  it('seven query-router labels have no domain-taxonomy counterpart', () => {
    const onlyQuery = [...QUERY_ROUTER_LABELS].filter((label) => !DOMAIN_TAXONOMY.has(label)).sort();
    expect(onlyQuery).toEqual(['api', 'code', 'documentation', 'security', 'testing', 'unknown', 'workflow']);
  });

  it.todo('reconciled: one label owner with stable class IDs, hierarchy, and an explicit unknown label');
});

describe('query-router split audit (current state)', () => {
  it('splits by query ID alone: the function takes no source reference', () => {
    expect(deterministicQueryRouterSplitV1.length).toBe(1);
  });

  it('is deterministic for a given query ID', () => {
    expect(deterministicQueryRouterSplitV1('query-42')).toBe(deterministicQueryRouterSplitV1('query-42'));
  });

  it('approximates an 80/10/10 split over a large synthetic ID set', () => {
    const counts = { train: 0, validation: 0, test: 0 };
    for (let i = 0; i < 10_000; i += 1) counts[deterministicQueryRouterSplitV1(`q-${i}`)] += 1;
    expect(counts.train / 10_000).toBeGreaterThan(0.77);
    expect(counts.train / 10_000).toBeLessThan(0.83);
    expect(counts.validation / 10_000).toBeGreaterThan(0.08);
    expect(counts.test / 10_000).toBeLessThan(0.12);
  });

  it.todo('reconciled: split keyed by source identity so queries sharing a source cannot straddle train and test');
  it.todo('reconciled: near-duplicate queries (same normalized text) grouped into one split');
});
